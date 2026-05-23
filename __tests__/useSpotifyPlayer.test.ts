/**
 * @jest-environment jsdom
 */
import { renderHook, act } from '@testing-library/react';
import { useSpotifyPlayer } from '@/lib/useSpotifyPlayer';

// ── Spotify SDK mock ────────────────────────────────────────────────────────

type ListenerCallback = (arg?: unknown) => void;

function makePlayerMock() {
  const listeners: Record<string, ListenerCallback[]> = {};
  return {
    addListener: jest.fn((event: string, cb: ListenerCallback) => {
      listeners[event] = listeners[event] ?? [];
      listeners[event].push(cb);
    }),
    connect: jest.fn(),
    disconnect: jest.fn(),
    pause: jest.fn().mockResolvedValue(undefined),
    resume: jest.fn().mockResolvedValue(undefined),
    _emit(event: string, arg?: unknown) {
      listeners[event]?.forEach((cb) => cb(arg));
    },
  };
}

type PlayerMock = ReturnType<typeof makePlayerMock>;

let playerMock: PlayerMock;
let appendChildSpy: jest.SpyInstance;

beforeEach(() => {
  playerMock = makePlayerMock();

  // Do NOT pre-assign window.Spotify — let the hook's existingScript/Spotify
  // check work. The appendChild spy will set it and the test helper will fire
  // window.onSpotifyWebPlaybackSDKReady after the hook registers the callback.
  delete (window as unknown as Record<string, unknown>).Spotify;

  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({}) } as Response);

  // Prevent actual script download. When the script element is appended,
  // simulate the SDK loading by setting window.Spotify so the callback can
  // create a Player when triggered manually by mountPlayer.
  appendChildSpy = jest.spyOn(document.body, 'appendChild').mockImplementation((node) => {
    if ((node as HTMLElement).tagName === 'SCRIPT') {
      (window as unknown as Record<string, unknown>).Spotify = {
        Player: jest.fn(() => playerMock),
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

// ── Helper: mount hook, trigger SDK ready, fire device-ready event ──────────

function mountPlayer(token = 'test-token', onTrackEnd = jest.fn()) {
  const hook = renderHook(() => useSpotifyPlayer(token, onTrackEnd));

  // Effect has now run and set window.onSpotifyWebPlaybackSDKReady — trigger it.
  act(() => { window.onSpotifyWebPlaybackSDKReady?.(); });

  // Fire the device-ready event so isReady → true and deviceId is stored.
  act(() => { playerMock._emit('ready', { device_id: 'device-abc' }); });

  return { hook, onTrackEnd };
}

function makeState(overrides: Partial<{
  paused: boolean; position: number; id: string; duration_ms: number;
}> = {}): Spotify.PlaybackState {
  const { paused = false, position = 5000, id = 'track-1', duration_ms = 200000 } = overrides;
  return {
    paused,
    position,
    track_window: {
      current_track: { id, duration_ms } as Spotify.Track,
    } as Spotify.PlaybackTrackWindow,
  } as Spotify.PlaybackState;
}

// ── Initialization ───────────────────────────────────────────────────────────

describe('useSpotifyPlayer — initialization', () => {
  it('does not create a player when accessToken is null', () => {
    renderHook(() => useSpotifyPlayer(null, jest.fn()));
    // With null token the hook returns early — no script is appended and no
    // Spotify.Player constructor is ever called.
    const scripts = appendChildSpy.mock.calls
      .map(([n]: [Node]) => n as HTMLScriptElement)
      .filter((n) => n.tagName === 'SCRIPT');
    expect(scripts).toHaveLength(0);
  });

  it('creates a player with the correct name and volume', () => {
    mountPlayer();
    expect((window.Spotify as { Player: jest.Mock }).Player).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Spotify Ranker', volume: 0.8 })
    );
  });

  it('calls player.connect() after creation', () => {
    mountPlayer();
    expect(playerMock.connect).toHaveBeenCalledTimes(1);
  });

  it('registers listeners for ready and player_state_changed', () => {
    mountPlayer();
    const events = playerMock.addListener.mock.calls.map(([e]: [string]) => e);
    expect(events).toContain('ready');
    expect(events).toContain('player_state_changed');
  });

  it('appends the Spotify SDK script to document.body', () => {
    renderHook(() => useSpotifyPlayer('tok', jest.fn()));
    const scripts = appendChildSpy.mock.calls
      .map(([n]: [Node]) => n as HTMLScriptElement)
      .filter((n) => n.tagName === 'SCRIPT');
    expect(scripts).toHaveLength(1);
    expect(scripts[0].src).toBe('https://sdk.scdn.co/spotify-player.js');
  });
});

// ── Device transfer on ready ─────────────────────────────────────────────────

describe('useSpotifyPlayer — device transfer on ready', () => {
  it('calls PUT /v1/me/player to transfer playback to the web player', () => {
    mountPlayer('my-token');
    expect(fetch).toHaveBeenCalledWith(
      'https://api.spotify.com/v1/me/player',
      expect.objectContaining({
        method: 'PUT',
        headers: expect.objectContaining({ Authorization: 'Bearer my-token' }),
        body: JSON.stringify({ device_ids: ['device-abc'] }),
      })
    );
  });

  it('sets isReady=true and stores deviceId after ready event', () => {
    const { hook } = mountPlayer();
    expect(hook.result.current.playerState.isReady).toBe(true);
    expect(hook.result.current.playerState.deviceId).toBe('device-abc');
  });
});

// ── playTrack ────────────────────────────────────────────────────────────────

describe('useSpotifyPlayer — playTrack', () => {
  it('calls PUT /v1/me/player/play with the track URI and device id', async () => {
    const { hook } = mountPlayer('tok');
    await act(async () => {
      await hook.result.current.playTrack('spotify:track:123');
    });
    expect(fetch).toHaveBeenCalledWith(
      'https://api.spotify.com/v1/me/player/play?device_id=device-abc',
      expect.objectContaining({
        method: 'PUT',
        headers: expect.objectContaining({ Authorization: 'Bearer tok' }),
        body: JSON.stringify({ uris: ['spotify:track:123'] }),
      })
    );
  });

  it('does nothing if the device is not yet registered (no ready event)', async () => {
    // Render hook but deliberately skip the ready event
    const hook = renderHook(() => useSpotifyPlayer('tok', jest.fn()));
    act(() => { window.onSpotifyWebPlaybackSDKReady?.(); });
    // Do NOT emit 'ready' → deviceId stays null

    const beforeCount = (fetch as jest.Mock).mock.calls.length;
    await act(async () => {
      await hook.result.current.playTrack('spotify:track:xyz');
    });
    // No new fetch calls should have been made for /play
    const playCalls = (fetch as jest.Mock).mock.calls.filter(([url]: [string]) =>
      url.includes('/play')
    );
    expect(playCalls).toHaveLength(0);
  });
});

// ── State transitions ────────────────────────────────────────────────────────

describe('useSpotifyPlayer — state transitions', () => {
  it('updates isPaused, position, duration, and currentTrackId on state change', () => {
    const { hook } = mountPlayer();
    act(() => { playerMock._emit('player_state_changed', makeState({ paused: false, position: 5000 })); });
    expect(hook.result.current.playerState.isPaused).toBe(false);
    expect(hook.result.current.playerState.position).toBe(5000);
    expect(hook.result.current.playerState.duration).toBe(200000);
    expect(hook.result.current.playerState.currentTrackId).toBe('track-1');
  });

  it('calls onTrackEnd when track finishes (paused=true, position=0, after having played)', () => {
    const { onTrackEnd } = mountPlayer();
    act(() => { playerMock._emit('player_state_changed', makeState({ paused: false, position: 10000 })); });
    act(() => { playerMock._emit('player_state_changed', makeState({ paused: true, position: 0 })); });
    expect(onTrackEnd).toHaveBeenCalledTimes(1);
  });

  it('does NOT call onTrackEnd twice for the same track end', () => {
    const { onTrackEnd } = mountPlayer();
    act(() => { playerMock._emit('player_state_changed', makeState({ paused: false, position: 10000 })); });
    act(() => { playerMock._emit('player_state_changed', makeState({ paused: true, position: 0 })); });
    act(() => { playerMock._emit('player_state_changed', makeState({ paused: true, position: 0 })); });
    expect(onTrackEnd).toHaveBeenCalledTimes(1);
  });

  it('does NOT call onTrackEnd on the very first pause-at-zero (no prior play)', () => {
    const { onTrackEnd } = mountPlayer();
    act(() => { playerMock._emit('player_state_changed', makeState({ paused: true, position: 0 })); });
    expect(onTrackEnd).not.toHaveBeenCalled();
  });

  it('resets trackEnded guard when a new track starts playing', () => {
    const { onTrackEnd } = mountPlayer();
    // Track 1 ends
    act(() => { playerMock._emit('player_state_changed', makeState({ paused: false, position: 5000, id: 't1' })); });
    act(() => { playerMock._emit('player_state_changed', makeState({ paused: true, position: 0, id: 't1' })); });
    expect(onTrackEnd).toHaveBeenCalledTimes(1);
    // Track 2 starts and ends
    act(() => { playerMock._emit('player_state_changed', makeState({ paused: false, position: 5000, id: 't2' })); });
    act(() => { playerMock._emit('player_state_changed', makeState({ paused: true, position: 0, id: 't2' })); });
    expect(onTrackEnd).toHaveBeenCalledTimes(2);
  });
});

// ── Progress tick ────────────────────────────────────────────────────────────

describe('useSpotifyPlayer — progress tick', () => {
  it('advances position by 500ms every 500ms while playing', () => {
    jest.useFakeTimers();
    const { hook } = mountPlayer();
    act(() => {
      playerMock._emit('player_state_changed', makeState({ paused: false, position: 1000, duration_ms: 10000 }));
    });
    act(() => { jest.advanceTimersByTime(1000); });
    expect(hook.result.current.playerState.position).toBe(2000);
  });

  it('stops advancing when paused', () => {
    jest.useFakeTimers();
    const { hook } = mountPlayer();
    act(() => {
      playerMock._emit('player_state_changed', makeState({ paused: false, position: 1000, duration_ms: 10000 }));
    });
    act(() => {
      playerMock._emit('player_state_changed', makeState({ paused: true, position: 1500, duration_ms: 10000 }));
    });
    act(() => { jest.advanceTimersByTime(2000); });
    expect(hook.result.current.playerState.position).toBe(1500);
  });

  it('does not advance beyond duration', () => {
    jest.useFakeTimers();
    const { hook } = mountPlayer();
    act(() => {
      playerMock._emit('player_state_changed', makeState({ paused: false, position: 9800, duration_ms: 10000 }));
    });
    act(() => { jest.advanceTimersByTime(2000); });
    expect(hook.result.current.playerState.position).toBeLessThanOrEqual(10000);
  });
});

// ── togglePlay ───────────────────────────────────────────────────────────────

describe('useSpotifyPlayer — togglePlay', () => {
  it('calls player.resume() when paused', async () => {
    const { hook } = mountPlayer();
    act(() => { playerMock._emit('player_state_changed', makeState({ paused: true })); });
    await act(async () => { await hook.result.current.togglePlay(); });
    expect(playerMock.resume).toHaveBeenCalledTimes(1);
    expect(playerMock.pause).not.toHaveBeenCalled();
  });

  it('calls player.pause() when playing', async () => {
    const { hook } = mountPlayer();
    act(() => { playerMock._emit('player_state_changed', makeState({ paused: false })); });
    await act(async () => { await hook.result.current.togglePlay(); });
    expect(playerMock.pause).toHaveBeenCalledTimes(1);
    expect(playerMock.resume).not.toHaveBeenCalled();
  });
});
