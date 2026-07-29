import { Suspense } from "react";
import type { Metadata } from "next";
import { Dictionary } from "./dictionary";

/**
 * Bible dictionary: 6,010 articles on the people, places, events, and
 * theological terms of the Bible, adapted from the Tyndale Open Bible
 * Dictionary (Tyndale House Publishers, CC BY-SA 4.0). Search-first, with
 * cross-references and scripture links that open the verse peek in place.
 *
 * The article data loads on demand (per-letter) via /api/dictionary on the web
 * and the bundled offline files in the native app, so the same component works
 * on both targets.
 */
export const metadata: Metadata = {
  title: "Bible Dictionary — every person, place & term in the Bible",
  description:
    "A free Bible dictionary: 6,010 articles on the people, places, events, and theological terms of the Bible, each with scripture references you can read in context. Adapted from the Tyndale Open Bible Dictionary (CC BY-SA 4.0).",
  alternates: { canonical: "/try/bible/dictionary" },
  openGraph: {
    title: "Bible Dictionary — every person, place & term in the Bible",
    description:
      "6,010 articles on the people, places, events, and theological terms of the Bible, with scripture references you can read in context.",
    url: "/try/bible/dictionary",
  },
};

export default function DictionaryPage() {
  return (
    <Suspense fallback={null}>
      <Dictionary />
    </Suspense>
  );
}
