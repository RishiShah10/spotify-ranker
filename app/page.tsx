'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import { LoginButton } from '@/components/LoginButton';
import { SearchBar } from '@/components/SearchBar';
import { SearchResults } from '@/components/SearchResults';
import { ArtistView } from '@/components/ArtistView';
import { getAlbumInfo, getPlaylistInfo } from '@/lib/spotify';
import type { SpotifyArtist, SpotifySearchResult, SpotifySearchResponse, RankingSession } from '@/types';


export default function HomePage() {
  const { data: session } = useSession();
  const router = useRouter();
  const [results, setResults] = useState<SpotifySearchResult[]>([]);
  const [selectedArtist, setSelectedArtist] = useState<SpotifyArtist | null>(null);
  const [activeSessions, setActiveSessions] = useState<RankingSession[]>([]);
  const [working, setWorking] = useState(false);

  useEffect(() => {
    if (!session?.spotifyId) return;
    fetch('/api/session')
      .then((r) => r.ok ? r.json() : [])
      .then(setActiveSessions)
      .catch(() => {});
  }, [session?.spotifyId]);

  async function createAndNavigate(
    spotifyType: 'album' | 'playlist',
    spotifyId: string,
    name: string,
    coverUrl: string,
    totalTracks: number
  ) {
    if (working) return;
    setWorking(true);
    try {
      const res = await fetch('/api/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ spotifyType, spotifyId, name, coverUrl, totalTracks }),
      });
      if (!res.ok) throw new Error('Failed to create session');
      const s: RankingSession = await res.json();
      router.push(`/rank/${s.id}`);
    } catch (err) {
      console.error(err);
      alert('Something went wrong. Please try again.');
    } finally {
      setWorking(false);
    }
  }

  async function handleStart(result: SpotifySearchResult) {
    await createAndNavigate(result.type, result.id, result.name, result.coverUrl, result.totalTracks);
  }

  async function handleDirectLink(type: 'album' | 'playlist', id: string) {
    if (!session?.accessToken) return;
    const token = session.accessToken;
    try {
      if (type === 'album') {
        const info = await getAlbumInfo(id, token);
        await createAndNavigate('album', id, info.name, info.coverUrl, info.totalTracks);
      } else {
        const info = await getPlaylistInfo(id, token);
        await createAndNavigate('playlist', id, info.name, info.coverUrl, info.totalTracks);
      }
    } catch (err) {
      console.error(err);
      alert('Could not load that link. Please check the URL and try again.');
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
          </div>
        ) : (
          <div className="space-y-8">
            {session.error && (
              <p className="text-sm text-center" style={{ color: '#FF4444' }}>
                Your session expired. Please sign out and sign back in.
              </p>
            )}
            <SearchBar
              onResults={(resp: SpotifySearchResponse) => {
                if (resp.artists.length > 0) {
                  setSelectedArtist(resp.artists[0]);
                  setResults([]);
                } else {
                  setResults(resp.results);
                  setSelectedArtist(null);
                }
              }}
              onDirectLink={handleDirectLink}
            />
            {selectedArtist ? (
              <ArtistView
                artist={selectedArtist}
                accessToken={session.accessToken}
                onSelect={handleStart}
                onBack={() => setSelectedArtist(null)}
              />
            ) : (
              <SearchResults
                results={results}
                activeSessions={activeSessions}
                onStart={handleStart}
                onResume={(s) => router.push(`/rank/${s.id}`)}
                onDelete={async (s) => {
                  await fetch(`/api/session?id=${s.id}`, { method: 'DELETE' });
                  setActiveSessions((prev) => prev.filter((x) => x.id !== s.id));
                }}
              />
            )}
          </div>
        )}
      </div>
    </main>
  );
}
