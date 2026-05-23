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
  const [completedSessions, setCompletedSessions] = useState<RankingSession[]>([]);
  const [historySearch, setHistorySearch] = useState('');
  const [working, setWorking] = useState(false);

  useEffect(() => {
    if (!session?.spotifyId) return;
    fetch('/api/session')
      .then((r) => r.ok ? r.json() : [])
      .then(setActiveSessions)
      .catch(() => {});
    fetch('/api/session?completed=true')
      .then((r) => r.ok ? r.json() : [])
      .then(setCompletedSessions)
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
    <main className="min-h-screen flex flex-col items-center px-4 py-12">
      <div className="w-full max-w-xl">
        {/* Header */}
        <div className="flex justify-between items-center mb-14">
          <div className="flex items-center gap-2">
            <svg viewBox="0 0 24 24" className="w-6 h-6 fill-current flex-shrink-0" style={{ color: 'var(--spotify-green)' }}>
              <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
            </svg>
            <h1 className="text-lg font-bold tracking-tight text-white">
              Ranker
            </h1>
          </div>
          <LoginButton />
        </div>

        {!session ? (
          /* Logged-out hero */
          <div className="mt-10 space-y-10">
            <div className="space-y-4">
              <h2 className="text-4xl font-black tracking-tight text-white leading-tight">
                Rank every<br />
                <span style={{ color: 'var(--spotify-green)' }}>track.</span>
              </h2>
              <p className="text-base leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                Listen to albums and playlists, then place every song in its tier — S through F.
              </p>
            </div>

            <div
              className="rounded-2xl p-5 space-y-3"
              style={{
                backgroundColor: 'var(--surface)',
                border: '1px solid var(--border)',
              }}
            >
              {[
                { tier: 'S', color: '#FF4444', label: 'Absolute classics' },
                { tier: 'A', color: '#FF9944', label: 'Really strong cuts' },
                { tier: 'B', color: '#FFDD44', label: 'Solid tracks' },
                { tier: 'C', color: '#44DD44', label: 'Decent listens' },
                { tier: 'F', color: '#4488FF', label: 'Skip' },
              ].map(({ tier, color, label }) => (
                <div key={tier} className="flex items-center gap-3">
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center font-black text-sm text-black flex-shrink-0"
                    style={{ backgroundColor: color }}
                  >
                    {tier}
                  </div>
                  <span className="text-sm" style={{ color: 'var(--text-muted)' }}>{label}</span>
                </div>
              ))}
            </div>

            <p className="text-xs" style={{ color: 'var(--text-faint)' }}>
              Requires Spotify Premium for in-browser playback.
            </p>
          </div>
        ) : (
          /* Logged-in state */
          <div className="space-y-6">
            {session.error && (
              <div
                className="flex items-center gap-2.5 px-4 py-3 rounded-xl text-sm"
                style={{
                  backgroundColor: 'rgba(241, 80, 80, 0.1)',
                  border: '1px solid rgba(241, 80, 80, 0.25)',
                  color: 'var(--error)',
                }}
              >
                <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
                </svg>
                Your session expired. Please sign out and sign back in.
              </div>
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

            {/* History */}
            {completedSessions.length > 0 && (
              <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold uppercase tracking-widest" style={{ color: 'var(--text-faint)' }}>
                    History
                  </h2>
                  <span className="text-xs tabular-nums" style={{ color: 'var(--text-faint)' }}>
                    {completedSessions.length} ranked
                  </span>
                </div>

                {/* Search */}
                <div className="relative">
                  <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none" viewBox="0 0 24 24" fill="currentColor" style={{ color: 'var(--text-faint)' }}>
                    <path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" />
                  </svg>
                  <input
                    type="text"
                    placeholder="Search history…"
                    value={historySearch}
                    onChange={(e) => setHistorySearch(e.target.value)}
                    className="w-full pl-8 pr-3 py-2 rounded-xl text-sm outline-none"
                    style={{
                      backgroundColor: 'var(--surface)',
                      border: '1px solid var(--border)',
                      color: 'var(--text-primary)',
                    }}
                  />
                </div>

                {/* Results list */}
                {(() => {
                  const q = historySearch.trim().toLowerCase();
                  const filtered = q
                    ? completedSessions.filter((s) => s.name.toLowerCase().includes(q))
                    : completedSessions;
                  if (filtered.length === 0) {
                    return (
                      <p className="text-sm text-center py-4" style={{ color: 'var(--text-faint)' }}>
                        No results for &ldquo;{historySearch}&rdquo;
                      </p>
                    );
                  }
                  return (
                    <div className="space-y-2">
                      {filtered.map((s) => (
                        <button
                          key={s.id}
                          onClick={() => router.push(`/results/${s.id}`)}
                          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all duration-150 hover:bg-white/5 active:bg-white/8"
                          style={{ border: '1px solid var(--border)' }}
                        >
                          {s.cover_url ? (
                            <img src={s.cover_url} alt={s.name} className="w-10 h-10 rounded-lg object-cover flex-shrink-0" />
                          ) : (
                            <div className="w-10 h-10 rounded-lg flex-shrink-0 flex items-center justify-center" style={{ backgroundColor: 'var(--surface-2)' }}>
                              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor" style={{ color: 'var(--text-faint)' }}>
                                <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
                              </svg>
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-white truncate">{s.name}</p>
                            <p className="text-xs mt-0.5" style={{ color: 'var(--text-faint)' }}>
                              {s.spotify_type === 'album' ? 'Album' : 'Playlist'} · {s.total_tracks} tracks
                            </p>
                          </div>
                          <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor" style={{ color: 'var(--text-faint)' }}>
                            <path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6z" />
                          </svg>
                        </button>
                      ))}
                    </div>
                  );
                })()}
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
