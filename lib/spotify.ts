import type { SpotifySearchResult, SpotifyTrack } from '@/types';

const BASE = 'https://api.spotify.com/v1';

async function spotifyFetch(path: string, token: string) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Spotify API ${res.status}: ${path}`);
  return res.json();
}

export async function searchSpotify(query: string, token: string): Promise<SpotifySearchResult[]> {
  const data = await spotifyFetch(
    `/search?q=${encodeURIComponent(query)}&type=album,playlist&limit=8`,
    token
  );
  const albums: SpotifySearchResult[] = (data.albums?.items ?? []).map((a: any) => ({
    id: a.id,
    type: 'album' as const,
    name: a.name,
    coverUrl: a.images?.[0]?.url ?? '',
    subtitle: a.artists.map((x: any) => x.name).join(', '),
    totalTracks: a.total_tracks,
  }));
  const playlists: SpotifySearchResult[] = (data.playlists?.items ?? []).map((p: any) => ({
    id: p.id,
    type: 'playlist' as const,
    name: p.name,
    coverUrl: p.images?.[0]?.url ?? '',
    subtitle: p.owner.display_name,
    totalTracks: p.tracks.total,
  }));
  return [...albums, ...playlists];
}

export async function getAlbumTracks(albumId: string, token: string): Promise<SpotifyTrack[]> {
  const data = await spotifyFetch(`/albums/${albumId}/tracks?limit=50`, token);
  return data.items.map((t: any) => ({
    id: t.id,
    name: t.name,
    artistName: t.artists.map((a: any) => a.name).join(', '),
    uri: t.uri,
    durationMs: t.duration_ms,
  }));
}

export async function getPlaylistTracks(playlistId: string, token: string): Promise<SpotifyTrack[]> {
  const data = await spotifyFetch(`/playlists/${playlistId}/tracks?limit=50`, token);
  return data.items
    .filter((item: any) => item.track && !item.track.is_local)
    .map((item: any) => ({
      id: item.track.id,
      name: item.track.name,
      artistName: item.track.artists.map((a: any) => a.name).join(', '),
      uri: item.track.uri,
      durationMs: item.track.duration_ms,
    }));
}

export async function getAlbumInfo(
  albumId: string,
  token: string
): Promise<{ name: string; coverUrl: string; artist: string; totalTracks: number }> {
  const data = await spotifyFetch(`/albums/${albumId}`, token);
  return {
    name: data.name,
    coverUrl: data.images?.[0]?.url ?? '',
    artist: data.artists.map((a: any) => a.name).join(', '),
    totalTracks: data.tracks.total,
  };
}

export async function getPlaylistInfo(
  playlistId: string,
  token: string
): Promise<{ name: string; coverUrl: string; owner: string; totalTracks: number }> {
  const data = await spotifyFetch(`/playlists/${playlistId}`, token);
  return {
    name: data.name,
    coverUrl: data.images?.[0]?.url ?? '',
    owner: data.owner.display_name,
    totalTracks: data.tracks.total,
  };
}
