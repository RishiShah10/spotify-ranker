import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { createSession, getSession, getActiveSessionsForUser, getCompletedSessionsForUser, getHiddenSessionsForUser, getFullyRankedSessionsForUser, setSessionHidden, restoreAllHiddenForUser, deleteSession } from '@/lib/db';

const UUID_RE = /^[0-9a-f-]{36}$/i;
const MAX_ACTIVE_SESSIONS = 20;

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.spotifyId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { spotifyType, spotifyId, name, coverUrl, totalTracks } = await req.json();
  if (!spotifyType || !spotifyId || !name || !totalTracks) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }
  if (spotifyType !== 'album' && spotifyType !== 'playlist') {
    return NextResponse.json({ error: 'Invalid spotifyType' }, { status: 400 });
  }
  if (typeof totalTracks !== 'number' || totalTracks < 1) {
    return NextResponse.json({ error: 'Invalid totalTracks' }, { status: 400 });
  }

  // M4 — length limits on user-supplied strings
  if (spotifyId.length > 100) {
    return NextResponse.json({ error: 'spotifyId too long' }, { status: 400 });
  }
  if (name.length > 500) {
    return NextResponse.json({ error: 'name too long' }, { status: 400 });
  }
  if ((coverUrl ?? '').length > 2000) {
    return NextResponse.json({ error: 'coverUrl too long' }, { status: 400 });
  }

  // H6 + M25 — check existing sessions before creating
  let activeSessions;
  try {
    activeSessions = await getActiveSessionsForUser(session.spotifyId);
  } catch (err) {
    console.error('Failed to fetch active sessions:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }

  // M25 — dedup: return existing session if one already exists for the same (userId, spotifyType, spotifyId)
  const existing = activeSessions.find(
    (s: { spotify_type: string; spotify_id: string }) =>
      s.spotify_type === spotifyType && s.spotify_id === spotifyId
  );
  if (existing) {
    return NextResponse.json(existing);
  }

  // H6 — enforce per-user session cap
  if (activeSessions.length >= MAX_ACTIVE_SESSIONS) {
    return NextResponse.json(
      { error: 'Too many active sessions. Please complete or delete some before starting a new one.' },
      { status: 400 }
    );
  }

  try {
    const rankingSession = await createSession({
      userId: session.spotifyId,
      spotifyType,
      spotifyId,
      name,
      coverUrl: coverUrl ?? '',
      totalTracks,
    });
    return NextResponse.json(rankingSession);
  } catch (err) {
    console.error('Failed to create session:', err);
    return NextResponse.json({ error: 'Failed to create session' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.spotifyId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  // L3 — validate UUID format before querying DB
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  try {
    const deleted = await deleteSession(id, session.spotifyId);
    if (!deleted) return NextResponse.json({ error: 'Not found or forbidden' }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('Failed to delete session:', err);
    return NextResponse.json({ error: 'Failed to delete session' }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');

  if (id) {
    // Public read by session UUID — results page is shareable without auth
    let rankingSession;
    try {
      rankingSession = await getSession(id);
    } catch (err) {
      console.error('Failed to fetch session:', err);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }

    if (!rankingSession) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    // H5 — strip user_id from public response
    const { user_id: _stripped, ...publicSession } = rankingSession;
    return NextResponse.json(publicSession);
  }

  // Listing sessions requires auth
  const session = await getServerSession(authOptions);
  if (!session?.spotifyId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const completed = searchParams.get('completed') === 'true';
  const hidden = searchParams.get('hidden') === 'true';
  const fullyRanked = searchParams.get('fullyRanked') === 'true';
  try {
    let sessions;
    if (fullyRanked) {
      sessions = await getFullyRankedSessionsForUser(session.spotifyId);
    } else if (hidden) {
      sessions = await getHiddenSessionsForUser(session.spotifyId);
    } else if (completed) {
      sessions = await getCompletedSessionsForUser(session.spotifyId);
    } else {
      sessions = await getActiveSessionsForUser(session.spotifyId);
    }
    return NextResponse.json(sessions);
  } catch (err) {
    console.error('Failed to fetch sessions:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.spotifyId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();

  // Restore all hidden sessions for user
  if (body.restoreAll === true) {
    try {
      await restoreAllHiddenForUser(session.spotifyId);
      return NextResponse.json({ ok: true });
    } catch (err) {
      console.error('Failed to restore sessions:', err);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  }

  // Soft-delete / restore a single session
  const { id, hidden } = body;
  if (!id || typeof hidden !== 'boolean') {
    return NextResponse.json({ error: 'Missing id or hidden' }, { status: 400 });
  }
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }
  try {
    const updated = await setSessionHidden(id, session.spotifyId, hidden);
    if (!updated) return NextResponse.json({ error: 'Not found or forbidden' }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('Failed to update session:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
