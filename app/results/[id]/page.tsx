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
  const tierListRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    (async () => {
      const [sessionRes, rankingsRes] = await Promise.all([
        fetch(`/api/session?id=${id}`),
        fetch(`/api/rankings?sessionId=${id}`),
      ]);
      setRankingSession(await sessionRes.json());
      setRankings(await rankingsRes.json());
      setLoading(false);
    })();
  }, [id]);

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p className="animate-pulse" style={{ color: 'var(--text-muted)' }}>Loading…</p>
      </main>
    );
  }
  if (!rankingSession) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p style={{ color: 'var(--text-muted)' }}>Not found.</p>
      </main>
    );
  }

  const subtitle = rankings[0]?.artist_name ?? '';

  return (
    <main className="min-h-screen flex flex-col items-center px-4 py-12">
      <div className="w-full max-w-xl space-y-6">
        <div className="flex items-center gap-4">
          <img src={rankingSession.cover_url} alt={rankingSession.name} className="w-16 h-16 rounded-xl object-cover" />
          <div>
            <h1 className="text-xl font-bold">{rankingSession.name}</h1>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{subtitle}</p>
          </div>
        </div>

        <div ref={tierListRef} className="rounded-xl overflow-hidden">
          <TierList rankings={rankings} />
        </div>

        <SharePanel
          session={rankingSession}
          rankings={rankings}
          subtitle={subtitle}
          tierListRef={tierListRef}
        />

        <p className="text-xs text-center" style={{ color: 'var(--text-muted)' }}>
          Share this link:{' '}
          <span className="underline break-all">
            {typeof window !== 'undefined' ? window.location.href : ''}
          </span>
        </p>
      </div>
    </main>
  );
}
