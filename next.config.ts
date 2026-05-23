import type { NextConfig } from 'next';

const isDev = process.env.NODE_ENV === 'development';

const securityHeaders = [
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      // Next.js App Router requires 'unsafe-inline' for RSC streaming payload (__next_f inline scripts).
      // 'unsafe-eval' is additionally required in dev mode for Turbopack HMR.
      // Proper nonce-based CSP would eliminate these but requires middleware-level injection.
      `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''} https://sdk.scdn.co`,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https://i.scdn.co https://mosaic.scdn.co https://lineup-images.scdn.co",
      "media-src 'self'",
      // https://*.spotify.com + wss://*.spotify.com covers the Web Playback SDK's
      // dealer WebSocket connections (wss://dealer.spotify.com etc.)
      "connect-src 'self' https://*.spotify.com wss://*.spotify.com",
      "frame-src https://sdk.scdn.co",
      "frame-ancestors 'none'",
    ].join('; '),
  },
  {
    key: 'X-Frame-Options',
    value: 'DENY',
  },
  {
    key: 'X-Content-Type-Options',
    value: 'nosniff',
  },
  {
    key: 'Referrer-Policy',
    value: 'strict-origin-when-cross-origin',
  },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=()',
  },
];

const nextConfig: NextConfig = {
  allowedDevOrigins: ['127.0.0.1'],
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'i.scdn.co' },
      { protocol: 'https', hostname: 'mosaic.scdn.co' },
      { protocol: 'https', hostname: 'lineup-images.scdn.co' },
    ],
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
