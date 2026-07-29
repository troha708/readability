import type { MetadataRoute } from "next";
import { BIBLE_BOOK_ORDER } from "@/lib/bible-book-order";
import { loadChapterNumbers } from "@/lib/content/chapter-text";
import { READING_VERSIONS } from "@/lib/translations";
import { IS_MOBILE } from "@/lib/build-target";
import { SITE_URL } from "@/lib/site";
import { loadAtlasData } from "@/lib/content/atlas-server";
import { placeSlug } from "@/lib/content/places";

const BASE = SITE_URL;

// Generated at build time from the on-disk chapter data (mobile returns the
// static entries below). force-static keeps it compatible with output:export.
export const dynamic = "force-static";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const entries: MetadataRoute.Sitemap = [
    { url: BASE, changeFrequency: "weekly", priority: 1 },
    { url: `${BASE}/try/bible/start`, changeFrequency: "weekly", priority: 0.9 },
    { url: `${BASE}/try/bible/map`, changeFrequency: "monthly", priority: 0.7 },
  ];

  // A sitemap is meaningless in the offline app; skip the dynamic part for
  // the mobile export.
  if (IS_MOBILE) return entries;

  // Atlas deep links: every place (located + unlocated) and journey route is
  // its own indexable page with place-specific metadata and text content.
  const atlas = loadAtlasData();
  atlas.journeys.forEach((_, i) => {
    entries.push({
      url: `${BASE}/try/bible/map?journey=${i}`,
      changeFrequency: "monthly",
      priority: 0.5,
    });
  });
  for (const place of [...atlas.places, ...atlas.unlocated]) {
    entries.push({
      url: `${BASE}/try/bible/map?place=${encodeURIComponent(placeSlug(place.link))}`,
      changeFrequency: "monthly",
      priority: 0.4,
    });
  }

  // Chapter URLs come from the on-disk BSB data — the same source the reader
  // serves — so the sitemap needs no database access at build time.
  for (const bookName of BIBLE_BOOK_ORDER) {
    const chapterNumbers = loadChapterNumbers("BSB", bookName);
    if (!chapterNumbers) continue;

    for (const chapterNumber of chapterNumbers) {
      // Every offered translation is its own indexable page ("read John 5
      // KJV"); the app default carries the weight. Chapter quizzes are
      // search targets in their own right ("John 5 quiz").
      for (const version of READING_VERSIONS) {
        entries.push({
          url: `${BASE}/try/bible/read?book=${encodeURIComponent(bookName)}&chapter=${chapterNumber}&version=${version}`,
          changeFrequency: "monthly",
          priority: version === "BSB" ? 0.7 : 0.4,
        });
      }
      entries.push({
        url: `${BASE}/try/bible/questions/${encodeURIComponent(bookName)}/${chapterNumber}`,
        changeFrequency: "monthly",
        priority: 0.3,
      });
    }
  }

  return entries;
}
