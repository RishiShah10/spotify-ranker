import { parseSpotifyUrl } from '@/lib/spotifyLink';

describe('parseSpotifyUrl', () => {
  it('parses an album URL', () => {
    expect(parseSpotifyUrl('https://open.spotify.com/album/4LH4d3cOWNNsVw41Gqt2kv'))
      .toEqual({ type: 'album', id: '4LH4d3cOWNNsVw41Gqt2kv' });
  });

  it('parses a playlist URL', () => {
    expect(parseSpotifyUrl('https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M'))
      .toEqual({ type: 'playlist', id: '37i9dQZF1DXcBWIGoYBM5M' });
  });

  it('strips query params', () => {
    expect(parseSpotifyUrl('https://open.spotify.com/album/4LH4d3cOWNNsVw41Gqt2kv?si=abc123'))
      .toEqual({ type: 'album', id: '4LH4d3cOWNNsVw41Gqt2kv' });
  });

  it('returns null for non-Spotify URLs', () => {
    expect(parseSpotifyUrl('https://example.com/album/abc')).toBeNull();
  });

  it('returns null for unsupported Spotify types (track)', () => {
    expect(parseSpotifyUrl('https://open.spotify.com/track/abc')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(parseSpotifyUrl('')).toBeNull();
  });
});
