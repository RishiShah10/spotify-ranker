import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { saveRanking, getRankingsForSession, updateSessionProgress, getSession, saveRankingAndProgress } from '@/lib/db';
import type { Tier } from '@/types';

const VALID_TIERS: Tier[] = ['S', 'A', 'B', 'C', 'F', 'skip'];
const UUID_RE = /^[0-9a-f-]{36}$/i;

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.spotifyId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Accept newIndex/completed from client for backwards compat but do not use them for DB writes (M1)
  const { sessionId, trackId, trackName, artistName, tier, newIndex: _newIndex, completed: _completed } = await req.json();

  if (!sessionId || !trackId || !trackName || !artistName || !tier) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }
  if (!VALID_TIERS.includes(tier)) {
    return NextResponse.json({ error: 'Invalid tier' }, { status: 400 });
  }

  // M4 — length limits on user-supplied strings
  if (trackId.length > 100) {
    return NextResponse.json({ error: 'trackId too long' }, { status: 400 });
  }
  if (trackName.length > 500) {
    return NextResponse.json({ error: 'trackName too long' }, { status: 400 });
  }
  if (artistName.length > 500) {
    return NextResponse.json({ error: 'artistName too long' }, { status: 400 });
  }

  const rankingSession = await getSession(sessionId);
  if (!rankingSession) return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  if (rankingSession.user_id !== session.spotifyId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // M1 — derive progress server-side, never trust client-supplied values
  const derivedIndex = rankingSession.current_index + 1;
  const derivedCompleted = derivedIndex >= rankingSession.total_tracks;

  try {
    await saveRankingAndProgress(
      { sessionId, userId: session.spotifyId, trackId, trackName, artistName, tier },
      { currentIndex: derivedIndex, completed: derivedCompleted }
    );
  } catch (err) {
    console.error('Failed to save ranking:', err);
    return NextResponse.json({ error: 'Failed to save ranking' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const sessionId = searchParams.get('sessionId');
  if (!sessionId) return NextResponse.json({ error: 'Missing sessionId' }, { status: 400 });

  // L3 — validate UUID format before hitting DB
  if (!UUID_RE.test(sessionId)) {
    return NextResponse.json({ error: 'Invalid sessionId' }, { status: 400 });
  }

  // C1 — fetch session first to determine access rules
  let rankingSession;
  try {
    rankingSession = await getSession(sessionId);
  } catch (err) {
    console.error('Failed to fetch session:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }

  if (!rankingSession) return NextResponse.json({ error: 'Session not found' }, { status: 404 });

  if (!rankingSession.completed) {
    // In-progress sessions are private — require auth and ownership
    const session = await getServerSession(authOptions);
    if (!session?.spotifyId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (rankingSession.user_id !== session.spotifyId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  }
  // Completed sessions are publicly readable (shareable results links)

  try {
    const rankings = await getRankingsForSession(sessionId);
    return NextResponse.json(rankings);
  } catch (err) {
    console.error('Failed to fetch rankings:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
