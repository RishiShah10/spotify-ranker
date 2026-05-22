export interface SpotifyLinkResult {
  type: 'album' | 'playlist';
  id: string;
}

export function parseSpotifyUrl(url: string): SpotifyLinkResult | null {
  const match = url.match(/open\.spotify\.com\/(album|playlist)\/([A-Za-z0-9]+)/);
  if (!match) return null;
  return { type: match[1] as 'album' | 'playlist', id: match[2] };
}
