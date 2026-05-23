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
  const [audioUnlocked, setAudioUnlocked] = useState(false);
  const [autoplay, setAutoplay] = useState(false);
  const exitCalledRef = useRef(false);

  const currentTrack = tracks[trackIndex];

  const { playerState, playTrack, pause, togglePlay, activateElement, seek } = useSpotifyPlayer(accessToken, () => {
    if (autoplay) {
      handleSkip();
    } else {
      setShowPicker(true);
    }
  });

  useEffect(() => {
    if (autoplay && audioUnlocked && playerState.isReady && currentTrack) {
      playTrack(currentTrack.uri);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackIndex]);

  async function handleStart() {
    if (!currentTrack) return;
    await activateElement();
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

  const progressPct = playerState.duration > 0
    ? (playerState.position / playerState.duration) * 100
    : 0;

  const isPlaying = !playerState.isPaused;

  if (!currentTrack) {
    return (
      <div className="flex flex-col items-center gap-6 text-center py-12">
        <div
          className="w-16 h-16 rounded-full flex items-center justify-center"
          style={{ backgroundColor: 'var(--surface-2)' }}
        >
          <svg className="w-8 h-8" viewBox="0 0 24 24" fill="currentColor" style={{ color: 'var(--spotify-green)' }}>
            <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
          </svg>
        </div>
        <div>
          <p className="text-2xl font-bold text-white">All done!</p>
          <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>Your rankings are ready.</p>
        </div>
        <button
          onClick={onExit}
          className="font-semibold px-8 py-3 rounded-full text-black transition-all duration-150 hover:brightness-110 active:scale-95"
          style={{ backgroundColor: 'var(--spotify-green)' }}
        >
          See Results
        </button>
      </div>
    );
  }

  return (
    <>
      {/* Blurred album art atmospheric background */}
      {session.cover_url && (
        <div
          aria-hidden="true"
          style={{
            position: 'fixed',
            inset: 0,
            backgroundImage: `url(${session.cover_url})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            filter: 'blur(90px) saturate(200%)',
            opacity: 0.22,
            transform: 'scale(1.3)',
            zIndex: 0,
            pointerEvents: 'none',
          }}
        />
      )}

      <div
        className="flex flex-col items-center w-full max-w-sm"
        style={{ gap: '24px', position: 'relative', zIndex: 1 }}
      >
        {/* Album art */}
        <div style={{ position: 'relative' }}>
          {session.cover_url ? (
            <>
              {/* Glow ring when playing */}
              {isPlaying && (
                <div
                  style={{
                    position: 'absolute',
                    inset: -8,
                    borderRadius: 28,
                    background: `radial-gradient(ellipse at center, rgba(29,185,84,0.25) 0%, transparent 70%)`,
                    animation: 'pulse 2s ease-in-out infinite',
                    zIndex: 0,
                  }}
                />
              )}
              <img
                src={session.cover_url}
                alt={session.name}
                className="rounded-2xl object-cover"
                style={{
                  width: 260,
                  height: 260,
                  boxShadow: isPlaying
                    ? '0 20px 60px rgba(0,0,0,0.8), 0 0 40px rgba(29,185,84,0.15)'
                    : '0 20px 60px rgba(0,0,0,0.8)',
                  position: 'relative',
                  zIndex: 1,
                  transition: 'box-shadow 0.6s ease',
                }}
              />
            </>
          ) : (
            <div
              className="rounded-2xl flex items-center justify-center"
              style={{
                width: 260,
                height: 260,
                backgroundColor: 'var(--surface-2)',
                boxShadow: '0 20px 60px rgba(0,0,0,0.8)',
              }}
            >
              <svg className="w-16 h-16" viewBox="0 0 24 24" fill="currentColor" style={{ color: 'var(--text-faint)' }}>
                <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
              </svg>
            </div>
          )}
        </div>

        {/* Track info */}
        <div className="text-center w-full px-2">
          <p className="text-xl font-bold text-white leading-tight truncate">{currentTrack.name}</p>
          <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>{currentTrack.artistName}</p>
          <div className="flex items-center justify-center gap-2 mt-2">
            {/* Animated equalizer bars when playing */}
            {isPlaying ? (
              <div className="flex items-end gap-px" style={{ height: 12 }} aria-hidden="true">
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    style={{
                      width: 3,
                      backgroundColor: 'var(--spotify-green)',
                      borderRadius: 2,
                      animation: `eq-bar ${0.6 + i * 0.15}s ease-in-out infinite alternate`,
                      height: [8, 12, 6][i],
                    }}
                  />
                ))}
              </div>
            ) : null}
            <p className="text-xs font-medium tabular-nums" style={{ color: 'var(--text-faint)' }}>
              {trackIndex + 1} / {tracks.length}
            </p>
          </div>
        </div>

        {/* Connecting / error states */}
        {!playerState.isReady && !playerState.error && (
          <div className="flex items-center gap-2" style={{ color: 'var(--text-faint)' }}>
            <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
            <span className="text-sm">Connecting to Spotify…</span>
          </div>
        )}
        {playerState.error && (
          <p className="text-sm text-center px-4" style={{ color: 'var(--error)' }}>
            {playerState.error}
          </p>
        )}

        {/* Progress bar */}
        {playerState.isReady && (
          <div className="w-full space-y-2 px-1">
            <div
              className="w-full rounded-full overflow-hidden cursor-pointer"
              style={{ height: 4, backgroundColor: 'var(--surface-3)' }}
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
                  width: `${progressPct}%`,
                  backgroundColor: 'var(--spotify-green)',
                  transition: 'width 0.5s linear',
                }}
              />
            </div>
            <div className="flex justify-between text-xs tabular-nums" style={{ color: 'var(--text-faint)' }}>
              <span>{formatTime(playerState.position)}</span>
              <span>{formatTime(playerState.duration)}</span>
            </div>
          </div>
        )}

        {/* Start listening CTA */}
        {playerState.isReady && !audioUnlocked && !showPicker && (
          <button
            onClick={handleStart}
            className="flex items-center gap-3 font-semibold px-10 py-4 rounded-full text-black transition-all duration-150 hover:brightness-110 active:scale-95"
            style={{
              backgroundColor: 'var(--spotify-green)',
              boxShadow: '0 4px 24px rgba(29,185,84,0.4)',
            }}
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5v14l11-7z" />
            </svg>
            Start Listening
          </button>
        )}

        {/* Playback controls */}
        {playerState.isReady && audioUnlocked && !showPicker && (
          <div className="flex flex-col items-center gap-4 w-full">
            <div className="flex items-center gap-6">
              {/* Play / pause */}
              <button
                onClick={togglePlay}
                className="w-14 h-14 rounded-full flex items-center justify-center transition-all duration-150 hover:brightness-110 active:scale-95"
                style={{
                  backgroundColor: 'var(--spotify-green)',
                  boxShadow: isPlaying ? '0 4px 24px rgba(29,185,84,0.45)' : '0 4px 16px rgba(29,185,84,0.25)',
                  transition: 'box-shadow 0.4s ease',
                }}
                aria-label={playerState.isPaused ? 'Play' : 'Pause'}
              >
                {playerState.isPaused ? (
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="black">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                ) : (
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="black">
                    <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
                  </svg>
                )}
              </button>

              {/* Skip */}
              <button
                onClick={handleSkip}
                className="w-10 h-10 rounded-full flex items-center justify-center transition-all duration-150 hover:bg-white/10 active:bg-white/15"
                style={{ color: 'var(--text-muted)' }}
                aria-label="Skip track"
                disabled={saving}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M6 18l8.5-6L6 6v12zm2-8.14L11.03 12 8 14.14V9.86zM16 6h2v12h-2z" />
                </svg>
              </button>
            </div>

            {/* Rate Track button */}
            <button
              onClick={handleDoneListening}
              className="flex items-center gap-2 px-7 py-2.5 rounded-full text-sm font-semibold transition-all duration-150 hover:bg-white/10 active:bg-white/15"
              style={{
                color: 'var(--text-muted)',
                border: '1px solid var(--border)',
              }}
            >
              Rate Track
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6z" />
              </svg>
            </button>

            {/* Autoplay toggle */}
            <button
              onClick={() => setAutoplay((v) => !v)}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-semibold transition-all duration-150"
              style={{
                color: autoplay ? 'var(--spotify-green)' : 'var(--text-faint)',
                border: `1px solid ${autoplay ? 'var(--spotify-green)' : 'var(--border)'}`,
                backgroundColor: autoplay ? 'rgba(29,185,84,0.08)' : 'transparent',
              }}
              aria-pressed={autoplay}
            >
              <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
                <path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z" />
              </svg>
              Autoplay
            </button>
          </div>
        )}

        {/* Tier picker */}
        {showPicker && (
          <div
            className="w-full rounded-2xl p-5 space-y-4 text-center"
            style={{
              backgroundColor: 'var(--surface)',
              border: '1px solid var(--border)',
            }}
          >
            <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-faint)' }}>
              Rate this track
            </p>
            <TierPicker onPick={handlePick} disabled={saving} />
          </div>
        )}

        {/* Nav links */}
        <div className="flex items-center gap-6 pt-1">
          <button
            onClick={onExit}
            className="text-xs transition-all duration-150 hover:text-white"
            style={{ color: 'var(--text-faint)' }}
          >
            See Results
          </button>
          <span style={{ color: 'var(--surface-3)' }}>·</span>
          <button
            onClick={async () => { await pause(); router.push('/'); }}
            className="text-xs transition-all duration-150 hover:text-white"
            style={{ color: 'var(--text-faint)' }}
          >
            Home
          </button>
        </div>
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 0.6; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.04); }
        }
        @keyframes eq-bar {
          from { transform: scaleY(0.3); }
          to   { transform: scaleY(1); }
        }
      `}</style>
    </>
  );
}
