/**
 * @jest-environment jsdom
 *
 * Integration tests verifying the complete playback flow:
 * SDK init → device transfer → play track → progress → track end → rate.
 *
 * These tests use a mocked Spotify SDK so they run without a real Spotify
 * account, but they assert every outbound HTTP request is well-formed, meaning
 * that when a Premium account IS present, audio will play.
 */
import { renderHook, act } from '@testing-library/react';
import { useSpotifyPlayer } from '@/lib/useSpotifyPlayer';

// ── SDK mock ─────────────────────────────────────────────────────────────────

type Listener = (arg?: unknown) => void;

function makeSdk() {
  const listeners: Record<string, Listener[]> = {};
  return {
    addListener: jest.fn((event: string, cb: Listener) => {
      listeners[event] = listeners[event] ?? [];
      listeners[event].push(cb);
    }),
    connect: jest.fn(),
    disconnect: jest.fn(),
    pause: jest.fn().mockResolvedValue(undefined),
    resume: jest.fn().mockResolvedValue(undefined),
    emit(event: string, arg?: unknown) {
      listeners[event]?.forEach((cb) => cb(arg));
    },
  };
}

type Sdk = ReturnType<typeof makeSdk>;

let sdk: Sdk;
let fetchCalls: Array<[string, RequestInit]>;

beforeEach(() => {
  sdk = makeSdk();
  fetchCalls = [];

  // Do NOT pre-assign window.Spotify — let the hook's existingScript/Spotify
  // check work. The appendChild spy will set it and mountAndReady will fire
  // window.onSpotifyWebPlaybackSDKReady after the hook registers the callback.
  delete (window as unknown as Record<string, unknown>).Spotify;

  global.fetch = jest.fn().mockImplementation((url: string, init: RequestInit) => {
    fetchCalls.push([url, init]);
    return Promise.resolve({ ok: true, json: async () => ({}) } as Response);
  });

  // Prevent actual script download. When the script element is appended,
  // simulate the SDK loading by setting window.Spotify so the callback can
  // create a Player when triggered manually by mountAndReady.
  jest.spyOn(document.body, 'appendChild').mockImplementation((node) => {
    if ((node as HTMLElement).tagName === 'SCRIPT') {
      (window as unknown as Record<string, unknown>).Spotify = {
        Player: jest.fn(() => sdk),
      };
    }
    return node;
  });
});

afterEach(() => {
  delete (window as unknown as Record<string, unknown>).Spotify;
  jest.restoreAllMocks();
  jest.useRealTimers();
});

// ── Helper ───────────────────────────────────────────────────────────────────

function mountAndReady(token: string, onTrackEnd = jest.fn()) {
  const result = renderHook(() => useSpotifyPlayer(token, onTrackEnd));
  // Effect has run and set window.onSpotifyWebPlaybackSDKReady — fire it now.
  act(() => { window.onSpotifyWebPlaybackSDKReady?.(); });
  // Fire the device-ready event.
  act(() => { sdk.emit('ready', { device_id: 'web-device' }); });
  return { ...result, onTrackEnd };
}

// ── Full playback flow ───────────────────────────────────────────────────────

describe('Full playback flow', () => {
  it('Step 1: SDK initialises with the correct OAuth token', () => {
    mountAndReady('premium-token');
    const PlayerCtor = (window.Spotify as { Player: jest.Mock }).Player;
    expect(PlayerCtor).toHaveBeenCalledTimes(1);
    const getOAuthToken: (cb: (t: string) => void) => void =
      PlayerCtor.mock.calls[0][0].getOAuthToken;
    let captured = '';
    getOAuthToken((t) => { captured = t; });
    expect(captured).toBe('premium-token');
  });

  it('Step 2: device transfer fires on ready — prevents desktop app from stealing audio', () => {
    mountAndReady('tok');
    const transfer = fetchCalls.find(([url]) => url === 'https://api.spotify.com/v1/me/player');
    expect(transfer).toBeDefined();
    expect(transfer![1].method).toBe('PUT');
    expect(JSON.parse(transfer![1].body as string)).toEqual({ device_ids: ['web-device'] });
  });

  it('Step 3: playTrack sends the URI to the registered web device', async () => {
    const { result } = mountAndReady('tok');
    await act(async () => {
      await result.current.playTrack('spotify:track:abc123');
    });
    const play = fetchCalls.find(([url]) => url.includes('/play?'));
    expect(play).toBeDefined();
    expect(play![0]).toBe('https://api.spotify.com/v1/me/player/play?device_id=web-device');
    expect(JSON.parse(play![1].body as string)).toEqual({ uris: ['spotify:track:abc123'] });
  });

  it('Step 4: progress ticks every 500ms while playing', () => {
    jest.useFakeTimers();
    const { result } = mountAndReady('tok');
    act(() => {
      sdk.emit('player_state_changed', {
        paused: false, position: 0,
        track_window: { current_track: { id: 't', duration_ms: 60000 } },
      });
    });
    act(() => { jest.advanceTimersByTime(3000); });
    // 6 ticks × 500ms = 3000ms added to starting position of 0
    expect(result.current.playerState.position).toBe(3000);
  });

  it('Step 5: onTrackEnd fires when track ends (paused at position 0)', () => {
    const { onTrackEnd } = mountAndReady('tok');
    act(() => {
      sdk.emit('player_state_changed', {
        paused: false, position: 10000,
        track_window: { current_track: { id: 't', duration_ms: 30000 } },
      });
    });
    act(() => {
      sdk.emit('player_state_changed', {
        paused: true, position: 0,
        track_window: { current_track: { id: 't', duration_ms: 30000 } },
      });
    });
    expect(onTrackEnd).toHaveBeenCalledTimes(1);
  });

  it('Step 6: togglePlay pauses a playing track', async () => {
    const { result } = mountAndReady('tok');
    act(() => {
      sdk.emit('player_state_changed', {
        paused: false, position: 5000,
        track_window: { current_track: { id: 't', duration_ms: 30000 } },
      });
    });
    await act(async () => { await result.current.togglePlay(); });
    expect(sdk.pause).toHaveBeenCalledTimes(1);
    expect(sdk.resume).not.toHaveBeenCalled();
  });
});

// ── Audio requirements checklist ─────────────────────────────────────────────

describe('Audio playback requirements', () => {
  it('REQ-1: player name is "Spotify Ranker" (required for SDK device list)', () => {
    mountAndReady('tok');
    const ctor = (window.Spotify as { Player: jest.Mock }).Player;
    expect(ctor.mock.calls[0][0].name).toBe('Spotify Ranker');
  });

  it('REQ-2: volume is > 0 (silent volume = no audio)', () => {
    mountAndReady('tok');
    const ctor = (window.Spotify as { Player: jest.Mock }).Player;
    expect(ctor.mock.calls[0][0].volume).toBeGreaterThan(0);
  });

  it('REQ-3: Authorization header uses Bearer scheme on all Spotify API calls', () => {
    mountAndReady('my-access-token');
    fetchCalls.forEach(([, init]) => {
      const auth = (init.headers as Record<string, string>)?.Authorization;
      expect(auth).toBe('Bearer my-access-token');
    });
  });

  it('REQ-4: Content-Type is application/json on all PUT requests', () => {
    mountAndReady('tok');
    fetchCalls
      .filter(([, init]) => init.method === 'PUT')
      .forEach(([, init]) => {
        expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json');
      });
  });

  it('REQ-5: player.connect() is called (without connect no audio ever plays)', () => {
    mountAndReady('tok');
    expect(sdk.connect).toHaveBeenCalledTimes(1);
  });

  it('REQ-6: SDK script is loaded from the official Spotify CDN', () => {
    // appendChildSpy is set in beforeEach; check what was appended.
    renderHook(() => useSpotifyPlayer('tok', jest.fn()));
    const appended = (document.body.appendChild as jest.Mock).mock.calls
      .map(([n]: [Node]) => n as HTMLScriptElement)
      .filter((n) => n.tagName === 'SCRIPT');
    expect(appended).toHaveLength(1);
    expect(appended[0].src).toBe('https://sdk.scdn.co/spotify-player.js');
  });
});
