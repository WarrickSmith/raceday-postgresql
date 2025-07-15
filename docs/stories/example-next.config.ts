import type { NextConfig } from 'next'
const nextConfig: NextConfig = {
  images: {
    // Set unoptimized to true in all environments since you're not concerned about image optimization
    unoptimized: true,
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
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
  // Add crossOrigin setting to prevent CORS issues
  crossOrigin: 'anonymous',
}
export default nextConfig
