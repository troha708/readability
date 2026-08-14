import type { NextConfig } from "next";

// The native (Capacitor) build sets NEXT_PUBLIC_BUILD_TARGET=mobile and is
// emitted as a static export into ./out, bundling all content from
// public/offline. The web build (Vercel) keeps full SSR.
const isMobile = process.env.NEXT_PUBLIC_BUILD_TARGET === "mobile";

const nextConfig: NextConfig = isMobile
  ? {
      output: "export",
      trailingSlash: true,
      images: { unoptimized: true },
    }
  : {
      // /try was a "choose a book" chooser from before the Bible was the only
      // book; the page is gone but old bookmarks and crawlers may still hold
      // the URL. (Export builds ignore redirects; the mobile app never linked
      // to /try.)
      async redirects() {
        return [
          { source: "/try", destination: "/try/bible/start", permanent: true },
          // Password reset went away with passwordless sign-in; old emails and
          // bookmarks land on the code flow instead.
          { source: "/forgot-password", destination: "/login", permanent: true },
          { source: "/reset-password", destination: "/login", permanent: true },
        ];
      },
      // /api/search and /api/verse read the on-disk translation JSON; list the
      // text directories explicitly so Vercel's file tracing bundles them with
      // the functions (their paths are too dynamic to be inferred).
      outputFileTracingIncludes: {
        "/api/search": [
          "./data/BSB/*.json",
          "./data/KJV/*.json",
          "./data/WEB/*.json",
          "./data/ASV/*.json",
          "./data/GNV/*.json",
          "./data/YLT/*.json",
          "./data/DBY/*.json",
        ],
        "/api/verse": [
          "./data/BSB/*.json",
          "./data/KJV/*.json",
          "./data/WEB/*.json",
          "./data/ASV/*.json",
          "./data/GNV/*.json",
          "./data/YLT/*.json",
          "./data/DBY/*.json",
        ],
        "/api/cross-refs": [
          "./data/crossrefs/*.json",
          "./data/BSB/*.json",
          "./data/KJV/*.json",
          "./data/WEB/*.json",
          "./data/ASV/*.json",
          "./data/GNV/*.json",
          "./data/YLT/*.json",
          "./data/DBY/*.json",
        ],
        "/api/strongs": ["./data/strongs/*.json", "./data/lexicon/*.json"],
        // The reader page and /api/chapter serve chapter text from the same
        // translation JSON (src/lib/content/chapter-text.ts) instead of
        // Supabase, so the reading path never waits on the database.
        "/try/bible/read": [
          "./data/BSB/*.json",
          "./data/KJV/*.json",
          "./data/WEB/*.json",
          "./data/ASV/*.json",
          "./data/GNV/*.json",
          "./data/YLT/*.json",
          "./data/DBY/*.json",
        ],
        "/api/chapter": [
          "./data/BSB/*.json",
          "./data/KJV/*.json",
          "./data/WEB/*.json",
          "./data/ASV/*.json",
          "./data/GNV/*.json",
          "./data/YLT/*.json",
          "./data/DBY/*.json",
        ],
      },
    };

// Two Next processes sharing this checkout (a dev server while `next build`
// runs, or two seats' tooling) corrupt each other through .next; set
// NEXT_DIST_DIR to give a process its own build dir.
if (process.env.NEXT_DIST_DIR) {
  nextConfig.distDir = process.env.NEXT_DIST_DIR;
}

export default nextConfig;
