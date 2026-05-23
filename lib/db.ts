import { neon } from '@neondatabase/serverless';
import type { RankingSession, SongRanking, Tier, User } from '@/types';

if (!process.env.DATABASE_URL) {
  throw new Error('Missing required env var: DATABASE_URL');
}
export const sql = neon(process.env.DATABASE_URL);

export async function upsertUser(user: Omit<User, 'created_at'>): Promise<void> {
  await sql`
    INSERT INTO users (id, display_name, email, avatar_url)
    VALUES (${user.id}, ${user.display_name}, ${user.email || null}, ${user.avatar_url})
    ON CONFLICT (id) DO UPDATE SET
      display_name = EXCLUDED.display_name,
      email        = EXCLUDED.email,
      avatar_url   = EXCLUDED.avatar_url
  `;
}

export async function createSession(data: {
  userId: string;
  spotifyType: 'album' | 'playlist';
  spotifyId: string;
  name: string;
  coverUrl: string;
  totalTracks: number;
}): Promise<RankingSession> {
  const rows = await sql`
    INSERT INTO ranking_sessions (user_id, spotify_type, spotify_id, name, cover_url, total_tracks)
    VALUES (${data.userId}, ${data.spotifyType}, ${data.spotifyId}, ${data.name}, ${data.coverUrl}, ${data.totalTracks})
    RETURNING *
  `;
  return rows[0] as RankingSession;
}

export async function getSession(sessionId: string): Promise<RankingSession | null> {
  const rows = await sql`SELECT * FROM ranking_sessions WHERE id = ${sessionId}`;
  return (rows[0] as RankingSession) ?? null;
}

export async function getActiveSessionsForUser(userId: string): Promise<RankingSession[]> {
  const rows = await sql`
    SELECT * FROM ranking_sessions
    WHERE user_id = ${userId} AND completed = false
    ORDER BY updated_at DESC
  `;
  return rows as RankingSession[];
}

export async function getCompletedSessionsForUser(userId: string): Promise<RankingSession[]> {
  const rows = await sql`
    SELECT * FROM ranking_sessions
    WHERE user_id = ${userId} AND completed = true AND hidden = false
    ORDER BY updated_at DESC
  `;
  return rows as RankingSession[];
}

export async function getHiddenSessionsForUser(userId: string): Promise<RankingSession[]> {
  const rows = await sql`
    SELECT * FROM ranking_sessions
    WHERE user_id = ${userId} AND completed = true AND hidden = true
    ORDER BY updated_at DESC
  `;
  return rows as RankingSession[];
}

export async function setSessionHidden(sessionId: string, userId: string, hidden: boolean): Promise<boolean> {
  const result = await sql`
    UPDATE ranking_sessions SET hidden = ${hidden}, updated_at = NOW()
    WHERE id = ${sessionId} AND user_id = ${userId}
    RETURNING id
  `;
  return result.length > 0;
}

export async function getFullyRankedSessionsForUser(userId: string): Promise<RankingSession[]> {
  const rows = await sql`
    SELECT rs.* FROM ranking_sessions rs
    WHERE rs.user_id = ${userId}
      AND rs.completed = true
      AND rs.hidden = false
      AND NOT EXISTS (
        SELECT 1 FROM song_rankings sr
        WHERE sr.session_id = rs.id AND sr.tier = 'skip'
      )
    ORDER BY rs.updated_at DESC
  `;
  return rows as RankingSession[];
}

export async function restoreAllHiddenForUser(userId: string): Promise<void> {
  await sql`
    UPDATE ranking_sessions SET hidden = false, updated_at = NOW()
    WHERE user_id = ${userId} AND hidden = true
  `;
}

export async function updateSessionProgress(
  sessionId: string,
  currentIndex: number,
  completed = false
): Promise<void> {
  await sql`
    UPDATE ranking_sessions
    SET current_index = ${currentIndex}, completed = ${completed}, updated_at = NOW()
    WHERE id = ${sessionId}
  `;
}

export async function saveRanking(data: {
  sessionId: string;
  userId: string;
  trackId: string;
  trackName: string;
  artistName: string;
  tier: Tier;
}): Promise<void> {
  await sql`
    INSERT INTO song_rankings (session_id, user_id, track_id, track_name, artist_name, tier)
    VALUES (${data.sessionId}, ${data.userId}, ${data.trackId}, ${data.trackName}, ${data.artistName}, ${data.tier})
    ON CONFLICT (session_id, track_id) DO UPDATE SET
      tier      = EXCLUDED.tier,
      ranked_at = NOW()
  `;
}

export async function deleteSession(sessionId: string, userId: string): Promise<boolean> {
  const result = await sql`
    DELETE FROM ranking_sessions
    WHERE id = ${sessionId} AND user_id = ${userId}
    RETURNING id
  `;
  return result.length > 0;
}

export async function getRankingsForSession(sessionId: string): Promise<SongRanking[]> {
  const rows = await sql`
    SELECT * FROM song_rankings WHERE session_id = ${sessionId} ORDER BY ranked_at ASC
  `;
  return rows as SongRanking[];
}

export async function saveRankingAndProgress(
  data: { sessionId: string; userId: string; trackId: string; trackName: string; artistName: string; tier: Tier },
  progress: { currentIndex: number; completed: boolean }
): Promise<void> {
  await sql.transaction([
    sql`INSERT INTO song_rankings (session_id, user_id, track_id, track_name, artist_name, tier)
        VALUES (${data.sessionId}, ${data.userId}, ${data.trackId}, ${data.trackName}, ${data.artistName}, ${data.tier})
        ON CONFLICT (session_id, track_id) DO UPDATE SET tier = EXCLUDED.tier, ranked_at = NOW()`,
    sql`UPDATE ranking_sessions SET current_index = ${progress.currentIndex}, completed = ${progress.completed}, updated_at = NOW() WHERE id = ${data.sessionId}`,
  ]);
}
