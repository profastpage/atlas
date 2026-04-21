import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // Cloudflare Pages SSR via @cloudflare/next-on-pages
  // output is set dynamically by next-on-pages at build time

  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,

  // Exclude API routes from static analysis (they run as Workers)
  experimental: {
    serverActions: {
      bodySizeLimit: "2mb",
    },
  },

  // Replace cross-fetch with native globals for Cloudflare Workers
  // cross-fetch uses XMLHttpRequest which doesn't exist in Edge Workers
  webpack: (config) => {
    config.resolve.alias["cross-fetch"] = path.resolve(
      __dirname, "src/lib/native-fetch.ts"
    );
    return config;
  },
};

// Dynamic config: add cloudflare runtime config for Pages
const withCloudflare = (config: NextConfig): NextConfig => {
  return config;
};

export default nextConfig;
