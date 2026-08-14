/**
 * Offline content provider (mobile build only).
 *
 * Reads everything from the bundled public/offline/ files produced by
 * scripts/build-offline-data.mjs. Path logic mirrors the server components so
 * the offline reader renders exactly what the live site renders.
 *
 * All functions are async and safe to call from client components.
 */
import type { QuizQuestion } from "@/app/try/bible/read/inline-quiz";
import type { SectionHeading } from "@/app/try/bible/read/format-chunk-text";
import { SITE_URL } from "@/lib/site";
import { parseBookPlaces, type BookPlaces, type RawBookPlaces } from "./places";
import {
  tyndaleNotesForVerse,
  type TyndaleNote,
  type TyndaleTuple,
} from "./tyndale";
import {
  dictLetterOf,
  parseIndexEntry,
  type DictArticle,
  type DictIndexEntry,
  type DictIndexTuple,
} from "./dictionary";
import { personLetterOf, type PersonRecord } from "./people";
import {
  CANONICAL_BOOK_ORDER,
  buildVerseIndex,
  extractVerses,
  searchVerses,
  bookInScope,
  type IndexedVerse,
  type SearchScope,
  type VerseHit,
} from "@/lib/search/verse-search";

// ── Shared shapes ────────────────────────────────────────────────────
export type ChapterContent = {
  text: string;
  questions: QuizQuestion[];
  headings: SectionHeading[] | null;
};

export type ManifestBook = {
  name: string;
  testament: "OT" | "NT";
  hasSummary: boolean;
  chapters: { n: number; chunks: number }[];
};

export type OfflineManifest = {
  generatedAt: string;
  defaultVersion: string;
  translations: { abbr: string; name: string }[];
  books: ManifestBook[];
};

export type { VerseHit as SearchResult } from "@/lib/search/verse-search";

// ── Low-level fetch helpers ──────────────────────────────────────────
const BASE = "/offline";

function seg(s: string): string {
  return encodeURIComponent(s);
}

async function getJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

// ── Manifest (cached) ────────────────────────────────────────────────
let manifestPromise: Promise<OfflineManifest> | null = null;

export function getManifest(): Promise<OfflineManifest> {
  if (!manifestPromise) {
    manifestPromise = getJson<OfflineManifest>(`${BASE}/manifest.json`).then(
      (m) => {
        if (!m) throw new Error("Offline manifest missing");
        return m;
      },
    );
  }
  return manifestPromise;
}

// ── Question normalization (mirrors server) ──────────────────────────
type RawQuestion = {
  id: string;
  type: string;
  question: string;
  options?: string[];
  answer?: string;
  correct?: string;
  accept?: string[];
  verse_reference?: string;
  verse_ref?: string;
};

function normalizeQuestion(raw: RawQuestion): QuizQuestion {
  const typeMap: Record<string, QuizQuestion["type"]> = {
    fill_in_the_blank: "fill_blank",
  };
  return {
    id: raw.id,
    type: (typeMap[raw.type] ?? raw.type) as QuizQuestion["type"],
    question: raw.question,
    options: raw.options,
    answer: String(raw.answer ?? raw.correct ?? ""),
    accept: raw.accept,
    verse_reference: raw.verse_reference ?? raw.verse_ref ?? "",
  };
}

// ── Individual loaders ───────────────────────────────────────────────
async function loadChapterText(
  book: string,
  chapter: number,
  version: string,
): Promise<string> {
  const data = await getJson<Record<string, string>>(
    `${BASE}/text/${seg(version)}/${seg(book)}.json`,
  );
  return data?.[String(chapter)] ?? "";
}

async function loadQuestions(
  book: string,
  chapter: number,
): Promise<QuizQuestion[]> {
  const slug = book.toLowerCase().replace(/ /g, "-");
  for (const fileName of [`${slug}-${chapter}.json`, `chapter_${chapter}.json`]) {
    const data = await getJson<{ questions?: RawQuestion[] }>(
      `${BASE}/questions/${seg(book)}/${seg(fileName)}`,
    );
    if (data?.questions) return data.questions.map(normalizeQuestion);
  }
  return [];
}

// Translations without inline headings get the BSB heading overlay (mirrors
// OVERLAY_HEADING_VERSIONS in chapter-data.ts, which can't be imported here
// because it pulls in fs).
const OVERLAY_HEADING_VERSIONS = new Set(["ASV", "GNV", "YLT", "DBY"]);

async function loadHeadings(
  book: string,
  chapter: number,
  version: string,
): Promise<SectionHeading[] | null> {
  if (!OVERLAY_HEADING_VERSIONS.has(version)) return null;
  const data = await getJson<{
    chapters?: Record<string, SectionHeading[]>;
  }>(`${BASE}/headings/${seg(book)}.json`);
  return data?.chapters?.[String(chapter)] ?? null;
}

async function loadBookSummary(book: string): Promise<string | null> {
  const slug = book.toLowerCase();
  const data = await getJson<{ summary?: string }>(
    `${BASE}/summaries/${seg(slug)}/${seg(`${slug}-book-summary.json`)}`,
  );
  return data?.summary ?? null;
}

// ── Public API (mirrors /api/chapter and the server pages) ───────────
export async function getChapter(
  book: string,
  chapter: number,
  version: string,
): Promise<ChapterContent> {
  const [text, questions, headings] = await Promise.all([
    loadChapterText(book, chapter, version),
    loadQuestions(book, chapter),
    loadHeadings(book, chapter, version),
  ]);
  return { text, questions, headings };
}

export type ReadPageData = ChapterContent & {
  bookSummary: string | null;
  versionName: string;
  availableVersions: { abbr: string; name: string }[];
  chapterNumbers: number[];
  allBookNames: string[];
};

export async function getReadPageData(
  book: string,
  chapter: number,
  version: string,
): Promise<ReadPageData | null> {
  const manifest = await getManifest();
  const bookEntry = manifest.books.find((b) => b.name === book);
  if (!bookEntry) return null;

  const [content, bookSummary] = await Promise.all([
    getChapter(book, chapter, version),
    bookEntry.hasSummary ? loadBookSummary(book) : Promise.resolve(null),
  ]);

  const versionName =
    manifest.translations.find((t) => t.abbr === version)?.name ?? version;

  return {
    ...content,
    bookSummary,
    versionName,
    availableVersions: manifest.translations,
    chapterNumbers: bookEntry.chapters.map((c) => c.n),
    allBookNames: manifest.books.map((b) => b.name),
  };
}

export type RoadmapData = {
  books: {
    name: string;
    testament: string;
    chapters: { chapterNumber: number }[];
  }[];
  versionAbbr: string;
  booksWithSummary: string[];
};

export async function getRoadmapData(): Promise<RoadmapData> {
  const manifest = await getManifest();
  return {
    books: manifest.books.map((b) => ({
      name: b.name,
      testament: b.testament,
      chapters: b.chapters.map((c) => ({
        chapterNumber: c.n,
      })),
    })),
    versionAbbr: manifest.defaultVersion,
    booksWithSummary: manifest.books.filter((b) => b.hasSummary).map((b) => b.name),
  };
}

export type QuizData = {
  questions: QuizQuestion[];
  chapterNumbers: number[];
};

export async function getQuizData(
  book: string,
  chapter: number,
): Promise<QuizData> {
  const manifest = await getManifest();
  const bookEntry = manifest.books.find((b) => b.name === book);
  const questions = await loadQuestions(book, chapter);
  return {
    questions,
    chapterNumbers: bookEntry?.chapters.map((c) => c.n) ?? [],
  };
}

// ── Verse across translations (verse sheet) ─────────────────────────
export type VerseVersion = { abbr: string; name: string; text: string };

export async function getVerseVersions(
  book: string,
  chapter: number,
  verse: number,
): Promise<VerseVersion[]> {
  const manifest = await getManifest();
  const out: VerseVersion[] = [];
  for (const t of manifest.translations) {
    const text = await getJson<Record<string, string>>(
      `${BASE}/text/${seg(t.abbr)}/${seg(book)}.json`,
    );
    const html = text?.[String(chapter)];
    if (!html) continue;
    const hit = extractVerses(html).find((v) => v.verse === verse);
    if (hit) out.push({ abbr: t.abbr, name: t.name, text: hit.text });
  }
  return out;
}

// ── Cross-references (verse sheet) ───────────────────────────────────
export type CrossRef = {
  book: string;
  chapter: number;
  verse: number;
  endChapter?: number;
  endVerse?: number;
  text: string;
};

type RefTuple = [string, number, number, number, number];

export async function getCrossRefs(
  book: string,
  chapter: number,
  verse: number,
  version: string,
): Promise<CrossRef[]> {
  const data = await getJson<{ refs: Record<string, RefTuple[]> }>(
    `${BASE}/crossrefs/${seg(book)}.json`,
  );
  const tuples = data?.refs?.[`${chapter}:${verse}`] ?? [];
  const out: CrossRef[] = [];
  for (const [toBook, toCh, toV, endCh, endV] of tuples) {
    const text = await getJson<Record<string, string>>(
      `${BASE}/text/${seg(version)}/${seg(toBook)}.json`,
    );
    const html = text?.[String(toCh)];
    const hit = html ? extractVerses(html).find((v) => v.verse === toV) : null;
    out.push({
      book: toBook,
      chapter: toCh,
      verse: toV,
      endChapter: endCh || undefined,
      endVerse: endV || undefined,
      text: hit?.text ?? "",
    });
  }
  return out;
}

// ── Chapter-map places ───────────────────────────────────────────────
export async function getBookPlaces(book: string): Promise<BookPlaces> {
  const data = await getJson<RawBookPlaces>(`${BASE}/places/${seg(book)}.json`);
  return data?.chapters ? parseBookPlaces(data) : {};
}

// ── Strong's word study (verse sheet) ────────────────────────────────
export type StrongsWord = {
  word: string;
  num: string;
  surface: string; // the word as written in the text (θεόν), not the lemma
  surfaceTranslit: string;
  lemma: string;
  translit: string;
  def: string;
  kjv: string;
};

type WordTuple = [string, string, string, string]; // [gloss, num, surface, surface translit]
type LexEntry = { lemma: string; translit: string; def: string; kjv: string };

let lexiconPromise: Promise<Record<string, LexEntry> | null> | null = null;

export async function getStrongsWords(
  book: string,
  chapter: number,
  verse: number,
): Promise<StrongsWord[]> {
  if (!lexiconPromise) {
    lexiconPromise = getJson<Record<string, LexEntry>>(
      `${BASE}/lexicon/strongs.json`,
    );
  }
  const [data, lexicon] = await Promise.all([
    getJson<{ verses: Record<string, WordTuple[]> }>(
      `${BASE}/strongs/${seg(book)}.json`,
    ),
    lexiconPromise,
  ]);
  const tuples = data?.verses?.[`${chapter}:${verse}`] ?? [];
  return tuples.flatMap(([word, num, surface, surfaceTranslit]) => {
    const entry = lexicon?.[num];
    return entry
      ? [{ word, num, surface: surface ?? "", surfaceTranslit: surfaceTranslit ?? "", ...entry }]
      : [];
  });
}

// ── Tyndale study notes (verse sheet) ────────────────────────────────
export async function getTyndaleNotes(
  book: string,
  chapter: number,
  verse: number,
): Promise<TyndaleNote[]> {
  const data = await getJson<{ notes: TyndaleTuple[] }>(
    `${BASE}/tyndale/${seg(book)}.json`,
  );
  return tyndaleNotesForVerse(data?.notes ?? [], chapter, verse);
}

// ── Tyndale Bible Dictionary ─────────────────────────────────────────
let dictIndexPromise: Promise<DictIndexEntry[]> | null = null;

export function getDictionaryIndex(): Promise<DictIndexEntry[]> {
  if (!dictIndexPromise) {
    dictIndexPromise = getJson<{ entries: DictIndexTuple[] }>(
      `${BASE}/tyndale-dictionary/_index.json`,
    ).then((d) => (d?.entries ?? []).map(parseIndexEntry));
  }
  return dictIndexPromise;
}

let dictAliasPromise: Promise<Record<string, string[]>> | null = null;
export function getDictionaryAliases(): Promise<Record<string, string[]>> {
  if (!dictAliasPromise) {
    dictAliasPromise = getJson<Record<string, string[]>>(
      `${BASE}/tyndale-dictionary/_place-aliases.json`,
    ).then((d) => d ?? {});
  }
  return dictAliasPromise;
}

const dictLetterCache = new Map<
  string,
  Promise<Record<string, Omit<DictArticle, "id">> | null>
>();

function loadDictLetter(letter: string) {
  let p = dictLetterCache.get(letter);
  if (!p) {
    p = getJson<{ articles: Record<string, Omit<DictArticle, "id">> }>(
      `${BASE}/tyndale-dictionary/${seg(letter)}.json`,
    ).then((d) => d?.articles ?? null);
    dictLetterCache.set(letter, p);
  }
  return p;
}

export async function getDictionaryArticle(id: string): Promise<DictArticle | null> {
  const articles = await loadDictLetter(dictLetterOf(id));
  const article = articles?.[id];
  return article ? { id, ...article } : null;
}

// ── People (family graph + verse index, shown in dictionary articles) ─
let peopleByDictPromise: Promise<Record<string, string[]>> | null = null;

export function getPeopleByDict(): Promise<Record<string, string[]>> {
  if (!peopleByDictPromise) {
    peopleByDictPromise = getJson<Record<string, string[]>>(
      `${BASE}/people/_by-dict.json`,
    ).then((d) => d ?? {});
  }
  return peopleByDictPromise;
}

const peopleLetterCache = new Map<
  string,
  Promise<Record<string, Omit<PersonRecord, "id">> | null>
>();

function loadPeopleLetter(letter: string) {
  let p = peopleLetterCache.get(letter);
  if (!p) {
    p = getJson<{ people: Record<string, Omit<PersonRecord, "id">> }>(
      `${BASE}/people/${seg(letter)}.json`,
    ).then((d) => d?.people ?? null);
    peopleLetterCache.set(letter, p);
  }
  return p;
}

export async function getPerson(id: string): Promise<PersonRecord | null> {
  const people = await loadPeopleLetter(personLetterOf(id));
  const person = people?.[id];
  return person ? { id, ...person } : null;
}

// ── Offline full-text search ─────────────────────────────────────────
// Mirrors /api/search: a verse index built from the bundled chapter text,
// ranked by the shared core so results match the web app exactly. The index
// is built once per version and cached for the session.
const verseIndexCache = new Map<string, IndexedVerse[]>();

async function getVerseIndex(version: string): Promise<IndexedVerse[]> {
  const cached = verseIndexCache.get(version);
  if (cached) return cached;

  const manifest = await getManifest();
  const byName = new Map(manifest.books.map((b) => [b.name, b]));
  const index: IndexedVerse[] = [];

  // Load in canonical presentation order, not the manifest's reading order.
  for (const bookName of CANONICAL_BOOK_ORDER) {
    const book = byName.get(bookName);
    if (!book) continue;
    const text =
      (await getJson<Record<string, string>>(
        `${BASE}/text/${seg(version)}/${seg(book.name)}.json`,
      )) ?? {};
    for (const ch of book.chapters) {
      if (book.name === "Psalms" && ch.n > 150) continue;
      const html = text[String(ch.n)];
      if (html) index.push(...buildVerseIndex(book.name, ch.n, html));
    }
  }

  verseIndexCache.set(version, index);
  return index;
}

export async function search(
  query: string,
  version: string,
  opts: { limit?: number; offset?: number; scope?: SearchScope } = {},
): Promise<{ results: VerseHit[]; total: number }> {
  const { limit = 25, offset = 0, scope = "all" } = opts;
  if (query.trim().length < 2) return { results: [], total: 0 };

  const index = await getVerseIndex(version);
  const matches = searchVerses(index, query).filter((hit) =>
    bookInScope(hit.book, scope),
  );
  return { results: matches.slice(offset, offset + limit), total: matches.length };
}
