'use client';

import { useEffect, useRef, useState } from 'react';

export interface PlayerState {
  isReady: boolean;
  isPaused: boolean;
  currentTrackId: string | null;
  deviceId: string | null;
}

export function useSpotifyPlayer(accessToken: string | null, onTrackEnd: () => void) {
  const playerRef = useRef<Spotify.Player | null>(null);
  const deviceIdRef = useRef<string | null>(null);
  const trackEndedRef = useRef(false);
  const onTrackEndRef = useRef(onTrackEnd);
  onTrackEndRef.current = onTrackEnd;

  const [playerState, setPlayerState] = useState<PlayerState>({
    isReady: false,
    isPaused: true,
    currentTrackId: null,
    deviceId: null,
  });

  useEffect(() => {
    if (!accessToken) return;

    const script = document.createElement('script');
    script.src = 'https://sdk.scdn.co/spotify-player.js';
    script.async = true;
    document.body.appendChild(script);

    window.onSpotifyWebPlaybackSDKReady = () => {
      const player = new window.Spotify.Player({
        name: 'Spotify Ranker',
        getOAuthToken: (cb) => cb(accessToken),
        volume: 0.8,
      });

      player.addListener('ready', ({ device_id }) => {
        deviceIdRef.current = device_id;
        setPlayerState((s) => ({ ...s, isReady: true, deviceId: device_id }));
      });

      player.addListener('player_state_changed', (state) => {
        if (!state) return;
        if (state.paused && state.position === 0 && !trackEndedRef.current) {
          trackEndedRef.current = true;
          onTrackEndRef.current();
        }
        if (!state.paused) trackEndedRef.current = false;
        setPlayerState((s) => ({
          ...s,
          isPaused: state.paused,
          currentTrackId: state.track_window.current_track?.id ?? null,
        }));
      });

      player.connect();
      playerRef.current = player;
    };

    return () => {
      playerRef.current?.disconnect();
      document.body.removeChild(script);
    };
  }, [accessToken]);

  async function playTrack(trackUri: string) {
    if (!deviceIdRef.current || !accessToken) return;
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

  return { playerState, playTrack, pause };
}
