import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Serving `next dev` behind the public hostname: Next blocks cross-origin
  // requests to dev-only assets and endpoints unless the origin is listed.
  // No effect on production builds.
  allowedDevOrigins: ["mahjong.arpthef.my.id", "*.arpthef.my.id"],
};

export default nextConfig;
