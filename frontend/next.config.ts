/** @type {import('next').NextConfig} */
const nextConfig = {
  // Enable standalone output for Docker
  output: "standalone",

  // Enable experimental features if needed
  experimental: {
    // Add any experimental features here
  },

  // Environment variables (these will be embedded at build time)
  env: {
    NEXT_PUBLIC_API_URL:
      process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000",
  },

  // Disable X-Powered-By header for security
  poweredByHeader: false,
};

module.exports = nextConfig;
