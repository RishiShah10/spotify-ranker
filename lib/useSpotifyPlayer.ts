'use client';

import { useEffect, useRef, useState } from 'react';

export interface PlayerState {
  isReady: boolean;
  isPaused: boolean;
  currentTrackId: string | null;
  deviceId: string | null;
  position: number;
  duration: number;
  error: string | null;
}

export function useSpotifyPlayer(accessToken: string | null, onTrackEnd: () => void) {
  const playerRef = useRef<Spotify.Player | null>(null);
  const deviceIdRef = useRef<string | null>(null);
  const trackEndedRef = useRef(false);
  const hasBeenPlayingRef = useRef(false);
  const onTrackEndRef = useRef(onTrackEnd);
  onTrackEndRef.current = onTrackEnd;
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const seekingRef = useRef(false);
  const seekDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seekSafetyRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [playerState, setPlayerState] = useState<PlayerState>({
    isReady: false,
    isPaused: true,
    currentTrackId: null,
    deviceId: null,
    position: 0,
    duration: 0,
    error: null,
  });

  useEffect(() => {
    if (!accessToken) return;

    function startTick() {
      if (intervalRef.current) return;
      intervalRef.current = setInterval(() => {
        setPlayerState((s) =>
          s.isPaused ? s : { ...s, position: Math.min(s.position + 500, s.duration) }
        );
      }, 500);
    }

    function stopTick() {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }

    function initPlayer() {
      const player = new window.Spotify.Player({
        name: 'Spotify Ranker',
        getOAuthToken: (cb) => cb(accessToken!),
        volume: 0.8,
      });

      player.addListener('ready', ({ device_id }) => {
        deviceIdRef.current = device_id;
        // Transfer playback to the web player — 404 is normal when no other device is active
        fetch('https://api.spotify.com/v1/me/player', {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ device_ids: [device_id] }),
        }).catch(() => {});
        setPlayerState((s) => ({ ...s, isReady: true, deviceId: device_id }));
      });

      player.addListener('player_state_changed', (state) => {
        if (!state) {
          // Another Spotify client (phone, desktop app) took over — reclaim the web device
          if (deviceIdRef.current) {
            fetch('https://api.spotify.com/v1/me/player', {
              method: 'PUT',
              headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ device_ids: [deviceIdRef.current] }),
            });
          }
          return;
        }
        const paused = state.paused;
        const position = state.position;
        const duration = state.track_window.current_track?.duration_ms ?? 0;

        // Seek completed once playback resumes — safe to stop suppressing
        if (seekingRef.current && !paused) {
          seekingRef.current = false;
          if (seekSafetyRef.current) { clearTimeout(seekSafetyRef.current); seekSafetyRef.current = null; }
        }

        // Only trigger track-end when not mid-seek — prevents false trigger when seeking to ~0
        if (!seekingRef.current && paused && position === 0 && !trackEndedRef.current && hasBeenPlayingRef.current) {
          trackEndedRef.current = true;
          stopTick();
          onTrackEndRef.current();
        }
        if (!paused) {
          hasBeenPlayingRef.current = true;
          trackEndedRef.current = false;
          startTick();
        } else {
          stopTick();
        }

        setPlayerState((s) => ({
          ...s,
          isPaused: paused,
          currentTrackId: state.track_window.current_track?.id ?? null,
          // While seeking, keep our optimistic position — SDK events during a seek carry stale data
          position: seekingRef.current ? s.position : position,
          duration,
        }));
      });

      player.addListener('initialization_error', ({ message }) => {
        console.error('Spotify init error:', message);
        setPlayerState((s) => ({ ...s, error: `Initialization error: ${message}` }));
      });
      player.addListener('authentication_error', ({ message }) => {
        console.error('Spotify auth error:', message);
        setPlayerState((s) => ({ ...s, error: `Authentication error — try signing out and back in. (${message})` }));
      });
      player.addListener('account_error', ({ message }) => {
        console.error('Spotify account error:', message);
        setPlayerState((s) => ({ ...s, error: `Spotify Premium required for in-browser playback. (${message})` }));
      });
      player.addListener('not_ready', ({ device_id }) => {
        console.warn('Spotify player went offline:', device_id);
        setPlayerState((s) => ({ ...s, isReady: false }));
      });

      player.connect();
      playerRef.current = player;
    }

    const existingScript = document.querySelector(
      'script[src="https://sdk.scdn.co/spotify-player.js"]'
    );

    if (window.Spotify) {
      // SDK already loaded — create player directly
      initPlayer();
    } else if (existingScript) {
      // Script is loading — register callback (will fire once)
      window.onSpotifyWebPlaybackSDKReady = initPlayer;
    } else {
      // First load — inject script and register callback
      const script = document.createElement('script');
      script.src = 'https://sdk.scdn.co/spotify-player.js';
      script.async = true;
      document.body.appendChild(script);
      window.onSpotifyWebPlaybackSDKReady = initPlayer;
    }

    return () => {
      stopTick();
      if (seekDebounceRef.current) clearTimeout(seekDebounceRef.current);
      if (seekSafetyRef.current) clearTimeout(seekSafetyRef.current);
      playerRef.current?.disconnect();
      playerRef.current = null;
    };
  }, [accessToken]);

  async function playTrack(trackUri: string) {
    if (!deviceIdRef.current || !accessToken) return;
    trackEndedRef.current = false;
    hasBeenPlayingRef.current = false;
    setPlayerState((s) => ({ ...s, position: 0 }));
    // Disable repeat so the track stops naturally instead of looping
    await fetch(
      `https://api.spotify.com/v1/me/player/repeat?state=off&device_id=${deviceIdRef.current}`,
      { method: 'PUT', headers: { Authorization: `Bearer ${accessToken}` } }
    ).catch(() => {});
    await fetch(
      `https://api.spotify.com/v1/me/player/play?device_id=${deviceIdRef.current}`,
      {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ uris: [trackUri] }),
      }
    );
  }

  async function pause() {
    await playerRef.current?.pause();
  }

  async function resume() {
    await playerRef.current?.resume();
  }

  async function togglePlay() {
    if (playerState.isPaused) {
      await resume();
    } else {
      await pause();
    }
  }

  // Must be called from a user gesture (click handler) to unlock the browser's
  // audio context. Call this once before the first playTrack to prevent autoplay blocking.
  async function activateElement() {
    const p = playerRef.current as (Spotify.Player & { activateElement?: () => Promise<void> }) | null;
    await p?.activateElement?.();
  }

  async function seek(positionMs: number) {
    if (!playerRef.current) return;
    // Suppress false track-end detection during seek
    seekingRef.current = true;
    // Safety: clear flag after 2s in case Spotify never fires a resume event (e.g. seek while paused)
    if (seekSafetyRef.current) clearTimeout(seekSafetyRef.current);
    seekSafetyRef.current = setTimeout(() => { seekingRef.current = false; }, 2000);
    // Optimistic UI update — show new position immediately
    setPlayerState((s) => ({ ...s, position: positionMs }));
    // Debounce the actual SDK call so rapid scrubbing sends only one request
    if (seekDebounceRef.current) clearTimeout(seekDebounceRef.current);
    seekDebounceRef.current = setTimeout(async () => {
      try {
        await playerRef.current?.seek(positionMs);
      } catch (err) {
        console.warn('Seek error:', err);
        seekingRef.current = false;
      }
    }, 80);
  }

  return { playerState, playTrack, pause, togglePlay, activateElement, seek };
}
