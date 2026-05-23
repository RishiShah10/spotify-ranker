'use client';

import type { RefObject } from 'react';
import { formatTierText, exportTierListImage } from '@/lib/share';
import type { RankingSession, SongRanking } from '@/types';

interface SharePanelProps {
  session: RankingSession;
  rankings: SongRanking[];
  subtitle: string;
  captureRef: RefObject<HTMLDivElement | null>;
}

export function SharePanel({ session, rankings, subtitle, captureRef }: SharePanelProps) {
  async function handleCopyText() {
    const text = formatTierText(session, rankings, subtitle);
    await navigator.clipboard.writeText(text);
    alert('Copied to clipboard!');
  }

  async function handleDownloadImage() {
    if (!captureRef.current) return;
    try {
      await exportTierListImage(captureRef.current);
    } catch (err) {
      console.error('Failed to export image:', err);
      alert('Could not generate image. Try copying the text instead.');
    }
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
