import { AuthOptions } from 'next-auth';
import SpotifyProvider from 'next-auth/providers/spotify';
import { upsertUser } from '@/lib/db';

const SCOPES = [
  'streaming',
  'user-read-email',
  'user-read-private',
  'user-read-playback-state',
  'user-modify-playback-state',
].join(' ');

async function refreshAccessToken(token: any) {
  try {
    const res = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${Buffer.from(
          `${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`
        ).toString('base64')}`,
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: token.refreshToken,
      }),
    });
    if (!res.ok) throw new Error(`Token refresh failed: ${res.status}`);
    const data = await res.json();
    return {
      ...token,
      accessToken: data.access_token,
      accessTokenExpires: Date.now() + data.expires_in * 1000,
      refreshToken: data.refresh_token ?? token.refreshToken,
    };
  } catch (err) {
    console.error('Spotify token refresh failed:', err);
    return { ...token, error: 'RefreshAccessTokenError' };
  }
}

if (!process.env.SPOTIFY_CLIENT_ID || !process.env.SPOTIFY_CLIENT_SECRET) {
  throw new Error('Missing required env vars: SPOTIFY_CLIENT_ID and/or SPOTIFY_CLIENT_SECRET');
}

export const authOptions: AuthOptions = {
  providers: [
    SpotifyProvider({
      clientId: process.env.SPOTIFY_CLIENT_ID!,
      clientSecret: process.env.SPOTIFY_CLIENT_SECRET!,
      authorization: { params: { scope: SCOPES } },
    }),
  ],
  callbacks: {
    async jwt({ token, account, profile }) {
      // First sign-in: persist user to DB and store tokens
      if (account && profile) {
        const p = profile as any;
        if (!p?.id) {
          console.error('Spotify profile missing id, skipping upsert');
          return token;
        }
        try {
          await upsertUser({
            id: p.id,
            display_name: p.display_name ?? p.id,
            email: p.email ?? null,
            avatar_url: p.images?.[0]?.url ?? null,
          });
        } catch (err) {
          console.error('Failed to upsert user:', err);
        }
        return {
          ...token,
          accessToken: account.access_token,
          refreshToken: account.refresh_token,
          accessTokenExpires: (account.expires_at ?? 0) * 1000,
          spotifyId: p.id,
        };
      }

      // Token still valid — return as-is
      if (Date.now() < (token.accessTokenExpires as number)) return token;

      // Token expired — attempt silent refresh
      return refreshAccessToken(token);
    },
    async session({ session, token }) {
      session.accessToken = token.accessToken as string;
      session.spotifyId = token.spotifyId as string;
      session.error = token.error as string | undefined;
      return session;
    },
  },
};
