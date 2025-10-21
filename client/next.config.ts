import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Bundle optimization for performance
  experimental: {
    optimizePackageImports: ['@/components', '@/hooks', '@/utils'],
    serverActions: {
      bodySizeLimit: '15mb',
    },
  },
  
  turbopack: {
    // Enable Turbopack optimizations for development
    rules: {
      '*.svg': {
        loaders: ['@svgr/webpack'],
        as: '*.js',
      },
    },
    // Resolve filesystem path issues in development
    resolveAlias: {
      '@': './src',
    },
  },
  
  // Webpack optimizations for production builds
  webpack: (config, { dev, isServer }) => {
    // Production optimizations
    if (!dev && !isServer) {
      // Enable tree shaking
      config.optimization = {
        ...config.optimization,
        usedExports: true,
        sideEffects: false,
        splitChunks: {
          chunks: 'all',
          cacheGroups: {
            vendor: {
              test: /[\\/]node_modules[\\/]/,
              name: 'vendors',
              chunks: 'all',
              priority: 10,
            },
            common: {
              name: 'common',
              minChunks: 2,
              chunks: 'all',
              priority: 5,
              reuseExistingChunk: true,
            },
          },
        },
      };

      // Bundle analyzer in development
      if (process.env.ANALYZE) {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { BundleAnalyzerPlugin } = require('webpack-bundle-analyzer');
        config.plugins.push(
          new BundleAnalyzerPlugin({
            analyzerMode: 'static',
            openAnalyzer: false,
            reportFilename: 'bundle-analyzer-report.html',
          })
        );
      }
    }

    return config;
  },
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
