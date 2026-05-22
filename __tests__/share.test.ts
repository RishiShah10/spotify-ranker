import { formatTierText } from '@/lib/share';
import type { RankingSession, SongRanking } from '@/types';

const session: RankingSession = {
  id: 'session-1', user_id: 'u1', spotify_type: 'album', spotify_id: 'a1',
  name: 'Blonde', cover_url: 'https://x.com/c.jpg', total_tracks: 4,
  current_index: 4, completed: true, created_at: '2026-01-01', updated_at: '2026-01-01',
};

const rankings: SongRanking[] = [
  { id: '1', session_id: 'session-1', user_id: 'u1', track_id: 't1', track_name: 'Nights',         artist_name: 'Frank Ocean', tier: 'S', ranked_at: '2026-01-01' },
  { id: '2', session_id: 'session-1', user_id: 'u1', track_id: 't2', track_name: 'Ivy',            artist_name: 'Frank Ocean', tier: 'S', ranked_at: '2026-01-01' },
  { id: '3', session_id: 'session-1', user_id: 'u1', track_id: 't3', track_name: 'Nikes',          artist_name: 'Frank Ocean', tier: 'B', ranked_at: '2026-01-01' },
  { id: '4', session_id: 'session-1', user_id: 'u1', track_id: 't4', track_name: 'Facebook Story', artist_name: 'Frank Ocean', tier: 'F', ranked_at: '2026-01-01' },
];

describe('formatTierText', () => {
  it('includes album name and subtitle', () => {
    const text = formatTierText(session, rankings, 'Frank Ocean');
    expect(text).toContain('Blonde');
    expect(text).toContain('Frank Ocean');
  });

  it('groups songs under their tier', () => {
    const text = formatTierText(session, rankings, 'Frank Ocean');
    expect(text).toMatch(/S\s+Nights, Ivy/);
    expect(text).toMatch(/B\s+Nikes/);
    expect(text).toMatch(/F\s+Facebook Story/);
  });

  it('shows dash for empty tiers', () => {
    const text = formatTierText(session, rankings, 'Frank Ocean');
    expect(text).toMatch(/A\s+—/);
    expect(text).toMatch(/C\s+—/);
  });
});
