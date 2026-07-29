import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

// Static content; mark explicitly so `output: export` (mobile) builds.
export const dynamic = "force-static";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      // /api/map-og is the atlas link-preview image; unfurl crawlers
      // (Discordbot, Twitterbot) honor robots.txt, so the blanket /api/
      // disallow must not cover it.
      allow: ["/", "/api/map-og"],
      // No content for crawlers here: API endpoints, auth flows, and
      // personal pages (settings, highlights).
      disallow: ["/api/", "/auth/", "/login", "/signup", "/try/bible/settings", "/try/bible/highlights"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
