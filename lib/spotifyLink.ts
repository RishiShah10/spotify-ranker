export interface SpotifyLinkResult {
  type: 'album' | 'playlist';
  id: string;
}

export function parseSpotifyUrl(url: string): SpotifyLinkResult | null {
  // L4: constrain ID length to 10–30 chars (Spotify IDs are 22 chars; slack for future changes)
  const match = url.match(/open\.spotify\.com\/(album|playlist)\/([A-Za-z0-9]{10,30})/);
  if (!match) return null;
  return { type: match[1] as 'album' | 'playlist', id: match[2] };
}
