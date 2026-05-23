import type { SongRanking, Tier } from '@/types';

const RANKED_TIERS: Tier[] = ['S', 'A', 'B', 'C', 'F'];

const TIER_COLORS: Record<string, string> = {
  S: '#FF4444',
  A: '#FF9944',
  B: '#FFDD44',
  C: '#44DD44',
  F: '#4488FF',
};

interface TierListProps {
  rankings: SongRanking[];
}

export function TierList({ rankings }: TierListProps) {
  const grouped: Record<string, SongRanking[]> = { S: [], A: [], B: [], C: [], F: [], skip: [] };
  for (const r of rankings) grouped[r.tier]?.push(r);

  const skipped = grouped['skip'];
  const hasSkipped = skipped.length > 0;

  return (
    <div className="w-full space-y-1">
      {RANKED_TIERS.map((tier) => (
        <div key={tier} className="flex rounded-lg overflow-hidden">
          <div
            style={{ backgroundColor: TIER_COLORS[tier] }}
            className="w-14 flex items-center justify-center font-black text-xl text-black flex-shrink-0 py-3"
          >
            {tier}
          </div>
          <div
            className="flex-1 flex flex-wrap items-center gap-2 px-4 py-3 min-h-[52px]"
            style={{ backgroundColor: '#181818' }}
          >
            {grouped[tier].length === 0 ? (
              <span className="text-sm" style={{ color: '#B3B3B3' }}>—</span>
            ) : (
              grouped[tier].map((r) => (
                <span
                  key={r.id}
                  className="text-sm px-3 py-1 rounded-full"
                  style={{ backgroundColor: '#282828', color: '#FFFFFF' }}
                >
                  {r.track_name}
                </span>
              ))
            )}
          </div>
        </div>
      ))}

      {hasSkipped && (
        <div className="flex rounded-lg overflow-hidden mt-2">
          <div
            className="w-14 flex items-center justify-center font-black text-xs text-black flex-shrink-0 py-3"
            style={{ backgroundColor: '#555555' }}
          >
            ⏭
          </div>
          <div
            className="flex-1 flex flex-wrap items-center gap-2 px-4 py-3 min-h-[52px]"
            style={{ backgroundColor: '#181818' }}
          >
            {skipped.map((r) => (
              <span
                key={r.id}
                className="text-sm px-3 py-1 rounded-full"
                style={{ backgroundColor: '#282828', color: '#888888' }}
              >
                {r.track_name}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
