import type { SongRanking, Tier } from '@/types';

const TIER_COLORS: Record<Tier, string> = {
  S: '#FF4444',
  A: '#FF9944',
  B: '#FFDD44',
  C: '#44DD44',
  F: '#4488FF',
};

const TIERS: Tier[] = ['S', 'A', 'B', 'C', 'F'];

interface TierListProps {
  rankings: SongRanking[];
}

export function TierList({ rankings }: TierListProps) {
  const grouped: Record<Tier, SongRanking[]> = { S: [], A: [], B: [], C: [], F: [] };
  for (const r of rankings) grouped[r.tier].push(r);

  return (
    <div className="w-full space-y-1">
      {TIERS.map((tier) => (
        <div key={tier} className="flex rounded-lg overflow-hidden">
          <div
            style={{ backgroundColor: TIER_COLORS[tier] }}
            className="w-14 flex items-center justify-center font-black text-xl text-black flex-shrink-0 py-3"
          >
            {tier}
          </div>
          <div
            className="flex-1 flex flex-wrap items-center gap-2 px-4 py-3 min-h-[52px]"
            style={{ backgroundColor: 'var(--surface)' }}
          >
            {grouped[tier].length === 0 ? (
              <span className="text-sm" style={{ color: 'var(--text-muted)' }}>—</span>
            ) : (
              grouped[tier].map((r) => (
                <span
                  key={r.id}
                  className="text-sm px-3 py-1 rounded-full"
                  style={{ backgroundColor: 'var(--surface-2)' }}
                >
                  {r.track_name}
                </span>
              ))
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
