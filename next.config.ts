import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  devIndicators: { position: "bottom-right" },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  async redirects() {
    // "Data & sync" moved into Settings. Query strings are passed through (e.g. old bank callbacks'
    // ?bank=connected), and the redirect isn't permanent so the path stays free for reuse.
    return [{ source: "/data", destination: "/settings/data", permanent: false }];
  },
};

export default nextConfig;
