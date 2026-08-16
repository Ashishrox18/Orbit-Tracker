import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Playwright drives the dev server over 127.0.0.1; Next 16 blocks dev-asset
  // requests from an origin it doesn't recognise, which silently serves the
  // page without CSS or JS. Dev-only setting, no effect on a production build.
  allowedDevOrigins: ["127.0.0.1", "localhost"],

  // pdfkit reads its .afm font metrics off disk relative to its own
  // __dirname at runtime; bundling it rewrites that path and breaks font
  // loading. Keeping it external leaves its real require/__dirname intact.
  serverExternalPackages: ["pdfkit"],

  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
