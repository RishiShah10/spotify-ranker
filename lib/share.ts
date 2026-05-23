import type { RankingSession, SongRanking, Tier } from '@/types';

const RANKED_TIERS: Tier[] = ['S', 'A', 'B', 'C', 'F'];

export function formatTierText(
  session: RankingSession,
  rankings: SongRanking[],
  subtitle: string
): string {
  const grouped: Record<string, string[]> = { S: [], A: [], B: [], C: [], F: [], skip: [] };
  for (const r of rankings) grouped[r.tier]?.push(r.track_name);

  const tierLines = RANKED_TIERS.map((tier) => {
    const songs = grouped[tier].length > 0 ? grouped[tier].join(', ') : '—';
    return `${tier}  ${songs}`;
  }).join('\n');

  const header = subtitle ? `🎵 ${session.name} — ${subtitle}` : `🎵 ${session.name}`;
  const skippedLine = grouped['skip'].length > 0
    ? `\n\n⏭ Skipped  ${grouped['skip'].join(', ')}`
    : '';

  return `${header}\n\n${tierLines}${skippedLine}`;
}

export async function exportTierListImage(element: HTMLElement): Promise<void> {
  const { toPng } = await import('html-to-image');
  const opts = { cacheBust: true, pixelRatio: 2 };
  // html-to-image has a known issue where external images (e.g. Spotify CDN cover art)
  // don't render on the first call — calling twice ensures they are fully loaded.
  await toPng(element, opts);
  const dataUrl = await toPng(element, opts);
  const link = document.createElement('a');
  link.download = 'tier-list.png';
  link.href = dataUrl;
  link.click();
}
