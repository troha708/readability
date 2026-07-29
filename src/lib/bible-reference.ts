import { BIBLE_BOOK_ORDER, PROTESTANT_PSALMS_MAX_CHAPTER } from "./bible-book-order";

/** A parsed scripture reference, e.g. "John 3:16" -> { book: "John", chapter: 3, verse: 16 }. */
export type BibleReference = {
  book: string; // canonical book name (matches BIBLE_BOOK_ORDER)
  chapter: number;
  verse?: number; // start verse, if the reference named one
};

// Common abbreviations per book, lowercase. Numbered books use the spaced Arabic
// form ("1 cor"); the parser normalizes "1cor", "i cor", "1st cor" to that shape
// before lookup. Ambiguous short forms follow the usual convention (jud = Jude,
// judg = Judges; phil = Philippians, phlm = Philemon).
const BOOK_ALIASES: Record<string, string[]> = {
  Genesis: ["gen", "ge", "gn"],
  Exodus: ["exod", "exo", "ex", "exd"],
  Leviticus: ["lev", "lv", "le"],
  Numbers: ["num", "nu", "nm", "nb"],
  Deuteronomy: ["deut", "deu", "dt"],
  Joshua: ["josh", "jos", "jsh"],
  Judges: ["judg", "jdg", "jdgs", "jg"],
  Ruth: ["rth", "ru"],
  "1 Samuel": ["1 sam", "1 sa", "1 sm"],
  "2 Samuel": ["2 sam", "2 sa", "2 sm"],
  "1 Kings": ["1 kings", "1 kgs", "1 ki", "1 kin"],
  "2 Kings": ["2 kings", "2 kgs", "2 ki", "2 kin"],
  "1 Chronicles": ["1 chron", "1 chr", "1 ch"],
  "2 Chronicles": ["2 chron", "2 chr", "2 ch"],
  Ezra: ["ezr"],
  Nehemiah: ["neh", "ne"],
  Esther: ["esth", "est", "es"],
  Job: ["jb"],
  Psalms: ["ps", "psa", "psalm", "pss", "pslm", "psm"],
  Proverbs: ["prov", "prv", "pro", "pr"],
  Ecclesiastes: ["eccl", "eccles", "ecc", "ec", "qoh"],
  "Song of Solomon": ["song", "song of songs", "song of sol", "sos", "sng", "ss", "canticles"],
  Isaiah: ["isa", "is", "isai"],
  Jeremiah: ["jer", "jr", "jere"],
  Lamentations: ["lam", "la"],
  Ezekiel: ["ezek", "eze", "ezk"],
  Daniel: ["dan", "dn", "da"],
  Hosea: ["hos", "ho"],
  Joel: ["joe", "jl"],
  Amos: ["amo", "am"],
  Obadiah: ["obad", "oba", "ob"],
  Jonah: ["jon", "jnh"],
  Micah: ["mic", "mi"],
  Nahum: ["nah", "na"],
  Habakkuk: ["hab", "hb"],
  Zephaniah: ["zeph", "zep", "zp"],
  Haggai: ["hag", "hg"],
  Zechariah: ["zech", "zec", "zch"],
  Malachi: ["mal", "ml"],
  Matthew: ["matt", "mat", "mt"],
  Mark: ["mrk", "mk", "mar"],
  Luke: ["luk", "lk"],
  John: ["jn", "jhn", "joh"],
  Acts: ["act", "ac"],
  Romans: ["rom", "ro", "rm"],
  "1 Corinthians": ["1 cor", "1 co"],
  "2 Corinthians": ["2 cor", "2 co"],
  Galatians: ["gal", "ga"],
  Ephesians: ["eph", "ephes"],
  Philippians: ["phil", "php", "pp"],
  Colossians: ["col"],
  "1 Thessalonians": ["1 thess", "1 thes", "1 th"],
  "2 Thessalonians": ["2 thess", "2 thes", "2 th"],
  "1 Timothy": ["1 tim", "1 ti"],
  "2 Timothy": ["2 tim", "2 ti"],
  Titus: ["tit", "tt"],
  Philemon: ["philem", "phlm", "phm", "pm"],
  Hebrews: ["heb", "hbr"],
  James: ["jas", "jm", "jms"],
  "1 Peter": ["1 pet", "1 pe", "1 pt"],
  "2 Peter": ["2 pet", "2 pe", "2 pt"],
  "1 John": ["1 jn", "1 jhn", "1 joh"],
  "2 John": ["2 jn", "2 jhn"],
  "3 John": ["3 jn", "3 jhn"],
  Jude: ["jud", "jd"],
  Revelation: ["rev", "re", "rv", "reve", "revelations", "apoc"],
};

// alias (lowercase) -> canonical book name. Includes every full name plus aliases.
const ALIAS_TO_CANONICAL = new Map<string, string>();
for (const canonical of BIBLE_BOOK_ORDER) {
  ALIAS_TO_CANONICAL.set(canonical.toLowerCase(), canonical);
}
for (const [canonical, aliases] of Object.entries(BOOK_ALIASES)) {
  for (const alias of aliases) ALIAS_TO_CANONICAL.set(alias, canonical);
}

// A book part (possibly multi-word / numbered) followed by chapter[:verse][-end].
// The lazy book group means the trailing number is always read as the chapter.
const REFERENCE_RE = /^\s*(.+?)\s*(\d+)\s*(?::\s*(\d+))?(?:\s*[-–]\s*\d+)?\s*$/;

function normalizeBookPart(raw: string): string {
  let s = raw.toLowerCase().replace(/\./g, " ").replace(/\s+/g, " ").trim();
  // Leading Roman numerals for the numbered books: "i john" -> "1 john".
  s = s.replace(/^iii\s+/, "3 ").replace(/^ii\s+/, "2 ").replace(/^i\s+/, "1 ");
  // Ordinals: "1st", "2nd", "3rd" -> bare digit.
  s = s.replace(/^([123])(?:st|nd|rd)\s+/, "$1 ");
  // Ensure a single space after a leading numbered-book digit ("1john" -> "1 john").
  s = s.replace(/^([123])\s*/, "$1 ");
  return s.trim();
}

/**
 * Parse a scripture reference like "John 3:16", "Ps 23", "1 cor 13", or
 * "Rom 8:28-30". Returns null when the text isn't a reference (no chapter
 * number, or an unrecognized book) so the caller can fall back to full-text
 * search. When `chapterCounts` (canonical book name -> chapter count) is given,
 * a chapter beyond the book's range is rejected; Psalms is always capped at 150.
 */
export function parseBibleReference(
  query: string,
  chapterCounts?: Record<string, number>,
): BibleReference | null {
  const match = REFERENCE_RE.exec(query);
  if (!match) return null;
  const [, bookRaw, chapterStr, verseStr] = match;

  const canonical = ALIAS_TO_CANONICAL.get(normalizeBookPart(bookRaw));
  if (!canonical) return null;

  const chapter = parseInt(chapterStr, 10);
  if (!Number.isFinite(chapter) || chapter < 1) return null;

  const max =
    chapterCounts?.[canonical] ??
    (canonical === "Psalms" ? PROTESTANT_PSALMS_MAX_CHAPTER : undefined);
  if (max !== undefined && chapter > max) return null;

  const verse = verseStr ? parseInt(verseStr, 10) : undefined;
  if (verse !== undefined && verse < 1) return null;

  return verse !== undefined ? { book: canonical, chapter, verse } : { book: canonical, chapter };
}
