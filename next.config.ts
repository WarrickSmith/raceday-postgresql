import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  images: {
    // Set unoptimized to true for Docker deployment
    unoptimized: true,
    remotePatterns: [
      {
        protocol: 'http',
        hostname: 'localhost',
        port: '3000',
      },
      {
        protocol: 'http',
        hostname: 'localhost',
        port: '3444',
      },
      {
        protocol: 'https',
        hostname: 'raceday.warricksmith.com',
      },
      {
        protocol: 'https',
        hostname: '*.warricksmith.com',
      },
    ],
  },
  serverExternalPackages: ['node-appwrite'],
  experimental: {
    serverActions: {
      bodySizeLimit: '15mb',
    },
  },
  // Tell Next.js to output a full server build rather than static
  output: 'standalone',
  // Security headers configuration
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
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
            value: 'origin-when-cross-origin',
          },
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block',
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=31536000; includeSubDomains',
          },
        ],
      },
    ]
  },
}

export default nextConfig
