import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    tsconfigPath: "tsconfig.web.json",
  },
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
