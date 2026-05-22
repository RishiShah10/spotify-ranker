# Spotify Ranker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Next.js web app where Spotify Premium users log in, search albums/playlists, listen to each track in order, rank each song S/A/B/C/F, and export results as text or image.

**Architecture:** Next.js 14 (App Router) monorepo on Vercel. Spotify OAuth via `next-auth` (v4), in-browser playback via Spotify Web Playback SDK, data in Neon PostgreSQL via `@neondatabase/serverless`. All API routes co-located in `app/api/`.

**Tech Stack:** Next.js 14, TypeScript, Tailwind CSS, next-auth 4, @neondatabase/serverless, html-to-image, @types/spotify-web-playback-sdk, Jest + ts-jest

---

## File Map

**Created:**
- `app/layout.tsx` — root layout with SessionProvider, Spotify dark theme
- `app/providers.tsx` — client-side SessionProvider wrapper
- `app/page.tsx` — home / search page
- `app/rank/[id]/page.tsx` — ranking flow page
- `app/results/[id]/page.tsx` — results / share page (public read-only)
- `app/api/auth/[...nextauth]/route.ts` — next-auth Spotify OAuth handler
- `app/api/search/route.ts` — proxies Spotify search (keeps token server-side)
- `app/api/session/route.ts` — POST create session, GET fetch session(s)
- `app/api/rankings/route.ts` — POST save ranking + advance index, GET fetch rankings
- `components/LoginButton.tsx` — Spotify login / sign-out button
- `components/SearchBar.tsx` — search input + paste-a-link detection
- `components/SearchResults.tsx` — result cards + resume badges
- `components/RankingPlayer.tsx` — playback UI + tier picker orchestration
- `components/TierPicker.tsx` — S/A/B/C/F colored buttons
- `components/TierList.tsx` — results grouped by tier
- `components/SharePanel.tsx` — copy text + download image buttons
- `lib/auth.ts` — next-auth AuthOptions (shared by route + API routes)
- `lib/db.ts` — Neon client + all query helpers
- `lib/spotify.ts` — Spotify Web API helpers
- `lib/spotifyLink.ts` — Spotify URL regex parser
- `lib/share.ts` — tier text formatter + html-to-image export
- `lib/useSpotifyPlayer.ts` — Spotify Web Playback SDK React hook
- `types/index.ts` — shared TypeScript types
- `types/next-auth.d.ts` — next-auth Session/JWT type extensions
- `scripts/migrate.ts` — one-time DB schema migration
- `__tests__/spotifyLink.test.ts` — link parser unit tests
- `__tests__/share.test.ts` — text formatter unit tests
- `jest.config.ts` — Jest config
- `.env.local.example` — env var template

---

## Task 1: Scaffold the project

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `tailwind.config.ts`, `jest.config.ts`

- [ ] **Step 1: Create Next.js app inside the existing folder**

```bash
cd /Users/rishi-shah/Desktop/spotify-ranker
npx create-next-app@latest . --typescript --tailwind --app --no-src-dir --import-alias "@/*" --no-eslint
```

Expected: Next.js scaffolded in current directory. Answer "Yes" to all prompts.

- [ ] **Step 2: Install runtime dependencies**

```bash
npm install next-auth @neondatabase/serverless html-to-image
```

- [ ] **Step 3: Install dev dependencies**

```bash
npm install --save-dev jest @types/jest jest-environment-jsdom ts-jest @types/spotify-web-playback-sdk tsx dotenv
```

- [ ] **Step 4: Create `jest.config.ts`**

```typescript
import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
};

export default config;
```

- [ ] **Step 5: Add scripts to `package.json`**

In the `"scripts"` block, add:
```json
"test": "jest",
"migrate": "tsx scripts/migrate.ts"
```

- [ ] **Step 6: Update `next.config.ts`**

```typescript
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'i.scdn.co' },
      { protocol: 'https', hostname: 'mosaic.scdn.co' },
      { protocol: 'https', hostname: 'lineup-images.scdn.co' },
    ],
  },
};

export default nextConfig;
```

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: scaffold Next.js 14 project with dependencies"
```

---

## Task 2: Define shared TypeScript types

**Files:**
- Create: `types/index.ts`
- Create: `types/next-auth.d.ts`

- [ ] **Step 1: Create `types/index.ts`**

```typescript
export type Tier = 'S' | 'A' | 'B' | 'C' | 'F';

export interface User {
  id: string;
  display_name: string;
  email: string;
  avatar_url: string | null;
  created_at: string;
}

export interface RankingSession {
  id: string;
  user_id: string;
  spotify_type: 'album' | 'playlist';
  spotify_id: string;
  name: string;
  cover_url: string;
  total_tracks: number;
  current_index: number;
  completed: boolean;
  created_at: string;
  updated_at: string;
}

export interface SongRanking {
  id: string;
  session_id: string;
  user_id: string;
  track_id: string;
  track_name: string;
  artist_name: string;
  tier: Tier;
  ranked_at: string;
}

export interface SpotifyTrack {
  id: string;
  name: string;
  artistName: string;
  uri: string;
  durationMs: number;
}

export interface SpotifySearchResult {
  id: string;
  type: 'album' | 'playlist';
  name: string;
  coverUrl: string;
  subtitle: string;
  totalTracks: number;
}
```

- [ ] **Step 2: Create `types/next-auth.d.ts`**

```typescript
import 'next-auth';

declare module 'next-auth' {
  interface Session {
    accessToken: string;
    spotifyId: string;
    error?: string;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    accessToken: string;
    refreshToken: string;
    accessTokenExpires: number;
    spotifyId: string;
    error?: string;
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add types/
git commit -m "feat: add shared TypeScript types"
```

---

## Task 3: DB schema + Neon client

**Files:**
- Create: `lib/db.ts`
- Create: `scripts/migrate.ts`
- Create: `.env.local` (gitignored)

- [ ] **Step 1: Get Neon connection string**

Go to your Neon dashboard → Project → Connection Details → copy the **pooled** connection string (starts with `postgres://...@...neon.tech/...?sslmode=require`).

- [ ] **Step 2: Create `.env.local`**

```
DATABASE_URL=<your-neon-pooled-connection-string>
SPOTIFY_CLIENT_ID=
SPOTIFY_CLIENT_SECRET=
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=
```

(Leave Spotify fields blank for now — filled in Task 8.)

- [ ] **Step 3: Create `lib/db.ts` with Neon client**

```typescript
import { neon } from '@neondatabase/serverless';

export const sql = neon(process.env.DATABASE_URL!);
```

- [ ] **Step 4: Create `scripts/migrate.ts`**

```typescript
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

  console.log('Migration complete.');
}

migrate().catch(console.error);
```

- [ ] **Step 5: Run migration**

```bash
npm run migrate
```

Expected output: `Migration complete.`

- [ ] **Step 6: Commit**

```bash
git add lib/db.ts scripts/migrate.ts
git commit -m "feat: add Neon DB client and schema migration"
```

---

## Task 4: Spotify link parser (TDD)

**Files:**
- Create: `lib/spotifyLink.ts`
- Create: `__tests__/spotifyLink.test.ts`

- [ ] **Step 1: Write failing tests**

Create `__tests__/spotifyLink.test.ts`:

```typescript
import { parseSpotifyUrl } from '@/lib/spotifyLink';

describe('parseSpotifyUrl', () => {
  it('parses an album URL', () => {
    expect(parseSpotifyUrl('https://open.spotify.com/album/4LH4d3cOWNNsVw41Gqt2kv'))
      .toEqual({ type: 'album', id: '4LH4d3cOWNNsVw41Gqt2kv' });
  });

  it('parses a playlist URL', () => {
    expect(parseSpotifyUrl('https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M'))
      .toEqual({ type: 'playlist', id: '37i9dQZF1DXcBWIGoYBM5M' });
  });

  it('strips query params', () => {
    expect(parseSpotifyUrl('https://open.spotify.com/album/4LH4d3cOWNNsVw41Gqt2kv?si=abc123'))
      .toEqual({ type: 'album', id: '4LH4d3cOWNNsVw41Gqt2kv' });
  });

  it('returns null for non-Spotify URLs', () => {
    expect(parseSpotifyUrl('https://example.com/album/abc')).toBeNull();
  });

  it('returns null for unsupported Spotify types (track)', () => {
    expect(parseSpotifyUrl('https://open.spotify.com/track/abc')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(parseSpotifyUrl('')).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
npm test -- --testPathPattern=spotifyLink
```

Expected: FAIL — `Cannot find module '@/lib/spotifyLink'`

- [ ] **Step 3: Implement `lib/spotifyLink.ts`**

```typescript
export interface SpotifyLinkResult {
  type: 'album' | 'playlist';
  id: string;
}

export function parseSpotifyUrl(url: string): SpotifyLinkResult | null {
  const match = url.match(/open\.spotify\.com\/(album|playlist)\/([A-Za-z0-9]+)/);
  if (!match) return null;
  return { type: match[1] as 'album' | 'playlist', id: match[2] };
}
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
npm test -- --testPathPattern=spotifyLink
```

Expected: PASS — 6 tests passing.

- [ ] **Step 5: Commit**

```bash
git add lib/spotifyLink.ts __tests__/spotifyLink.test.ts
git commit -m "feat: add Spotify URL parser with tests"
```

---

## Task 5: Share text formatter (TDD)

**Files:**
- Create: `lib/share.ts`
- Create: `__tests__/share.test.ts`

- [ ] **Step 1: Write failing tests**

Create `__tests__/share.test.ts`:

```typescript
import { formatTierText } from '@/lib/share';
import type { RankingSession, SongRanking } from '@/types';

const session: RankingSession = {
  id: 'session-1', user_id: 'u1', spotify_type: 'album', spotify_id: 'a1',
  name: 'Blonde', cover_url: 'https://x.com/c.jpg', total_tracks: 4,
  current_index: 4, completed: true, created_at: '2026-01-01', updated_at: '2026-01-01',
};

const rankings: SongRanking[] = [
  { id: '1', session_id: 'session-1', user_id: 'u1', track_id: 't1', track_name: 'Nights',         artist_name: 'Frank Ocean', tier: 'S', ranked_at: '2026-01-01' },
  { id: '2', session_id: 'session-1', user_id: 'u1', track_id: 't2', track_name: 'Ivy',            artist_name: 'Frank Ocean', tier: 'S', ranked_at: '2026-01-01' },
  { id: '3', session_id: 'session-1', user_id: 'u1', track_id: 't3', track_name: 'Nikes',          artist_name: 'Frank Ocean', tier: 'B', ranked_at: '2026-01-01' },
  { id: '4', session_id: 'session-1', user_id: 'u1', track_id: 't4', track_name: 'Facebook Story', artist_name: 'Frank Ocean', tier: 'F', ranked_at: '2026-01-01' },
];

describe('formatTierText', () => {
  it('includes album name and subtitle', () => {
    const text = formatTierText(session, rankings, 'Frank Ocean');
    expect(text).toContain('Blonde');
    expect(text).toContain('Frank Ocean');
  });

  it('groups songs under their tier', () => {
    const text = formatTierText(session, rankings, 'Frank Ocean');
    expect(text).toMatch(/S\s+Nights, Ivy/);
    expect(text).toMatch(/B\s+Nikes/);
    expect(text).toMatch(/F\s+Facebook Story/);
  });

  it('shows dash for empty tiers', () => {
    const text = formatTierText(session, rankings, 'Frank Ocean');
    expect(text).toMatch(/A\s+—/);
    expect(text).toMatch(/C\s+—/);
  });
});
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
npm test -- --testPathPattern=share
```

Expected: FAIL — `Cannot find module '@/lib/share'`

- [ ] **Step 3: Implement `lib/share.ts` (text formatter only — image export added in Task 15)**

```typescript
import type { RankingSession, SongRanking, Tier } from '@/types';

const TIERS: Tier[] = ['S', 'A', 'B', 'C', 'F'];

export function formatTierText(
  session: RankingSession,
  rankings: SongRanking[],
  subtitle: string
): string {
  const grouped: Record<Tier, string[]> = { S: [], A: [], B: [], C: [], F: [] };
  for (const r of rankings) grouped[r.tier].push(r.track_name);

  const tierLines = TIERS.map((tier) => {
    const songs = grouped[tier].length > 0 ? grouped[tier].join(', ') : '—';
    return `${tier}  ${songs}`;
  }).join('\n');

  return `🎵 ${session.name} — ${subtitle}\n\n${tierLines}`;
}
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
npm test -- --testPathPattern=share
```

Expected: PASS — 3 tests passing.

- [ ] **Step 5: Commit**

```bash
git add lib/share.ts __tests__/share.test.ts
git commit -m "feat: add tier text formatter with tests"
```

---

## Task 6: DB query helpers

**Files:**
- Modify: `lib/db.ts`

- [ ] **Step 1: Replace `lib/db.ts` with full query helpers**

```typescript
import { neon } from '@neondatabase/serverless';
import type { RankingSession, SongRanking, Tier, User } from '@/types';

export const sql = neon(process.env.DATABASE_URL!);

export async function upsertUser(user: Omit<User, 'created_at'>): Promise<void> {
  await sql`
    INSERT INTO users (id, display_name, email, avatar_url)
    VALUES (${user.id}, ${user.display_name}, ${user.email ?? ''}, ${user.avatar_url})
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
  `;
}

export async function getRankingsForSession(sessionId: string): Promise<SongRanking[]> {
  const rows = await sql`
    SELECT * FROM song_rankings WHERE session_id = ${sessionId} ORDER BY ranked_at ASC
  `;
  return rows as SongRanking[];
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/db.ts
git commit -m "feat: add DB query helpers"
```

---

## Task 7: Spotify API helpers

**Files:**
- Create: `lib/spotify.ts`

- [ ] **Step 1: Create `lib/spotify.ts`**

```typescript
import type { SpotifySearchResult, SpotifyTrack } from '@/types';

const BASE = 'https://api.spotify.com/v1';

async function spotifyFetch(path: string, token: string) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Spotify API ${res.status}: ${path}`);
  return res.json();
}

export async function searchSpotify(query: string, token: string): Promise<SpotifySearchResult[]> {
  const data = await spotifyFetch(
    `/search?q=${encodeURIComponent(query)}&type=album,playlist&limit=8`,
    token
  );
  const albums: SpotifySearchResult[] = (data.albums?.items ?? []).map((a: any) => ({
    id: a.id,
    type: 'album' as const,
    name: a.name,
    coverUrl: a.images?.[0]?.url ?? '',
    subtitle: a.artists.map((x: any) => x.name).join(', '),
    totalTracks: a.total_tracks,
  }));
  const playlists: SpotifySearchResult[] = (data.playlists?.items ?? []).map((p: any) => ({
    id: p.id,
    type: 'playlist' as const,
    name: p.name,
    coverUrl: p.images?.[0]?.url ?? '',
    subtitle: p.owner.display_name,
    totalTracks: p.tracks.total,
  }));
  return [...albums, ...playlists];
}

export async function getAlbumTracks(albumId: string, token: string): Promise<SpotifyTrack[]> {
  const data = await spotifyFetch(`/albums/${albumId}/tracks?limit=50`, token);
  return data.items.map((t: any) => ({
    id: t.id,
    name: t.name,
    artistName: t.artists.map((a: any) => a.name).join(', '),
    uri: t.uri,
    durationMs: t.duration_ms,
  }));
}

export async function getPlaylistTracks(playlistId: string, token: string): Promise<SpotifyTrack[]> {
  const data = await spotifyFetch(`/playlists/${playlistId}/tracks?limit=50`, token);
  return data.items
    .filter((item: any) => item.track && !item.track.is_local)
    .map((item: any) => ({
      id: item.track.id,
      name: item.track.name,
      artistName: item.track.artists.map((a: any) => a.name).join(', '),
      uri: item.track.uri,
      durationMs: item.track.duration_ms,
    }));
}

export async function getAlbumInfo(
  albumId: string,
  token: string
): Promise<{ name: string; coverUrl: string; artist: string; totalTracks: number }> {
  const data = await spotifyFetch(`/albums/${albumId}`, token);
  return {
    name: data.name,
    coverUrl: data.images?.[0]?.url ?? '',
    artist: data.artists.map((a: any) => a.name).join(', '),
    totalTracks: data.tracks.total,
  };
}

export async function getPlaylistInfo(
  playlistId: string,
  token: string
): Promise<{ name: string; coverUrl: string; owner: string; totalTracks: number }> {
  const data = await spotifyFetch(`/playlists/${playlistId}`, token);
  return {
    name: data.name,
    coverUrl: data.images?.[0]?.url ?? '',
    owner: data.owner.display_name,
    totalTracks: data.tracks.total,
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/spotify.ts
git commit -m "feat: add Spotify Web API helpers"
```

---

## Task 8: Spotify OAuth with next-auth

**Files:**
- Create: `lib/auth.ts`
- Create: `app/api/auth/[...nextauth]/route.ts`
- Create: `.env.local.example`

- [ ] **Step 1: Register a Spotify application**

1. Go to https://developer.spotify.com/dashboard → Create App
2. App name: `Spotify Ranker`
3. Redirect URI: `http://localhost:3000/api/auth/callback/spotify`
4. Check "Web API" and "Web Playback SDK"
5. Copy the **Client ID** and **Client Secret**

- [ ] **Step 2: Fill in `.env.local`**

```
SPOTIFY_CLIENT_ID=<your-client-id>
SPOTIFY_CLIENT_SECRET=<your-client-secret>
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=<run: openssl rand -base64 32>
```

- [ ] **Step 3: Create `lib/auth.ts`**

```typescript
import { AuthOptions } from 'next-auth';
import SpotifyProvider from 'next-auth/providers/spotify';
import { upsertUser } from './db';

const SCOPES = [
  'streaming',
  'user-read-email',
  'user-read-private',
  'user-read-playback-state',
  'user-modify-playback-state',
].join(' ');

async function refreshAccessToken(token: any) {
  try {
    const res = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${Buffer.from(
          `${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`
        ).toString('base64')}`,
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: token.refreshToken,
      }),
    });
    const data = await res.json();
    return {
      ...token,
      accessToken: data.access_token,
      accessTokenExpires: Date.now() + data.expires_in * 1000,
      refreshToken: data.refresh_token ?? token.refreshToken,
    };
  } catch {
    return { ...token, error: 'RefreshAccessTokenError' };
  }
}

export const authOptions: AuthOptions = {
  providers: [
    SpotifyProvider({
      clientId: process.env.SPOTIFY_CLIENT_ID!,
      clientSecret: process.env.SPOTIFY_CLIENT_SECRET!,
      authorization: { params: { scope: SCOPES } },
    }),
  ],
  callbacks: {
    async jwt({ token, account, profile }) {
      if (account && profile) {
        const p = profile as any;
        await upsertUser({
          id: p.id,
          display_name: p.display_name ?? p.id,
          email: p.email ?? '',
          avatar_url: p.images?.[0]?.url ?? null,
        });
        return {
          ...token,
          accessToken: account.access_token,
          refreshToken: account.refresh_token,
          accessTokenExpires: (account.expires_at ?? 0) * 1000,
          spotifyId: p.id,
        };
      }
      if (Date.now() < (token.accessTokenExpires as number)) return token;
      return refreshAccessToken(token);
    },
    async session({ session, token }) {
      session.accessToken = token.accessToken as string;
      session.spotifyId = token.spotifyId as string;
      session.error = token.error as string | undefined;
      return session;
    },
  },
};
```

- [ ] **Step 4: Create `app/api/auth/[...nextauth]/route.ts`**

```typescript
import NextAuth from 'next-auth';
import { authOptions } from '@/lib/auth';

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };
```

- [ ] **Step 5: Create `.env.local.example`**

```
SPOTIFY_CLIENT_ID=
SPOTIFY_CLIENT_SECRET=
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=
DATABASE_URL=
```

- [ ] **Step 6: Commit**

```bash
git add lib/auth.ts app/api/auth/ .env.local.example
git commit -m "feat: add Spotify OAuth via next-auth"
```

---

## Task 9: Session API route

**Files:**
- Create: `app/api/session/route.ts`

- [ ] **Step 1: Create `app/api/session/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { createSession, getSession, getActiveSessionsForUser } from '@/lib/db';

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.spotifyId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { spotifyType, spotifyId, name, coverUrl, totalTracks } = await req.json();
  if (!spotifyType || !spotifyId || !name || !totalTracks) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  const rankingSession = await createSession({
    userId: session.spotifyId,
    spotifyType,
    spotifyId,
    name,
    coverUrl: coverUrl ?? '',
    totalTracks,
  });
  return NextResponse.json(rankingSession);
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');

  if (id) {
    // Public read by session UUID — results page is shareable without auth
    const rankingSession = await getSession(id);
    if (!rankingSession) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json(rankingSession);
  }

  // Listing active sessions requires auth
  const session = await getServerSession(authOptions);
  if (!session?.spotifyId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const sessions = await getActiveSessionsForUser(session.spotifyId);
  return NextResponse.json(sessions);
}
```

- [ ] **Step 2: Commit**

```bash
git add app/api/session/
git commit -m "feat: add session API route"
```

---

## Task 10: Rankings API route + Search proxy

**Files:**
- Create: `app/api/rankings/route.ts`
- Create: `app/api/search/route.ts`

- [ ] **Step 1: Create `app/api/rankings/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { saveRanking, getRankingsForSession, updateSessionProgress } from '@/lib/db';
import type { Tier } from '@/types';

const VALID_TIERS: Tier[] = ['S', 'A', 'B', 'C', 'F'];

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.spotifyId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { sessionId, trackId, trackName, artistName, tier, newIndex, completed } = await req.json();

  if (!sessionId || !trackId || !trackName || !artistName || !tier) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }
  if (!VALID_TIERS.includes(tier)) {
    return NextResponse.json({ error: 'Invalid tier' }, { status: 400 });
  }

  await saveRanking({ sessionId, userId: session.spotifyId, trackId, trackName, artistName, tier });
  await updateSessionProgress(sessionId, newIndex, completed ?? false);

  return NextResponse.json({ ok: true });
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const sessionId = searchParams.get('sessionId');
  if (!sessionId) return NextResponse.json({ error: 'Missing sessionId' }, { status: 400 });

  const rankings = await getRankingsForSession(sessionId);
  return NextResponse.json(rankings);
}
```

- [ ] **Step 2: Create `app/api/search/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { searchSpotify } from '@/lib/spotify';

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const q = searchParams.get('q');
  if (!q) return NextResponse.json({ error: 'Missing query' }, { status: 400 });

  const results = await searchSpotify(q, session.accessToken);
  return NextResponse.json(results);
}
```

- [ ] **Step 3: Commit**

```bash
git add app/api/rankings/ app/api/search/
git commit -m "feat: add rankings and search API routes"
```

---

## Task 11: Root layout + providers

**Files:**
- Create: `app/providers.tsx`
- Modify: `app/layout.tsx`
- Modify: `app/globals.css`

- [ ] **Step 1: Create `app/providers.tsx`**

```typescript
'use client';

import { SessionProvider } from 'next-auth/react';

export function Providers({ children }: { children: React.ReactNode }) {
  return <SessionProvider>{children}</SessionProvider>;
}
```

- [ ] **Step 2: Replace `app/globals.css`**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --spotify-green: #1DB954;
  --bg:            #121212;
  --surface:       #181818;
  --surface-2:     #282828;
  --text:          #FFFFFF;
  --text-muted:    #B3B3B3;
}

body {
  background-color: var(--bg);
  color: var(--text);
}
```

- [ ] **Step 3: Replace `app/layout.tsx`**

```typescript
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { Providers } from './providers';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Spotify Ranker',
  description: 'Rank every track on your favourite albums and playlists.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add app/layout.tsx app/providers.tsx app/globals.css
git commit -m "feat: add root layout with Spotify dark theme and SessionProvider"
```

---

## Task 12: Spotify Web Playback SDK hook

**Files:**
- Create: `lib/useSpotifyPlayer.ts`

- [ ] **Step 1: Create `lib/useSpotifyPlayer.ts`**

```typescript
'use client';

import { useEffect, useRef, useState } from 'react';

export interface PlayerState {
  isReady: boolean;
  isPaused: boolean;
  currentTrackId: string | null;
  deviceId: string | null;
}

export function useSpotifyPlayer(accessToken: string | null, onTrackEnd: () => void) {
  const playerRef = useRef<Spotify.Player | null>(null);
  const deviceIdRef = useRef<string | null>(null);
  const trackEndedRef = useRef(false);
  const onTrackEndRef = useRef(onTrackEnd);
  onTrackEndRef.current = onTrackEnd;

  const [playerState, setPlayerState] = useState<PlayerState>({
    isReady: false,
    isPaused: true,
    currentTrackId: null,
    deviceId: null,
  });

  useEffect(() => {
    if (!accessToken) return;

    const script = document.createElement('script');
    script.src = 'https://sdk.scdn.co/spotify-player.js';
    script.async = true;
    document.body.appendChild(script);

    window.onSpotifyWebPlaybackSDKReady = () => {
      const player = new window.Spotify.Player({
        name: 'Spotify Ranker',
        getOAuthToken: (cb) => cb(accessToken),
        volume: 0.8,
      });

      player.addListener('ready', ({ device_id }) => {
        deviceIdRef.current = device_id;
        setPlayerState((s) => ({ ...s, isReady: true, deviceId: device_id }));
      });

      player.addListener('player_state_changed', (state) => {
        if (!state) return;
        if (state.paused && state.position === 0 && !trackEndedRef.current) {
          trackEndedRef.current = true;
          onTrackEndRef.current();
        }
        if (!state.paused) trackEndedRef.current = false;
        setPlayerState((s) => ({
          ...s,
          isPaused: state.paused,
          currentTrackId: state.track_window.current_track?.id ?? null,
        }));
      });

      player.connect();
      playerRef.current = player;
    };

    return () => {
      playerRef.current?.disconnect();
      document.body.removeChild(script);
    };
  }, [accessToken]);

  async function playTrack(trackUri: string) {
    if (!deviceIdRef.current || !accessToken) return;
    await fetch(
      `https://api.spotify.com/v1/me/player/play?device_id=${deviceIdRef.current}`,
      {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ uris: [trackUri] }),
      }
    );
  }

  async function pause() {
    await playerRef.current?.pause();
  }

  return { playerState, playTrack, pause };
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/useSpotifyPlayer.ts
git commit -m "feat: add Spotify Web Playback SDK hook"
```

---

## Task 13: Home page + search components

**Files:**
- Create: `components/LoginButton.tsx`
- Create: `components/SearchBar.tsx`
- Create: `components/SearchResults.tsx`
- Create: `app/page.tsx`

- [ ] **Step 1: Create `components/LoginButton.tsx`**

```typescript
'use client';

import { signIn, signOut, useSession } from 'next-auth/react';

export function LoginButton() {
  const { data: session } = useSession();

  if (session) {
    return (
      <div className="flex items-center gap-3">
        <span className="text-sm" style={{ color: 'var(--text-muted)' }}>
          {session.user?.name}
        </span>
        <button
          onClick={() => signOut()}
          className="text-sm transition hover:text-white"
          style={{ color: 'var(--text-muted)' }}
        >
          Sign out
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={() => signIn('spotify')}
      className="flex items-center gap-2 font-semibold px-6 py-3 rounded-full hover:scale-105 transition text-black"
      style={{ backgroundColor: 'var(--spotify-green)' }}
    >
      <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current">
        <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
      </svg>
      Login with Spotify
    </button>
  );
}
```

- [ ] **Step 2: Create `components/SearchBar.tsx`**

```typescript
'use client';

import { useState } from 'react';
import { parseSpotifyUrl } from '@/lib/spotifyLink';
import type { SpotifySearchResult } from '@/types';

interface SearchBarProps {
  onResults: (results: SpotifySearchResult[]) => void;
  onDirectLink: (type: 'album' | 'playlist', id: string) => void;
}

export function SearchBar({ onResults, onDirectLink }: SearchBarProps) {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSearch() {
    const parsed = parseSpotifyUrl(query);
    if (parsed) {
      onDirectLink(parsed.type, parsed.id);
      return;
    }
    if (!query.trim()) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(query.trim())}`);
      onResults(await res.json());
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex gap-2 w-full">
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
        placeholder="Search albums & playlists, or paste a Spotify link…"
        className="flex-1 px-4 py-3 rounded-full outline-none focus:ring-2 text-white"
        style={{
          backgroundColor: 'var(--surface-2)',
          caretColor: 'var(--spotify-green)',
        }}
      />
      <button
        onClick={handleSearch}
        disabled={loading}
        className="font-semibold px-6 py-3 rounded-full hover:scale-105 transition disabled:opacity-50 text-black"
        style={{ backgroundColor: 'var(--spotify-green)' }}
      >
        {loading ? '…' : 'Search'}
      </button>
    </div>
  );
}
```

- [ ] **Step 3: Create `components/SearchResults.tsx`**

```typescript
'use client';

import type { SpotifySearchResult, RankingSession } from '@/types';

interface SearchResultsProps {
  results: SpotifySearchResult[];
  activeSessions: RankingSession[];
  onStart: (result: SpotifySearchResult) => void;
  onResume: (session: RankingSession) => void;
}

export function SearchResults({ results, activeSessions, onStart, onResume }: SearchResultsProps) {
  return (
    <div className="w-full space-y-6">
      {activeSessions.length > 0 && (
        <section>
          <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: 'var(--text-muted)' }}>
            Resume
          </p>
          <div className="space-y-2">
            {activeSessions.map((s) => (
              <button
                key={s.id}
                onClick={() => onResume(s)}
                className="w-full flex items-center gap-3 p-3 rounded-xl transition hover:opacity-80"
                style={{ backgroundColor: 'var(--surface)' }}
              >
                <img src={s.cover_url} alt={s.name} className="w-10 h-10 rounded object-cover flex-shrink-0" />
                <div className="flex-1 text-left">
                  <p className="font-medium text-sm">{s.name}</p>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    Track {s.current_index} of {s.total_tracks}
                  </p>
                </div>
                <span className="text-xs font-bold px-2 py-1 rounded-full text-black" style={{ backgroundColor: 'var(--spotify-green)' }}>
                  Resume
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      {results.length > 0 && (
        <section>
          <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: 'var(--text-muted)' }}>
            Results
          </p>
          <div className="space-y-2">
            {results.map((r) => (
              <button
                key={`${r.type}-${r.id}`}
                onClick={() => onStart(r)}
                className="w-full flex items-center gap-3 p-3 rounded-xl transition hover:opacity-80"
                style={{ backgroundColor: 'var(--surface)' }}
              >
                <img src={r.coverUrl} alt={r.name} className="w-10 h-10 rounded object-cover flex-shrink-0" />
                <div className="flex-1 text-left">
                  <p className="font-medium text-sm">{r.name}</p>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    {r.subtitle} · {r.totalTracks} tracks
                  </p>
                </div>
                <span className="text-xs capitalize" style={{ color: 'var(--text-muted)' }}>{r.type}</span>
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Create `app/page.tsx`**

```typescript
'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import { LoginButton } from '@/components/LoginButton';
import { SearchBar } from '@/components/SearchBar';
import { SearchResults } from '@/components/SearchResults';
import { getAlbumInfo, getPlaylistInfo } from '@/lib/spotify';
import type { SpotifySearchResult, RankingSession } from '@/types';

export default function HomePage() {
  const { data: session } = useSession();
  const router = useRouter();
  const [results, setResults] = useState<SpotifySearchResult[]>([]);
  const [activeSessions, setActiveSessions] = useState<RankingSession[]>([]);

  useEffect(() => {
    if (!session?.spotifyId) return;
    fetch('/api/session').then((r) => r.json()).then(setActiveSessions);
  }, [session?.spotifyId]);

  async function createAndNavigate(
    spotifyType: 'album' | 'playlist',
    spotifyId: string,
    name: string,
    coverUrl: string,
    totalTracks: number
  ) {
    const res = await fetch('/api/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ spotifyType, spotifyId, name, coverUrl, totalTracks }),
    });
    const s: RankingSession = await res.json();
    router.push(`/rank/${s.id}`);
  }

  async function handleStart(result: SpotifySearchResult) {
    await createAndNavigate(result.type, result.id, result.name, result.coverUrl, result.totalTracks);
  }

  async function handleDirectLink(type: 'album' | 'playlist', id: string) {
    if (!session?.accessToken) return;
    const token = session.accessToken;
    if (type === 'album') {
      const info = await getAlbumInfo(id, token);
      await createAndNavigate('album', id, info.name, info.coverUrl, info.totalTracks);
    } else {
      const info = await getPlaylistInfo(id, token);
      await createAndNavigate('playlist', id, info.name, info.coverUrl, info.totalTracks);
    }
  }

  return (
    <main className="min-h-screen flex flex-col items-center px-4 py-16">
      <div className="w-full max-w-xl">
        <div className="flex justify-between items-center mb-12">
          <h1 className="text-2xl font-bold tracking-tight">
            <span style={{ color: 'var(--spotify-green)' }}>Spotify</span> Ranker
          </h1>
          <LoginButton />
        </div>

        {!session ? (
          <div className="text-center space-y-6 mt-16">
            <p className="text-4xl font-bold">Rank every track.</p>
            <p style={{ color: 'var(--text-muted)' }}>
              Listen to albums and playlists, then tier every song — S through F.
            </p>
            <p className="text-xs mt-2" style={{ color: 'var(--text-muted)' }}>
              Requires Spotify Premium for in-browser playback.
            </p>
            <div className="mt-8 flex justify-center">
              <LoginButton />
            </div>
          </div>
        ) : (
          <div className="space-y-8">
            <SearchBar onResults={setResults} onDirectLink={handleDirectLink} />
            <SearchResults
              results={results}
              activeSessions={activeSessions}
              onStart={handleStart}
              onResume={(s) => router.push(`/rank/${s.id}`)}
            />
          </div>
        )}
      </div>
    </main>
  );
}
```

- [ ] **Step 5: Commit**

```bash
git add app/page.tsx components/LoginButton.tsx components/SearchBar.tsx components/SearchResults.tsx
git commit -m "feat: add home page with search, paste-a-link, and resume sessions"
```

---

## Task 14: Ranking flow page

**Files:**
- Create: `components/TierPicker.tsx`
- Create: `components/RankingPlayer.tsx`
- Create: `app/rank/[id]/page.tsx`

- [ ] **Step 1: Create `components/TierPicker.tsx`**

```typescript
'use client';

import type { Tier } from '@/types';

const TIERS: { tier: Tier; bg: string }[] = [
  { tier: 'S', bg: '#FF4444' },
  { tier: 'A', bg: '#FF9944' },
  { tier: 'B', bg: '#FFDD44' },
  { tier: 'C', bg: '#44DD44' },
  { tier: 'F', bg: '#4488FF' },
];

interface TierPickerProps {
  onPick: (tier: Tier) => void;
  disabled?: boolean;
}

export function TierPicker({ onPick, disabled }: TierPickerProps) {
  return (
    <div className="flex gap-3">
      {TIERS.map(({ tier, bg }) => (
        <button
          key={tier}
          onClick={() => onPick(tier)}
          disabled={disabled}
          style={{ backgroundColor: bg }}
          className="w-14 h-14 rounded-xl text-black font-black text-xl hover:scale-110 transition disabled:opacity-40"
        >
          {tier}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Create `components/RankingPlayer.tsx`**

```typescript
'use client';

import { useEffect, useState } from 'react';
import { useSpotifyPlayer } from '@/lib/useSpotifyPlayer';
import { TierPicker } from './TierPicker';
import type { RankingSession, SpotifyTrack, Tier } from '@/types';

interface RankingPlayerProps {
  session: RankingSession;
  tracks: SpotifyTrack[];
  accessToken: string;
  onRank: (track: SpotifyTrack, tier: Tier) => Promise<void>;
  onExit: () => void;
}

export function RankingPlayer({ session, tracks, accessToken, onRank, onExit }: RankingPlayerProps) {
  const [trackIndex, setTrackIndex] = useState(session.current_index);
  const [showPicker, setShowPicker] = useState(false);
  const [saving, setSaving] = useState(false);

  const currentTrack = tracks[trackIndex];

  const { playerState, playTrack, pause } = useSpotifyPlayer(accessToken, () => {
    setShowPicker(true);
  });

  useEffect(() => {
    if (playerState.isReady && currentTrack) {
      playTrack(currentTrack.uri);
    }
  }, [playerState.isReady, trackIndex]);

  async function handlePick(tier: Tier) {
    if (!currentTrack || saving) return;
    setSaving(true);
    await pause();
    await onRank(currentTrack, tier);
    const next = trackIndex + 1;
    setTrackIndex(next);
    setShowPicker(false);
    setSaving(false);
    if (next >= tracks.length) onExit();
  }

  async function handleDoneListening() {
    await pause();
    setShowPicker(true);
  }

  if (!currentTrack) {
    return (
      <div className="text-center space-y-4">
        <p className="text-2xl font-bold">All done!</p>
        <button
          onClick={onExit}
          className="font-semibold px-8 py-3 rounded-full text-black"
          style={{ backgroundColor: 'var(--spotify-green)' }}
        >
          See Results
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-8 w-full max-w-sm">
      <img src={session.cover_url} alt={session.name} className="w-48 h-48 rounded-2xl shadow-2xl" />

      <div className="text-center">
        <p className="text-xl font-bold">{currentTrack.name}</p>
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{currentTrack.artistName}</p>
        <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
          Track {trackIndex + 1} of {tracks.length}
        </p>
      </div>

      {!playerState.isReady && (
        <p className="text-sm animate-pulse" style={{ color: 'var(--text-muted)' }}>
          Connecting to Spotify…
        </p>
      )}

      {playerState.isReady && !showPicker && (
        <button
          onClick={handleDoneListening}
          className="px-6 py-3 rounded-full transition hover:opacity-80 text-white"
          style={{ backgroundColor: 'var(--surface-2)' }}
        >
          Done Listening →
        </button>
      )}

      {showPicker && (
        <div className="space-y-3 text-center">
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Rate this track</p>
          <TierPicker onPick={handlePick} disabled={saving} />
        </div>
      )}

      <button
        onClick={onExit}
        className="text-xs transition hover:text-white"
        style={{ color: 'var(--text-muted)' }}
      >
        Exit & Save
      </button>
    </div>
  );
}
```

- [ ] **Step 3: Create `app/rank/[id]/page.tsx`**

```typescript
'use client';

import { useSession } from 'next-auth/react';
import { useRouter, useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { RankingPlayer } from '@/components/RankingPlayer';
import { getAlbumTracks, getPlaylistTracks } from '@/lib/spotify';
import type { RankingSession, SpotifyTrack, Tier } from '@/types';

export default function RankPage() {
  const { data: authSession } = useSession();
  const router = useRouter();
  const { id } = useParams<{ id: string }>();

  const [rankingSession, setRankingSession] = useState<RankingSession | null>(null);
  const [tracks, setTracks] = useState<SpotifyTrack[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authSession?.accessToken) return;
    (async () => {
      const res = await fetch(`/api/session?id=${id}`);
      const session: RankingSession = await res.json();
      setRankingSession(session);

      const token = authSession.accessToken;
      const fetched =
        session.spotify_type === 'album'
          ? await getAlbumTracks(session.spotify_id, token)
          : await getPlaylistTracks(session.spotify_id, token);
      setTracks(fetched);
      setLoading(false);
    })();
  }, [authSession?.accessToken, id]);

  async function handleRank(track: SpotifyTrack, tier: Tier) {
    if (!rankingSession) return;
    const newIndex = rankingSession.current_index + 1;
    const completed = newIndex >= rankingSession.total_tracks;
    await fetch('/api/rankings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: rankingSession.id,
        trackId: track.id,
        trackName: track.name,
        artistName: track.artistName,
        tier,
        newIndex,
        completed,
      }),
    });
    setRankingSession((s) => s ? { ...s, current_index: newIndex, completed } : s);
  }

  if (!authSession) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p style={{ color: 'var(--text-muted)' }}>Please log in to rank tracks.</p>
      </main>
    );
  }
  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p className="animate-pulse" style={{ color: 'var(--text-muted)' }}>Loading…</p>
      </main>
    );
  }
  if (!rankingSession) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p style={{ color: 'var(--text-muted)' }}>Session not found.</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-4 py-12">
      <RankingPlayer
        session={rankingSession}
        tracks={tracks}
        accessToken={authSession.accessToken}
        onRank={handleRank}
        onExit={() => router.push(`/results/${id}`)}
      />
    </main>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add components/TierPicker.tsx components/RankingPlayer.tsx app/rank/
git commit -m "feat: add ranking flow with Spotify playback and tier picker"
```

---

## Task 15: Results + share page

**Files:**
- Create: `components/TierList.tsx`
- Create: `components/SharePanel.tsx`
- Create: `app/results/[id]/page.tsx`
- Modify: `lib/share.ts` (add `exportTierListImage`)

- [ ] **Step 1: Add `exportTierListImage` to `lib/share.ts`**

```typescript
import type { RankingSession, SongRanking, Tier } from '@/types';

const TIERS: Tier[] = ['S', 'A', 'B', 'C', 'F'];

export function formatTierText(
  session: RankingSession,
  rankings: SongRanking[],
  subtitle: string
): string {
  const grouped: Record<Tier, string[]> = { S: [], A: [], B: [], C: [], F: [] };
  for (const r of rankings) grouped[r.tier].push(r.track_name);

  const tierLines = TIERS.map((tier) => {
    const songs = grouped[tier].length > 0 ? grouped[tier].join(', ') : '—';
    return `${tier}  ${songs}`;
  }).join('\n');

  return `🎵 ${session.name} — ${subtitle}\n\n${tierLines}`;
}

export async function exportTierListImage(element: HTMLElement): Promise<void> {
  const { toPng } = await import('html-to-image');
  const dataUrl = await toPng(element, { cacheBust: true });
  const link = document.createElement('a');
  link.download = 'tier-list.png';
  link.href = dataUrl;
  link.click();
}
```

- [ ] **Step 2: Create `components/TierList.tsx`**

```typescript
import type { SongRanking, Tier } from '@/types';

const TIER_COLORS: Record<Tier, string> = {
  S: '#FF4444',
  A: '#FF9944',
  B: '#FFDD44',
  C: '#44DD44',
  F: '#4488FF',
};

const TIERS: Tier[] = ['S', 'A', 'B', 'C', 'F'];

interface TierListProps {
  rankings: SongRanking[];
}

export function TierList({ rankings }: TierListProps) {
  const grouped: Record<Tier, SongRanking[]> = { S: [], A: [], B: [], C: [], F: [] };
  for (const r of rankings) grouped[r.tier].push(r);

  return (
    <div className="w-full space-y-1">
      {TIERS.map((tier) => (
        <div key={tier} className="flex rounded-lg overflow-hidden">
          <div
            style={{ backgroundColor: TIER_COLORS[tier] }}
            className="w-14 flex items-center justify-center font-black text-xl text-black flex-shrink-0 py-3"
          >
            {tier}
          </div>
          <div
            className="flex-1 flex flex-wrap items-center gap-2 px-4 py-3 min-h-[52px]"
            style={{ backgroundColor: 'var(--surface)' }}
          >
            {grouped[tier].length === 0 ? (
              <span className="text-sm" style={{ color: 'var(--text-muted)' }}>—</span>
            ) : (
              grouped[tier].map((r) => (
                <span
                  key={r.id}
                  className="text-sm px-3 py-1 rounded-full"
                  style={{ backgroundColor: 'var(--surface-2)' }}
                >
                  {r.track_name}
                </span>
              ))
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Create `components/SharePanel.tsx`**

```typescript
'use client';

import type { RefObject } from 'react';
import { formatTierText, exportTierListImage } from '@/lib/share';
import type { RankingSession, SongRanking } from '@/types';

interface SharePanelProps {
  session: RankingSession;
  rankings: SongRanking[];
  subtitle: string;
  tierListRef: RefObject<HTMLDivElement | null>;
}

export function SharePanel({ session, rankings, subtitle, tierListRef }: SharePanelProps) {
  async function handleCopyText() {
    const text = formatTierText(session, rankings, subtitle);
    await navigator.clipboard.writeText(text);
    alert('Copied to clipboard!');
  }

  async function handleDownloadImage() {
    if (!tierListRef.current) return;
    await exportTierListImage(tierListRef.current);
  }

  return (
    <div className="flex gap-3">
      <button
        onClick={handleCopyText}
        className="flex-1 font-medium px-4 py-3 rounded-full transition hover:opacity-80 text-white"
        style={{ backgroundColor: 'var(--surface-2)' }}
      >
        Copy Text
      </button>
      <button
        onClick={handleDownloadImage}
        className="flex-1 font-semibold px-4 py-3 rounded-full hover:scale-105 transition text-black"
        style={{ backgroundColor: 'var(--spotify-green)' }}
      >
        Download Image
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Create `app/results/[id]/page.tsx`**

```typescript
'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { TierList } from '@/components/TierList';
import { SharePanel } from '@/components/SharePanel';
import type { RankingSession, SongRanking } from '@/types';

export default function ResultsPage() {
  const { id } = useParams<{ id: string }>();
  const [rankingSession, setRankingSession] = useState<RankingSession | null>(null);
  const [rankings, setRankings] = useState<SongRanking[]>([]);
  const [loading, setLoading] = useState(true);
  const tierListRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    (async () => {
      const [sessionRes, rankingsRes] = await Promise.all([
        fetch(`/api/session?id=${id}`),
        fetch(`/api/rankings?sessionId=${id}`),
      ]);
      setRankingSession(await sessionRes.json());
      setRankings(await rankingsRes.json());
      setLoading(false);
    })();
  }, [id]);

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p className="animate-pulse" style={{ color: 'var(--text-muted)' }}>Loading…</p>
      </main>
    );
  }
  if (!rankingSession) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p style={{ color: 'var(--text-muted)' }}>Not found.</p>
      </main>
    );
  }

  const subtitle = rankings[0]?.artist_name ?? '';

  return (
    <main className="min-h-screen flex flex-col items-center px-4 py-12">
      <div className="w-full max-w-xl space-y-6">
        <div className="flex items-center gap-4">
          <img src={rankingSession.cover_url} alt={rankingSession.name} className="w-16 h-16 rounded-xl object-cover" />
          <div>
            <h1 className="text-xl font-bold">{rankingSession.name}</h1>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{subtitle}</p>
          </div>
        </div>

        <div ref={tierListRef} className="rounded-xl overflow-hidden">
          <TierList rankings={rankings} />
        </div>

        <SharePanel
          session={rankingSession}
          rankings={rankings}
          subtitle={subtitle}
          tierListRef={tierListRef}
        />

        <p className="text-xs text-center" style={{ color: 'var(--text-muted)' }}>
          Share this link:{' '}
          <span className="underline break-all">
            {typeof window !== 'undefined' ? window.location.href : ''}
          </span>
        </p>
      </div>
    </main>
  );
}
```

- [ ] **Step 5: Commit**

```bash
git add components/TierList.tsx components/SharePanel.tsx app/results/ lib/share.ts
git commit -m "feat: add results page with tier list, copy text, and download image"
```

---

## Task 16: Vercel deployment

**Files:**
- No extra config needed — Vercel auto-detects Next.js.

- [ ] **Step 1: Add production redirect URI to Spotify Developer Dashboard**

In your Spotify app settings → Redirect URIs, add:
`https://<your-vercel-domain>/api/auth/callback/spotify`

- [ ] **Step 2: Set Vercel env vars**

In Vercel dashboard → Project Settings → Environment Variables, add:
```
SPOTIFY_CLIENT_ID       = <same as local>
SPOTIFY_CLIENT_SECRET   = <same as local>
NEXTAUTH_URL            = https://<your-vercel-domain>
NEXTAUTH_SECRET         = <same as local>
DATABASE_URL            = <neon pooled connection string>
```

- [ ] **Step 3: Run migration against Neon (already done in Task 3, same DB)**

The dev migration already created the tables. If you use a separate Neon branch for prod, run:

```bash
DATABASE_URL=<prod-connection-string> npm run migrate
```

Expected: `Migration complete.`

- [ ] **Step 4: Deploy**

```bash
npx vercel --prod
```

Expected: build succeeds, app live at your Vercel URL.

- [ ] **Step 5: Smoke test**

1. Open the Vercel URL
2. Click "Login with Spotify" — should redirect to Spotify and back
3. Search for an album — results appear
4. Click "Start Ranking" — navigates to `/rank/[id]`
5. SDK connects ("Connecting to Spotify…" disappears)
6. Track plays, click "Done Listening →", tier buttons appear
7. Pick a tier — next track plays
8. Click "Exit & Save" — navigates to `/results/[id]`
9. Tier list renders, "Copy Text" and "Download Image" work

- [ ] **Step 6: Final commit**

```bash
git add .
git commit -m "feat: complete Spotify Ranker — search, rank, export, deploy"
```
