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
