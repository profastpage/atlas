import type { NextConfig } from "next";

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
};

// Dynamic config: add cloudflare runtime config for Pages
const withCloudflare = (config: NextConfig): NextConfig => {
  // next-on-pages handles the output configuration
  return config;
};

export default process.env.NODE_ENV === "production"
  ? withCloudflare(nextConfig)
  : nextConfig;
