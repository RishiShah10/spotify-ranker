import { neon } from '@neondatabase/serverless';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const sql = neon(process.env.DATABASE_URL!);

async function migrate() {
  await sql`
    CREATE TABLE IF NOT EXISTS users (
      id          TEXT PRIMARY KEY,
      display_name TEXT NOT NULL,
      email       TEXT,
      avatar_url  TEXT,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS ranking_sessions (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id       TEXT NOT NULL REFERENCES users(id),
      spotify_type  TEXT NOT NULL CHECK (spotify_type IN ('album','playlist')),
      spotify_id    TEXT NOT NULL,
      name          TEXT NOT NULL,
      cover_url     TEXT NOT NULL,
      total_tracks  INT  NOT NULL,
      current_index INT  NOT NULL DEFAULT 0,
      completed     BOOLEAN NOT NULL DEFAULT false,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS song_rankings (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      session_id  UUID NOT NULL REFERENCES ranking_sessions(id) ON DELETE CASCADE,
      user_id     TEXT NOT NULL REFERENCES users(id),
      track_id    TEXT NOT NULL,
      track_name  TEXT NOT NULL,
      artist_name TEXT NOT NULL,
      tier        TEXT NOT NULL CHECK (tier IN ('S','A','B','C','F')),
      ranked_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_ranking_sessions_user_id
      ON ranking_sessions(user_id)
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_song_rankings_session_id
      ON song_rankings(session_id)
  `;

  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_song_rankings_unique_session_track
      ON song_rankings(session_id, track_id)
  `;

  // Allow 'skip' as a valid tier value (added when skip-track feature was introduced)
  await sql`
    ALTER TABLE song_rankings
      DROP CONSTRAINT IF EXISTS song_rankings_tier_check
  `;
  await sql`
    ALTER TABLE song_rankings
      ADD CONSTRAINT song_rankings_tier_check
      CHECK (tier IN ('S','A','B','C','F','skip'))
  `;

  console.log('Migration complete.');
}

migrate().catch(console.error);
