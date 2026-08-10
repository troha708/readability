import { Suspense } from "react";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import type { Metadata } from "next";
import { Dictionary } from "./dictionary";
import { dictLetterOf, type DictArticle } from "@/lib/content/dictionary";

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
const TITLE = "Bible Dictionary — every person, place & term in the Bible";
const BLURB =
  "6,010 articles on the people, places, events, and theological terms of the Bible, with scripture references you can read in context.";

/**
 * The opening prose of an article, trimmed to something a link preview can
 * show — Discord, Slack and search all display roughly 160–200 characters.
 *
 * Cut at a sentence end where one falls in range rather than mid-word: a
 * preview that stops after a full stop reads as the start of the article,
 * while one that stops at a character count reads as truncated marketing.
 */
function articleSummary(article: DictArticle): string | null {
  const prose = article.b
    .filter((block) => !block.h)
    .flatMap((block) => block.runs.map((run) => run.s))
    .join("")
    .replace(/\s+/g, " ")
    .trim();
  if (prose.length < 40) return null;
  if (prose.length <= 200) return prose;

  const window = prose.slice(0, 220);
  const lastStop = Math.max(
    window.lastIndexOf(". "),
    window.lastIndexOf("! "),
    window.lastIndexOf("? "),
  );
  if (lastStop > 90) return window.slice(0, lastStop + 1);
  return window.slice(0, window.lastIndexOf(" ")).trimEnd() + "\u2026";
}

function loadArticle(entry: string): DictArticle | null {
  const letter = dictLetterOf(entry);
  const path = join(process.cwd(), "data", "tyndale-dictionary", `${letter}.json`);
  if (!existsSync(path)) return null;
  try {
    const file = JSON.parse(readFileSync(path, "utf8")) as {
      articles?: Record<string, { t: string; b: DictArticle["b"] }>;
    };
    const raw = file.articles?.[entry];
    return raw ? { id: entry, t: raw.t, b: raw.b } : null;
  } catch {
    return null;
  }
}

/**
 * Per-article link previews. Opening an entry gives ?entry=<id>, and every one
 * of those used to share the dictionary's own promotional blurb — so a shared
 * article advertised the site rather than telling you what the article says.
 * A preview now leads with the article's first sentences, the way a search
 * result does.
 *
 * The cost: reading searchParams here opts the route out of static rendering.
 * That is the trade for previews that describe their own content, and the page
 * was already loading its article data on demand rather than at build time.
 */
export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ entry?: string }>;
}): Promise<Metadata> {
  const { entry } = await searchParams;
  const article = entry ? loadArticle(entry) : null;
  const summary = article ? articleSummary(article) : null;

  if (!article || !summary) {
    return {
      title: TITLE,
      description:
        "A free Bible dictionary: 6,010 articles on the people, places, events, and theological terms of the Bible, each with scripture references you can read in context. Adapted from the Tyndale Open Bible Dictionary (CC BY-SA 4.0).",
      alternates: { canonical: "/try/bible/dictionary" },
      openGraph: { title: TITLE, description: BLURB, url: "/try/bible/dictionary" },
    };
  }

  const url = `/try/bible/dictionary?entry=${encodeURIComponent(entry as string)}`;
  const title = `${article.t} — Bible Dictionary`;
  return {
    title,
    description: summary,
    alternates: { canonical: url },
    openGraph: { title, description: summary, url, type: "article" },
    twitter: { card: "summary", title, description: summary },
  };
}

/**
 * The article is loaded here as well as in generateMetadata and handed to the
 * client component, so the prose ships in the HTML.
 *
 * It used to arrive only from /api/dictionary after hydration, which meant a
 * crawler got a title, the description generateMetadata built, and nothing
 * else — and robots.txt disallows /api/, so following the fetch was not an
 * option either. 6,308 articles were reaching search engines as empty pages.
 * Next dedupes the two loads within a request, so this costs nothing.
 */
export default async function DictionaryPage({
  searchParams,
}: {
  searchParams: Promise<{ entry?: string }>;
}) {
  const { entry } = await searchParams;
  const article = entry ? loadArticle(entry) : null;

  return (
    <Suspense fallback={null}>
      <Dictionary initialArticle={article} />
    </Suspense>
  );
}
