import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep the backend tsconfig.json untouched as the canonical project config;
  // Next compiles the app/ tree against this isolated config instead.
  typescript: {
    tsconfigPath: "tsconfig.next.json",
  },
  // The backend lives in src/ and api/ with its own toolchain — don't let
  // Next's ESLint integration block web builds on backend lint rules.
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
