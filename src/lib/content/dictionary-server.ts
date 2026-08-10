import rawIndex from "../../../data/tyndale-dictionary/_index.json";
import { parseIndexEntry, type DictIndexEntry, type DictIndexTuple } from "./dictionary";

/**
 * Server-side copy of the dictionary index (the client fetches the same rows
 * from /api/dictionary). Static import rather than a disk read, matching
 * atlas-server: it has to be available to the sitemap at build time without
 * teaching Vercel's file tracing about another path.
 */
let cached: DictIndexEntry[] | null = null;

export function loadDictionaryIndex(): DictIndexEntry[] {
  if (!cached) {
    const { entries } = rawIndex as unknown as { entries: DictIndexTuple[] };
    cached = entries.map(parseIndexEntry);
  }
  return cached;
}

/**
 * The shortest article worth submitting to a search engine, in words.
 *
 * The dictionary has 6,308 entries, and most of them are not pages a crawler
 * should be pointed at. 1,171 are alt-spelling stubs ("Abiah, see Abijah") —
 * excluded outright, since they are cross-references rather than articles, and
 * the browse view already hides them. Of what remains, 2,169 are one- or
 * two-line entries: "Abagtha" is nineteen words, "Ab" is fourteen. Those are
 * useful *in* the dictionary and stay linked and crawlable, but a sitemap full
 * of pages that are mostly site chrome is the thin-content pattern, and it
 * spends crawl budget that the substantial articles want.
 *
 * 40 words is where an entry stops being a gloss and becomes a paragraph. It
 * admits 2,968 of 5,137 non-variant articles. Lower it to submit more.
 */
export const SITEMAP_MIN_WORDS = 40;

/** Dictionary articles substantial enough to submit, longest first. */
export function indexableDictionaryEntries(): DictIndexEntry[] {
  return loadDictionaryIndex()
    .filter((e) => e.cat !== "variant" && e.words >= SITEMAP_MIN_WORDS)
    .sort((a, b) => b.words - a.words);
}
