'use client';

import type { SpotifySearchResult, RankingSession } from '@/types';

interface SearchResultsProps {
  results: SpotifySearchResult[];
  activeSessions: RankingSession[];
  onStart: (result: SpotifySearchResult) => void;
  onResume: (session: RankingSession) => void;
  onDelete: (session: RankingSession) => void;
}

export function SearchResults({
  results,
  activeSessions,
  onStart,
  onResume,
  onDelete,
}: SearchResultsProps) {
  return (
    <div className="w-full space-y-6">
      {activeSessions.length > 0 && (
        <section>
          <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: 'var(--text-muted)' }}>
            Resume
          </p>
          <div className="space-y-2">
            {activeSessions.map((s) => (
              <div
                key={s.id}
                className="w-full flex items-center gap-3 p-3 rounded-xl"
                style={{ backgroundColor: 'var(--surface)' }}
              >
                {s.cover_url ? (
                  <img src={s.cover_url} alt={s.name} className="w-10 h-10 rounded object-cover flex-shrink-0" />
                ) : (
                  <div className="w-10 h-10 rounded flex-shrink-0" style={{ backgroundColor: 'var(--surface-2)' }} />
                )}
                <div className="flex-1 text-left min-w-0">
                  <p className="font-medium text-sm truncate">{s.name}</p>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    Track {s.current_index + 1} of {s.total_tracks}
                  </p>
                </div>
                <button
                  onClick={() => onResume(s)}
                  className="text-xs font-bold px-3 py-1 rounded-full text-black flex-shrink-0 hover:opacity-80 transition"
                  style={{ backgroundColor: 'var(--spotify-green)' }}
                >
                  Resume
                </button>
                <button
                  onClick={() => onDelete(s)}
                  className="text-xs px-3 py-1 rounded-full flex-shrink-0 hover:opacity-80 transition"
                  style={{ backgroundColor: 'var(--surface-2)', color: 'var(--text-muted)' }}
                  aria-label="Delete session"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

{results.length > 0 && (
        <section>
          <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: 'var(--text-muted)' }}>
            Results
          </p>
          <div className="space-y-2">
            {results.map((r) => (
              <button
                key={`${r.type}-${r.id}`}
                onClick={() => onStart(r)}
                className="w-full flex items-center gap-3 p-3 rounded-xl transition hover:opacity-80"
                style={{ backgroundColor: 'var(--surface)' }}
              >
                {r.coverUrl ? (
                  <img src={r.coverUrl} alt={r.name} className="w-10 h-10 rounded object-cover flex-shrink-0" />
                ) : (
                  <div className="w-10 h-10 rounded flex-shrink-0" style={{ backgroundColor: 'var(--surface-2)' }} />
                )}
                <div className="flex-1 text-left">
                  <p className="font-medium text-sm">{r.name}</p>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    {r.subtitle} · {r.totalTracks} tracks
                  </p>
                </div>
                <span className="text-xs capitalize" style={{ color: 'var(--text-muted)' }}>{r.type}</span>
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
