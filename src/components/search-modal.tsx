"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  searchScripture,
  fetchDictionaryIndex,
  type DictIndexEntry,
} from "@/lib/content/client";
import { parseBibleReference, type BibleReference } from "@/lib/bible-reference";
import { chapterReference } from "@/lib/bible-book-order";
import {
  queryTokens,
  escapeRegExp,
  type SearchScope,
  type VerseHit,
} from "@/lib/search/verse-search";

const PAGE_SIZE = 25;
/** How many dictionary matches the modal lists before eliding to the page. */
const DICT_LIMIT = 60;

const SCOPES: { value: SearchScope; label: string }[] = [
  { value: "all", label: "All" },
  { value: "ot", label: "Old Testament" },
  { value: "nt", label: "New Testament" },
];

export function normalizeTitle(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[’']/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function SearchModal({
  open,
  onClose,
  version = "BSB",
  bookChapterCounts,
  initialQuery,
}: {
  open: boolean;
  onClose: () => void;
  version?: string;
  /** Canonical book name -> chapter count, used to reject out-of-range references. */
  bookChapterCounts?: Record<string, number>;
  /** Seed the query on open (the landing dropdown's "all results" hand-off). */
  initialQuery?: string;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<SearchScope>("all");
  // "verses" is the default axis; "dictionary" is the separate axis to the
  // right of the testament scopes — a different corpus, not a verse filter.
  const [mode, setMode] = useState<"verses" | "dictionary">("verses");
  const [dictIndex, setDictIndex] = useState<DictIndexEntry[] | null>(null);
  const [results, setResults] = useState<VerseHit[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [searched, setSearched] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  // Guards against out-of-order responses: only the latest request may land.
  const requestRef = useRef(0);

  // Focus input when modal opens; state resets, seeded with any caller query.
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
      const q = initialQuery ?? "";
      setQuery(q);
      setScope("all");
      setMode("verses");
      setResults([]);
      setTotal(0);
      setSearched(false);
      if (q.trim().length >= 2) doSearch(q, "all");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Load the dictionary search index once, the first time the modal opens.
  useEffect(() => {
    if (open && !dictIndex) fetchDictionaryIndex().then(setDictIndex);
  }, [open, dictIndex]);

  // Dictionary matches for the current query (title substring, prefix-first).
  // Titles are normalized once when the index loads so typing stays cheap.
  const normIndex = useMemo(
    () => (dictIndex ? dictIndex.map((e) => ({ e, n: normalizeTitle(e.title) })) : []),
    [dictIndex],
  );
  const dictMatches = useMemo(() => {
    const q = normalizeTitle(query);
    if (q.length < 2) return [];
    const scored: { e: DictIndexEntry; rank: number }[] = [];
    for (const { e, n } of normIndex) {
      const pos = n.indexOf(q);
      if (pos === -1) continue;
      scored.push({ e, rank: pos === 0 ? 0 : 1 });
    }
    scored.sort((a, b) => a.rank - b.rank || a.e.title.localeCompare(b.e.title));
    return scored.map((s) => s.e);
  }, [normIndex, query]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const doSearch = useCallback(
    (q: string, s: SearchScope) => {
      if (q.trim().length < 2) {
        setResults([]);
        setTotal(0);
        setSearched(false);
        return;
      }
      const requestId = ++requestRef.current;
      setLoading(true);
      searchScripture(q.trim(), version, { limit: PAGE_SIZE, scope: s })
        .then(({ results, total }) => {
          if (requestId !== requestRef.current) return;
          setResults(results);
          setTotal(total);
          setSearched(true);
        })
        .catch(() => {
          if (requestId !== requestRef.current) return;
          setResults([]);
          setTotal(0);
          setSearched(true);
        })
        .finally(() => {
          if (requestId === requestRef.current) setLoading(false);
        });
    },
    [version],
  );

  function handleInput(value: string) {
    setQuery(value);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(value, scope), 350);
  }

  function handleScope(s: SearchScope) {
    setScope(s);
    clearTimeout(debounceRef.current);
    doSearch(query, s);
  }

  function loadMore() {
    const requestId = ++requestRef.current;
    setLoadingMore(true);
    searchScripture(query.trim(), version, {
      limit: PAGE_SIZE,
      offset: results.length,
      scope,
    })
      .then(({ results: more }) => {
        if (requestId !== requestRef.current) return;
        setResults((prev) => prev.concat(more));
      })
      .catch(() => {})
      .finally(() => {
        if (requestId === requestRef.current) setLoadingMore(false);
      });
  }

  function goToEntry(id: string) {
    onClose();
    router.push(`/try/bible/dictionary?entry=${encodeURIComponent(id)}`);
  }

  function goToResult(result: VerseHit) {
    onClose();
    // A phrase hit re-finds and spotlights the exact text via ?highlight=;
    // scattered-word hits land on the verse itself instead (the reader skips
    // scroll-to-verse whenever a highlight jump is pending).
    const target = result.phrase
      ? `&highlight=${encodeURIComponent(query.trim())}`
      : `&verse=${result.verse}`;
    router.push(
      `/try/bible/read?book=${encodeURIComponent(result.book)}&chapter=${result.chapter}&version=${version}${target}`,
    );
  }

  // If the query reads as a reference ("John 3:16", "Ps 23", "1 cor 13"), offer a
  // direct jump above the text results and let Enter go straight there.
  const reference = parseBibleReference(query, bookChapterCounts);
  const referenceLabel = reference
    ? `${chapterReference(reference.book, reference.chapter)}${reference.verse ? `:${reference.verse}` : ""}`
    : "";

  function goToReference(ref: BibleReference) {
    onClose();
    const verseParam = ref.verse ? `&verse=${ref.verse}` : "";
    router.push(
      `/try/bible/read?book=${encodeURIComponent(ref.book)}&chapter=${ref.chapter}&version=${version}${verseParam}`,
    );
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && reference) {
      e.preventDefault();
      goToReference(reference);
    }
  }

  if (!open) return null;

  const tokens = queryTokens(query);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative mx-4 w-full max-w-lg rounded-xl border border-neutral-200 bg-white shadow-2xl dark:border-neutral-700 dark:bg-neutral-900">
        {/* Search input */}
        <div className="flex items-center gap-3 border-b border-neutral-200 px-4 py-3 dark:border-neutral-700">
          <svg
            className="h-5 w-5 shrink-0 text-neutral-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"
            />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => handleInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search the Bible..."
            className="flex-1 bg-transparent text-base text-neutral-900 outline-none placeholder:text-neutral-400 dark:text-neutral-100 dark:placeholder:text-neutral-500"
          />
          {loading && (
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-neutral-300 border-t-amber-500" />
          )}
          <kbd className="hidden rounded bg-neutral-100 px-1.5 py-0.5 text-xs text-neutral-400 dark:bg-neutral-800 sm:inline">
            ESC
          </kbd>
        </div>

        {/* Axis row — testament scopes filter verses; the Dictionary axis
            (set off to the right) switches to the dictionary corpus. */}
        {(searched || loading) && !reference && (
          <div className="flex items-center gap-1.5 border-b border-neutral-100 px-4 py-2 dark:border-neutral-800">
            {SCOPES.map((s) => (
              <button
                key={s.value}
                onClick={() => {
                  setMode("verses");
                  handleScope(s.value);
                }}
                className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                  mode === "verses" && scope === s.value
                    ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
                    : "text-neutral-500 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
                }`}
              >
                {s.label}
              </button>
            ))}
            <span className="mx-0.5 h-4 w-px shrink-0 bg-neutral-200 dark:bg-neutral-700" />
            <button
              onClick={() => setMode("dictionary")}
              className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                mode === "dictionary"
                  ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
                  : "text-neutral-500 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
              }`}
            >
              Dictionary
              {dictMatches.length > 0 && (
                <span
                  className={`rounded-full px-1 text-[10px] tabular-nums ${
                    mode === "dictionary"
                      ? "bg-amber-200/70 text-amber-800 dark:bg-amber-800/60 dark:text-amber-200"
                      : "bg-neutral-200 text-neutral-500 dark:bg-neutral-700 dark:text-neutral-300"
                  }`}
                >
                  {dictMatches.length > 99 ? "99+" : dictMatches.length}
                </span>
              )}
            </button>
            <span className="ml-auto text-xs tabular-nums text-neutral-400">
              {mode === "dictionary"
                ? `${dictMatches.length} ${dictMatches.length === 1 ? "entry" : "entries"}`
                : searched && !loading
                  ? `${total} ${total === 1 ? "verse" : "verses"}`
                  : ""}
            </span>
          </div>
        )}

        {/* Results */}
        <div className="max-h-[50vh] overflow-y-auto">
          {/* Direct reference jump — shown above text results when the query
              parses as a scripture reference. */}
          {reference && (
            <button
              onClick={() => goToReference(reference)}
              className="flex w-full items-center gap-3 border-b border-neutral-100 px-4 py-3 text-left transition-colors hover:bg-amber-50 dark:border-neutral-800 dark:hover:bg-amber-900/20"
            >
              <svg
                className="h-5 w-5 shrink-0 text-amber-500"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
              </svg>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-amber-600 dark:text-amber-400">
                  Go to {referenceLabel}
                </span>
                <span className="block text-xs text-neutral-400">Jump to this passage</span>
              </span>
              <kbd className="hidden rounded bg-neutral-100 px-1.5 py-0.5 text-xs text-neutral-400 dark:bg-neutral-800 sm:inline">
                ↵
              </kbd>
            </button>
          )}
          {mode === "dictionary" && !reference ? (
            dictMatches.length > 0 ? (
              <ul className="py-2">
                {dictMatches.slice(0, DICT_LIMIT).map((e) => (
                  <li key={e.id}>
                    <button
                      onClick={() => goToEntry(e.id)}
                      className="w-full px-4 py-3 text-left transition-colors hover:bg-neutral-50 dark:hover:bg-neutral-800"
                    >
                      <span className="text-sm font-medium text-neutral-800 dark:text-neutral-100">
                        {e.title}
                      </span>
                    </button>
                  </li>
                ))}
                {dictMatches.length > DICT_LIMIT && (
                  <li className="px-4 py-2 text-center text-xs text-neutral-400">
                    Showing {DICT_LIMIT} of {dictMatches.length} — keep typing to
                    narrow
                  </li>
                )}
              </ul>
            ) : (
              <div className="px-4 py-8 text-center text-sm text-neutral-400">
                No dictionary entries found
              </div>
            )
          ) : results.length > 0 ? (
            <>
              <ul className="py-2">
                {results.map((r) => (
                  <li key={`${r.book}-${r.chapter}-${r.verse}`}>
                    <button
                      onClick={() => goToResult(r)}
                      className="w-full px-4 py-3 text-left transition-colors hover:bg-neutral-50 dark:hover:bg-neutral-800"
                    >
                      <span className="text-sm font-semibold text-amber-600 dark:text-amber-400">
                        {chapterReference(r.book, r.chapter)}:{r.verse}
                      </span>
                      <p className="mt-0.5 text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
                        <HighlightedVerse text={r.text} tokens={tokens} />
                      </p>
                    </button>
                  </li>
                ))}
              </ul>
              {results.length < total && (
                <div className="border-t border-neutral-100 p-2 dark:border-neutral-800">
                  <button
                    onClick={loadMore}
                    disabled={loadingMore}
                    className="w-full rounded-lg px-4 py-2 text-sm font-medium text-amber-600 transition-colors hover:bg-amber-50 disabled:opacity-50 dark:text-amber-400 dark:hover:bg-amber-900/20"
                  >
                    {loadingMore
                      ? "Loading..."
                      : `Show more (${total - results.length} remaining)`}
                  </button>
                </div>
              )}
            </>
          ) : !reference && searched && !loading ? (
            <div className="px-4 py-8 text-center text-sm text-neutral-400">
              No results found
            </div>
          ) : !reference && !searched ? (
            <div className="px-4 py-8 text-center text-sm text-neutral-400">
              Type a reference (John 3:16) or search across all books
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/** Verse text with every query word marked, matching on word starts. */
function HighlightedVerse({ text, tokens }: { text: string; tokens: string[] }) {
  if (tokens.length === 0) return <>{text}</>;
  const re = new RegExp(
    `(\\b(?:${tokens.map(escapeRegExp).join("|")})[\\p{L}\\p{N}']*)`,
    "giu",
  );
  const parts = text.split(re);
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <mark
            key={i}
            className="rounded-sm bg-yellow-200/80 px-0.5 text-neutral-900 dark:bg-yellow-400/30 dark:text-neutral-100"
          >
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}
