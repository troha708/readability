/**
 * Client-side content access used by interactive components (chapter
 * navigation, search). On web it calls the existing API routes; on the mobile
 * build it reads the bundled offline content. The component code stays
 * identical across both targets.
 */
import { IS_MOBILE } from "@/lib/build-target";
import * as offline from "./offline";
import type { ChapterContent, SearchResult } from "./offline";
import { parseBookPlaces, type BookPlaces, type RawBookPlaces } from "./places";
import { parseBookThemes, type BookThemes, type RawBookThemes } from "./chapter-themes";
import type { SearchScope } from "@/lib/search/verse-search";

export async function fetchChapter(
  book: string,
  chapter: number,
  version: string,
): Promise<ChapterContent> {
  if (IS_MOBILE) {
    return offline.getChapter(book, chapter, version);
  }
  const res = await fetch(
    `/api/chapter?book=${encodeURIComponent(book)}&chapter=${chapter}&version=${version}`,
  );
  if (!res.ok) {
    return { text: "", questions: [], headings: null };
  }
  const data = await res.json();
  return {
    text: data.text ?? "",
    questions: data.questions ?? [],
    headings: data.headings ?? null,
  };
}

/** `html` and `quote` carry the verse with its source formatting, for copying. */
export type VerseVersion = {
  abbr: string;
  name: string;
  text: string;
  html?: string;
  quote?: string;
};

/** One verse across every offered translation (verse sheet "Compare"). */
export async function fetchVerseVersions(
  book: string,
  chapter: number,
  verse: number,
): Promise<VerseVersion[]> {
  if (IS_MOBILE) {
    return offline.getVerseVersions(book, chapter, verse);
  }
  const res = await fetch(
    `/api/verse?book=${encodeURIComponent(book)}&chapter=${chapter}&verse=${verse}`,
  );
  if (!res.ok) return [];
  const data = await res.json();
  return data.versions ?? [];
}

export type PassageVerse = { verse: number; text: string };

/** A short run of verses for the note-reference peek (BSB fallback). */
export async function fetchPassage(
  book: string,
  chapter: number,
  start: number,
  end: number,
  version: string,
): Promise<{ version: string; verses: PassageVerse[] }> {
  if (IS_MOBILE) {
    const verses: PassageVerse[] = [];
    let used = version;
    for (let v = start; v <= Math.min(end, start + 11); v++) {
      const versions = await offline.getVerseVersions(book, chapter, v);
      if (versions.length === 0) continue;
      const hit =
        versions.find((x) => x.abbr === version) ??
        versions.find((x) => x.abbr === "BSB") ??
        versions[0];
      used = hit.abbr;
      verses.push({ verse: v, text: hit.text });
    }
    return { version: used, verses };
  }
  const res = await fetch(
    `/api/passage?book=${encodeURIComponent(book)}&chapter=${chapter}&verse=${start}&end=${end}&version=${version}`,
  );
  if (!res.ok) return { version, verses: [] };
  const data = await res.json();
  return { version: data.version ?? version, verses: data.verses ?? [] };
}

export type CrossRef = {
  book: string;
  chapter: number;
  verse: number;
  endChapter?: number;
  endVerse?: number;
  text: string;
};

/** TSK-derived cross-references for one verse, with target-verse previews. */
export async function fetchCrossRefs(
  book: string,
  chapter: number,
  verse: number,
  version: string,
): Promise<CrossRef[]> {
  if (IS_MOBILE) {
    return offline.getCrossRefs(book, chapter, verse, version);
  }
  const res = await fetch(
    `/api/cross-refs?book=${encodeURIComponent(book)}&chapter=${chapter}&verse=${verse}&version=${version}`,
  );
  if (!res.ok) return [];
  const data = await res.json();
  return data.refs ?? [];
}

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

/** Original-language words for one verse (Strong's, via STEPBible tagging). */
export async function fetchStrongsWords(
  book: string,
  chapter: number,
  verse: number,
): Promise<StrongsWord[]> {
  if (IS_MOBILE) {
    return offline.getStrongsWords(book, chapter, verse);
  }
  const res = await fetch(
    `/api/strongs?book=${encodeURIComponent(book)}&chapter=${chapter}&verse=${verse}`,
  );
  if (!res.ok) return [];
  const data = await res.json();
  return data.words ?? [];
}

export type InterlinearWord = {
  id: number;
  orig: string; // original-language word ("" for a translator-supplied English word)
  translit: string;
  parse: string;
  strong: string; // "G25" / "H7225" ("" for a supplied word)
  bsb: string; // the BSB rendering ("" for an untranslated original word)
  gkSort: number;
  bsbSort: number;
  gloss: string; // concise TAGNT/TAHOT English gloss for the Strong's number
  lemma: string;
  def: string;
  kjv: string;
};

/** One KJV word in the interlinear KJV line; `link` is a `words` id (or <0 if
 * the word has no Greek partner). Text comes from the shipped KJV. */
export type InterlinearKjvToken = {
  text: string;
  link: number;
  strong: string;
  lemma: string;
  translit: string;
  def: string;
};

export type InterlinearData = {
  words: InterlinearWord[];
  kjv: InterlinearKjvToken[];
};

/**
 * Reverse interlinear for one verse — the original words with each one's BSB
 * rendering (sort keys for both reading orders), plus the KJV line as
 * Strong's-linked tokens. Alignment from the public-domain BSB Translation
 * Tables and a KJV+Strong's dataset; definitions from openscriptures. Not yet
 * bundled offline, so the mobile build returns empty and the sheet falls back
 * to the plain word list.
 */
export async function fetchInterlinear(
  book: string,
  chapter: number,
  verse: number,
): Promise<InterlinearData> {
  if (IS_MOBILE) return { words: [], kjv: [] };
  const res = await fetch(
    `/api/interlinear?book=${encodeURIComponent(book)}&chapter=${chapter}&verse=${verse}`,
  );
  if (!res.ok) return { words: [], kjv: [] };
  const data = await res.json();
  return { words: data.words ?? [], kjv: data.kjv ?? [] };
}

export type { TyndaleNote } from "./tyndale";
import type { TyndaleNote as TyndaleNoteType } from "./tyndale";

/** Tyndale Open Study Notes covering one verse (CC BY-SA, attributed in UI). */
export async function fetchTyndaleNotes(
  book: string,
  chapter: number,
  verse: number,
): Promise<TyndaleNoteType[]> {
  if (IS_MOBILE) {
    return offline.getTyndaleNotes(book, chapter, verse);
  }
  const res = await fetch(
    `/api/tyndale?book=${encodeURIComponent(book)}&chapter=${chapter}&verse=${verse}`,
  );
  if (!res.ok) return [];
  const data = await res.json();
  return data.notes ?? [];
}

/** Chapter-map place index for a whole book (chapter-keyed, client-cached). */
export async function fetchBookPlaces(book: string): Promise<BookPlaces> {
  if (IS_MOBILE) {
    return offline.getBookPlaces(book);
  }
  try {
    const res = await fetch(`/api/places?book=${encodeURIComponent(book)}`);
    if (!res.ok) return {};
    const data = (await res.json()) as RawBookPlaces;
    return data.chapters ? parseBookPlaces(data) : {};
  } catch {
    return {}; // offline on web — the Map button simply stays hidden
  }
}

/** Per-chapter theme essays for a whole book (chapter-keyed, client-cached). */
export async function fetchBookThemes(book: string): Promise<BookThemes> {
  if (IS_MOBILE) {
    // Not in the offline bundle yet — the native build simply shows no Themes
    // row until that bundle is rebuilt to carry the index.
    return {};
  }
  try {
    const res = await fetch(`/api/chapter-themes?book=${encodeURIComponent(book)}`);
    if (!res.ok) return {};
    const data = (await res.json()) as RawBookThemes;
    return data.chapters ? parseBookThemes(data) : {};
  } catch {
    return {}; // offline on web — the Themes row simply stays hidden
  }
}

export type { DictArticle, DictIndexEntry } from "./dictionary";
import {
  parseIndexEntry,
  type DictArticle,
  type DictIndexEntry,
  type DictIndexTuple,
} from "./dictionary";

/** The Tyndale Bible Dictionary search index (all entry titles + ids). */
export async function fetchDictionaryIndex(): Promise<DictIndexEntry[]> {
  if (IS_MOBILE) {
    return offline.getDictionaryIndex();
  }
  const res = await fetch(`/api/dictionary`);
  if (!res.ok) return [];
  const data = await res.json();
  return ((data.entries ?? []) as DictIndexTuple[]).map(parseIndexEntry);
}

/** Map of dictionary-article id → alternate names that redirect to it, so a
 * place article can find the atlas point its older-spelling alias holds. */
export async function fetchDictionaryAliases(): Promise<Record<string, string[]>> {
  if (IS_MOBILE) {
    return offline.getDictionaryAliases();
  }
  const res = await fetch(`/api/dictionary?aliases=1`);
  if (!res.ok) return {};
  const data = await res.json();
  return (data.aliases ?? {}) as Record<string, string[]>;
}

/** One dictionary article by id (loads its per-letter file on demand). */
export async function fetchDictionaryArticle(
  id: string,
): Promise<DictArticle | null> {
  if (IS_MOBILE) {
    return offline.getDictionaryArticle(id);
  }
  const res = await fetch(`/api/dictionary?id=${encodeURIComponent(id)}`);
  if (!res.ok) return null;
  const data = await res.json();
  return data.article ?? null;
}

export type { PersonRecord } from "./people";
import { type PersonRecord } from "./people";

/**
 * Dictionary-article id → the person id(s) that share that headword, so a
 * person's dictionary article can show their family tree(s) + verse index.
 */
export async function fetchPeopleByDict(): Promise<Record<string, string[]>> {
  if (IS_MOBILE) {
    return offline.getPeopleByDict();
  }
  const res = await fetch(`/api/people?byDict=1`);
  if (!res.ok) return {};
  const data = await res.json();
  return (data.byDict ?? {}) as Record<string, string[]>;
}

/** One person by id (loads its per-letter file on demand). */
export async function fetchPerson(id: string): Promise<PersonRecord | null> {
  if (IS_MOBILE) {
    return offline.getPerson(id);
  }
  const res = await fetch(`/api/people?id=${encodeURIComponent(id)}`);
  if (!res.ok) return null;
  const data = await res.json();
  return data.person ?? null;
}

export type SearchOptions = {
  limit?: number;
  offset?: number;
  scope?: SearchScope;
};

export async function searchScripture(
  query: string,
  version: string,
  opts: SearchOptions = {},
): Promise<{ results: SearchResult[]; total: number }> {
  const { limit = 25, offset = 0, scope = "all" } = opts;
  if (IS_MOBILE) {
    return offline.search(query, version, { limit, offset, scope });
  }
  const res = await fetch(
    `/api/search?q=${encodeURIComponent(query.trim())}&version=${version}&limit=${limit}&offset=${offset}&scope=${scope}`,
  );
  if (!res.ok) return { results: [], total: 0 };
  const data = await res.json();
  return { results: data.results ?? [], total: data.total ?? 0 };
}
