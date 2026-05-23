'use client';

import { useEffect, useState } from 'react';
import { getArtistAlbums, getArtistPlaylists } from '@/lib/spotify';
import type { SpotifyArtist, SpotifySearchResult } from '@/types';

interface ArtistViewProps {
  artist: SpotifyArtist;
  accessToken: string;
  onSelect: (result: SpotifySearchResult) => void;
  onBack: () => void;
}

function ResultCard({ item, onSelect }: { item: SpotifySearchResult; onSelect: (r: SpotifySearchResult) => void }) {
  return (
    <button
      onClick={() => onSelect(item)}
      className="w-full flex items-center gap-3 p-3 rounded-xl transition hover:opacity-80"
      style={{ backgroundColor: 'var(--surface)' }}
    >
      {item.coverUrl ? (
        <img src={item.coverUrl} alt={item.name} className="w-10 h-10 rounded object-cover flex-shrink-0" />
      ) : (
        <div className="w-10 h-10 rounded flex-shrink-0 flex items-center justify-center" style={{ backgroundColor: 'var(--surface-2)' }}>
          <span className="text-lg">🎵</span>
        </div>
      )}
      <div className="flex-1 min-w-0 text-left">
        <p className="text-sm font-medium truncate text-white">{item.name}</p>
        <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>
          {item.subtitle} · {item.totalTracks} tracks
        </p>
      </div>
      <span className="text-xs capitalize flex-shrink-0" style={{ color: 'var(--text-muted)' }}>{item.type}</span>
    </button>
  );
}

export function ArtistView({ artist, accessToken, onSelect, onBack }: ArtistViewProps) {
  const [albums, setAlbums] = useState<SpotifySearchResult[]>([]);
  const [playlists, setPlaylists] = useState<SpotifySearchResult[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      getArtistAlbums(artist.id, accessToken),
      getArtistPlaylists(artist.name, accessToken),
    ]).then(([a, p]) => {
      setAlbums(a);
      setPlaylists(p);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [artist.id, artist.name, accessToken]);

  return (
    <div className="w-full space-y-6">
      {/* Artist header */}
      <div className="flex items-center gap-3">
        {artist.imageUrl ? (
          <img src={artist.imageUrl} alt={artist.name} className="w-12 h-12 rounded-full object-cover flex-shrink-0" />
        ) : (
          <div className="w-12 h-12 rounded-full flex-shrink-0 flex items-center justify-center" style={{ backgroundColor: 'var(--surface-2)' }}>
            <span className="text-xl">🎤</span>
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="font-bold text-white truncate">{artist.name}</p>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            {artist.followers >= 1_000_000
              ? `${(artist.followers / 1_000_000).toFixed(1)}M followers`
              : `${(artist.followers / 1_000).toFixed(0)}K followers`}
            {artist.genres.length > 0 && ` · ${artist.genres.slice(0, 2).join(', ')}`}
          </p>
        </div>
        <button
          onClick={onBack}
          className="text-xs transition hover:text-white flex-shrink-0"
          style={{ color: 'var(--text-muted)' }}
          aria-label="Back to search"
        >
          ✕
        </button>
      </div>

      {loading ? (
        <p className="text-sm animate-pulse text-center" style={{ color: 'var(--text-muted)' }}>Loading…</p>
      ) : (
        <>
          {albums.length > 0 && (
            <section>
              <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: 'var(--text-muted)' }}>
                Albums
              </p>
              <div className="space-y-2">
                {albums.map((a) => <ResultCard key={a.id} item={a} onSelect={onSelect} />)}
              </div>
            </section>
          )}

          {playlists.length > 0 && (
            <section>
              <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: 'var(--text-muted)' }}>
                Playlists
              </p>
              <div className="space-y-2">
                {playlists.map((p) => <ResultCard key={p.id} item={p} onSelect={onSelect} />)}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
