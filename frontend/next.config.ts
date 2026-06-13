import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // TypeScript errors must fail the build so they are not silently
  // introduced in production.  The previous ``ignoreBuildErrors: true``
  // swallowed every type error and made CI unable to catch regressions.
  typescript: {
    ignoreBuildErrors: false,
  },
  reactStrictMode: true,
};

export default nextConfig;
