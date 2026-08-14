import { Suspense } from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ChunkReader } from "./chunk-reader";
import { OfflineRead } from "./offline-read";
import { chapterReference } from "@/lib/bible-book-order";
import { IS_MOBILE } from "@/lib/build-target";
import {
  loadQuestions,
  loadHeadings,
  loadBookIntro,
} from "@/lib/content/chapter-data";
import {
  isOfferedVersion,
  listCanonBooks,
  loadBookText,
  loadChapterText,
} from "@/lib/content/chapter-text";
import { READING_VERSIONS, TRANSLATION_NAMES } from "@/lib/translations";
import { SITE_URL } from "@/lib/site";

type Props = {
  searchParams: Promise<{
    book?: string;
    chapter?: string;
    version?: string;
    overview?: string;
    verse?: string;
  }>;
};

// Pitch line that rides above the passage title in the social unfurl (the
// og:site_name slot). Promotes the app rather than just naming it.
const SOCIAL_SITE_NAME = "Readability.bible — A study Bible";


// Control char that never appears in scripture text and isn't a regex
// metacharacter, so it safely wraps verse numbers for the split below.
const VERSE_SENTINEL = "\u0001";

/**
 * Plain-text scripture snippet for the social card, lifted from the stored
 * chapter HTML. Verse-number markers are turned into sentinels so the snippet
 * can start at a shared verse, then all markup is stripped and whitespace
 * collapsed. Capped so the unfurl stays a teaser, not the whole chapter.
 */
function passageTextForCard(html: string, fromVerse?: number, maxLen = 240): string {
  const marked = html
    // Drop section headings so they don't interrupt the prose.
    .replace(/<h[1-6][^>]*>[\s\S]*?<\/h[1-6]>/gi, " ")
    // Verse 1's chapter-number marker.
    .replace(
      /<span[^>]*class="[^"]*chapter-num[^"]*"[^>]*>[\s\S]*?<\/span>/gi,
      `${VERSE_SENTINEL}1${VERSE_SENTINEL}`,
    )
    // Verse-number markers carrying a data-number attribute.
    .replace(
      /<span\b[^>]*\bdata-number="(\d+)"[^>]*>[\s\S]*?<\/span>/gi,
      `${VERSE_SENTINEL}$1${VERSE_SENTINEL}`,
    )
    // Legacy verse markers: <span class="v">N</span> with the number inline.
    .replace(
      /<span\b[^>]*\bclass="v(?:\s[^"]*)?"[^>]*>\s*(\d+)\s*<\/span>/gi,
      `${VERSE_SENTINEL}$1${VERSE_SENTINEL}`,
    );

  const plain = marked
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&rsquo;|&lsquo;/g, "'")
    .replace(/&ldquo;|&rdquo;/g, '"')
    .replace(/&[a-z]+;/gi, " ");

  // Split into [pre, num1, text1, num2, text2, ...]: even indices are prose,
  // odd indices are the verse numbers captured above.
  const parts = plain.split(new RegExp(`${VERSE_SENTINEL}(\\d+)${VERSE_SENTINEL}`));

  let segments: string[] = [];
  if (fromVerse && parts.length > 1) {
    for (let i = 1; i < parts.length; i += 2) {
      if (parseInt(parts[i], 10) >= fromVerse) segments.push(parts[i + 1] ?? "");
    }
  }
  if (segments.length === 0) segments = parts.filter((_, i) => i % 2 === 0);

  let text = segments.join(" ").replace(/\s+/g, " ").trim();
  if (text.length > maxLen) {
    text = text.slice(0, maxLen).replace(/\s+\S*$/, "") + "…";
  }
  return text;
}


export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  if (IS_MOBILE) return { title: "Read — Readability" };
  const params = await searchParams;
  const book = params.book ?? "Genesis";
  const chapterNum = parseInt(params.chapter ?? "1", 10);
  const versionAbbr = READING_VERSIONS.includes(params.version ?? "BSB")
    ? (params.version ?? "BSB")
    : "BSB";
  const verse = params.verse ? parseInt(params.verse, 10) : undefined;
  const ref = chapterReference(book, chapterNum);
  const refWithVerse = verse ? `${ref}:${verse}` : ref;
  const versionName = TRANSLATION_NAMES[versionAbbr] ?? versionAbbr;

  // Page <title> + meta description stay search-oriented. Non-default
  // translations put the version in the title so "read John 5 KJV" queries
  // match, and each translation page is its own canonical (the text really
  // differs); verse/chunk variants canonicalize to the plain chapter URL.
  const title =
    versionAbbr === "BSB" ? `${ref} — Read & Study` : `${ref} ${versionAbbr} — Read & Study`;
  const description =
    versionAbbr === "BSB"
      ? `Read ${ref} online with comprehension quizzes, cross-references, and word study. Free Bible study tool.`
      : `Read ${ref} in the ${versionName} online, with cross-references, comprehension quizzes, and free Bible study tools.`;
  const canonical = `/try/bible/read?book=${encodeURIComponent(book)}&chapter=${chapterNum}&version=${versionAbbr}`;

  // Social unfurl mirrors a Bible-app link preview: a square lightbulb logo
  // beside a card whose title names the passage ("John 1 | BSB Bible |
  // Readability"), whose site-name line pitches the app, and whose body is the
  // actual scripture — the shared verse onward when a ?verse link was copied,
  // otherwise the chapter's opening.
  let snippet = "";
  const html = loadChapterText(versionAbbr, book, chapterNum);
  if (html) snippet = passageTextForCard(html, verse);
  const socialTitle = `${refWithVerse} | ${versionAbbr} Bible | Readability`;
  const socialDescription =
    snippet || "A study Bible: cross-references, word study, and comprehension quizzes.";

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      siteName: SOCIAL_SITE_NAME,
      title: socialTitle,
      description: socialDescription,
      url: canonical,
      images: ["/icons/icon-192.png?v=1"],
    },
    twitter: {
      card: "summary",
      title: socialTitle,
      description: socialDescription,
      // Bump ?v= whenever the icon art changes so Discord/Twitter re-fetch
      // instead of serving a stale cached unfurl image (cache keys on URL).
      images: ["/icons/icon-192.png?v=1"],
    },
  };
}

export default async function BibleReadPage({ searchParams }: Props) {
  if (IS_MOBILE) {
    return (
      <Suspense fallback={null}>
        <OfflineRead />
      </Suspense>
    );
  }

  const params = await searchParams;
  const bookName = params.book ?? "Genesis";
  const chapterNum = parseInt(params.chapter ?? "1", 10);
  const versionAbbr = params.version ?? "BSB";

  if (!isOfferedVersion(versionAbbr)) notFound();

  // The data dirs include the KJV Apocrypha (Ecclesiasticus, Tobit, …), which
  // stay reachable by direct URL; the picker is restricted to the Protestant
  // canon the rest of the app supports.
  const bookText = loadBookText(versionAbbr, bookName);
  if (!bookText) notFound();

  const chapterText = bookText.chapters.get(chapterNum);
  if (chapterText === undefined) notFound();

  const chapterNumbers = bookText.chapterNumbers;
  const allBookNames = listCanonBooks(versionAbbr);
  const versionName = TRANSLATION_NAMES[versionAbbr] ?? versionAbbr;

  const questions = loadQuestions(bookName, chapterNum);
  const headings = loadHeadings(bookName, chapterNum, versionAbbr);
  const bookIntro = loadBookIntro(bookName);

  // Breadcrumbs for search results: Bible library › book › chapter.
  const breadcrumbs = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Bible", item: `${SITE_URL}/try/bible/start` },
      {
        "@type": "ListItem",
        position: 2,
        name: bookName,
        item: `${SITE_URL}/try/bible/read?book=${encodeURIComponent(bookName)}&chapter=1&version=${versionAbbr}`,
      },
      { "@type": "ListItem", position: 3, name: chapterReference(bookName, chapterNum) },
    ],
  };

  return (
    <>
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbs) }}
    />
    {/* The visual design carries "John 5" in the sticky header controls and a
        drop-cap, neither of which is a heading — give the page its h1. */}
    <h1 className="sr-only">
      {chapterReference(bookName, chapterNum)} — {versionName}
    </h1>
    <ChunkReader
      key={`${bookName}-${chapterNum}`}
      bookName={bookName}
      initialChapterNumber={chapterNum}
      initialText={chapterText}
      initialQuestions={questions}
      initialHeadings={headings}
      bookIntro={bookIntro}
      scrollToOverview={params.overview === "1"}
      versionAbbr={versionAbbr}
      versionName={versionName}
      availableVersions={READING_VERSIONS.map((abbr) => ({
        abbr,
        name: TRANSLATION_NAMES[abbr] ?? abbr,
      }))}
      chapterNumbers={chapterNumbers}
      allBookNames={allBookNames}
    />
    </>
  );
}
