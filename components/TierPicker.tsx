'use client';

import type { Tier } from '@/types';

const TIERS: { tier: Tier; bg: string }[] = [
  { tier: 'S', bg: '#FF4444' },
  { tier: 'A', bg: '#FF9944' },
  { tier: 'B', bg: '#FFDD44' },
  { tier: 'C', bg: '#44DD44' },
  { tier: 'F', bg: '#4488FF' },
];

interface TierPickerProps {
  onPick: (tier: Tier) => void;
  disabled?: boolean;
}

export function TierPicker({ onPick, disabled }: TierPickerProps) {
  return (
    <div className="flex gap-3">
      {TIERS.map(({ tier, bg }) => (
        <button
          key={tier}
          onClick={() => onPick(tier)}
          disabled={disabled}
          style={{ backgroundColor: bg, width: 56, height: 56 }}
          className="rounded-xl text-black font-black text-xl hover:scale-110 transition disabled:opacity-40"
        >
          {tier}
        </button>
      ))}
    </div>
  );
}
