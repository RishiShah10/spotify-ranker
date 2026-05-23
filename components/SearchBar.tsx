'use client';

import { useState } from 'react';
import { parseSpotifyUrl } from '@/lib/spotifyLink';
import type { SpotifySearchResponse } from '@/types';

interface SearchBarProps {
  onResults: (response: SpotifySearchResponse) => void;
  onDirectLink: (type: 'album' | 'playlist', id: string) => Promise<void> | void;
}

export function SearchBar({ onResults, onDirectLink }: SearchBarProps) {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSearch() {
    const parsed = parseSpotifyUrl(query);
    if (parsed) {
      setLoading(true);
      try {
        await onDirectLink(parsed.type, parsed.id);
      } finally {
        setLoading(false);
      }
      return;
    }
    if (!query.trim()) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(query.trim())}`);
      if (!res.ok) { onResults({ results: [], artists: [] }); return; }
      onResults(await res.json());
    } catch {
      onResults({ results: [], artists: [] });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex gap-2 w-full">
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
        placeholder="Search albums & playlists, or paste a Spotify link…"
        className="flex-1 px-4 py-3 rounded-full outline-none focus:ring-2 text-white"
        style={{
          backgroundColor: 'var(--surface-2)',
          caretColor: 'var(--spotify-green)',
        }}
      />
      <button
        onClick={handleSearch}
        disabled={loading}
        className="font-semibold px-6 py-3 rounded-full hover:scale-105 transition disabled:opacity-50 text-black"
        style={{ backgroundColor: 'var(--spotify-green)' }}
      >
        {loading ? '…' : 'Search'}
      </button>
    </div>
  );
}
