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
