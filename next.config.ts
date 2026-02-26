import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 放行原生二进制模块
  serverExternalPackages: ["@lancedb/lancedb"],
};

export default nextConfig;
