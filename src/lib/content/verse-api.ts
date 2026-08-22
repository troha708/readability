/**
 * Single-verse lookups for the modern translations we licence rather than own.
 * Two providers, because the ESV isn't on API.Bible: everything else comes
 * from API.Bible (American Bible Society), the ESV from Crossway's own API.
 * Server-only: neither account key may reach the browser.
 *
 * The shape of this file is dictated by the terms, not by taste:
 *
 * - ONE VERSE PER REQUEST, cached per verse. API.Bible allows caching "fewer
 *   than 500 consecutive verses", cleared every 14 days — verse-keyed entries
 *   can never accumulate into a continuous run of the text, which is what that
 *   clause exists to prevent. Never widen this to chapters or ranges.
 * - THE CACHE IS OURS, IN POSTGRES, NOT NEXT'S DATA CACHE. Next's cache is
 *   per-deployment; this project deploys often, and every deploy would send
 *   the whole readership back upstream and burn the month's allowance.
 * - NOTHING IS PERSISTED TO THE REPO OR THE APP. No writes to data/, no
 *   bundling into the native build. Publishers licence display, not
 *   redistribution — the cache is a 14-day scratch copy, deliberately not a
 *   corpus.
 * - A MONTHLY BUDGET, counted in Postgres, because the free tier allows 5,000
 *   calls a month across all readers. Cache hits cost nothing and are not
 *   counted; only real upstream calls are.
 *
 * Each provider is off unless its own key is set — API_BIBLE_KEY plus
 * API_BIBLE_VERSIONS for the first, ESV_API_KEY for the second — so local dev,
 * contributors and the public repo are unaffected by either.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { BIBLE_BOOK_ORDER } from "@/lib/bible-book-order";
import { LICENSED_META } from "@/lib/licensed-versions";
import type { VerseVersion } from "@/lib/content/verse-versions";

/** USFM book codes, positional against the Protestant canon order. */
const USFM_CODES = [
  "GEN", "EXO", "LEV", "NUM", "DEU", "JOS", "JDG", "RUT", "1SA", "2SA",
  "1KI", "2KI", "1CH", "2CH", "EZR", "NEH", "EST", "JOB", "PSA", "PRO",
  "ECC", "SNG", "ISA", "JER", "LAM", "EZK", "DAN", "HOS", "JOL", "AMO",
  "OBA", "JON", "MIC", "NAM", "HAB", "ZEP", "HAG", "ZEC", "MAL",
  "MAT", "MRK", "LUK", "JHN", "ACT", "ROM", "1CO", "2CO", "GAL", "EPH",
  "PHP", "COL", "1TH", "2TH", "1TI", "2TI", "TIT", "PHM", "HEB", "JAS",
  "1PE", "2PE", "1JN", "2JN", "3JN", "JUD", "REV",
];

const API_BASE = process.env.API_BIBLE_BASE ?? "https://api.scripture.api.bible/v1";
// Free tier is 5,000 calls a month; stop short so concurrent reservations
// near the end of the month can't overshoot.
const MONTHLY_BUDGET = Number(process.env.API_BIBLE_BUDGET ?? 4500);

const ESV_BASE = process.env.ESV_API_BASE ?? "https://api.esv.org/v3";
// Crossway's free non-commercial allowance is 5,000 queries a DAY, not a
// month — a different shape of limit, so it gets its own counter below.
const ESV_DAILY_BUDGET = Number(process.env.ESV_BUDGET ?? 4500);
// Serve a cached verse for a week; rows are purged at 14 days by the same
// migration's cleanup, keeping us inside API.Bible's cache-clearing rule.
const CACHE_DAYS = 7;

function usfmBook(book: string): string | null {
  const i = (BIBLE_BOOK_ORDER as readonly string[]).findIndex(
    (b) => b.toLowerCase() === book.toLowerCase(),
  );
  return i >= 0 ? USFM_CODES[i] : null;
}

/** Configured versions, as "NIV:78a9f6124f344018-01,NLT:<id>". */
function configuredVersions(): { abbr: string; bibleId: string }[] {
  const raw = process.env.API_BIBLE_VERSIONS;
  if (!raw || !process.env.API_BIBLE_KEY) return [];
  return raw
    .split(",")
    .map((pair) => pair.trim())
    .filter(Boolean)
    .map((pair) => {
      const [abbr, bibleId] = pair.split(":").map((s) => s.trim());
      return { abbr, bibleId };
    })
    // provider check included: an ESV id here would be a misconfiguration,
    // since Crossway serves it and API.Bible doesn't carry it at all.
    .filter(
      (v) =>
        v.abbr && v.bibleId && LICENSED_META[v.abbr]?.provider === "api.bible",
    );
}

/** The ESV needs no version list — Crossway's API serves exactly one text. */
function esvEnabled(): boolean {
  return Boolean(process.env.ESV_API_KEY);
}

export function licensedVersionsEnabled(): boolean {
  return configuredVersions().length > 0 || esvEnabled();
}

/** Which licensed translations are switched on — for the credits page. */
export function configuredLicensedAbbrs(): string[] {
  const abbrs = configuredVersions().map((v) => v.abbr);
  if (esvEnabled()) abbrs.push("ESV");
  return abbrs;
}

/** Service-role client: the cache and counter are ours, not the reader's. */
function db(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey, { auth: { persistSession: false } });
}

/** "2026-08" — API.Bible counts by the month. */
function monthPeriod(): string {
  return new Date().toISOString().slice(0, 7);
}

/** "2026-08-22" — Crossway counts by the day. */
function dayPeriod(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Reserve up to `n` upstream calls against a provider's budget for the current
 * period, returning how many were granted.
 *
 * Fails CLOSED: if the counter is unreachable we make no upstream calls at
 * all. A metered external allowance is worth being strict about — the reader
 * simply sees the public-domain translations instead.
 */
async function reserveCalls(
  client: SupabaseClient,
  provider: string,
  period: string,
  n: number,
  budget: number,
): Promise<number> {
  try {
    const { data, error } = await client.rpc("reserve_api_quota", {
      p_provider: provider,
      p_period: period,
      p_requested: n,
      p_budget: budget,
    });
    if (error) return 0;
    return typeof data === "number" ? data : 0;
  } catch {
    return 0;
  }
}

type CachedRow = { version: string; text: string };

async function readCache(
  client: SupabaseClient,
  ref: string,
  abbrs: string[],
): Promise<Map<string, string>> {
  const fresh = new Date(Date.now() - CACHE_DAYS * 86400_000).toISOString();
  try {
    const { data } = await client
      .from("licensed_verse_cache")
      .select("version, text")
      .eq("ref", ref)
      .in("version", abbrs)
      .gte("fetched_at", fresh);
    return new Map((data ?? []).map((r: CachedRow) => [r.version, r.text]));
  } catch {
    return new Map();
  }
}

async function writeCache(
  client: SupabaseClient,
  rows: { version: string; ref: string; text: string }[],
): Promise<void> {
  if (rows.length === 0) return;
  try {
    await client.from("licensed_verse_cache").upsert(
      rows.map((r) => ({ ...r, fetched_at: new Date().toISOString() })),
      { onConflict: "version,ref" },
    );
  } catch {
    // A cache write failure costs a future call, nothing more.
  }
}

type EsvPassage = { passages?: string[] };

/**
 * Crossway's API, the only place the ESV is served — it is not on API.Bible.
 * Their terms are the same shape as API.Bible's and tighter in places: 5,000
 * queries a day, no more than 500 verses held at a time, never a whole book,
 * and a SEPARATE formal licence for native apps, which we don't hold and don't
 * need (the mobile export strips /api). So this stays one verse per call like
 * everything else here.
 *
 * `include-short-copyright` is off because the sheet renders Crossway's full
 * notice under the rows; leaving it on would print "(ESV)" inside the verse.
 */
async function fetchEsv(book: string, chapter: number, verse: number): Promise<string | null> {
  const params = new URLSearchParams({
    q: `${book} ${chapter}:${verse}`,
    "include-headings": "false",
    "include-footnotes": "false",
    "include-verse-numbers": "false",
    "include-first-verse-numbers": "false",
    "include-passage-references": "false",
    "include-short-copyright": "false",
    "indent-poetry": "false",
  });
  try {
    const res = await fetch(`${ESV_BASE}/passage/text/?${params}`, {
      headers: { Authorization: `Token ${process.env.ESV_API_KEY!}` },
      cache: "no-store", // our Postgres cache is the cache; see the header note
    });
    if (!res.ok) return null;
    const json = (await res.json()) as EsvPassage;
    const text = (json.passages?.[0] ?? "").replace(/\s+/g, " ").trim();
    return text || null;
  } catch {
    return null;
  }
}

type ApiBibleVerse = { data?: { content?: string } };

async function fetchOne(bibleId: string, verseId: string): Promise<string | null> {
  const params = new URLSearchParams({
    "content-type": "text",
    "include-notes": "false",
    "include-titles": "false",
    "include-chapter-numbers": "false",
    "include-verse-numbers": "false",
    "include-verse-spans": "false",
  });
  try {
    const res = await fetch(`${API_BASE}/bibles/${bibleId}/verses/${verseId}?${params}`, {
      headers: { "api-key": process.env.API_BIBLE_KEY! },
      cache: "no-store", // our Postgres cache is the cache; see the header note
    });
    if (!res.ok) return null;
    const json = (await res.json()) as ApiBibleVerse;
    const text = (json.data?.content ?? "").replace(/\s+/g, " ").trim();
    return text || null;
  } catch {
    return null;
  }
}

/**
 * One verse in every configured licensed translation. Returns [] when the
 * feature is off, the budget is spent, or every request failed — callers
 * treat absence as "these translations aren't available", never as an error.
 */
export async function getLicensedVerseVersions(
  book: string,
  chapter: number,
  verse: number,
): Promise<VerseVersion[]> {
  const versions = configuredVersions();
  const esv = esvEnabled();
  if (versions.length === 0 && !esv) return [];

  const code = usfmBook(book);
  if (!code) return [];
  // One key shape for both providers: a cache row is a verse, never more,
  // whichever API it came from.
  const ref = `${code}.${chapter}.${verse}`;

  const client = db();
  if (!client) return []; // no counter, no calls — fail closed

  const abbrs = versions.map((v) => v.abbr);
  if (esv) abbrs.push("ESV");
  const cached = await readCache(client, ref, abbrs);

  const fetched: { version: string; ref: string; text: string }[] = [];

  const misses = versions.filter((v) => !cached.has(v.abbr));
  if (misses.length > 0) {
    // Only misses are metered. A partial grant serves the first versions in
    // configured order rather than a random subset.
    const granted = await reserveCalls(
      client,
      "apibible",
      monthPeriod(),
      misses.length,
      MONTHLY_BUDGET,
    );
    const results = await Promise.all(
      misses.slice(0, granted).map(async ({ abbr, bibleId }) => {
        const text = await fetchOne(bibleId, ref);
        return text ? { version: abbr, ref, text } : null;
      }),
    );
    for (const row of results) if (row) fetched.push(row);
  }

  // A separate account, a separate allowance, counted by the day.
  if (esv && !cached.has("ESV")) {
    const granted = await reserveCalls(client, "esv", dayPeriod(), 1, ESV_DAILY_BUDGET);
    if (granted > 0) {
      const text = await fetchEsv(book, chapter, verse);
      if (text) fetched.push({ version: "ESV", ref, text });
    }
  }

  await writeCache(client, fetched);

  const texts = new Map(cached);
  for (const row of fetched) texts.set(row.version, row.text);

  // Configured order, so the sheet lists them the way the owner chose, with
  // the ESV appended since it isn't part of that list. The sheet sorts them
  // by approach anyway; this only decides ties.
  const out: VerseVersion[] = versions
    .filter((v) => texts.has(v.abbr))
    .map((v) => ({ abbr: v.abbr, name: LICENSED_META[v.abbr].name, text: texts.get(v.abbr)! }));
  if (texts.has("ESV")) {
    out.push({ abbr: "ESV", name: LICENSED_META.ESV.name, text: texts.get("ESV")! });
  }
  return out;
}
