import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */

  typescript: {
    // This allows the build to continue even with TypeScript errors
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
