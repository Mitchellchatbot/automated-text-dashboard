import type { NextConfig } from "next";

// Static security headers applied to every response. The Content-Security-Policy
// is intentionally NOT here — it is set per-request (with a nonce) in proxy.ts.
const securityHeaders = [
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  // no-referrer: PHI can appear in URLs (search/filter), so never leak the URL.
  { key: "Referrer-Policy", value: "no-referrer" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
  },
];

const nextConfig: NextConfig = {
  // Pin the workspace root: a stray lockfile in the home dir otherwise confuses
  // Turbopack's root inference.
  turbopack: { root: import.meta.dirname },
  // Don't advertise the framework/version.
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
