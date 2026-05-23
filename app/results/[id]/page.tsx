'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { TierList } from '@/components/TierList';
import { SharePanel } from '@/components/SharePanel';
import type { RankingSession, SongRanking } from '@/types';

export default function ResultsPage() {
  const { id } = useParams<{ id: string }>();
  const [rankingSession, setRankingSession] = useState<RankingSession | null>(null);
  const [rankings, setRankings] = useState<SongRanking[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [shareUrl, setShareUrl] = useState('');
  const captureRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setShareUrl(window.location.href);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const [sessionRes, rankingsRes] = await Promise.all([
          fetch(`/api/session?id=${id}`),
          fetch(`/api/rankings?sessionId=${id}`),
        ]);
        if (!sessionRes.ok) {
          setNotFound(true);
          setLoading(false);
          return;
        }
        setRankingSession(await sessionRes.json());
        if (rankingsRes.ok) {
          setRankings(await rankingsRes.json());
        } else {
          setRankings([]);
        }
        setLoading(false);
      } catch {
        setNotFound(true);
        setLoading(false);
      }
    })();
  }, [id]);

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p className="animate-pulse" style={{ color: 'var(--text-muted)' }}>Loading…</p>
      </main>
    );
  }
  if (notFound || !rankingSession) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p style={{ color: 'var(--text-muted)' }}>Not found.</p>
      </main>
    );
  }

  const rankedSongs = rankings.filter((r) => r.tier !== 'skip');
  // For albums, all tracks share the same artist — use first ranked track's artist.
  // For playlists, show the session name only (no single subtitle artist).
  const subtitle =
    rankingSession.spotify_type === 'album'
      ? (rankedSongs[0]?.artist_name ?? '')
      : '';

  return (
    <main className="min-h-screen flex flex-col items-center px-4 py-12">
      <div className="w-full max-w-xl space-y-6">
        <a
          href="/"
          className="inline-flex items-center gap-2 text-sm transition hover:text-white"
          style={{ color: 'var(--text-muted)' }}
        >
          ← Home
        </a>
        {/* captureRef wraps header + tier list — this entire block is what gets exported as an image */}
        <div
          ref={captureRef}
          style={{ backgroundColor: '#121212', borderRadius: 12, padding: 16 }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
            {rankingSession.cover_url ? (
              <img
                src={rankingSession.cover_url}
                alt={rankingSession.name}
                style={{ width: 72, height: 72, borderRadius: 10, objectFit: 'cover', flexShrink: 0 }}
                crossOrigin="anonymous"
              />
            ) : (
              <div style={{ width: 72, height: 72, borderRadius: 10, backgroundColor: '#282828', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <span style={{ fontSize: 28 }}>🎵</span>
              </div>
            )}
            <div>
              <p style={{ color: '#FFFFFF', fontWeight: 700, fontSize: 20, margin: 0 }}>{rankingSession.name}</p>
              {subtitle && (
                <p style={{ color: '#B3B3B3', fontSize: 14, margin: '4px 0 0' }}>{subtitle}</p>
              )}
            </div>
          </div>
          <div style={{ borderRadius: 8, overflow: 'hidden' }}>
            <TierList rankings={rankings} />
          </div>
        </div>

        <SharePanel
          session={rankingSession}
          rankings={rankings}
          subtitle={subtitle}
          captureRef={captureRef}
        />

        {shareUrl && (
          <p className="text-xs text-center" style={{ color: 'var(--text-muted)' }}>
            Share this link:{' '}
            <span className="underline break-all">{shareUrl}</span>
          </p>
        )}
      </div>
    </main>
  );
}
