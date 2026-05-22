'use client';

import { useEffect, useState } from 'react';
import { useSpotifyPlayer } from '@/lib/useSpotifyPlayer';
import { TierPicker } from './TierPicker';
import type { RankingSession, SpotifyTrack, Tier } from '@/types';

interface RankingPlayerProps {
  session: RankingSession;
  tracks: SpotifyTrack[];
  accessToken: string;
  onRank: (track: SpotifyTrack, tier: Tier) => Promise<void>;
  onExit: () => void;
}

export function RankingPlayer({ session, tracks, accessToken, onRank, onExit }: RankingPlayerProps) {
  const [trackIndex, setTrackIndex] = useState(session.current_index);
  const [showPicker, setShowPicker] = useState(false);
  const [saving, setSaving] = useState(false);

  const currentTrack = tracks[trackIndex];

  const { playerState, playTrack, pause } = useSpotifyPlayer(accessToken, () => {
    setShowPicker(true);
  });

  // Auto-play when player becomes ready or trackIndex advances
  useEffect(() => {
    if (playerState.isReady && currentTrack) {
      playTrack(currentTrack.uri);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerState.isReady, trackIndex]);

  async function handlePick(tier: Tier) {
    if (!currentTrack || saving) return;
    setSaving(true);
    await pause();
    await onRank(currentTrack, tier);
    const next = trackIndex + 1;
    setTrackIndex(next);
    setShowPicker(false);
    setSaving(false);
    // If we've run out of tracks, navigate to results
    if (next >= tracks.length) onExit();
  }

  async function handleDoneListening() {
    await pause();
    setShowPicker(true);
  }

  // All tracks ranked — show completion state
  if (!currentTrack) {
    return (
      <div className="text-center space-y-4">
        <p className="text-2xl font-bold">All done!</p>
        <button
          onClick={onExit}
          className="font-semibold px-8 py-3 rounded-full text-black"
          style={{ backgroundColor: 'var(--spotify-green)' }}
        >
          See Results
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-8 w-full max-w-sm">
      <img src={session.cover_url} alt={session.name} className="w-48 h-48 rounded-2xl shadow-2xl" />

      <div className="text-center">
        <p className="text-xl font-bold">{currentTrack.name}</p>
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{currentTrack.artistName}</p>
        <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
          Track {trackIndex + 1} of {tracks.length}
        </p>
      </div>

      {!playerState.isReady && (
        <p className="text-sm animate-pulse" style={{ color: 'var(--text-muted)' }}>
          Connecting to Spotify…
        </p>
      )}

      {playerState.isReady && !showPicker && (
        <button
          onClick={handleDoneListening}
          className="px-6 py-3 rounded-full transition hover:opacity-80 text-white"
          style={{ backgroundColor: 'var(--surface-2)' }}
        >
          Done Listening →
        </button>
      )}

      {showPicker && (
        <div className="space-y-3 text-center">
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Rate this track</p>
          <TierPicker onPick={handlePick} disabled={saving} />
        </div>
      )}

      <button
        onClick={onExit}
        className="text-xs transition hover:text-white"
        style={{ color: 'var(--text-muted)' }}
      >
        Exit & Save
      </button>
    </div>
  );
}
