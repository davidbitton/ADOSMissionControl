import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  experimental: {
    inlineCss: true,
  },
  env: {
    CESIUM_BASE_URL: "https://cesium.com/downloads/cesiumjs/releases/1.138/Build/Cesium/",
    NEXT_PUBLIC_BUILD_TARGET: process.env.NEXT_PUBLIC_BUILD_TARGET || "",
  },
  async redirects() {
    return [
      {
        source: "/hardware/controllers/transmitter",
        destination: "/hardware/edge",
        permanent: true,
      },
      {
        source: "/hardware/controllers/transmitter/:path*",
        destination: "/hardware/edge/:path*",
        permanent: true,
      },
      {
        source: "/history",
        destination: "/flight-logs",
        permanent: true,
      },
      {
        source: "/history/:path*",
        destination: "/flight-logs/:path*",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
