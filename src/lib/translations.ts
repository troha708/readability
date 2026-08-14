/**
 * The translations the app offers. Reading is limited to the two most-read
 * public-domain texts (BSB, KJV); the verse-compare sheet adds the older,
 * more literal set so a reader can see a single verse rendered several ways.
 * Client-safe (no fs) — shared by the reader picker, the verse compare sheet,
 * and the server-side verse lookup.
 */
import { LICENSED_META } from "@/lib/licensed-versions";

export const READING_VERSIONS: string[] = ["BSB", "KJV"];

export const COMPARE_VERSIONS: string[] = [
  "BSB",
  "KJV",
  "WEB",
  "ASV",
  "GNV",
  "YLT",
  "DBY",
  "JPS",
];

/**
 * How a translation renders its source, in the three bands the translators
 * themselves use. Deliberately coarse: the extremes are uncontested and
 * stated in each translation's own preface, while any finer scale — a number
 * out of ten, an ordering within a band — would assert a precision the field
 * doesn't agree on. Translations that differ by SOURCE TEXT or by translating
 * TRADITION rather than by approach (a Septuagint rendering; a Jewish Bible)
 * carry `note` instead; they don't belong anywhere on this axis.
 */
export type TranslationApproach = "word-for-word" | "balanced" | "thought-for-thought";

export type TranslationInfo = {
  name: string;
  /** The translation's own date, which answers "why does this sound old?". */
  year: number;
  approach?: TranslationApproach;
  /** A longer characterisation, where one is worth having. */
  note?: string;
};

export const TRANSLATION_INFO: Record<string, TranslationInfo> = {
  BSB: { name: "Berean Standard Bible", year: 2023, approach: "balanced" },
  KJV: { name: "King James (Authorised) Version", year: 1611, approach: "word-for-word" },
  WEB: {
    name: "World English Bible",
    year: 2020,
    approach: "word-for-word",
    note: "A modern-English revision of the American Standard Version.",
  },
  ASV: { name: "American Standard Version (1901)", year: 1901, approach: "word-for-word" },
  GNV: {
    name: "Geneva Bible (1599)",
    year: 1599,
    approach: "word-for-word",
    note: "The English Bible of the Reformation, a generation before the King James.",
  },
  YLT: {
    name: "Young's Literal Translation (1898)",
    year: 1898,
    approach: "word-for-word",
    note: "Strictly literal: keeps Hebrew and Greek tense and word order even where the English strains.",
  },
  DBY: { name: "Darby Translation (1890)", year: 1890, approach: "word-for-word" },
  JPS: {
    name: "JPS TaNaKH (1917)",
    year: 1917,
    note: "The Jewish Publication Society's Hebrew Bible: the Old Testament in the Jewish translating tradition rather than the Christian one. Old Testament only.",
  },
};

/** Sort key: literal first, then freest, then by age within a band. */
const APPROACH_RANK: Record<TranslationApproach, number> = {
  "word-for-word": 0,
  balanced: 1,
  "thought-for-thought": 2,
};

/**
 * Metadata for any version the app can show, whether it lives on disk or is
 * fetched under licence.
 */
export function translationInfo(abbr: string): TranslationInfo | undefined {
  return TRANSLATION_INFO[abbr] ?? LICENSED_META[abbr];
}

/**
 * Orders translations from the most literal to the freest, so reading down
 * the column shows the verse loosen — which demonstrates translation
 * philosophy rather than asserting it. Versions with no approach (those that
 * differ by source text) sort last, newest first.
 */
export function compareByApproach(a: { abbr: string }, b: { abbr: string }): number {
  const ia = translationInfo(a.abbr);
  const ib = translationInfo(b.abbr);
  const ra = ia?.approach ? APPROACH_RANK[ia.approach] : 3;
  const rb = ib?.approach ? APPROACH_RANK[ib.approach] : 3;
  if (ra !== rb) return ra - rb;
  return (ib?.year ?? 0) - (ia?.year ?? 0);
}

export const TRANSLATION_NAMES: Record<string, string> = Object.fromEntries(
  Object.entries(TRANSLATION_INFO).map(([abbr, info]) => [abbr, info.name]),
);
