'use client';

import type { RefObject } from 'react';
import { formatTierText, exportTierListImage } from '@/lib/share';
import type { RankingSession, SongRanking } from '@/types';

interface SharePanelProps {
  session: RankingSession;
  rankings: SongRanking[];
  subtitle: string;
  tierListRef: RefObject<HTMLDivElement | null>;
}

export function SharePanel({ session, rankings, subtitle, tierListRef }: SharePanelProps) {
  async function handleCopyText() {
    const text = formatTierText(session, rankings, subtitle);
    await navigator.clipboard.writeText(text);
    alert('Copied to clipboard!');
  }

  async function handleDownloadImage() {
    if (!tierListRef.current) return;
    await exportTierListImage(tierListRef.current);
  }

  return (
    <div className="flex gap-3">
      <button
        onClick={handleCopyText}
        className="flex-1 font-medium px-4 py-3 rounded-full transition hover:opacity-80 text-white"
        style={{ backgroundColor: 'var(--surface-2)' }}
      >
        Copy Text
      </button>
      <button
        onClick={handleDownloadImage}
        className="flex-1 font-semibold px-4 py-3 rounded-full hover:scale-105 transition text-black"
        style={{ backgroundColor: 'var(--spotify-green)' }}
      >
        Download Image
      </button>
    </div>
  );
}
