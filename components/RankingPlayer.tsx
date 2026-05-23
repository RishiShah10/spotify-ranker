'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
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

function formatTime(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, '0')}`;
}

export function RankingPlayer({ session, tracks, accessToken, onRank, onExit }: RankingPlayerProps) {
  const router = useRouter();
  const [trackIndex, setTrackIndex] = useState(session.current_index);
  const [showPicker, setShowPicker] = useState(false);
  const [saving, setSaving] = useState(false);
  // Tracks whether the user has clicked at least once to unlock the audio context.
  // The first play requires activateElement() from a real user gesture; after that
  // the audio context stays unlocked for the session.
  const [audioUnlocked, setAudioUnlocked] = useState(false);
  const exitCalledRef = useRef(false);

  const currentTrack = tracks[trackIndex];

  const { playerState, playTrack, pause, togglePlay, activateElement, seek } = useSpotifyPlayer(accessToken, () => {
    setShowPicker(true);
  });

  // Auto-play on subsequent tracks once the user has already unlocked audio
  useEffect(() => {
    if (audioUnlocked && playerState.isReady && currentTrack) {
      playTrack(currentTrack.uri);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackIndex]);

  async function handleStart() {
    if (!currentTrack) return;
    await activateElement(); // unlocks browser audio context from this user gesture
    setAudioUnlocked(true);
    await playTrack(currentTrack.uri);
  }

  async function handlePick(tier: Tier) {
    if (!currentTrack || saving) return;
    setSaving(true);
    try {
      await pause();
      await onRank(currentTrack, tier);
      const next = trackIndex + 1;
      setTrackIndex(next);
      setShowPicker(false);
      if (next >= tracks.length) {
        if (!exitCalledRef.current) { exitCalledRef.current = true; onExit(); }
      }
    } catch {
      alert('Failed to save your ranking. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDoneListening() {
    await pause();
    setShowPicker(true);
  }

  async function handleSkip() {
    if (!currentTrack || saving) return;
    setSaving(true);
    try {
      await pause();
      await onRank(currentTrack, 'skip');
      const next = trackIndex + 1;
      setTrackIndex(next);
      setShowPicker(false);
      if (next >= tracks.length) {
        if (!exitCalledRef.current) { exitCalledRef.current = true; onExit(); }
      }
    } catch {
      alert('Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  function handleSeek(e: React.MouseEvent<HTMLDivElement>) {
    if (playerState.duration === 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    seek(pct * playerState.duration);
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
      {session.cover_url ? (
        <img src={session.cover_url} alt={session.name} className="w-48 h-48 rounded-2xl shadow-2xl object-cover" />
      ) : (
        <div className="w-48 h-48 rounded-2xl shadow-2xl flex items-center justify-center" style={{ backgroundColor: 'var(--surface-2)' }}>
          <span className="text-4xl">🎵</span>
        </div>
      )}

      <div className="text-center">
        <p className="text-xl font-bold">{currentTrack.name}</p>
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{currentTrack.artistName}</p>
        <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
          Track {trackIndex + 1} of {tracks.length}
        </p>
      </div>

      {!playerState.isReady && !playerState.error && (
        <p className="text-sm animate-pulse" style={{ color: 'var(--text-muted)' }}>
          Connecting to Spotify…
        </p>
      )}
      {playerState.error && (
        <p className="text-sm text-center" style={{ color: '#FF4444' }}>
          {playerState.error}
        </p>
      )}

      {playerState.isReady && (
        <div className="w-full space-y-2">
          <div
            className="w-full rounded-full overflow-hidden cursor-pointer"
            style={{ height: 6, backgroundColor: 'var(--surface-2)' }}
            onClick={handleSeek}
            role="slider"
            aria-label="Seek"
            tabIndex={0}
            aria-valuemin={0}
            aria-valuemax={playerState.duration}
            aria-valuenow={Math.round(playerState.position / 1000)}
            aria-valuetext={formatTime(playerState.position)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowRight') seek(Math.min(playerState.position + 5000, playerState.duration));
              else if (e.key === 'ArrowLeft') seek(Math.max(playerState.position - 5000, 0));
            }}
          >
            <div
              className="h-full rounded-full pointer-events-none"
              style={{
                width: playerState.duration > 0 ? `${(playerState.position / playerState.duration) * 100}%` : '0%',
                backgroundColor: 'var(--spotify-green)',
                transition: 'width 0.5s linear',
              }}
            />
          </div>
          <div className="flex justify-between text-xs" style={{ color: 'var(--text-muted)' }}>
            <span>{formatTime(playerState.position)}</span>
            <span>{formatTime(playerState.duration)}</span>
          </div>
        </div>
      )}

      {playerState.isReady && !audioUnlocked && !showPicker && (
        <button
          onClick={handleStart}
          className="font-semibold px-8 py-3 rounded-full hover:scale-105 transition text-black"
          style={{ backgroundColor: 'var(--spotify-green)' }}
        >
          ▶ Start Listening
        </button>
      )}

      {playerState.isReady && audioUnlocked && !showPicker && (
        <div className="flex items-center gap-4">
          <button
            onClick={togglePlay}
            className="w-12 h-12 rounded-full flex items-center justify-center transition hover:opacity-80"
            style={{ backgroundColor: 'var(--spotify-green)' }}
            aria-label={playerState.isPaused ? 'Play' : 'Pause'}
          >
            {playerState.isPaused ? (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="black">
                <path d="M8 5v14l11-7z" />
              </svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="black">
                <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
              </svg>
            )}
          </button>
          <button
            onClick={handleDoneListening}
            className="px-6 py-3 rounded-full transition hover:opacity-80 text-white"
            style={{ backgroundColor: 'var(--surface-2)' }}
          >
            Rate Track →
          </button>
          <button
            onClick={handleSkip}
            className="w-10 h-10 rounded-full flex items-center justify-center transition hover:opacity-80"
            style={{ backgroundColor: 'var(--surface-2)' }}
            aria-label="Skip track"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="white">
              <path d="M6 18l8.5-6L6 6v12zm2-8.14L11.03 12 8 14.14V9.86zM16 6h2v12h-2z" />
            </svg>
          </button>
        </div>
      )}

      {showPicker && (
        <div className="space-y-3 text-center">
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Rate this track</p>
          <TierPicker onPick={handlePick} disabled={saving} />
        </div>
      )}

      <div className="flex items-center gap-6">
        <button
          onClick={onExit}
          className="text-xs transition hover:text-white"
          style={{ color: 'var(--text-muted)' }}
        >
          See Results
        </button>
        <button
          onClick={async () => { await pause(); router.push('/'); }}
          className="text-xs transition hover:text-white"
          style={{ color: 'var(--text-muted)' }}
        >
          ← Home
        </button>
      </div>
    </div>
  );
}
