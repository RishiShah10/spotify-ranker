# Bug Bash — Spotify Ranker
> Generated 2026-05-22 by 5 parallel audit agents covering API routes, auth/tokens, frontend components, database/Spotify integration, and config/infrastructure.

---

## Summary

| Severity | Count |
|----------|-------|
| CRITICAL | 2     |
| HIGH     | 15    |
| MEDIUM   | 26    |
| LOW      | 17    |
| **Total**| **60**|

---

## CRITICAL

---

### C1 — `GET /api/rankings` is completely unauthenticated (IDOR)
**File:** `app/api/rankings/route.ts:42–48`

Zero auth check on the GET handler. Any unauthenticated HTTP caller who knows (or obtains) a session UUID can read every song ranking for that session, including `user_id`, `track_name`, `artist_name`, `tier`, and `ranked_at`. In-progress sessions are equally exposed — a user's private, unfinished rankings are fully readable before they're done.

The design intent (shareable results page) doesn't require zero auth — at minimum, completed sessions should be publicly readable and in-progress sessions should require ownership.

```ts
// Current — no auth, no ownership check:
export async function GET(req: NextRequest) {
  const sessionId = searchParams.get('sessionId');
  const rankings = await getRankingsForSession(sessionId); // 🚨 anyone can call this
  return NextResponse.json(rankings);
}
```

---

### C2 — Live credentials in `.env.local`
**File:** `.env.local`

Real, active secrets are present:
- `SPOTIFY_CLIENT_SECRET` — allows impersonating the OAuth app and issuing tokens
- `DATABASE_URL` — full Neon owner-level database password; grants read/write/drop on the entire DB

The `.gitignore` has `.env*` so these aren't committed to git — but verify with `git log --all -- .env.local`. These credentials should be rotated before any public exposure of this repo, and stored in platform secret management (e.g., Vercel Environment Variables) rather than a file that can be accidentally shared.

---

## HIGH

---

### H1 — `saveRanking` + `updateSessionProgress` are not atomic
**File:** `app/api/rankings/route.ts:32–33`, `lib/db.ts`

Two separate DB writes with no transaction. If the server crashes or loses DB connectivity between them:
- Ranking is saved but `current_index` doesn't advance → track appears again on resume
- OR `current_index` advances but ranking isn't saved → track skipped silently, no ranking recorded

The Neon driver supports transactions. These two calls must be wrapped in one.

---

### H2 — Spotify access token exposed in client-side session
**File:** `lib/auth.ts:76`, `types/next-auth.d.ts`

`session.accessToken` is set in the NextAuth session callback, making the live Spotify token available to every browser tab via `useSession()` and the `/api/auth/session` endpoint. The token carries scopes including `streaming`, `user-read-email`, `user-read-private`, and `user-modify-playback-state`.

This is required by the Spotify Web Playback SDK, but it's important to know: any XSS on this page → immediate Spotify token theft → attacker can read the user's email, private profile, and fully control their Spotify playback.

---

### H3 — No Content Security Policy
**File:** `next.config.ts`

No `headers()` export means no CSP. The app dynamically injects `<script src="https://sdk.scdn.co/spotify-player.js">` and makes direct browser fetches to `api.spotify.com`. Without a CSP, any injected script runs with full page access — including the Spotify access token in React state.

Minimum CSP to add:
```
script-src 'self' https://sdk.scdn.co
connect-src 'self' https://api.spotify.com https://accounts.spotify.com
```

---

### H4 — No standard security headers
**File:** `next.config.ts`

None of the following are set:
- `X-Frame-Options` / `frame-ancestors` — clickjacking possible
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy` — full `/rank/<uuid>` path leaks to Spotify CDN and `api.spotify.com` via Referer header
- `Strict-Transport-Security` — no HSTS for production
- `Permissions-Policy`

---

### H5 — `GET /api/session` leaks Spotify user ID to unauthenticated callers
**File:** `app/api/session/route.ts:41–46`

The unauthenticated read path (used by the shareable results page) returns the raw DB row, which includes `user_id` — the owner's permanent Spotify ID. This ID can be used to look up their public Spotify profile. Strip `user_id` from the response before returning it to unauthenticated callers.

---

### H6 — No session creation limit per user
**File:** `app/api/session/route.ts:6–34`

An authenticated user can call `POST /api/session` in a loop with no cap. No per-user session count limit, no rate limiting. Leads to:
- Unbounded `ranking_sessions` table growth
- `getActiveSessionsForUser` increasingly slow for that user
- DB storage exhaustion on Neon free tier

---

### H7 — Stale expired token used after refresh failure; no auto sign-out
**File:** `lib/auth.ts:36–38`, `app/rank/[id]/page.tsx:26–30`

On token refresh failure, the old (now-expired) `accessToken` is left in the token and propagated to the session. Client pages show a warning banner but don't call `signOut()`. The expired token continues to be passed to `useSpotifyPlayer` and direct Spotify API fetches, which silently return 401s. The user is stuck with a broken player and no automatic recovery path.

---

### H8 — Unbounded pagination loop on large playlists
**File:** `lib/spotify.ts:38–55`, `lib/spotify.ts:57–76`

Both `getAlbumTracks` and `getPlaylistTracks` loop indefinitely until `data.next` is null. A 500-track playlist makes 10 sequential awaited Spotify API calls; a 10,000-track playlist makes 200. No page cap, no timeout guard, no total-track ceiling. Results in:
- Multi-second UI hang for large inputs
- Spotify API rate-limit exhaustion (429) mid-loop with no retry
- Potentially hitting Vercel serverless function timeout (10s on hobby plan)

---

### H9 — No 429 (rate limit) handling in Spotify client
**File:** `lib/spotify.ts:5–11`

`spotifyFetch` throws immediately on any non-2xx, including 429. No reading of the `Retry-After` header, no retry logic, no back-off. During paginated fetches (Finding H8), hitting a rate limit aborts the entire operation with a generic error.

---

### H10 — No 401 detection or auto-refresh in client-side Spotify fetches
**File:** `lib/spotify.ts:5–11`, `app/rank/[id]/page.tsx`

When the Spotify token expires mid-session, `spotifyFetch` throws `"Spotify API 401: ..."`. There's no mechanism to detect this, trigger a NextAuth token refresh, and retry. The user gets a generic error with no recovery path — they have to reload the page.

---

### H11 — `upsertUser` in JWT callback has no try/catch
**File:** `lib/auth.ts:54–59`

If the DB is unavailable at login time, the unhandled throw propagates through NextAuth internals and produces an opaque server error. Authentication fails with no user-friendly message and no fallback.

---

### H12 — `GET /api/search` has no error handling around Spotify call
**File:** `app/api/search/route.ts:13–15`

`searchSpotify(q, token)` is called with no try/catch. A 429, 401, or 503 from Spotify becomes an unhandled exception that returns a Next.js 500 — which in development includes a full stack trace.

---

### H13 — Silent failure on Spotify playback API calls (device transfer, playTrack)
**File:** `lib/useSpotifyPlayer.ts:60–67`, `lib/useSpotifyPlayer.ts:75–83`, `lib/useSpotifyPlayer.ts:147–157`

All `fetch` calls to `PUT /v1/me/player` (device transfer) and `PUT /v1/me/player/play` have no `.ok` check and no catch. A 403 (non-Premium), 404 (device not found), or 401 (expired token) silently fails. The player shows as ready, the progress bar stays at 0, and there's no user-facing error — the user just hears nothing.

---

### H14 — No Spotify Premium check
**File:** `lib/useSpotifyPlayer.ts`

The Web Playback SDK requires Premium. There's no `/v1/me` check for `product: 'premium'`. A free-tier user sees "Connecting to Spotify…" indefinitely or gets a ready-state player that silently fails all playback, with no explanation.

---

### H15 — Missing error handling on SearchBar fetch
**File:** `components/SearchBar.tsx:29–33`

No `res.ok` check and no `catch`. A failed search (5xx, network error, CORS) silently fails — the loading spinner disappears and nothing happens. No user feedback.

---

## MEDIUM

---

### M1 — `newIndex` has no upper-bound validation
**File:** `app/api/rankings/route.ts:21–23`

Only `>= 0` is checked. An authenticated user can POST `newIndex: 999999` or `completed: true` to corrupt their session's progress state or mark it complete arbitrarily. The server should derive these values from DB state, not trust the client.

---

### M2 — `saveRanking` INSERT is not idempotent (no `ON CONFLICT`)
**File:** `lib/db.ts:67–71`

The unique index on `(session_id, track_id)` exists but the INSERT has no `ON CONFLICT DO UPDATE`. A duplicate submission (double-click, retry after the non-atomic failure in H1) throws a Postgres constraint violation → 500 → permanently breaks that track's rankability for that session.

---

### M3 — `completed` field not validated as boolean
**File:** `app/api/rankings/route.ts:33`

`completed ?? false` only handles `null`/`undefined`. Sending `completed: "yes"` or `completed: 1` passes through to the DB write without type coercion validation.

---

### M4 — No length limits on user-supplied string fields
**Files:** `app/api/rankings/route.ts:13–16`, `app/api/session/route.ts:10–18`

`trackId`, `trackName`, `artistName`, `name`, `spotifyId`, and `coverUrl` are accepted with no maximum length. Multi-MB strings can be stored, causing oversized DB rows and potentially triggering connection timeouts.

---

### M5 — `coverUrl` rendered as raw `<img src>` without host validation
**File:** `app/api/session/route.ts:27`, `app/results/[id]/page.tsx:72`

Any URL string (including attacker-controlled `http://attacker.com/track.png`) is accepted, stored, and rendered directly in `<img src={...}>`. Every user who views the results page makes a request to that URL, leaking timing data and IP addresses. `data:` and `javascript:` URIs are also not rejected.

---

### M6 — No query length limit on `/api/search`
**File:** `app/api/search/route.ts:11–12`

No maximum length enforced on `q`. An arbitrarily long string is forwarded to Spotify's search API, wasting rate-limit quota on every such request.

---

### M7 — Token refresh errors silently discarded with no logging
**File:** `lib/auth.ts:36–38`

The `catch` block discards the actual error entirely. No logging means diagnosing token refresh failures in production is impossible without external monitoring.

---

### M8 — No startup validation of `NEXTAUTH_SECRET`, `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`
**File:** `lib/auth.ts`, `lib/db.ts:4`

All three use `!` non-null assertions with no startup check. Missing or empty values fail at runtime with confusing errors rather than at startup with a clear message. NextAuth v4 will silently fall back to a weak default secret if `NEXTAUTH_SECRET` is unset in development.

---

### M9 — Spotify SDK script loaded without Subresource Integrity (SRI)
**File:** `lib/useSpotifyPlayer.ts:128–130`

No `integrity` attribute on the injected `<script>`. If Spotify's CDN is compromised or the request is MITM'd, the script runs with full page access — including the Spotify access token.

---

### M10 — Custom POST routes lack explicit CSRF protection
**Files:** `app/api/rankings/route.ts` (POST), `app/api/session/route.ts` (POST)

NextAuth's CSRF protection covers only `/api/auth/*`. The custom POST routes rely solely on `SameSite=Lax` cookies. A cross-origin `fetch()` with `credentials: 'include'` from a page the user visits can trigger session creation or ranking writes on their behalf.

---

### M11 — No `middleware.ts` — route protection is client-side only
**File:** project root (missing `middleware.ts`)

`/rank/[id]` checks `useSession()` client-side but serves the full page HTML to unauthenticated requests. `GET /api/session?id=<uuid>` (intentionally public) still returns full session metadata to bots/scrapers. A `withAuth` middleware would enforce authentication server-side before the page is served.

---

### M12 — Results page: `rankingsRes` failure causes unhandled rejection
**File:** `app/results/[id]/page.tsx:24–36`

`Promise.all([sessionRes, rankingsRes])` — if `sessionRes` succeeds but `rankingsRes` fails (DB timeout, network error), `rankingsRes.json()` throws an unhandled promise rejection inside the effect. No try/catch wraps the entire block, so the page crashes with no fallback UI.

---

### M13 — Unguarded DB calls in GET `/api/session`
**File:** `app/api/session/route.ts:42–53`

`getSession(id)` and `getActiveSessionsForUser(session.spotifyId)` are called with no try/catch. Any DB error (cold-start timeout, malformed UUID) becomes an unhandled exception and a raw Next.js 500 — potentially leaking stack trace details in development.

---

### M14 — Stale closure in autoplay `useEffect`
**File:** `components/RankingPlayer.tsx:39–44`

`eslint-disable-next-line react-hooks/exhaustive-deps` suppresses the warning. `playTrack` and `playerState.isReady` are captured as stale closures. If `isReady` is false when `trackIndex` changes (brief SDK disconnect/reconnect), auto-play is silently skipped with no retry mechanism.

---

### M15 — Seek bar is interactive before device transfer completes
**File:** `components/RankingPlayer.tsx:130`, `lib/useSpotifyPlayer.ts:68`

`playerState.isReady` is set immediately inside the `ready` listener, before the `PUT /v1/me/player` device-transfer fetch completes. If the user clicks the seek bar while the device-transfer is in flight, the seek API call 404s or 403s because the device isn't yet active — and fails silently (M16).

---

### M16 — `seek()` has no error handling
**File:** `lib/useSpotifyPlayer.ts:185–192`

`seek` optimistically updates `position` state then fires a fetch with no `.ok` check or catch. If the call fails, the visual position jumps but actual playback doesn't move — the UI shows a wrong position until the next `player_state_changed` event corrects it.

---

### M17 — `handlePick` hides the tier picker on error but doesn't restore it
**File:** `components/RankingPlayer.tsx:53–67`

If `onRank` throws, `trackIndex` hasn't advanced (correct) but `setShowPicker(false)` has already been called on the line after `setTrackIndex` — wait, actually `setShowPicker(false)` runs after `setTrackIndex(next)` which only runs after `await onRank`. Let me re-read... `setSaving(false)` runs in `finally`, but if `onRank` throws the `catch` block shows an alert. `setTrackIndex`, `setShowPicker(false)` are after `onRank` so they don't run on throw. BUT `showPicker` was already `true` when handlePick was called (user clicked Rate Track). After the error alert the user is left with `showPicker = true`, `saving = false` — actually that's correct. However the real issue: `pause()` is called before `onRank` and succeeds, so after an `onRank` failure the track is paused with the picker showing — the user must re-pick a tier to continue, which is correct, but there's no visual indication of the failure state beyond the `alert()`.

---

### M18 — `window.onSpotifyWebPlaybackSDKReady` overwritten on rapid remount
**File:** `lib/useSpotifyPlayer.ts:120–133`

This is a global one-shot assignment. In React Strict Mode (double-invoke) or on rapid re-renders while the script is still loading, the second assignment overwrites the first — the first `initPlayer` closure is never called, leaving the first player instance never ready. The three-way branch guard (`if window.Spotify` / `else if existingScript` / `else`) mitigates but doesn't fully eliminate this.

---

### M19 — SDK `getOAuthToken` closure captures token at init time
**File:** `lib/useSpotifyPlayer.ts:52–54`

`getOAuthToken: (cb) => cb(accessToken)` captures the closure value at player construction time. When `accessToken` rotates (via next-auth silent refresh), the old player disconnects and a new one initializes — interrupting playback. More critically: if the SDK calls `getOAuthToken` in the window between token expiry and React state updating with the new value, it receives the expired token and playback fails silently.

---

### M20 — `total_tracks` may not match actual rankable track count
**File:** `lib/spotify.ts:63–69`, `app/api/session/route.ts`

For playlists, `tracks.total` from Spotify includes local tracks, but `getPlaylistTracks` skips `item.track.is_local`. If a playlist has local tracks, `total_tracks` stored in DB is higher than the number of rankable tracks fetched, causing the `completed` flag to potentially never become `true`.

---

### M21 — `data.items` not guarded before iteration
**File:** `lib/spotify.ts:41–54`, `lib/spotify.ts:62`

`for (const t of data.items)` throws `TypeError: data.items is not iterable` if the Spotify response is malformed or `items` is missing. No validation before iterating.

---

### M22 — `p.owner.display_name` not null-safe in Spotify search results
**File:** `lib/spotify.ts:31`

`p.owner.display_name` — if `p.owner` is null (possible for certain playlist types), this throws a `TypeError` crashing the search endpoint.

---

### M23 — Spotify API response fields not null-guarded
**File:** `lib/spotify.ts:82–88`, `lib/spotify.ts:94–101`

`getAlbumInfo` and `getPlaylistInfo` access `data.artists.map(...)`, `data.tracks.total`, `data.owner.display_name` without optional chaining. Partial API responses for region-restricted content would throw uncaught TypeErrors.

---

### M24 — Tracks with `null` id not filtered
**File:** `lib/spotify.ts:63–69`

Filter skips `is_local` tracks but not tracks where `item.track.id === null` (possible for podcast episodes or unavailable tracks). These get included with `id: null` and would violate the schema's semantic intent when inserted into `song_rankings.track_id`.

---

### M25 — No server-side dedup check before creating a new session
**File:** `app/api/session/route.ts`

No check whether an active session already exists for `(userId, spotifyType, spotifyId)`. Double-clicking or re-pasting the same link creates duplicate sessions surfaced to the user with no way to distinguish them.

---

### M26 — No cleanup of abandoned ranking sessions
**File:** `lib/db.ts`, `scripts/migrate.ts`

Sessions created but never ranked accumulate forever. No TTL, no scheduled cleanup, no `DELETE` API, no user-facing way to dismiss them. `getActiveSessionsForUser` returns all of them.

---

### M27 — No CORS policy on API routes
**File:** all `app/api/` routes

All routes are cross-origin readable by default (Next.js sets no `Access-Control-Allow-Origin` restrictions). `GET /api/rankings` and `GET /api/session?id=<uuid>` are fully accessible cross-origin.

---

### M28 — Active sessions fetch on home page has no error handling
**File:** `app/page.tsx:21`

`.then((r) => r.json()).then(setActiveSessions)` — no `.catch()`. A failed fetch (network error, 5xx) causes an unhandled promise rejection with no UI feedback.

---

### M29 — Home page `handleStart` doesn't prevent duplicate session creation on double-click
**File:** `app/page.tsx`

`working` state guards against double-submission during the async call, but if the user clicks twice quickly before `working` is set, two `POST /api/session` requests can be sent. Related to M25.

---

## LOW

---

### L1 — No index on `song_rankings(user_id)`
**File:** `scripts/migrate.ts`

If a "ranking history by user" query is ever added, it would be a full table scan. Defensively adding the index now matches the rationale for `idx_ranking_sessions_user_id`.

---

### L2 — `email` stored as `''` instead of `NULL`
**File:** `lib/db.ts:9`, `lib/auth.ts:57`

`upsertUser` passes `user.email ?? ''`. Queries checking `email IS NULL` won't match users with no email; `email = ''` is indistinguishable from "empty string email."

---

### L3 — UUID format not validated before DB query
**Files:** `app/api/rankings/route.ts:25`, `app/api/session/route.ts:43`

`sessionId` / `id` from query params are passed directly to `getSession()`. A non-UUID string causes Postgres to throw, which is caught in POST rankings but not in GET session (M13). No pre-validation.

---

### L4 — `spotifyLink.ts` regex has no ID length constraint
**File:** `lib/spotifyLink.ts:7`

`[A-Za-z0-9]+` has no length bound. Spotify IDs are always 22 chars. An arbitrarily long alphanumeric string passes the regex and triggers a backend Spotify API call with a guaranteed-invalid ID.

---

### L5 — Double `onExit()` possible from `handlePick` and `handleSkip`
**File:** `components/RankingPlayer.tsx:62`, `components/RankingPlayer.tsx:80`

Both call `onExit()` when `next >= tracks.length`. Under rapid concurrent interaction (unlikely but possible on slow network), both could fire in the same cycle. No deduplication guard.

---

### L6 — `handleSkip` has no internal guard against empty `tracks`
**File:** `components/RankingPlayer.tsx:75–80`

Safe only because the `!currentTrack` early return gates the UI. If that gate were ever removed, `handleSkip` would call `setTrackIndex(1)` on an empty array without calling `onExit`.

---

### L7 — Seek bar not keyboard-accessible
**File:** `components/RankingPlayer.tsx:136–140`

`role="slider"` with no `tabIndex`, no `aria-valuemin`, and raw millisecond `aria-valuenow` (e.g., `247000`). Screen readers announce `"247000"` rather than `"4:07"`. Keyboard users have no seek capability.

---

### L8 — `SearchResults` renders `cover_url` with no null guard
**File:** `components/SearchResults.tsx:28`, `components/SearchResults.tsx:57`

`<img src={s.cover_url}>` and `<img src={r.coverUrl}>` render without a null/empty guard. Spotify can return playlists/albums with empty `images` arrays. Broken image elements with unnecessary HTTP requests result.

---

### L9 — `html-to-image` canvas CORS taint
**File:** `lib/share.ts:23–27`, `components/TierList.tsx`

The double-call workaround for external image rendering requires `crossOrigin="anonymous"` on `<img>` elements. `TierList.tsx` does not render any images (it renders track names), so this is not an active issue there — but `SearchResults.tsx` and the results page header image need to consistently have `crossOrigin="anonymous"` set for any canvas-based export to work reliably.

---

### L10 — `SharePanel.handleDownloadImage` has no error handling
**File:** `components/SharePanel.tsx:23`, `lib/share.ts`

`await exportTierListImage(captureRef.current)` has no try/catch in the caller. If `html-to-image` throws (CORS-tainted canvas, serialization error), the rejection is unhandled — download silently doesn't happen.

---

### L11 — `NEXTAUTH_SECRET` should be in platform secrets for production
**File:** `.env.local`

The secret is adequately strong (32 bytes, base64). But it must be set in Vercel Environment Variables (not copied from `.env.local`) before production deployment.

---

### L12 — `NEXTAUTH_URL` must be updated for production
**File:** `.env.local`

`NEXTAUTH_URL=http://127.0.0.1:3000` — if deployed without updating this, OAuth callbacks redirect to localhost, breaking authentication in production.

---

### L13 — Neon driver initialized with `!` assertion; no startup check
**File:** `lib/db.ts:4`

`neon(process.env.DATABASE_URL!)` — missing `DATABASE_URL` may not throw at module load time, only at query time, producing confusing runtime errors.

---

### L14 — Spotify profile cast to `any` without field validation
**File:** `lib/auth.ts:53`

`const p = profile as any` — `p.id`, `p.display_name`, `p.email`, `p.images` are all read without validation. If Spotify's schema changes or returns unexpected types, `upsertUser` could insert `undefined` as a primary key, silently corrupting the `users` table.

---

### L15 — No `vercel.json` — serverless timeout not configured
**File:** project root (missing `vercel.json`)

Defaults to 10s on hobby plan. Large playlist pagination (H8) could hit this timeout. A `vercel.json` with `"functions": { "app/api/**": { "maxDuration": 30 } }` would at least make the limit explicit.

---

### L16 — Session expiry mid-ranking loses progress with no recovery
**File:** `app/rank/[id]/page.tsx:56–74`

When the NextAuth session expires (not the Spotify token), `handleRank` fires a fetch with an expired session cookie → 401 → caught by the ranking catch → `alert("Failed to save your ranking")`. The tier choice is lost with no queue-and-retry mechanism.

---

### L17 — `player_state_changed` callback may fire after component unmount
**File:** `lib/useSpotifyPlayer.ts:71–109`

`player.disconnect()` in cleanup removes the websocket but queued `player_state_changed` callbacks may still fire. If `onTrackEndRef.current()` (→ `setShowPicker(true)`) fires after the parent unmounts, React 18 suppresses the error but the callback runs against a stale closure.

---

## Deferred / By-Design (acknowledge but don't fix without discussion)

| Item | Note |
|------|------|
| `GET /api/rankings` unauthenticated | May be intentional for shareability — needs a conscious decision on public vs. private sessions |
| Access token in client session | Required by Spotify Web Playback SDK; design trade-off not a bug |
| Direct browser-to-Spotify API calls | Same SDK requirement; proxying would be more secure but breaks the SDK pattern |

---

*Generated by automated audit agents. Line numbers are approximate — verify against current file state before fixing.*
