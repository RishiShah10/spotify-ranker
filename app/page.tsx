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
