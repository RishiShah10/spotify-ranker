import type { RankingSession, SongRanking, Tier } from '@/types';

const TIERS: Tier[] = ['S', 'A', 'B', 'C', 'F'];

export function formatTierText(
  session: RankingSession,
  rankings: SongRanking[],
  subtitle: string
): string {
  const grouped: Record<Tier, string[]> = { S: [], A: [], B: [], C: [], F: [] };
  for (const r of rankings) grouped[r.tier].push(r.track_name);

  const tierLines = TIERS.map((tier) => {
    const songs = grouped[tier].length > 0 ? grouped[tier].join(', ') : '—';
    return `${tier}  ${songs}`;
  }).join('\n');

  return `🎵 ${session.name} — ${subtitle}\n\n${tierLines}`;
}

export async function exportTierListImage(element: HTMLElement): Promise<void> {
  const { toPng } = await import('html-to-image');
  const dataUrl = await toPng(element, { cacheBust: true });
  const link = document.createElement('a');
  link.download = 'tier-list.png';
  link.href = dataUrl;
  link.click();
}
