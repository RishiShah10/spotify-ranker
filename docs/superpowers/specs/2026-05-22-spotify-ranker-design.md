# Spotify Ranker — Design Spec
**Date:** 2026-05-22
**Status:** Approved

---

## Overview

A web app where users log in with Spotify, search for or paste a link to an album or playlist, listen to each track in order, and rank each song into S/A/B/C/F tiers. Rankings are saved per user and sessions are resumable. After completing (or exiting) a session, users see a tier list they can export as an image or copy as clean text.

---

## Constraints & Notes

- **Spotify Premium required** for in-browser playback via the Web Playback SDK. A simple blurb is shown on the login/home screen explaining this requirement.
- Auth is Spotify OAuth only — no username/password accounts.
- Ranking is solo per user — no shared/collaborative sessions.
- Songs play in track order (no shuffle).

---

## Architecture

**Stack:**
- Next.js 14 (App Router) + TypeScript
- Deployed on Vercel
- Neon (PostgreSQL) via `@neondatabase/serverless`
- Auth via `next-auth` with Spotify provider
- Spotify Web Playback SDK for in-browser playback
- Spotify Web API for search and metadata
- `html-to-image` for client-side image export

**Repo structure:**
```
spotify-ranker/
├── app/
│   ├── api/
│   │   ├── auth/[...nextauth]/   # Spotify OAuth via next-auth
│   │   ├── rankings/             # Save/fetch rankings
│   │   └── session/              # Create/resume ranking sessions
│   ├── (pages)/
│   │   ├── page.tsx              # Home / search
│   │   ├── rank/[id]/page.tsx    # Ranking flow
│   │   └── results/[id]/page.tsx # Share/export screen
├── components/
├── lib/
│   ├── db.ts                     # Neon client
│   ├── spotify.ts                # Spotify Web API helpers
│   └── share.ts                  # Text and image export logic
└── types/
```

---

## Data Model (Neon/PostgreSQL)

### `users`
| Column | Type | Notes |
|---|---|---|
| id | TEXT PK | Spotify user ID |
| display_name | TEXT | |
| email | TEXT | |
| avatar_url | TEXT | |
| created_at | TIMESTAMPTZ | |

### `ranking_sessions`
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| user_id | TEXT FK → users | |
| spotify_type | TEXT | `'album'` or `'playlist'` |
| spotify_id | TEXT | Spotify album/playlist ID |
| name | TEXT | Album or playlist name |
| cover_url | TEXT | |
| total_tracks | INT | |
| current_index | INT | Resume pointer, default 0 |
| completed | BOOLEAN | Default false |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |

### `song_rankings`
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| session_id | UUID FK → ranking_sessions | |
| user_id | TEXT FK → users | |
| track_id | TEXT | Spotify track ID |
| track_name | TEXT | |
| artist_name | TEXT | |
| tier | TEXT | `'S'`, `'A'`, `'B'`, `'C'`, `'F'` |
| ranked_at | TIMESTAMPTZ | |

`current_index` is the resume mechanism. On session load, we fast-forward to that track index.

---

## User Flow

### 1. Home / Search (`/`)
- "Login with Spotify" if not authenticated
- Small blurb: "Spotify Premium required for playback"
- Once logged in:
  - Search bar → calls Spotify `/v1/search?type=album,playlist`
  - Paste-a-link input → parses Spotify URL via regex to extract type + ID
  - Results show: cover art, name, artist/owner, track count, "Start Ranking" button
  - In-progress sessions shown with a "Resume" badge

### 2. Ranking Flow (`/rank/[sessionId]`)
- Album/playlist cover and name at top
- Progress indicator: "Track 4 of 12"
- Track plays automatically via Spotify Web Playback SDK
- Listen to player state via `player_state_changed` — when track ends, playback pauses and tier picker appears
- User can also manually click "Done Listening" to trigger the tier picker early
- **Tier buttons:** S / A / B / C / F — styled in classic tier list colors:
  - S = red/gold
  - A = orange
  - B = yellow
  - C = green
  - F = gray/blue
- Picking a tier → saves `song_ranking` to DB + increments `current_index` → next track auto-plays
- "Exit & Save" button available at any time → saves progress, redirects to results screen
- On revisit: loads session and resumes from `current_index`

### 3. Results / Share (`/results/[sessionId]`)
- Tier list grouped S → A → B → C → F
- Each tier shows song names and artist
- **Copy Text** button: formatted markdown-style block, e.g.:
  ```
  🎵 Blonde — Frank Ocean

  S  Nights, Self Control, Ivy
  A  Pink + White, Solo
  B  Nikes, White Ferrari
  C  Facebook Story
  F  —
  ```
- **Download Image** button: renders the tier list DOM node to PNG via `html-to-image`
- Public share URL: `/results/[sessionId]` is readable without auth (read-only view)

---

## Key Technical Details

### Spotify Web Playback SDK
- Requires Premium — enforced with a UI blurb, not a hard block
- Provides a `player` object; we use `player_state_changed` to detect track end
- Tracks loaded by Spotify URI: `spotify:track:<id>`

### Spotify OAuth + Token Refresh
- `next-auth` Spotify provider stores `access_token` and `refresh_token` in JWT
- Token refresh handled via `next-auth` JWT callback — transparent to the rest of the app

### Search
- `GET /v1/search?q=<query>&type=album,playlist` using the user's access token
- Returns: cover art, name, artist/owner, Spotify ID, track count

### Paste-a-link Parsing
- Regex extracts type and ID from `open.spotify.com/album/<id>` or `open.spotify.com/playlist/<id>`
- No extra API call needed to parse

### Image Export
- `html-to-image` renders the results component to PNG client-side — no server involved

### Text Export
- Built client-side from the ranked results array — pure string formatting

---

## Todo (Post-MVP)
- Re-rank individual songs after session completes
- Improved resume UX (e.g., replay last song before continuing)
- Pagination or infinite scroll for search results
