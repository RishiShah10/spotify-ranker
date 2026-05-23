'use client';

import { useSession } from 'next-auth/react';
import { useRouter, useParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { RankingPlayer } from '@/components/RankingPlayer';
import { getAlbumTracks, getPlaylistTracks } from '@/lib/spotify';
import type { RankingSession, SpotifyTrack, Tier } from '@/types';

export default function RankPage() {
  const { data: authSession, status } = useSession();
  const router = useRouter();
  const { id } = useParams<{ id: string }>();

  const [rankingSession, setRankingSession] = useState<RankingSession | null>(null);
  const [tracks, setTracks] = useState<SpotifyTrack[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const rankingSessionRef = useRef<RankingSession | null>(null);

  // Keep ref in sync so handleRank always reads current value
  rankingSessionRef.current = rankingSession;

  useEffect(() => {
    if (!authSession?.accessToken) return;
    if (authSession.error) {
      setError('Your session has expired. Please sign in again.');
      setLoading(false);
      return;
    }
    (async () => {
      try {
        const res = await fetch(`/api/session?id=${id}`);
        if (!res.ok) {
          setError('Session not found.');
          setLoading(false);
          return;
        }
        const session: RankingSession = await res.json();
        setRankingSession(session);

        const token = authSession.accessToken;
        const fetched =
          session.spotify_type === 'album'
            ? await getAlbumTracks(session.spotify_id, token)
            : await getPlaylistTracks(session.spotify_id, token);
        setTracks(fetched);
        setLoading(false);
      } catch {
        setError('Failed to load session. Please try again.');
        setLoading(false);
      }
    })();
  }, [authSession?.accessToken, id]);

  async function handleRank(track: SpotifyTrack, tier: Tier) {
    const current = rankingSessionRef.current;
    if (!current) return;
    const newIndex = current.current_index + 1;
    const completed = newIndex >= current.total_tracks;
    const res = await fetch('/api/rankings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: current.id,
        trackId: track.id,
        trackName: track.name,
        artistName: track.artistName,
        tier,
        newIndex,
        completed,
      }),
    });
    if (!res.ok) throw new Error('Failed to save ranking');
    setRankingSession((s) => (s ? { ...s, current_index: newIndex, completed } : s));
  }

  if (status === 'loading') {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p className="animate-pulse" style={{ color: 'var(--text-muted)' }}>Loading…</p>
      </main>
    );
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
  if (error || !rankingSession) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p style={{ color: 'var(--text-muted)' }}>{error ?? 'Session not found.'}</p>
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
