import {
  searchSpotify,
  getAlbumTracks,
  getPlaylistTracks,
  getAlbumInfo,
  getPlaylistInfo,
} from '@/lib/spotify';

const TOKEN = 'test-token';

function mockFetch(body: unknown, ok = true) {
  global.fetch = jest.fn().mockResolvedValue({
    ok,
    status: ok ? 200 : 403,
    json: async () => body,
  } as Response);
}

afterEach(() => jest.resetAllMocks());

// ── searchSpotify ────────────────────────────────────────────────────────────

describe('searchSpotify', () => {
  const albumItem = {
    id: 'album-1',
    name: 'Blonde',
    images: [{ url: 'https://i.scdn.co/cover.jpg' }],
    artists: [{ name: 'Frank Ocean' }],
    total_tracks: 17,
  };
  const playlistItem = {
    id: 'pl-1',
    name: 'Chill Mix',
    images: [{ url: 'https://i.scdn.co/pl.jpg' }],
    owner: { display_name: 'Spotify' },
    tracks: { total: 50 },
  };

  it('calls the Spotify search endpoint with Authorization header', async () => {
    mockFetch({ albums: { items: [] }, playlists: { items: [] } });
    await searchSpotify('frank ocean', TOKEN);
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/search?q=frank%20ocean'),
      expect.objectContaining({ headers: { Authorization: `Bearer ${TOKEN}` } })
    );
  });

  it('maps album results to SpotifySearchResult shape', async () => {
    mockFetch({ albums: { items: [albumItem] }, playlists: { items: [] }, artists: { items: [] } });
    const { results } = await searchSpotify('blonde', TOKEN);
    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({
      id: 'album-1',
      type: 'album',
      name: 'Blonde',
      coverUrl: 'https://i.scdn.co/cover.jpg',
      subtitle: 'Frank Ocean',
      totalTracks: 17,
    });
  });

  it('maps playlist results to SpotifySearchResult shape', async () => {
    mockFetch({ albums: { items: [] }, playlists: { items: [playlistItem] }, artists: { items: [] } });
    const { results } = await searchSpotify('chill', TOKEN);
    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({
      id: 'pl-1',
      type: 'playlist',
      name: 'Chill Mix',
      coverUrl: 'https://i.scdn.co/pl.jpg',
      subtitle: 'Spotify',
      totalTracks: 50,
    });
  });

  it('returns albums before playlists', async () => {
    mockFetch({ albums: { items: [albumItem] }, playlists: { items: [playlistItem] }, artists: { items: [] } });
    const { results } = await searchSpotify('q', TOKEN);
    expect(results[0].type).toBe('album');
    expect(results[1].type).toBe('playlist');
  });

  it('handles empty response gracefully', async () => {
    mockFetch({ albums: { items: [] }, playlists: { items: [] }, artists: { items: [] } });
    const { results } = await searchSpotify('nothing', TOKEN);
    expect(results).toHaveLength(0);
  });

  it('throws on non-ok response', async () => {
    mockFetch({}, false);
    await expect(searchSpotify('x', TOKEN)).rejects.toThrow('Spotify API 403');
  });
});

// ── getAlbumTracks ───────────────────────────────────────────────────────────

describe('getAlbumTracks', () => {
  const trackItem = {
    id: 'track-1',
    name: 'Nights',
    artists: [{ name: 'Frank Ocean' }],
    uri: 'spotify:track:track-1',
    duration_ms: 307000,
  };

  it('returns correctly shaped SpotifyTrack array', async () => {
    mockFetch({ items: [trackItem], next: null });
    const tracks = await getAlbumTracks('album-1', TOKEN);
    expect(tracks).toHaveLength(1);
    expect(tracks[0]).toEqual({
      id: 'track-1',
      name: 'Nights',
      artistName: 'Frank Ocean',
      uri: 'spotify:track:track-1',
      durationMs: 307000,
    });
  });

  it('joins multiple artists with a comma', async () => {
    mockFetch({
      items: [{ ...trackItem, artists: [{ name: 'A' }, { name: 'B' }] }],
      next: null,
    });
    const tracks = await getAlbumTracks('album-1', TOKEN);
    expect(tracks[0].artistName).toBe('A, B');
  });

  it('calls the correct endpoint', async () => {
    mockFetch({ items: [], next: null });
    await getAlbumTracks('alb123', TOKEN);
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/albums/alb123/tracks'),
      expect.anything()
    );
  });
});

// ── getPlaylistTracks ────────────────────────────────────────────────────────

describe('getPlaylistTracks', () => {
  const playlistTrackItem = {
    track: {
      id: 'track-2',
      name: 'Ivy',
      artists: [{ name: 'Frank Ocean' }],
      uri: 'spotify:track:track-2',
      duration_ms: 251000,
      is_local: false,
    },
  };

  it('returns correctly shaped SpotifyTrack array', async () => {
    mockFetch({ items: [playlistTrackItem], next: null });
    const tracks = await getPlaylistTracks('pl-1', TOKEN);
    expect(tracks[0]).toEqual({
      id: 'track-2',
      name: 'Ivy',
      artistName: 'Frank Ocean',
      uri: 'spotify:track:track-2',
      durationMs: 251000,
    });
  });

  it('filters out local tracks', async () => {
    mockFetch({
      items: [
        playlistTrackItem,
        { track: { ...playlistTrackItem.track, id: 'local', is_local: true } },
      ],
      next: null,
    });
    const tracks = await getPlaylistTracks('pl-1', TOKEN);
    expect(tracks).toHaveLength(1);
    expect(tracks[0].id).toBe('track-2');
  });

  it('filters out null track entries (podcast episodes etc.)', async () => {
    mockFetch({ items: [{ track: null }, playlistTrackItem], next: null });
    const tracks = await getPlaylistTracks('pl-1', TOKEN);
    expect(tracks).toHaveLength(1);
  });
});

// ── getAlbumInfo ─────────────────────────────────────────────────────────────

describe('getAlbumInfo', () => {
  it('returns name, coverUrl, artist, totalTracks', async () => {
    mockFetch({
      name: 'Blonde',
      images: [{ url: 'https://i.scdn.co/cover.jpg' }],
      artists: [{ name: 'Frank Ocean' }],
      tracks: { total: 17 },
    });
    const info = await getAlbumInfo('alb-1', TOKEN);
    expect(info).toEqual({
      name: 'Blonde',
      coverUrl: 'https://i.scdn.co/cover.jpg',
      artist: 'Frank Ocean',
      totalTracks: 17,
    });
  });

  it('returns empty string for coverUrl when images array is empty', async () => {
    mockFetch({
      name: 'X',
      images: [],
      artists: [{ name: 'Y' }],
      tracks: { total: 5 },
    });
    const info = await getAlbumInfo('alb-2', TOKEN);
    expect(info.coverUrl).toBe('');
  });
});

// ── getPlaylistInfo ──────────────────────────────────────────────────────────

describe('getPlaylistInfo', () => {
  it('returns name, coverUrl, owner, totalTracks', async () => {
    mockFetch({
      name: 'Chill Mix',
      images: [{ url: 'https://i.scdn.co/pl.jpg' }],
      owner: { display_name: 'Spotify' },
      tracks: { total: 50 },
    });
    const info = await getPlaylistInfo('pl-1', TOKEN);
    expect(info).toEqual({
      name: 'Chill Mix',
      coverUrl: 'https://i.scdn.co/pl.jpg',
      owner: 'Spotify',
      totalTracks: 50,
    });
  });
});
