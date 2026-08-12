import { OT_BOOK_ORDER } from "@/lib/bible-book-order";
import { SYNONYMS } from "@/lib/search/synonyms";

/**
 * Verse-level full-text search over stored chapter HTML. Isomorphic: the
 * /api/search route runs it over data/{VERSION}/ read from disk, and the
 * mobile build runs it over the bundled /offline/text files, so both targets
 * return identical results.
 *
 * Matching model: verses are scored, not filtered. A verse earns credit for
 * each query word it carries, weighted by how rare that word is across the
 * translation, plus a bonus for each adjacent pair of query words it repeats
 * and a large one for carrying the query verbatim. Words match on a leading
 * word boundary with an open tail, so "love" also matches "loved" and
 * "lovingkindness".
 *
 * Two things follow from scoring rather than filtering. Half-remembered
 * wording still lands: "pick up your cross and follow me" has neither "pick"
 * nor "your" in it, but carries enough of the rest — and enough of it in the
 * right order — to reach Mark 8:34. And where the old all-words rule did
 * match, the results are now ordered by fit rather than by book, so "cross
 * follow me" leads with Matthew 10:38 instead of Deuteronomy 4:14, which
 * happens to contain all three words scattered across a sentence about
 * crossing into the land.
 *
 * Short queries keep the strict rule. Tolerance only applies from three
 * content words up, where one wrong word out of several shouldn't empty the
 * page; below that every word still has to be there.
 *
 * What this does NOT do is bridge a synonym, and short paraphrases can turn
 * on one. "pick up your cross" holds two content words, "pick" and "cross",
 * so both are required and BSB's "take up his cross" is missed — the longer
 * "pick up your cross and follow me" only survives because a third content
 * word gives it something to lose. Returning near misses instead of nothing
 * was tried and is worse: "pick" appears in 49 verses against a "cross" that
 * prefix-matching inflates to 247 with every crossing of the Jordan, so the
 * page fills with "pick up your mat" and the cross never surfaces. An empty
 * result is the honest answer until something knows pick means take.
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
 * Words too common to say anything about which verse is wanted. They still
 * count toward the phrase and adjacency bonuses — "follow me" is a better
 * signal than "follow" alone — but a verse is never required to carry them,
 * so "the lord" is not held to the "the".
 */
export const STOPWORDS = new Set([
  "a", "an", "the", "and", "or", "but", "if", "of", "to", "in", "on", "at",
  "by", "for", "with", "from", "into", "unto", "upon", "as", "that", "this",
  "these", "those", "there", "then", "so", "not", "is", "was", "were", "are",
  "be", "been", "am", "shall", "will", "may", "let", "do", "did", "have",
  "has", "had", "i", "me", "my", "we", "us", "our", "you", "your", "ye",
  "thee", "thy", "thou", "he", "him", "his", "she", "her", "it", "its",
  "they", "them", "their", "who", "whom", "which", "what", "all", "any",
  "when", "where", "why", "how", "up", "out", "down", "over", "under",
  "again", "also", "no", "nor", "than", "too", "very", "can", "would",
  "should", "could", "must", "one", "now", "here", "him self", "himself",
  // Archaic auxiliaries carry no more meaning than the modern forms they
  // stand for, and no suffix rule reaches them from "has" or "does".
  "hath", "hast", "doth", "dost", "shalt", "wilt", "art", "wast", "thine",
]);

/**
 * A prefix both the query's form and the verse's form should share. Match
 * text is prefix-open already, so "love" finds "loved" without help; this
 * exists for the other direction, where the reader types the older or the
 * inflected form — "loveth" for "loves", "works" for "work". Deliberately
 * blunt: cutting to a shared prefix costs a little precision ("times" cuts to
 * "tim", which also reaches "Timothy") and buys the recall that matters, and
 * scoring across several words absorbs the stray.
 */
export function matchPrefix(token: string): string {
  // Archaic verb endings cut to three, which is what "loveth" needs to reach
  // "loves"; modern endings keep four so short words aren't shaved to noise.
  for (const suffix of ["eth", "est"]) {
    if (token.endsWith(suffix) && token.length - suffix.length >= 3) {
      return token.slice(0, -suffix.length);
    }
  }
  // "enemies" cuts to "enem", which reaches "enemy" as well; stripping only
  // the "es" would leave "enemi" and reach neither.
  if (token.endsWith("ies") && token.length - 3 >= 3) return token.slice(0, -3);
  for (const suffix of ["ing", "ed", "es", "s"]) {
    if (token.endsWith(suffix) && token.length - suffix.length >= 4) {
      return token.slice(0, -suffix.length);
    }
  }
  return token;
}

/** True when some word in the match text ends with `word`. */
function endsAWord(m: string, word: string): boolean {
  return m.includes(word + " ") || m.endsWith(word);
}

/** What a compound match is worth against a clean word match. */
const INNER_CREDIT = 0.5;
/**
 * What a synonym is worth against the word actually typed. Half, so a verse
 * carrying the reader's own word always outranks one that merely means it —
 * and so a loose entry in the table costs a place in the ranking rather than
 * a wrong answer at the top.
 */
const SYNONYM_CREDIT = 0.5;
/** Fraction of the content words' weight a verse must carry to be returned. */
const COVERAGE_FLOOR = 0.6;
/** Below this many content words, every one of them is still required. */
const TOLERANCE_MIN_CONTENT = 3;

/**
 * Rank an index (already in canonical order) against a query. Returns every
 * verse that clears the coverage floor, best fit first, canonical order among
 * equals; the caller paginates.
 */
export function searchVerses(index: IndexedVerse[], query: string): VerseHit[] {
  const tokens = queryTokens(query);
  if (tokens.length === 0) return [];

  const needles = tokens.map((t) => " " + matchPrefix(t));
  // Same word carried at the end of a compound. BSB has Christ leaving an
  // example "that you should follow in His footsteps", so a reader typing the
  // older "follow in his steps" finds nothing on word boundaries alone.
  //
  // Anchored to the end of a word rather than loose inside one, which is what
  // keeps "hear" out of "heart" and "ear" out of "earth". Five characters
  // minimum, because at four the English suffixes take over — "king" would
  // arrive inside "walking", "taking" and "making". The raw word is used, not
  // the stem, since a compound keeps the whole of it.
  const inner = tokens.map((t) =>
    !STOPWORDS.has(t) && t.length >= 5 ? t : null,
  );
  // Words that stand in for the one typed (see synonyms.ts). Built only for
  // content words, and only for the few that appear in the table, so most
  // queries carry no alternates at all and pay nothing for the feature.
  const alternates = tokens.map((t) => {
    if (STOPWORDS.has(t)) return null;
    const group = SYNONYMS.get(t);
    return group ? group.map((a) => " " + matchPrefix(a)) : null;
  });
  const hasAlternates = alternates.some((a) => a !== null);
  const phraseNeedle = " " + tokens.join(" ");
  // Adjacent pairs, matched verbatim: a cheap stand-in for word order. A
  // paraphrase keeps some of the run ("and follow me") even where it loses
  // individual words, and a verse that merely contains the words keeps none.
  const bigrams = tokens.slice(0, -1).map((t, i) => " " + t + " " + tokens[i + 1]);

  const contentIdx = tokens
    .map((t, i) => i)
    .filter((i) => !STOPWORDS.has(tokens[i]));
  // An all-stopword query ("out of the") has nothing to weigh, so every word
  // counts and the strict rule applies.
  const weighed = contentIdx.length > 0 ? contentIdx : tokens.map((_t, i) => i);
  const requireAll = weighed.length < TOLERANCE_MIN_CONTENT;

  // One pass to find which words each verse carries and how common each word
  // is; the weights aren't known until the whole translation has been seen.
  // `where` records the position each word was found at, so the span below
  // doesn't have to search the verse a second time to work out which of the
  // three ways a word matched.
  const candidates: { v: IndexedVerse; hits: number[]; where: number[] }[] = [];
  const df = new Array(tokens.length).fill(0);
  // Only the words that can qualify a verse are matched against every verse.
  // Stopwords are matched nowhere: they carry no weight in coverage, and the
  // phrase and adjacency tests read the verse text directly, so nothing needs
  // them here. Skipping them stops "the lord is my shepherd" making a
  // candidate of most of the Bible on the strength of "the".
  //
  // Scratch arrays, copied only when a verse actually becomes a candidate: the
  // per-verse allocation is paid 31,000 times a query and the copy far fewer.
  const hitScratch = new Array(tokens.length).fill(0);
  const whereScratch = new Array(tokens.length).fill(-1);

  for (const v of index) {
    let any = false;
    for (const i of weighed) {
      hitScratch[i] = 0;
      whereScratch[i] = -1;
      const at = v.m.indexOf(needles[i]);
      if (at >= 0) {
        hitScratch[i] = 1;
        whereScratch[i] = at;
      } else if (inner[i] && endsAWord(v.m, inner[i]!)) {
        hitScratch[i] = INNER_CREDIT;
        whereScratch[i] = v.m.indexOf(inner[i]!);
      } else if (hasAlternates && alternates[i]) {
        for (const alt of alternates[i]!) {
          const altAt = v.m.indexOf(alt);
          if (altAt >= 0) {
            hitScratch[i] = SYNONYM_CREDIT;
            whereScratch[i] = altAt;
            break;
          }
        }
      }
      if (hitScratch[i] > 0) {
        df[i]++;
        any = true;
      }
    }
    if (any) {
      candidates.push({ v, hits: hitScratch.slice(), where: whereScratch.slice() });
    }
  }

  const n = Math.max(index.length, 1);
  // Rarity weight. A word in every other verse ("said") should not outvote one
  // in thirty ("cross"); df is never 0 here because only matched words count.
  const idf = df.map((d) => Math.log(n / Math.max(d, 1)) + 1);
  const totalWeight = weighed.reduce((sum, i) => sum + idf[i], 0);

  const scored: { hit: VerseHit; score: number }[] = [];

  for (const { v, hits, where } of candidates) {
    const carried = weighed.reduce((sum, i) => sum + idf[i] * hits[i], 0);
    const coverage = totalWeight > 0 ? carried / totalWeight : 0;

    // Strict means every content word is present in some form, not that every
    // one is present cleanly — otherwise "follow in his steps" (two content
    // words, so strict) would still miss the footsteps of 1 Peter 2:21.
    if (requireAll ? !weighed.every((i) => hits[i] > 0) : coverage < COVERAGE_FLOOR) {
      continue;
    }

    const phrase = v.m.includes(phraseNeedle);
    let adjacent = 0;
    for (const b of bigrams) if (v.m.includes(b)) adjacent++;

    // How far apart the words landed. Adjacency alone can't separate a verse
    // that gathers the query into one clause from one that happens to hold the
    // same words a sentence apart — Judges 3:28 opens with "Follow me" and
    // closes with men crossing the Jordan, and on words and pairs alone it
    // matched "cross follow me" as well as Matthew 10:38 did. First occurrence
    // of each word is enough to tell the two apart.
    let lo = Infinity;
    let hi = -Infinity;
    let found = 0;
    for (let i = 0; i < where.length; i++) {
      if (where[i] < 0) continue;
      lo = Math.min(lo, where[i]);
      hi = Math.max(hi, where[i]);
      found++;
    }
    // SPAN_HALF is the width at which closeness halves: a clause's worth of
    // characters, so verse-length spans score near nothing.
    const SPAN_HALF = 60;
    const closeness = found > 1 ? 1 / (1 + (hi - lo) / SPAN_HALF) : 0;

    scored.push({
      hit: { book: v.book, chapter: v.chapter, verse: v.verse, text: v.text, phrase },
      // The verbatim bonus dwarfs the rest so exact hits stay on top, as they
      // were before scoring. Below that, coverage decides which verses qualify
      // and the two order terms decide between them: repeated word pairs, then
      // how tightly the words sit together.
      score:
        (phrase ? 1000 : 0) + coverage * 100 + adjacent * 10 + closeness * 30,
    });
  }

  // Stable, so canonical order survives among equally good matches.
  return scored.sort((a, b) => b.score - a.score).map((s) => s.hit);
}

export function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
