import type { SpotifySearchResult, SpotifySearchResponse, SpotifyArtist, SpotifyTrack } from '@/types';

const BASE = 'https://api.spotify.com/v1';

// H9: retry once on 429 after honoring Retry-After header
async function spotifyFetch(path: string, token: string) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 429) {
    const retryAfter = parseInt(res.headers.get('Retry-After') ?? '1', 10);
    await new Promise((resolve) => setTimeout(resolve, retryAfter * 1000));
    const retry = await fetch(`${BASE}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!retry.ok) throw new Error(`Spotify API ${retry.status}: ${path}`);
    return retry.json();
  }
  if (!res.ok) throw new Error(`Spotify API ${res.status}: ${path}`);
  return res.json();
}

export async function searchSpotify(query: string, token: string): Promise<SpotifySearchResponse> {
  const data = await spotifyFetch(
    `/search?q=${encodeURIComponent(query)}&type=album,playlist,artist&limit=6`,
    token
  );
  const albums: SpotifySearchResult[] = (data.albums?.items ?? []).map((a: any) => ({
    id: a.id,
    type: 'album' as const,
    name: a.name,
    coverUrl: a.images?.[0]?.url ?? '',
    subtitle: a.artists?.map((x: any) => x.name).join(', ') ?? '',
    totalTracks: a.total_tracks,
  }));
  // M22: p.owner?.display_name already uses optional chaining — verified correct
  const playlists: SpotifySearchResult[] = (data.playlists?.items ?? [])
    .filter(Boolean)
    .map((p: any) => ({
      id: p.id,
      type: 'playlist' as const,
      name: p.name,
      coverUrl: p.images?.[0]?.url ?? '',
      subtitle: p.owner?.display_name ?? '',
      totalTracks: p.tracks?.total ?? 0,
    }));
  const artists: SpotifyArtist[] = (data.artists?.items ?? []).slice(0, 5).map((a: any) => ({
    id: a.id,
    name: a.name,
    imageUrl: a.images?.[0]?.url ?? '',
    followers: a.followers?.total ?? 0,
    genres: a.genres ?? [],
  }));
  return { results: [...albums, ...playlists], artists };
}

export async function getArtistAlbums(artistId: string, token: string): Promise<SpotifySearchResult[]> {
  const data = await spotifyFetch(
    `/artists/${artistId}/albums?include_groups=album,compilation&market=US&limit=50`,
    token
  );
  return (data.items ?? []).map((a: any) => ({
    id: a.id,
    type: 'album' as const,
    name: a.name,
    coverUrl: a.images?.[0]?.url ?? '',
    subtitle: a.release_date?.slice(0, 4) ?? '',
    totalTracks: a.total_tracks,
  }));
}

export async function getArtistPlaylists(artistName: string, token: string): Promise<SpotifySearchResult[]> {
  const data = await spotifyFetch(
    `/search?q=${encodeURIComponent(`This Is ${artistName}`)}&type=playlist&limit=10`,
    token
  );
  // M22: p.owner?.display_name already uses optional chaining — verified correct
  const thisIs: SpotifySearchResult[] = (data.playlists?.items ?? [])
    .filter(Boolean)
    .slice(0, 5)
    .map((p: any) => ({
      id: p.id,
      type: 'playlist' as const,
      name: p.name,
      coverUrl: p.images?.[0]?.url ?? '',
      subtitle: p.owner?.display_name ?? '',
      totalTracks: p.tracks?.total ?? 0,
    }));

  const data2 = await spotifyFetch(
    `/search?q=${encodeURIComponent(artistName)}&type=playlist&limit=10`,
    token
  );
  // M22: p.owner?.display_name already uses optional chaining — verified correct
  const general: SpotifySearchResult[] = (data2.playlists?.items ?? [])
    .filter(Boolean)
    .map((p: any) => ({
      id: p.id,
      type: 'playlist' as const,
      name: p.name,
      coverUrl: p.images?.[0]?.url ?? '',
      subtitle: p.owner?.display_name ?? '',
      totalTracks: p.tracks?.total ?? 0,
    }));

  // Merge, deduplicate by id, cap at 10
  const seen = new Set(thisIs.map((p) => p.id));
  const merged = [...thisIs];
  for (const p of general) {
    if (!seen.has(p.id)) { seen.add(p.id); merged.push(p); }
    if (merged.length >= 10) break;
  }
  return merged;
}

export async function getAlbumTracks(albumId: string, token: string): Promise<SpotifyTrack[]> {
  const tracks: SpotifyTrack[] = [];
  let offset = 0;
  while (true) {
    const data = await spotifyFetch(`/albums/${albumId}/tracks?limit=50&offset=${offset}`, token);
    // M21: guard data.items against null/undefined
    for (const t of (data.items ?? [])) {
      // M24: skip tracks with falsy id
      if (!t.id) continue;
      tracks.push({
        id: t.id,
        name: t.name,
        artistName: t.artists.map((a: any) => a.name).join(', '),
        uri: t.uri,
        durationMs: t.duration_ms,
      });
    }
    // H8: hard cap at 500 tracks
    if (!data.next || tracks.length >= 500) break;
    offset += 50;
  }
  return tracks;
}

export async function getPlaylistTracks(playlistId: string, token: string): Promise<SpotifyTrack[]> {
  const tracks: SpotifyTrack[] = [];
  let offset = 0;
  while (true) {
    const data = await spotifyFetch(`/playlists/${playlistId}/tracks?limit=50&offset=${offset}`, token);
    // M21: guard data.items against null/undefined
    for (const item of (data.items ?? [])) {
      // M24: also skip items where track.id is null/falsy
      if (!item.track || item.track.is_local || !item.track.id) continue;
      tracks.push({
        id: item.track.id,
        name: item.track.name,
        artistName: item.track.artists.map((a: any) => a.name).join(', '),
        uri: item.track.uri,
        durationMs: item.track.duration_ms,
      });
    }
    // H8: hard cap at 500 tracks
    if (!data.next || tracks.length >= 500) break;
    offset += 50;
  }
  return tracks;
}

export async function getAlbumInfo(
  albumId: string,
  token: string
): Promise<{ name: string; coverUrl: string; artist: string; totalTracks: number }> {
  const data = await spotifyFetch(`/albums/${albumId}`, token);
  return {
    name: data.name,
    coverUrl: data.images?.[0]?.url ?? '',
    // M23: guard data.artists and data.tracks against null
    artist: (data.artists ?? []).map((a: any) => a.name).join(', '),
    totalTracks: data.tracks?.total ?? 0,
  };
}

export async function getPlaylistInfo(
  playlistId: string,
  token: string
): Promise<{ name: string; coverUrl: string; owner: string; totalTracks: number }> {
  const data = await spotifyFetch(`/playlists/${playlistId}`, token);
  // M20: totalTracks from data.tracks.total may not reflect actual rankable track count
  // (local tracks filtered in getPlaylistTracks are still counted here). Known limitation.
  return {
    name: data.name,
    coverUrl: data.images?.[0]?.url ?? '',
    // M23: guard data.owner and data.tracks against null
    owner: data.owner?.display_name ?? '',
    totalTracks: data.tracks?.total ?? 0,
  };
}
