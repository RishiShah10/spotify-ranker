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
