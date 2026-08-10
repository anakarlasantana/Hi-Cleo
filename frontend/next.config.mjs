import { withSentryConfig } from '@sentry/nextjs';

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  images: {
    unoptimized: true,
  },
}

export default withSentryConfig(nextConfig, {
  // Sentry webpack plugin options
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  silent: !process.env.CI,
  // Upload source maps only in production builds
  widenClientFileUpload: true,
  disableLogger: true,
  // Only upload source maps when SENTRY_AUTH_TOKEN is set
  authToken: process.env.SENTRY_AUTH_TOKEN,
});
