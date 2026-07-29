import { OT_BOOK_ORDER } from "@/lib/bible-book-order";

/**
 * Verse-level full-text search over stored chapter HTML. Isomorphic: the
 * /api/search route runs it over data/{VERSION}/ read from disk, and the
 * mobile build runs it over the bundled /offline/text files, so both targets
 * return identical results.
 *
 * Matching model: a verse matches when it contains the query as an exact
 * phrase (ranked first) or contains every query word (ranked after). Words
 * match on a leading word boundary with an open tail, so "love" also matches
 * "loved" and "lovingkindness".
 */

export type VerseHit = {
  book: string;
  chapter: number;
  verse: number;
  /** Display text of the verse (headings and markup stripped). */
  text: string;
  /** True when the verse contains the whole query as a phrase. */
  phrase: boolean;
};

export type IndexedVerse = {
  book: string;
  chapter: number;
  verse: number;
  text: string;
  /** Normalized, de-punctuated match text with a leading space (see match()). */
  m: string;
};

/**
 * Traditional canonical order for presenting results. The app's reading order
 * starts the NT at John; search results follow the order readers expect from
 * a printed Bible.
 */
export const CANONICAL_NT_ORDER = [
  "Matthew", "Mark", "Luke", "John", "Acts",
  "Romans", "1 Corinthians", "2 Corinthians", "Galatians",
  "Ephesians", "Philippians", "Colossians",
  "1 Thessalonians", "2 Thessalonians", "1 Timothy", "2 Timothy",
  "Titus", "Philemon", "Hebrews", "James",
  "1 Peter", "2 Peter", "1 John", "2 John", "3 John",
  "Jude", "Revelation",
] as const;

export const CANONICAL_BOOK_ORDER: readonly string[] = [
  ...OT_BOOK_ORDER,
  ...CANONICAL_NT_ORDER,
];

const OT_BOOK_SET = new Set<string>(OT_BOOK_ORDER);

export type SearchScope = "all" | "ot" | "nt";

export function bookInScope(book: string, scope: SearchScope): boolean {
  if (scope === "all") return true;
  return scope === "ot" ? OT_BOOK_SET.has(book) : !OT_BOOK_SET.has(book);
}

// Control char that never appears in scripture text and isn't a regex
// metacharacter, so it safely wraps verse numbers during extraction.
const VERSE_SENTINEL = "";

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&[a-z]+;/gi, " ");
}

/**
 * Split one chapter's stored HTML into per-verse plain text. Handles all three
 * stored markup shapes: the BSB converter's inline markers, api.bible's
 * verse-span wrappers (KJV/WEB), and legacy <span class="v">N</span> markers.
 * Section headings, parallel-reference lines, and psalm superscriptions are
 * dropped; text before the first verse marker is not verse text.
 */
export function extractVerses(html: string): { verse: number; text: string }[] {
  const marked = html
    .replace(/<h[1-6][^>]*>[\s\S]*?<\/h[1-6]>/gi, " ")
    // Heading / parallel-ref paragraphs from our converters. Psalm
    // superscriptions (class "d") are NOT stripped: BSB and KJV place the
    // verse-1 marker (and in KJV the whole first verse) inside that block, so
    // dropping it would erase verse 1. A superscription with no marker sits
    // before the first verse marker and is dropped by the split below anyway.
    .replace(/<p class="(?:s1|s2|r)"[^>]*>[\s\S]*?<\/p>/gi, " ")
    // Verse 1 in api.bible-formatted chapters is marked by the chapter number.
    .replace(
      /<span[^>]*class="[^"]*chapter-num[^"]*"[^>]*>[\s\S]*?<\/span>/gi,
      `${VERSE_SENTINEL}1${VERSE_SENTINEL}`,
    )
    // Verse-number markers carrying data-number ("3" or ranges like "3-4").
    .replace(
      /<span\b[^>]*\bdata-number="(\d+)[^"]*"[^>]*>[\s\S]*?<\/span>/gi,
      `${VERSE_SENTINEL}$1${VERSE_SENTINEL}`,
    )
    // Legacy verse markers with the number inline.
    .replace(
      /<span\b[^>]*\bclass="v(?:\s[^"]*)?"[^>]*>\s*(\d+)\s*<\/span>/gi,
      `${VERSE_SENTINEL}$1${VERSE_SENTINEL}`,
    );

  const plain = decodeEntities(marked.replace(/<[^>]+>/g, " ")).replace(/¶/g, " ");

  // Split into [pre, num1, text1, num2, text2, ...]: odd indices are the verse
  // numbers captured above. parts[0] (before any verse marker) is dropped.
  const parts = plain.split(new RegExp(`${VERSE_SENTINEL}(\\d+)${VERSE_SENTINEL}`));
  const byVerse = new Map<number, string>();
  for (let i = 1; i < parts.length; i += 2) {
    const num = parseInt(parts[i], 10);
    if (!Number.isFinite(num)) continue;
    byVerse.set(num, (byVerse.get(num) ?? "") + " " + (parts[i + 1] ?? ""));
  }

  const verses: { verse: number; text: string }[] = [];
  for (const [verse, raw] of byVerse) {
    const text = raw.replace(/\s+/g, " ").trim();
    if (text) verses.push({ verse, text });
  }
  return verses;
}

/** Fold case and typographic quotes so queries match regardless of either. */
function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"');
}

/**
 * Match text: normalized, punctuation collapsed to single spaces, with a
 * leading space so ` word` tests give a cheap left word boundary without
 * regexes. Apostrophes are kept so "God's" stays one word.
 */
function toMatchText(s: string): string {
  return (
    " " +
    normalize(s)
      .replace(/[^\p{L}\p{N}']+/gu, " ")
      .replace(/\s+/g, " ")
      .trim()
  );
}

/** Query words, normalized the same way as the match text. */
export function queryTokens(query: string): string[] {
  return toMatchText(query).split(" ").filter(Boolean);
}

export function buildVerseIndex(
  book: string,
  chapter: number,
  html: string,
): IndexedVerse[] {
  return extractVerses(html).map(({ verse, text }) => ({
    book,
    chapter,
    verse,
    text,
    m: toMatchText(text),
  }));
}

/**
 * Rank an index (already in canonical order) against a query: exact-phrase
 * hits first, then verses containing every word, canonical order within each
 * band. Returns all matches; the caller paginates.
 */
export function searchVerses(index: IndexedVerse[], query: string): VerseHit[] {
  const tokens = queryTokens(query);
  if (tokens.length === 0) return [];
  const phraseNeedle = " " + tokens.join(" ");

  const phraseHits: VerseHit[] = [];
  const wordHits: VerseHit[] = [];

  for (const v of index) {
    if (v.m.includes(phraseNeedle)) {
      phraseHits.push({ book: v.book, chapter: v.chapter, verse: v.verse, text: v.text, phrase: true });
      continue;
    }
    if (tokens.length > 1 && tokens.every((t) => v.m.includes(" " + t))) {
      wordHits.push({ book: v.book, chapter: v.chapter, verse: v.verse, text: v.text, phrase: false });
    }
  }

  return phraseHits.concat(wordHits);
}

export function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
