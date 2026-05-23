export type Tier = 'S' | 'A' | 'B' | 'C' | 'F' | 'skip';

export interface User {
  id: string;
  display_name: string;
  email: string | null;
  avatar_url: string | null;
  created_at: string;
}

export interface RankingSession {
  id: string;
  user_id: string;
  spotify_type: 'album' | 'playlist';
  spotify_id: string;
  name: string;
  cover_url: string;
  total_tracks: number;
  current_index: number;
  completed: boolean;
  hidden: boolean;
  created_at: string;
  updated_at: string;
}

export interface SongRanking {
  id: string;
  session_id: string;
  user_id: string;
  track_id: string;
  track_name: string;
  artist_name: string;
  tier: Tier;
  ranked_at: string;
}

export interface SpotifyTrack {
  id: string;
  name: string;
  artistName: string;
  uri: string;
  durationMs: number;
}

export interface SpotifySearchResult {
  id: string;
  type: 'album' | 'playlist';
  name: string;
  coverUrl: string;
  subtitle: string;
  totalTracks: number;
}

export interface SpotifyArtist {
  id: string;
  name: string;
  imageUrl: string;
  followers: number;
  genres: string[];
}

export interface SpotifySearchResponse {
  results: SpotifySearchResult[];
  artists: SpotifyArtist[];
}
