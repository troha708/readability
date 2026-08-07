"use client";

import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { isChapterUrlSyncSuppressed } from "@/lib/reading-nav-guard";
import {
  getReadingMode,
  setReadingMode,
  saveLastReadUrl,
  type ReadingMode,
} from "@/lib/reading-progress";
import {
  markChapterComplete,
  markReadingComplete,
  loadAllProgress,
  emitMilestone,
} from "@/lib/progress-service";
import { Logo } from "@/components/logo";
import { FormattedChunkText, type SectionHeading } from "./format-chunk-text";
import type { BookIntro } from "@/lib/content/chapter-data";
import { InlineQuiz, type QuizQuestion } from "./inline-quiz";
import { bibleBookSortIndex, chapterUnit, OT_BOOK_ORDER } from "@/lib/bible-book-order";
import { isOverviewAtStart } from "@/lib/overview-placement";
import { parseScriptureRefs } from "@/lib/scripture-refs";
import { VersePeekLink } from "@/components/verse-peek";
import { SITE_URL, GITHUB_URL } from "@/lib/site";
import { createPortal } from "react-dom";
import {
  type HighlightColor,
  type VerseHighlight,
  type HighlightsMap,
  loadHighlights,
  saveHighlight,
  removeHighlight,
  getHighlightsForChapter,
  HIGHLIGHT_COLORS,
  highlightColorInfo,
} from "@/lib/highlights-service";
import { SearchModal } from "@/components/search-modal";
import { SiteFooter } from "@/components/site-footer";
import { FirstContactHint } from "@/components/first-contact-hint";
import { fetchChapter, fetchBookPlaces } from "@/lib/content/client";
import { IS_MOBILE } from "@/lib/build-target";
import type { BookPlaces, ChapterPlaces } from "@/lib/content/places";
import { VerseSheet } from "./verse-sheet";
import { ChapterMapSheet } from "./chapter-map-sheet";

// ── Types ────────────────────────────────────────────────────

type LoadedChapter = {
  chapterNumber: number;
  text: string;
  questions: QuizQuestion[];
  headings: SectionHeading[] | null;
};

type VersionInfo = { abbr: string; name: string };

// One shared empty map, so a chapter with no highlights still gets a stable
// reference and keeps ChapterSection's memo.
const EMPTY_HIGHLIGHTS: Record<number, VerseHighlight> = {};

/** Width of each wide-screen side rail, in px. */
const RAIL_WIDTH = 216;
// The edge tabs (navigation, atlas, tools) share one box so they read as a
// set: same border, same fill, same padding, same size. Only the side they
// round on and their vertical position differ.
const BOX_CLASS =
  "z-10 hidden border border-current bg-white/95 py-3 text-gold backdrop-blur transition-[opacity,color,border-color] duration-300 hover:text-gold-deep dark:bg-neutral-925/95 dark:hover:text-gold-bright xl:block";

// The warm reveal: the edge line lights up AND throws a soft spill sideways
// onto the page — both, but at roughly half the strength of the first cut,
// which was too assertive.
const RAIL_GLOW_LEFT =
  "border-r-amber-500/25 shadow-[8px_0_28px_-12px_rgba(224,184,90,0.22)] dark:border-r-amber-400/20";
const RAIL_GLOW_RIGHT =
  "border-l-amber-500/25 shadow-[-8px_0_28px_-12px_rgba(224,184,90,0.22)] dark:border-l-amber-400/20";

type CompletionAge = "recent" | "fading" | "old";

function getCompletionAge(timestamp: string | undefined): CompletionAge {
  if (!timestamp) return "old";
  const days = (Date.now() - new Date(timestamp).getTime()) / (1000 * 60 * 60 * 24);
  if (days <= 7) return "recent";
  if (days <= 30) return "fading";
  return "old";
}

// Build a standard Bible reference (e.g. "Matthew 6:5-9", or cross-chapter
// "Matthew 6:5-7:2") from the set of selected verses.
function formatReference(
  bookName: string,
  verses: { chapter: number; verse: number }[],
): string {
  if (verses.length === 0) return bookName;
  const sorted = [...verses].sort(
    (a, b) => a.chapter - b.chapter || a.verse - b.verse,
  );
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  if (first.chapter === last.chapter) {
    return first.verse === last.verse
      ? `${bookName} ${first.chapter}:${first.verse}`
      : `${bookName} ${first.chapter}:${first.verse}-${last.verse}`;
  }
  return `${bookName} ${first.chapter}:${first.verse}-${last.chapter}:${last.verse}`;
}

// ── Search phrase spotlight ──────────────────────────────────
//
// A search result jumps to the chapter and briefly highlights the exact matched
// phrase. The phrase is plain text, but the rendered scripture splits it across
// nodes (verse-number sups, divine-name spans, bionic bold), so we concatenate
// the body text nodes, locate the phrase with a whitespace- and quote-tolerant
// regex, then map the match back onto a DOM Range.

function buildPhraseRegex(phrase: string): RegExp | null {
  const trimmed = phrase.trim();
  if (!trimmed) return null;
  const source = trimmed
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&") // escape regex metacharacters
    .replace(/['‘’]/g, "['‘’]") // any apostrophe variant
    .replace(/["“”]/g, '["“”]') // any quote variant
    .replace(/\s+/g, "\\s+"); // tolerate whitespace differences
  try {
    return new RegExp(source, "i");
  } catch {
    return null;
  }
}

function findPhraseRange(root: HTMLElement, phrase: string): Range | null {
  const re = buildPhraseRegex(phrase);
  if (!re) return null;

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const el = node.parentElement;
      if (!el) return NodeFilter.FILTER_REJECT;
      // Skip verse numbers, headings, and buttons — match only the scripture
      // prose the reader sees as body text.
      if (el.closest("[data-verse-num], sup, h3, button")) {
        return NodeFilter.FILTER_REJECT;
      }
      return NodeFilter.FILTER_ACCEPT;
    },
  });

  const map: { node: Text; start: number }[] = [];
  let combined = "";
  let n: Node | null;
  while ((n = walker.nextNode())) {
    const t = n as Text;
    map.push({ node: t, start: combined.length });
    combined += t.nodeValue ?? "";
  }
  if (map.length === 0) return null;

  const m = re.exec(combined);
  if (!m) return null;

  // Binary-search the node whose text run contains a given combined-string index.
  const locate = (idx: number): { node: Text; offset: number } => {
    let lo = 0;
    let hi = map.length - 1;
    let res = 0;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (map[mid].start <= idx) {
        res = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    return { node: map[res].node, offset: idx - map[res].start };
  };

  const startPos = locate(m.index);
  const endPos = locate(m.index + m[0].length);
  const range = document.createRange();
  range.setStart(startPos.node, Math.min(startPos.offset, startPos.node.length));
  range.setEnd(endPos.node, Math.min(endPos.offset, endPos.node.length));
  return range;
}

type HighlightRegistry = {
  set(name: string, highlight: unknown): void;
  delete(name: string): void;
};

// Spotlight a range for ~2s. Prefers the CSS Custom Highlight API (no DOM
// mutation, spans multiple nodes cleanly); where unavailable, flashes the
// phrase's containing block instead. Returns a cleanup function.
function spotlightRange(range: Range): () => void {
  const registry =
    (CSS as unknown as { highlights?: HighlightRegistry }).highlights ?? null;
  const HighlightCtor = (
    window as unknown as { Highlight?: new (r: Range) => unknown }
  ).Highlight;

  if (registry && HighlightCtor) {
    registry.set("search-phrase", new HighlightCtor(range));
    const id = window.setTimeout(() => registry.delete("search-phrase"), 2200);
    return () => {
      window.clearTimeout(id);
      registry.delete("search-phrase");
    };
  }

  const block = range.startContainer.parentElement?.closest(
    "p, li, blockquote, div",
  ) as HTMLElement | null;
  if (block) {
    block.classList.add("verse-flash");
    const id = window.setTimeout(() => block.classList.remove("verse-flash"), 2500);
    return () => {
      window.clearTimeout(id);
      block.classList.remove("verse-flash");
    };
  }
  return () => {};
}

// ── Icons ────────────────────────────────────────────────────

function SunIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="5" />
      <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

// ── ChapterSection ───────────────────────────────────────────

type ChapterSectionProps = {
  bookName: string;
  chapter: LoadedChapter;
  bionic: boolean;
  showCrossRefs: boolean;
  redLetter: boolean;
  fontSize: number;
  mode: ReadingMode;
  chapterHighlights: Record<number, VerseHighlight>;
  onHeadingMount: (chNum: number, el: HTMLElement | null) => void;
  onReadingComplete: (chNum: number) => void;
  onNextChapter: (chNum: number) => void;
  onSkipQuiz: (chNum: number) => void;
  onSwitchToReadMode: (chNum: number) => void;
};

const ChapterSection = React.memo(function ChapterSection({
  bookName,
  chapter,
  bionic,
  showCrossRefs,
  redLetter,
  fontSize,
  mode,
  chapterHighlights,
  onHeadingMount,
  onReadingComplete,
  onNextChapter,
  onSkipQuiz,
  onSwitchToReadMode,
}: ChapterSectionProps) {
  const { chapterNumber, text, questions, headings } = chapter;
  const endSentinelRef = useRef<HTMLDivElement>(null);
  const readMarkedRef = useRef(false);

  const headingCallbackRef = useCallback(
    (el: HTMLElement | null) => onHeadingMount(chapterNumber, el),
    [chapterNumber, onHeadingMount],
  );

  // Use refs for callbacks to avoid stale closures in the observer
  const onReadingCompleteRef = useRef(onReadingComplete);
  const onNextChapterRef = useRef(onNextChapter);
  const modeRef = useRef(mode);
  useEffect(() => { onReadingCompleteRef.current = onReadingComplete; }, [onReadingComplete]);
  useEffect(() => { onNextChapterRef.current = onNextChapter; }, [onNextChapter]);
  useEffect(() => { modeRef.current = mode; }, [mode]);

  useEffect(() => {
    const el = endSentinelRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !readMarkedRef.current) {
          readMarkedRef.current = true;
          onReadingCompleteRef.current(chapterNumber);
          if (modeRef.current === "read") {
            onNextChapterRef.current(chapterNumber);
          }
        }
      },
      { threshold: 0.1 },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [chapterNumber]);

  return (
    <section className="mb-16" data-chapter={chapterNumber}>
      <article
        ref={headingCallbackRef}
        className="max-w-none font-scripture font-[450] text-neutral-800 dark:font-normal dark:text-neutral-300"
        style={{ fontSize: `${fontSize}px` }}
      >
        <FormattedChunkText
          chunkText={text}
          bionic={bionic}
          showCrossRefs={showCrossRefs}
          redLetter={redLetter}
          highlights={chapterHighlights}
          headings={headings ?? undefined}
          chapterNumber={chapterNumber}
        />
      </article>

      {/* End-of-chapter sentinel — triggers reading complete */}
      <div ref={endSentinelRef} className="h-2" />

      {/* Inline quiz (study mode only) */}
      {mode === "study" && (
        <div className="mt-8">
          <InlineQuiz
            bookName={bookName}
            chapterNumber={chapterNumber}
            questions={questions}
            onComplete={() => onNextChapter(chapterNumber)}
            onSkip={() => onSkipQuiz(chapterNumber)}
            onSwitchToRead={() => onSwitchToReadMode(chapterNumber)}
          />
        </div>
      )}
    </section>
  );
});

// ── NotesDrawer ─────────────────────────────────────────────

function NotesDrawer({
  bookName,
  highlights,
  onClose,
  onScrollToVerse,
}: {
  bookName: string;
  highlights: HighlightsMap;
  onClose: () => void;
  onScrollToVerse: (chapter: number, verse: number) => void;
}) {
  // Filter highlights for current book, group consecutive same-color/note verses into ranges
  const rawHighlights: { chapter: number; verse: number; hl: VerseHighlight }[] = [];
  for (const [key, hl] of Object.entries(highlights)) {
    const parts = key.split(":");
    if (parts[0] === bookName) {
      rawHighlights.push({
        chapter: parseInt(parts[1], 10),
        verse: parseInt(parts[2], 10),
        hl,
      });
    }
  }
  rawHighlights.sort((a, b) => a.chapter - b.chapter || a.verse - b.verse);

  // Group consecutive verses with same chapter, color, and note into ranges
  type VerseRange = { chapter: number; startVerse: number; endVerse: number; hl: VerseHighlight };
  const groupedHighlights: VerseRange[] = [];
  for (const h of rawHighlights) {
    const last = groupedHighlights[groupedHighlights.length - 1];
    if (
      last &&
      last.chapter === h.chapter &&
      last.hl.color === h.hl.color &&
      last.hl.note === h.hl.note &&
      h.verse === last.endVerse + 1
    ) {
      last.endVerse = h.verse;
    } else {
      groupedHighlights.push({ chapter: h.chapter, startVerse: h.verse, endVerse: h.verse, hl: h.hl });
    }
  }

  const chapters = [...new Set(groupedHighlights.map((h) => h.chapter))].sort((a, b) => a - b);

  return (
    <div className="border-b border-neutral-200 bg-neutral-50 px-4 py-4 dark:border-neutral-700 dark:bg-neutral-800">
      <div className="mx-auto max-w-2xl">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-bold text-neutral-700 dark:text-neutral-200">
            Highlights & Notes — {bookName}
          </h2>
          <button
            onClick={onClose}
            aria-label="Close highlights and notes"
            className="rounded-md p-1 text-neutral-400 hover:bg-neutral-200 hover:text-neutral-600 dark:hover:bg-neutral-700 dark:hover:text-neutral-300"
          >
            ×
          </button>
        </div>

        {groupedHighlights.length === 0 ? (
          <div className="py-6 text-center">
            <p className="text-sm text-neutral-400 dark:text-neutral-500">
              No highlights yet.
            </p>
            <p className="mt-1 text-xs text-neutral-400 dark:text-neutral-500">
              Select any text while reading, then pick a color to highlight it.
            </p>
          </div>
        ) : (
          <div className="max-h-72 space-y-4 overflow-y-auto pr-1">
            {chapters.map((ch) => (
              <div key={ch}>
                <p className="mb-1.5 text-xs font-bold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
                  {chapterUnit(bookName)} {ch}
                </p>
                <div className="space-y-1.5">
                  {groupedHighlights
                    .filter((h) => h.chapter === ch)
                    .map((h) => {
                      const colorInfo = highlightColorInfo(h.hl.color);
                      const verseLabel = h.startVerse === h.endVerse
                        ? `${h.startVerse}`
                        : `${h.startVerse}-${h.endVerse}`;
                      return (
                        <button
                          key={`${h.chapter}:${h.startVerse}-${h.endVerse}`}
                          onClick={() => onScrollToVerse(h.chapter, h.startVerse)}
                          className={`block w-full rounded-lg px-3 py-2 text-left transition-all hover:ring-1 hover:ring-inset ${colorInfo.bg} ${colorInfo.ring.replace("ring-", "hover:ring-")}`}
                        >
                          <div className="flex items-center gap-2">
                            <span className={`inline-block h-2.5 w-2.5 rounded-full ${colorInfo.dot}`} />
                            <span className="text-xs font-bold text-neutral-700 dark:text-neutral-200">
                              {bookName} {ch}:{verseLabel}
                            </span>
                            <span className="text-[0.6rem] text-neutral-400 dark:text-neutral-500">
                              tap to jump
                            </span>
                          </div>
                          {h.hl.note && (
                            <p className="mt-1 pl-[18px] text-sm leading-snug text-neutral-600 dark:text-neutral-300">
                              {h.hl.note}
                            </p>
                          )}
                        </button>
                      );
                    })}
                </div>
              </div>
            ))}
          </div>
        )}

        <Link
          href="/try/bible/highlights"
          className="mt-3 flex items-center justify-center gap-1.5 rounded-lg border border-neutral-200 py-2 text-xs font-semibold text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-700 dark:border-neutral-600 dark:text-neutral-400 dark:hover:bg-neutral-700 dark:hover:text-neutral-200"
        >
          View all notes
          <span aria-hidden="true">→</span>
        </Link>
      </div>
    </div>
  );
}

// ── Shared reader controls ───────────────────────────────────
//
// The narrow-screen sticky header and the wide-screen side panels show the same
// controls in different furniture, so the bodies live here and each layout
// supplies its own container.

const MENU_HOVER = "hover:bg-neutral-100 dark:hover:bg-neutral-700";
const MENU_RULE = "my-1 h-px bg-neutral-100 dark:bg-neutral-700";
// Rows in the wide-screen rails sit on the page ground, not a raised menu, so
// they hover one step darker than menu items do.
const PANEL_ROW_HOVER =
  "hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-200";

function ToggleRow({
  label,
  on,
  onClick,
}: {
  label: string;
  on: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left ${MENU_HOVER}`}
    >
      <span className="text-xs font-medium tracking-[0.25px] text-neutral-500 dark:text-neutral-400">
        {label}
      </span>
      <span
        className={`flex h-5 w-9 items-center rounded-full p-0.5 transition-colors ${
          on ? "bg-amber-500" : "bg-neutral-300 dark:bg-neutral-600"
        }`}
      >
        <span
          className={`h-4 w-4 rounded-full bg-white shadow transition-transform ${
            on ? "translate-x-4" : "translate-x-0"
          }`}
        />
      </span>
    </button>
  );
}

type SettingsControlsProps = {
  mode: ReadingMode;
  onMode: (m: ReadingMode) => void;
  fontSize: number;
  fontSizeMin: number;
  fontSizeMax: number;
  onFontSize: (delta: number) => void;
  dark: boolean;
  onToggleTheme: () => void;
  bionic: boolean;
  onToggleBionic: () => void;
  verseNumbers: boolean;
  onToggleVerseNumbers: () => void;
  redLetter: boolean;
  onToggleRedLetter: () => void;
  showCrossRefs: boolean;
  onToggleCrossRefs: () => void;
  versionAbbr: string;
  availableVersions: VersionInfo[];
  onPickVersion: (abbr: string) => void;
  /**
   * Whether the translation list belongs in this menu. The narrow-screen header
   * has nowhere else to put it; the wide-screen rail lists it in the open, so
   * there it must not also be buried here.
   */
  includeTranslation: boolean;
  /**
   * The side-rail auto-hide switch, offered only by the rails' own menu — there
   * are no rails on a narrow screen for it to govern.
   */
  autoHideRails?: boolean;
  onToggleAutoHideRails?: () => void;
};

function SettingsControls({
  mode,
  onMode,
  fontSize,
  fontSizeMin,
  fontSizeMax,
  onFontSize,
  dark,
  onToggleTheme,
  bionic,
  onToggleBionic,
  verseNumbers,
  onToggleVerseNumbers,
  redLetter,
  onToggleRedLetter,
  showCrossRefs,
  onToggleCrossRefs,
  versionAbbr,
  availableVersions,
  onPickVersion,
  includeTranslation,
  autoHideRails,
  onToggleAutoHideRails,
}: SettingsControlsProps) {
  return (
    <>
      {/* Reading mode */}
      <div className="flex items-center justify-between px-2 py-1.5">
        <span className="text-xs font-medium tracking-[0.25px] text-neutral-500 dark:text-neutral-400">Mode</span>
        <div className="inline-flex rounded-md bg-neutral-100 p-0.5 dark:bg-neutral-700">
          {(["read", "study"] as const).map((m) => (
            <button
              key={m}
              onClick={() => onMode(m)}
              className={`rounded px-2.5 py-1 text-xs font-medium tracking-[0.25px] capitalize leading-none transition-all ${
                mode === m
                  ? "bg-white text-amber-700 shadow-sm dark:bg-neutral-600 dark:text-amber-400"
                  : "text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-300"
              }`}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      <div className={MENU_RULE} />

      {/* Text size */}
      <div className="flex items-center justify-between px-2 py-1.5">
        <span className="text-xs font-medium tracking-[0.25px] text-neutral-500 dark:text-neutral-400">Text size</span>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => onFontSize(-1)}
            disabled={fontSize <= fontSizeMin}
            aria-label="Decrease font size"
            className={`flex h-7 w-7 items-center justify-center rounded text-sm font-medium tracking-[0.25px] text-neutral-600 disabled:cursor-not-allowed disabled:opacity-30 dark:text-neutral-300 ${MENU_HOVER}`}
          >
            −
          </button>
          <span className="min-w-[3ch] text-center text-xs font-medium tracking-[0.25px] tabular-nums text-neutral-700 dark:text-neutral-200">
            {fontSize}
          </span>
          <button
            onClick={() => onFontSize(1)}
            disabled={fontSize >= fontSizeMax}
            aria-label="Increase font size"
            className={`flex h-7 w-7 items-center justify-center rounded text-sm font-medium tracking-[0.25px] text-neutral-600 disabled:cursor-not-allowed disabled:opacity-30 dark:text-neutral-300 ${MENU_HOVER}`}
          >
            +
          </button>
        </div>
      </div>

      {/* Theme */}
      <button
        onClick={onToggleTheme}
        className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left ${MENU_HOVER}`}
      >
        <span className="text-xs font-medium tracking-[0.25px] text-neutral-500 dark:text-neutral-400">Theme</span>
        <span className="flex items-center gap-1.5 text-xs font-medium text-neutral-700 dark:text-neutral-200">
          {dark ? <SunIcon /> : <MoonIcon />}
          {dark ? "Light" : "Dark"}
        </span>
      </button>

      <ToggleRow label="Bionic reading" on={bionic} onClick={onToggleBionic} />
      <ToggleRow label="Verse numbers" on={verseNumbers} onClick={onToggleVerseNumbers} />
      <ToggleRow label="Red letters" on={redLetter} onClick={onToggleRedLetter} />
      {/* Cross-references (BSB only) */}
      {versionAbbr === "BSB" && (
        <ToggleRow
          label="Cross-references"
          on={showCrossRefs}
          onClick={onToggleCrossRefs}
        />
      )}
      {onToggleAutoHideRails && (
        <ToggleRow
          label="Hide side panels"
          on={!!autoHideRails}
          onClick={onToggleAutoHideRails}
        />
      )}

      {includeTranslation && (
        <>
          <div className={MENU_RULE} />
          <TranslationList
            versions={availableVersions}
            current={versionAbbr}
            onPick={onPickVersion}
          />
        </>
      )}
    </>
  );
}

/**
 * The translation choices, one per row: abbreviation then full name. Shown
 * inside the settings menu on narrow screens and directly in the wide-screen
 * right rail, so both read identically.
 */
function TranslationList({
  versions,
  current,
  onPick,
  hover = MENU_HOVER,
}: {
  versions: VersionInfo[];
  current: string;
  onPick: (abbr: string) => void;
  hover?: string;
}) {
  return (
    <>
      <div className="px-2 pb-1 pt-0.5 text-xs font-medium tracking-[0.25px] text-neutral-500 dark:text-neutral-400">
        Translation
      </div>
      {versions.map((v) => (
        <button
          key={v.abbr}
          onClick={() => onPick(v.abbr)}
          className={`block w-full rounded-md px-2 py-1.5 text-left text-sm font-medium tracking-[0.25px] ${hover} ${
            v.abbr === current
              ? "font-semibold text-amber-700 dark:text-amber-400"
              : "text-neutral-700 dark:text-neutral-300"
          }`}
        >
          <span className="font-medium">{v.abbr}</span>{" "}
          <span className="text-neutral-500 dark:text-neutral-400">{v.name}</span>
        </button>
      ))}
    </>
  );
}

function BookMenu({
  books,
  firstNtBook,
  current,
  onPick,
}: {
  books: string[];
  firstNtBook: string | undefined;
  current: string;
  onPick: (name: string) => void;
}) {
  return (
    <>
      {books.map((name) => (
        <React.Fragment key={name}>
          {name === firstNtBook && (
            <div className="my-1 flex items-center gap-2 px-3 py-0.5">
              <span className="h-px flex-1 bg-neutral-200 dark:bg-neutral-700" />
              <span className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
                New Testament
              </span>
              <span className="h-px flex-1 bg-neutral-200 dark:bg-neutral-700" />
            </div>
          )}
          <button
            onClick={() => onPick(name)}
            className={`block w-full px-3 py-1.5 text-left text-sm font-medium tracking-[0.25px] hover:bg-neutral-100 dark:hover:bg-neutral-700 ${
              name === current
                ? "font-semibold text-amber-700 dark:text-amber-400"
                : "text-neutral-700 dark:text-neutral-300"
            }`}
          >
            {name}
          </button>
        </React.Fragment>
      ))}
    </>
  );
}

// ── Book overview body ───────────────────────────────────────

// Calmer than the dotted underline notes use: the intros are far more
// reference-dense, so the links sit quietly in the amber prose and only firm
// up on hover, rather than turning the essay into a field of underlines.
const OVERVIEW_REF_CLASS =
  "cursor-pointer underline decoration-dotted decoration-amber-700/30 underline-offset-2 transition-colors hover:decoration-amber-700/70 dark:decoration-amber-400/25 dark:hover:decoration-amber-400/60";

/**
 * Renders overview prose with its scripture references (both "Mark 1:1" and
 * bare same-book "8:27-33" forms) turned into verse-peek links. No current
 * chapter is passed: a whole-book intro has none on screen, so every reference
 * is a live jump.
 */
function linkifyOverview(
  text: string,
  book: string,
  versionAbbr: string,
): React.ReactNode {
  const refs = parseScriptureRefs(text, book);
  if (refs.length === 0) return text;
  const nodes: React.ReactNode[] = [];
  let last = 0;
  refs.forEach((r, i) => {
    if (r.index > last) nodes.push(text.slice(last, r.index));
    nodes.push(
      <VersePeekLink
        key={i}
        reference={r}
        versionAbbr={versionAbbr}
        className={OVERVIEW_REF_CLASS}
      >
        {text.slice(r.index, r.index + r.length)}
      </VersePeekLink>,
    );
    last = r.index + r.length;
  });
  if (last < text.length) nodes.push(text.slice(last));
  return <>{nodes}</>;
}

/**
 * The start-of-book overview: the Tyndale introduction (Purpose/Author/Date/
 * Setting sidebar plus the introductory essay) on the web reader, or a legacy
 * summary string on the offline reader until its bundle is rebuilt.
 */
function BookOverviewBody({
  bookName,
  intro,
  summary,
  fontSize,
  versionAbbr,
}: {
  bookName: string;
  intro?: BookIntro | null;
  summary?: string | null;
  fontSize: number;
  versionAbbr: string;
}) {
  if (!intro) {
    return (
      <>
        <h2 className="mb-4 text-lg font-bold text-amber-800 dark:text-amber-300">
          {bookName}
        </h2>
        {(summary ?? "").split("\n\n").map((paragraph, i) => (
          <p
            key={i}
            className="mb-4 font-scripture font-[450] leading-relaxed text-neutral-800 last:mb-0 dark:font-normal dark:text-neutral-300"
            style={{ fontSize: `${fontSize}px` }}
          >
            {linkifyOverview(paragraph, bookName, versionAbbr)}
          </p>
        ))}
      </>
    );
  }

  return (
    <>
      <h2 className="mb-4 text-lg font-bold text-amber-800 dark:text-amber-300">
        {bookName}
      </h2>
      {intro.fields.length > 0 && (
        <dl className="mb-5">
          {intro.fields.map((f) => (
            <div key={f.label} className="mb-2 last:mb-0">
              <dt className="text-[0.7rem] font-bold uppercase tracking-widest text-amber-800 dark:text-amber-400/90">
                {f.label}
              </dt>
              <dd
                className="font-scripture font-[450] leading-relaxed text-neutral-800 dark:font-normal dark:text-neutral-300"
                style={{ fontSize: `${fontSize}px` }}
              >
                {linkifyOverview(f.value, bookName, versionAbbr)}
              </dd>
            </div>
          ))}
        </dl>
      )}
      {intro.sections.map((section, si) => (
        <div key={si} className="mb-5 last:mb-0">
          {section.heading && (
            <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-amber-800 dark:text-amber-300">
              {section.heading}
            </h3>
          )}
          {section.paragraphs.map((paragraph, pi) => (
            <p
              key={pi}
              className="mb-3 font-scripture font-[450] leading-relaxed text-neutral-800 last:mb-0 dark:font-normal dark:text-neutral-300"
              style={{ fontSize: `${fontSize}px` }}
            >
              {linkifyOverview(paragraph, bookName, versionAbbr)}
            </p>
          ))}
        </div>
      ))}
      <p className="mt-6 text-[11px] text-amber-700 dark:text-amber-400/60">
        Adapted from{" "}
        <a
          href="https://tyndaleopenresources.com/"
          target="_blank"
          rel="noopener noreferrer"
          className="underline decoration-amber-400/50 underline-offset-2 hover:text-amber-800 dark:hover:text-amber-300"
        >
          Tyndale Open Study Notes
        </a>
        , © Tyndale House Publishers (CC BY-SA 4.0)
      </p>
    </>
  );
}

// ── ChunkReader ──────────────────────────────────────────────

type Props = {
  bookName: string;
  initialChapterNumber: number;
  initialText: string;
  initialQuestions: QuizQuestion[];
  initialHeadings: SectionHeading[] | null;
  // The start-of-book overview: the Tyndale intro on the web reader; the offline
  // (mobile) reader still passes a legacy summary string until its bundle is
  // rebuilt. Exactly one is set.
  bookIntro?: BookIntro | null;
  bookSummary?: string | null;
  scrollToOverview?: boolean;
  versionAbbr: string;
  versionName: string;
  availableVersions: VersionInfo[];
  chapterNumbers: number[];
  allBookNames: string[];
};

export function ChunkReader({
  bookName,
  initialChapterNumber,
  initialText,
  initialQuestions,
  initialHeadings,
  bookIntro,
  bookSummary,
  scrollToOverview,
  versionAbbr,
  availableVersions,
  chapterNumbers,
  allBookNames,
}: Props) {
  const router = useRouter();
  // Read reactively (not just at mount) so a search jump lands even when the
  // target is the chapter already on screen — same book+chapter keeps the same
  // component key, so ChunkReader doesn't remount and a mount-only effect never
  // fires.
  const highlightParam = useSearchParams().get("highlight");

  // Display settings
  const [dark, setDark] = useState(false);
  const [bionic, setBionic] = useState(false);
  // Verse-number superscripts can be hidden for a more natural read (default on).
  const [verseNumbers, setVerseNumbers] = useState(true);
  // BSB ships cross-references (parallel passages) beside section headings.
  // Off by default; readers can opt in via the settings menu under BSB.
  const [showCrossRefs, setShowCrossRefs] = useState(false);
  // Words of Jesus carry <wj> markup where the source text provides it.
  // Rendered in the normal body colour by default; opt-in via settings.
  const [redLetter, setRedLetter] = useState(false);
  const [mode, setMode] = useState<ReadingMode>("read");
  const [fontSize, setFontSize] = useState(17);
  const FONT_SIZE_MIN = 14;
  const FONT_SIZE_MAX = 28;
  const FONT_SIZE_STEP = 1;

  // Continuous chapter state
  const [loadedChapters, setLoadedChapters] = useState<LoadedChapter[]>([
    {
      chapterNumber: initialChapterNumber,
      text: initialText,
      questions: initialQuestions,
      headings: initialHeadings,
    },
  ]);
  const [loadingNext, setLoadingNext] = useState(false);
  const [visibleChapterNumber, setVisibleChapterNumber] = useState(initialChapterNumber);
  const visibleChapterRef = useRef(initialChapterNumber);

  // Track loaded chapter numbers to prevent duplicates
  const loadedChapterNums = useRef<Set<number>>(new Set([initialChapterNumber]));
  const loadingRef = useRef(false);
  const [loadingPrev, setLoadingPrev] = useState(false);
  const loadingPrevRef = useRef(false);
  const topSentinelRef = useRef<HTMLDivElement>(null);
  const pendingScrollAdjust = useRef<{ anchor: HTMLElement; top: number } | null>(null);

  // Progress for chapter strip coloring
  const [chapterTimestamps, setChapterTimestamps] = useState<Record<string, string>>({});
  const [readDone, setReadDone] = useState<Record<string, boolean>>({});
  const [quizDone, setQuizDone] = useState<Record<string, boolean>>({});

  // Highlights state
  const [allHighlights, setAllHighlights] = useState<HighlightsMap>({});
  const [notesDrawerOpen, setNotesDrawerOpen] = useState(false);

  // Search
  const [searchOpen, setSearchOpen] = useState(false);

  // ── Auto-hiding side rails (wide screens, pointer devices) ──
  //
  // Default is on. The rails fold off-canvas and come back when the cursor
  // reaches either edge, so the scripture has the screen to itself while
  // you're reading it. Off pins them open, which is the old behaviour.
  const [autoHideRails, setAutoHideRails] = useState(false);
  const [leftRailOpen, setLeftRailOpen] = useState(true);
  const [rightRailOpen, setRightRailOpen] = useState(true);

  // A rail must not fold away while one of its own menus is open. Kept in a
  // ref because the mousemove handler below must not re-bind on every toggle.
  // (Assigned further down, once the dropdown state exists.)
  const railMenuOpenRef = useRef(false);
  // Until the opening beat has run, the cursor may bring a rail out but must
  // not put one away — otherwise dismissing the map coachmark (which leaves
  // the cursor mid-screen) folds them instantly and the beat never happens.
  const introFoldedRef = useRef(false);

  useEffect(() => {
    // Touch-only devices have no cursor to bring the rails back, so there they
    // stay pinned whatever the setting says.
    if (!window.matchMedia?.("(hover: hover)").matches) return;
    setAutoHideRails(localStorage.getItem("readerAutoHideRails") !== "false");
  }, []);

  function toggleAutoHideRails() {
    const next = !autoHideRails;
    setAutoHideRails(next);
    localStorage.setItem("readerAutoHideRails", String(next));
    if (!next) {
      setLeftRailOpen(true);
      setRightRailOpen(true);
    }
  }

  // The opening beat: rails start open, and fold once the reader has had a
  // moment — after the map coachmark is dismissed if one is due, since losing
  // the panels while reading a coachmark would be two things at once.
  useEffect(() => {
    if (!autoHideRails) return;
    let settle: number | undefined;
    const fold = () => {
      introFoldedRef.current = true;
      setLeftRailOpen(false);
      setRightRailOpen(false);
    };
    const alreadySeen = (() => {
      try {
        return !!localStorage.getItem("hint-map-seen");
      } catch {
        return true;
      }
    })();
    if (alreadySeen) {
      settle = window.setTimeout(fold, 1600);
      return () => window.clearTimeout(settle);
    }
    const onDismissed = () => {
      settle = window.setTimeout(fold, 1000);
    };
    window.addEventListener("first-contact-dismissed", onDismissed, { once: true });
    // The hint only appears on chapters that have places; don't wait forever
    // on one that doesn't.
    const fallback = window.setTimeout(fold, 7000);
    return () => {
      window.removeEventListener("first-contact-dismissed", onDismissed);
      window.clearTimeout(settle);
      window.clearTimeout(fallback);
    };
  }, [autoHideRails]);

  // Cursor to an edge unfolds that rail; back toward the middle folds it away.
  // The two thresholds are deliberately far apart — a single boundary makes
  // the rail flicker when the cursor sits on it.
  useEffect(() => {
    if (!autoHideRails) return;
    const REVEAL = 80; // within this of the edge → open
    const RELEASE = RAIL_WIDTH + 64; // past the rail by this much → close
    function onMove(e: MouseEvent) {
      const w = window.innerWidth;
      const held = railMenuOpenRef.current || !introFoldedRef.current;
      setLeftRailOpen((open) =>
        e.clientX <= REVEAL ? true : !held && e.clientX > RELEASE ? false : open,
      );
      setRightRailOpen((open) =>
        e.clientX >= w - REVEAL ? true : !held && e.clientX < w - RELEASE ? false : open,
      );
    }
    window.addEventListener("mousemove", onMove, { passive: true });
    return () => window.removeEventListener("mousemove", onMove);
  }, [autoHideRails]);

  // Fullscreen — a wide-screen reading control (the native app is already
  // fullscreen, and phone browsers don't offer it). Never persisted: the API
  // only grants fullscreen from a user gesture, so a saved preference could
  // not be restored on load anyway. `available` is read after mount because
  // document.fullscreenEnabled doesn't exist during SSR.
  const [fullscreen, setFullscreen] = useState(false);
  const [fullscreenAvailable, setFullscreenAvailable] = useState(false);

  useEffect(() => {
    setFullscreenAvailable(!!document.fullscreenEnabled);
    // The reader isn't the only way out of fullscreen — Esc and the browser's
    // own control bypass the button entirely — so the label follows the
    // document rather than the click.
    const sync = () => setFullscreen(!!document.fullscreenElement);
    sync();
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);

  const toggleFullscreen = useCallback(() => {
    // Both calls reject when the gesture isn't trusted or the browser blocks
    // it; there's nothing to recover, and the change listener above keeps the
    // label honest either way.
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    else void document.documentElement.requestFullscreen().catch(() => {});
  }, []);

  // Chapter map — the whole book's place index is fetched once, so the Map
  // button can show/hide instantly as the visible chapter changes. The open
  // sheet holds a snapshot: scrolling the reader behind it must not swap or
  // unmount the map mid-interaction.
  const [bookPlaces, setBookPlaces] = useState<BookPlaces | null>(null);
  const [mapSheet, setMapSheet] = useState<{ chapter: number; data: ChapterPlaces } | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setSearchOpen((o) => !o);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setBookPlaces(null);
    setMapSheet(null);
    fetchBookPlaces(bookName).then((p) => {
      if (!cancelled) setBookPlaces(p);
    });
    return () => {
      cancelled = true;
    };
  }, [bookName]);

  const chapterPlaces = bookPlaces?.[String(visibleChapterNumber)] ?? null;
  // How many places this chapter puts on the map. Located places only — the
  // `unlocated` list is names the dataset can't site, so they're nothing to go
  // and see, which is what the count on the atlas tab is promising.
  const placeCount = chapterPlaces?.places.length ?? 0;

  // Scroll the reader to a verse (used by the notes drawer and chapter map);
  // falls back to the chapter heading, or navigates if it isn't loaded.
  function scrollToVerse(chapter: number, verse: number) {
    const section = contentRef.current?.querySelector(`section[data-chapter="${chapter}"]`);
    if (section) {
      const el = section.querySelector(`[data-verse-num="${verse}"]`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        return;
      }
      section.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    navigateReadUrl(readUrl({ chapter }));
  }

  // Dropdown state. The book picker and the settings menu each exist twice —
  // once in the narrow-screen header, once in a wide-screen panel — and share
  // their open state, so outside-click detection has to know both containers.
  const [bookOpen, setBookOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const bookRef = useRef<HTMLDivElement>(null);
  const panelBookRef = useRef<HTMLDivElement>(null);
  const settingsRef = useRef<HTMLDivElement>(null);
  const panelSettingsRef = useRef<HTMLDivElement>(null);

  // Feeds the rail auto-hide: an open picker or settings menu holds its rail
  // out even when the cursor wanders back toward the middle.
  useEffect(() => {
    railMenuOpenRef.current = bookOpen || settingsOpen;
  }, [bookOpen, settingsOpen]);

  // Header height — drives the notes drawer's sticky offset so its top isn't
  // hidden behind the (variable-height) header.
  const headerRef = useRef<HTMLElement>(null);
  const [headerHeight, setHeaderHeight] = useState(57);
  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const update = () => setHeaderHeight(el.offsetHeight);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Chapter strip (narrow screens) and its wide-screen counterpart, the chapter
  // grid in the left panel. Both are always in the DOM — only one is displayed —
  // so each keeps its own refs rather than fighting over one.
  const chapterStripRef = useRef<HTMLDivElement>(null);
  const activeChapterRef = useRef<HTMLAnchorElement>(null);
  const panelChapterListRef = useRef<HTMLDivElement>(null);
  const panelActiveChapterRef = useRef<HTMLAnchorElement>(null);
  const [chapterStripJustify, setChapterStripJustify] = useState<"center" | "flex-start">("center");

  // Chapter heading elements for scroll detection
  const headingRefs = useRef<Map<number, HTMLElement>>(new Map());

  // Book overview section. The overview is now the Tyndale book introduction and
  // renders at the start of every book (see lib/overview-placement); the offline
  // reader may still pass a legacy summary string instead.
  const hasOverview = !!bookIntro || !!bookSummary;
  const overviewAtStart = hasOverview && isOverviewAtStart(bookName);
  const [summaryVisible, setSummaryVisible] = useState(false);
  // Start-placed overviews render collapsed so they don't wall off the scripture;
  // one tap (or arriving via an overview link) expands them.
  const [overviewExpanded, setOverviewExpanded] = useState(false);
  const summaryHeadingRef = useRef<HTMLDivElement>(null);
  const summaryStripRef = useRef<HTMLButtonElement>(null);

  const sortedBooks = [...allBookNames].sort(
    (a, b) => bibleBookSortIndex(a) - bibleBookSortIndex(b),
  );
  // First New Testament book in the sorted list, used to draw an OT/NT divider.
  const firstNtBook = sortedBooks.find(
    (n) => bibleBookSortIndex(n) >= OT_BOOK_ORDER.length,
  );

  // ── Init ──────────────────────────────────────────────────

  // Continue Reading anchoring: whether this session has saved a position yet
  // (deep-linked visits defer to the first interaction), and a pending
  // debounced save's chapter so a completion can flush it first.
  const lastReadSavedRef = useRef(false);
  const pendingLastReadRef = useRef<number | null>(null);

  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
    setBionic(localStorage.getItem("bionic") === "true");
    setVerseNumbers(localStorage.getItem("verseNumbers") !== "false");
    setShowCrossRefs(localStorage.getItem("bsbCrossRefs") === "true");
    setRedLetter(localStorage.getItem("redLetter") === "true");
    setMode(getReadingMode());
    const saved = localStorage.getItem("bibleFontSize");
    if (saved) {
      const n = parseInt(saved, 10);
      if (n >= FONT_SIZE_MIN && n <= FONT_SIZE_MAX) setFontSize(n);
    }
    // Anchor Continue Reading on this open — unless it's a ?verse=/?highlight=
    // deep link (shared quote, cross-ref chip, search hit, highlight
    // back-link). Those are look-ups, not a chosen reading position: they
    // anchor only on the visitor's first interaction (see the intent
    // listeners), so a glance-and-leave never moves the Continue button, the
    // daily reminder, or the landing redirect off the real frontier.
    const q = new URLSearchParams(window.location.search);
    if (!q.has("verse") && !q.has("highlight")) {
      lastReadSavedRef.current = true;
      saveLastReadUrl(`/try/bible/read?book=${encodeURIComponent(bookName)}&chapter=${initialChapterNumber}&version=${versionAbbr}`);
    }
  }, []);

  useEffect(() => {
    loadAllProgress().then(({ read, quiz, timestamps }) => {
      setReadDone(read);
      setQuizDone(quiz);
      setChapterTimestamps(timestamps);
    });
    loadHighlights().then(setAllHighlights);
  }, []);

  // A shared-quote deep link (?verse=N) means someone followed a link to read
  // a specific passage. Captured once at mount because the scroll-spy strips the
  // param from the URL.
  const [cameFromShareLink] = useState(
    () =>
      typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).has("verse"),
  );

  // While a deep-link (verse or search-phrase) is settling, hold off the
  // prev-chapter auto-load: a chapter prepended above the viewport would strand
  // the reader a chapter-height too low, and the compensating scroll can race
  // the jump. Cleared once the position is stable, which re-arms the top sentinel.
  //
  // On the NATIVE (static-export) build the hold covers every chapter open
  // until the reader actually scrolls: there the compensating scroll loses a
  // race with the router's own scroll restoration (programmatic scrolls are
  // snapped back to the top for a beat after hydration), so an unsuppressed
  // sentinel cascades prepend-after-prepend all the way to chapter 1 —
  // observed as the URL walking 26→25→…→1 on a Job 26 open. A real scroll
  // gesture both proves the reader wants to move up and postdates the
  // restoration window, so re-arming then is safe.
  const [suppressPrevLoad, setSuppressPrevLoad] = useState(
    () =>
      IS_MOBILE ||
      cameFromShareLink ||
      (typeof window !== "undefined" &&
        new URLSearchParams(window.location.search).has("highlight")),
  );
  useEffect(() => {
    if (!IS_MOBILE) return;
    const rearm = () => setSuppressPrevLoad(false);
    window.addEventListener("wheel", rearm, { once: true, passive: true });
    window.addEventListener("touchmove", rearm, { once: true, passive: true });
    return () => {
      window.removeEventListener("wheel", rearm);
      window.removeEventListener("touchmove", rearm);
    };
  }, []);

  // Deep-link: scroll to ?verse=N (e.g. from a copied quote's share link).
  // Retries briefly because the verse spans render with the first paint but
  // layout may still be settling. The jump is instant (not smooth) so nothing
  // can cancel it mid-animation, and the position is re-asserted for ~2.5s
  // against late layout shifts — unless the reader starts scrolling on
  // their own.
  useEffect(() => {
    const verse = parseInt(
      new URLSearchParams(window.location.search).get("verse") ?? "",
      10,
    );
    if (!verse) {
      // A search-phrase deep-link runs its own settling; only clear suppression
      // here when there's no highlight jump waiting to land.
      if (!new URLSearchParams(window.location.search).has("highlight")) {
        setSuppressPrevLoad(false);
      }
      return;
    }
    let attempts = 0;
    let timer: number | undefined;
    let guard: number | undefined;
    let interacted = false;
    const markInteracted = () => {
      interacted = true;
    };
    window.addEventListener("wheel", markInteracted, { passive: true, once: true });
    window.addEventListener("touchstart", markInteracted, { passive: true, once: true });
    window.addEventListener("keydown", markInteracted, { once: true });

    const tryScroll = () => {
      const section = contentRef.current?.querySelector(
        `section[data-chapter="${initialChapterNumber}"]`,
      );
      const el = section?.querySelector(`[data-verse-num="${verse}"]`);
      if (el instanceof HTMLElement) {
        // Land on the START of the quote: top-align the first verse just below
        // the sticky header so the reader begins at the quote rather than
        // somewhere past it. scroll-margin clears the (variable-height) header.
        const offset = (headerRef.current?.offsetHeight ?? headerHeight) + 16;
        el.style.scrollMarginTop = `${offset}px`;
        el.scrollIntoView({ block: "start" });
        const para = el.closest("p") ?? el.parentElement;
        if (para) {
          para.classList.add("verse-flash");
          window.setTimeout(() => para.classList.remove("verse-flash"), 2600);
        }
        let checks = 0;
        guard = window.setInterval(() => {
          if (!interacted) {
            const r = el.getBoundingClientRect();
            // Re-pin to the top if late layout shifts nudge it away.
            if (Math.abs(r.top - offset) > 24) {
              el.scrollIntoView({ block: "start" });
            }
          }
          if (interacted || ++checks >= 10) {
            window.clearInterval(guard);
            setSuppressPrevLoad(false);
          }
        }, 250);
      } else if (++attempts < 10) {
        timer = window.setTimeout(tryScroll, 100);
      } else {
        setSuppressPrevLoad(false);
      }
    };
    timer = window.setTimeout(tryScroll, 100);
    return () => {
      window.clearTimeout(timer);
      window.clearInterval(guard);
      window.removeEventListener("wheel", markInteracted);
      window.removeEventListener("touchstart", markInteracted);
      window.removeEventListener("keydown", markInteracted);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Search deep-link: jump to and briefly spotlight the exact phrase a search
  // result matched (?highlight=…). The chapter renders with the first paint but
  // layout may still be settling, so retry briefly until the phrase is found.
  // The jump is instant (not smooth) so the prev-chapter prepend's compensating
  // scroll can't cancel it mid-animation and fling the reader away; prev-load
  // stays suppressed until the phrase lands (or the reader takes over).
  useEffect(() => {
    const phrase = highlightParam;
    if (!phrase) return;

    // A same-chapter search result doesn't remount the reader, so the
    // mount-time suppression is long gone. Re-suppress: the route's
    // scroll-to-top puts the top sentinel in view, and a previous chapter
    // prepending mid-jump is exactly the fling this guards against.
    setSuppressPrevLoad(true);

    let attempts = 0;
    let findTimer: number | undefined;
    let releaseTimer: number | undefined;
    let cleanup: (() => void) | undefined;
    let interacted = false;

    const release = () => setSuppressPrevLoad(false);
    const onInteract = () => {
      interacted = true;
      release();
    };
    window.addEventListener("wheel", onInteract, { passive: true, once: true });
    window.addEventListener("touchstart", onInteract, { passive: true, once: true });
    window.addEventListener("keydown", onInteract, { once: true });

    const tryFlash = () => {
      const section = contentRef.current?.querySelector(
        `section[data-chapter="${initialChapterNumber}"]`,
      );
      if (section instanceof HTMLElement) {
        const range = findPhraseRange(section, phrase);
        if (range && range.getClientRects().length > 0) {
          const offset = (headerRef.current?.offsetHeight ?? headerHeight) + 24;
          const top = window.scrollY + range.getBoundingClientRect().top - offset;
          window.scrollTo({ top: Math.max(0, top) }); // instant — see note above
          cleanup = spotlightRange(range);
          // Note: don't strip ?highlight= here. In the App Router a raw
          // history.replaceState syncs back into useSearchParams, which would
          // flip highlightParam to null, re-run this effect, and its cleanup
          // would clear the spotlight instantly. The [highlightParam] dep
          // already stops a scroll from re-flashing, so leaving the param is
          // both correct and harmless (a reload simply re-flashes).
          // Re-arm the prev-chapter auto-load once the position has settled.
          releaseTimer = window.setTimeout(() => {
            if (!interacted) release();
          }, 800);
          return;
        }
      }
      if (++attempts < 12) findTimer = window.setTimeout(tryFlash, 100);
      else release(); // phrase not found — don't leave prev-load stuck off
    };
    findTimer = window.setTimeout(tryFlash, 120);

    return () => {
      window.clearTimeout(findTimer);
      window.clearTimeout(releaseTimer);
      cleanup?.();
      window.removeEventListener("wheel", onInteract);
      window.removeEventListener("touchstart", onInteract);
      window.removeEventListener("keydown", onInteract);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlightParam]);

  // Auto-scroll to overview when arriving via overview link
  const didScrollToOverview = useRef(false);
  useEffect(() => {
    if (!scrollToOverview || didScrollToOverview.current || !hasOverview) return;
    if (loadingNext) return; // wait until chapters finish loading
    // A start-placed overview is collapsed by default; arriving via an overview
    // link means the reader wants to read it, so open it before scrolling.
    if (overviewAtStart) setOverviewExpanded(true);
    const el = summaryHeadingRef.current;
    if (el) {
      didScrollToOverview.current = true;
      // Small delay to let the DOM settle after render
      requestAnimationFrame(() => {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
  }, [scrollToOverview, hasOverview, loadingNext, overviewAtStart]);

  // ── Scroll detection for visible chapter ─────────────────

  // True once the reader has genuinely scrolled (wheel/touch/key). Programmatic
  // scrolls — the prev-chapter prepend's compensating jump, deep-link settles —
  // also fire scroll events, and near the top of a chapter they can resolve the
  // spy's best-visible heading to the *previous* chapter. Gating the last-read
  // save on real interaction keeps merely opening a chapter from recording its
  // neighbor as the reading position.
  const userScrolledRef = useRef(false);
  const lastReadSaveTimerRef = useRef<number | undefined>(undefined);
  useEffect(() => {
    const mark = () => {
      userScrolledRef.current = true;
      // A deep-linked visit anchors Continue Reading only once the visitor
      // actually interacts — this is that first-interaction save.
      if (!lastReadSavedRef.current) {
        lastReadSavedRef.current = true;
        const ch = visibleChapterRef.current ?? initialChapterNumber;
        saveLastReadUrl(
          `/try/bible/read?book=${encodeURIComponent(bookName)}&chapter=${ch}&version=${versionAbbr}`,
        );
      }
    };
    window.addEventListener("wheel", mark, { passive: true });
    window.addEventListener("touchstart", mark, { passive: true });
    window.addEventListener("keydown", mark);
    // Scrollbar drags and middle-click autoscroll fire no wheel/touch/key
    // events — the pointer press that starts them is the interaction signal
    // (Firefox dispatches no events for scrollbar presses; nothing to hook).
    window.addEventListener("pointerdown", mark, { passive: true });
    window.addEventListener("mousedown", mark, { passive: true });
    return () => {
      window.removeEventListener("wheel", mark);
      window.removeEventListener("touchstart", mark);
      window.removeEventListener("keydown", mark);
      window.removeEventListener("pointerdown", mark);
      window.removeEventListener("mousedown", mark);
    };
    // bookName/versionAbbr are fixed for this mount (remount-by-key per book).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    function onScroll() {
      // Check if summary heading is in view (most recently scrolled past 120px)
      const summaryEl = summaryHeadingRef.current;
      const summaryTop = summaryEl ? summaryEl.getBoundingClientRect().top : Infinity;

      let bestChapter: number | null = null;
      let bestChapterTop = -Infinity;
      for (const [chNum, el] of headingRefs.current) {
        const top = el.getBoundingClientRect().top;
        if (top <= 120 && top > bestChapterTop) {
          bestChapterTop = top;
          bestChapter = chNum;
        }
      }

      // Summary is "active" if its heading has scrolled past 120px and is
      // below the last chapter heading — or, at the top of the book where no
      // heading has crossed the line yet, when the expanded overview card is
      // what's on screen (reading it should highlight Overview, not "1").
      const summaryActive =
        (summaryTop <= 120 && summaryTop > bestChapterTop) ||
        (bestChapter === null && overviewExpanded && summaryTop < window.innerHeight);
      setSummaryVisible(summaryActive);

      if (bestChapter !== null && bestChapter !== visibleChapterRef.current) {
        // Track the visible chapter for the strip highlight even while a
        // deep-link is settling (so a later scroll event doesn't see a stale
        // ref and "change" back)...
        visibleChapterRef.current = bestChapter;
        setVisibleChapterNumber(bestChapter);
        // ...but don't let a stray scroll during a just-applied reminder
        // deep-link rewrite the chapter in the URL and snap the reader back.
        if (isChapterUrlSyncSuppressed()) return;
        // The URL mirror serves the web's address bar and canonical URLs.
        // The native build has no visible address bar, and there each
        // replaceState makes the static-export router snap the scroll back
        // to the top — mid-scroll, that cascades the prev-chapter loader all
        // the way to chapter 1 (a Job 26 open walked 26→25→…→1). Position
        // saving below still runs; only the address-bar write is web-only.
        if (!IS_MOBILE) {
          const url = new URL(window.location.href);
          url.searchParams.set("chapter", String(bestChapter));
          url.searchParams.delete("chunk");
          url.searchParams.delete("verse");
          window.history.replaceState({}, "", url.toString());
        }
        // Keep the saved position on the chapter actually being read, so
        // Continue Reading resumes here — not at the chapter first opened.
        // Debounced: a hard navigation away fires a scroll-to-top on the dying
        // document, whose transition would otherwise record the chapter above.
        // Its timer never gets to run; a real reading pause's does.
        if (userScrolledRef.current) {
          const chapterToSave = bestChapter;
          window.clearTimeout(lastReadSaveTimerRef.current);
          pendingLastReadRef.current = chapterToSave;
          lastReadSaveTimerRef.current = window.setTimeout(() => {
            pendingLastReadRef.current = null;
            lastReadSavedRef.current = true;
            saveLastReadUrl(
              `/try/bible/read?book=${encodeURIComponent(bookName)}&chapter=${chapterToSave}&version=${versionAbbr}`,
            );
          }, 300);
        }
      }
    }
    // Expanding/collapsing the overview changes what's on screen without a
    // scroll event, so recompute once on (re)subscribe.
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      // A pending save must not outlive the reader — on a client-side nav to
      // another chapter it would overwrite the new mount's saved position.
      window.clearTimeout(lastReadSaveTimerRef.current);
    };
    // bookName/versionAbbr are fixed for this mount (remount-by-key per book).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overviewExpanded]);

  // ── Chapter strip ─────────────────────────────────────────

  const updateChapterStripJustify = useCallback(() => {
    const node = chapterStripRef.current;
    if (!node) return;
    setChapterStripJustify(node.scrollWidth > node.clientWidth ? "flex-start" : "center");
  }, []);

  useLayoutEffect(() => {
    updateChapterStripJustify();
    const node = chapterStripRef.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => updateChapterStripJustify());
    ro.observe(node);
    return () => ro.disconnect();
  }, [bookName, chapterNumbers, chapterTimestamps, mode, quizDone, readDone, updateChapterStripJustify]);

  useEffect(() => {
    const container = chapterStripRef.current;
    if (!container) return;
    if (summaryVisible) {
      const el = summaryStripRef.current;
      if (el) el.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
    } else if (visibleChapterNumber <= 5) {
      container.scrollLeft = 0;
    } else {
      const el = activeChapterRef.current;
      if (el) el.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
    }
  }, [visibleChapterNumber, summaryVisible, chapterStripJustify]);

  // Same idea for the left panel's vertical chapter grid: keep the chapter
  // being read in view as the reader scrolls through a long book. Only the
  // grid's own scroll box moves (block: "nearest"), never the page.
  useEffect(() => {
    const list = panelChapterListRef.current;
    const el = panelActiveChapterRef.current;
    if (!list || !el || list.clientHeight === 0) return;
    const listRect = list.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();
    if (elRect.top < listRect.top || elRect.bottom > listRect.bottom) {
      el.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [visibleChapterNumber, summaryVisible]);

  // Hold ArrowLeft / ArrowRight to scroll the chapter strip horizontally.
  // A rAF loop keeps the strip moving for as long as the key is held (rather
  // than one nudge per OS key-repeat), and scrollLeft naturally clamps so it
  // stops once either end of the strip comes into view.
  useEffect(() => {
    let direction: -1 | 0 | 1 = 0;
    let raf: number | null = null;

    const step = () => {
      const node = chapterStripRef.current;
      if (node && direction !== 0) node.scrollLeft += direction * 10;
      raf = direction !== 0 ? requestAnimationFrame(step) : null;
    };

    const isEditable = (el: EventTarget | null) => {
      if (!(el instanceof HTMLElement)) return false;
      return el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable;
    };

    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (searchOpen || isEditable(e.target)) return;
      // Wide screens show the chapter grid in the left panel instead of the
      // strip; with nothing to scroll, leave the arrow keys to the browser.
      if (!chapterStripRef.current || chapterStripRef.current.clientWidth === 0) return;
      e.preventDefault();
      direction = e.key === "ArrowLeft" ? -1 : 1;
      if (raf === null) raf = requestAnimationFrame(step);
    }

    function onKeyUp(e: KeyboardEvent) {
      if (e.key === "ArrowLeft" && direction === -1) direction = 0;
      if (e.key === "ArrowRight" && direction === 1) direction = 0;
    }

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      if (raf !== null) cancelAnimationFrame(raf);
    };
  }, [searchOpen]);

  // Restore scroll position after a chapter is prepended above. Compensates by
  // the previously-first section's measured displacement rather than the
  // scrollHeight delta: when the reader sits mid-chapter (e.g. a search jump
  // just landed), the browser's native scroll anchoring has already adjusted
  // for the insertion, and adding the full height again flung the reader a
  // chapter-height down. Measuring the anchor picks up only the residual.
  // Also resets loadingPrevRef here (not in finally) so the IntersectionObserver
  // cannot cascade another load before the scroll adjustment settles.
  useLayoutEffect(() => {
    if (pendingScrollAdjust.current !== null) {
      const { anchor, top } = pendingScrollAdjust.current;
      window.scrollBy(0, anchor.getBoundingClientRect().top - top);
      pendingScrollAdjust.current = null;
      loadingPrevRef.current = false;
    }
  }, [loadedChapters]);

  // ── Close dropdowns on outside click ─────────────────────

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      const t = e.target as Node;
      const inBookPicker =
        !!bookRef.current?.contains(t) || !!panelBookRef.current?.contains(t);
      if (!inBookPicker) setBookOpen(false);
      const inSettings =
        !!settingsRef.current?.contains(t) || !!panelSettingsRef.current?.contains(t);
      if (!inSettings) setSettingsOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // ── Display toggles ───────────────────────────────────────

  function toggleTheme() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("theme", next ? "dark" : "light");
  }

  function toggleBionic() {
    const next = !bionic;
    setBionic(next);
    localStorage.setItem("bionic", String(next));
  }

  function toggleVerseNumbers() {
    const next = !verseNumbers;
    setVerseNumbers(next);
    localStorage.setItem("verseNumbers", String(next));
  }

  function toggleCrossRefs() {
    const next = !showCrossRefs;
    setShowCrossRefs(next);
    localStorage.setItem("bsbCrossRefs", String(next));
  }

  function toggleRedLetter() {
    const next = !redLetter;
    setRedLetter(next);
    localStorage.setItem("redLetter", String(next));
  }

  function changeFontSize(delta: number) {
    setFontSize((prev) => {
      const next = Math.min(FONT_SIZE_MAX, Math.max(FONT_SIZE_MIN, prev + delta));
      localStorage.setItem("bibleFontSize", String(next));
      return next;
    });
  }

  // ── URL helpers ───────────────────────────────────────────

  function readUrl(overrides: {
    book?: string;
    chapter?: number;
    version?: string;
    overview?: boolean;
  }) {
    const b = encodeURIComponent(overrides.book ?? bookName);
    const c = overrides.chapter ?? visibleChapterRef.current;
    const v = overrides.version ?? versionAbbr;
    const o = overrides.overview ? "&overview=1" : "";
    return `/try/bible/read?book=${b}&chapter=${c}&version=${v}${o}`;
  }

  // Same-route navigations (chapter strip, book picker, overview chip) hang
  // in the static export: the router's refetch of the identical segment
  // never resolves against bundled files, so the address bar updates while
  // the old tree stays frozen. The native build hard-navigates instead — a
  // full load is instant against local assets, and the cold-start path
  // reads the params correctly (see OfflineRead).
  function navigateReadUrl(url: string) {
    if (IS_MOBILE) window.location.assign(url);
    else router.push(url);
  }

  // The "Overview" chip. The overview sits above chapter 1, so the chip renders
  // before the chapter buttons (see the strip below). Both layouts draw one, so
  // the horizontal strip's scroll-into-view ref is passed in rather than baked.
  const overviewChip = (
    ref?: React.Ref<HTMLButtonElement>,
    extraClass = "",
  ) => (hasOverview ? (
    <button
      ref={ref}
      onClick={() => {
        const el = summaryHeadingRef.current;
        if (el) {
          // Card is mounted (reader is near the overview) — open and scroll.
          if (overviewAtStart) setOverviewExpanded(true);
          el.scrollIntoView({ behavior: "smooth", block: "start" });
        } else {
          // Deep-linked away from where the overview lives — go to it.
          // Start overviews sit above chapter 1; end overviews after the last.
          navigateReadUrl(
            readUrl({
              chapter: overviewAtStart
                ? chapterNumbers[0]
                : chapterNumbers[chapterNumbers.length - 1],
              overview: true,
            }),
          );
        }
      }}
      style={{ flexShrink: 0, height: "28px", paddingLeft: "10px", paddingRight: "10px" }}
      className={`flex items-center justify-center rounded text-xs font-medium tracking-[0.25px] transition-all ${extraClass} ${
        summaryVisible
          ? // "You are here" reads the same as it does on a chapter square:
            // a solid gold fill, no ring. This was the last amber outline left
            // in the strip after the chapter squares lost theirs.
            "bg-amber-500 font-bold text-neutral-950 dark:bg-amber-400 dark:text-neutral-950"
          : "bg-amber-500/10 text-gold hover:bg-amber-500/20 dark:bg-amber-400/10 dark:text-gold-bright dark:hover:bg-amber-400/20"
      }`}
    >
      Overview
    </button>
  ) : null);

  // A chapter square. Real anchors (not button + push) so every chapter of the
  // book stays crawlable from any chapter's server-rendered HTML.
  const chapterLink = (num: number, ref?: React.Ref<HTMLAnchorElement>) => (
    <Link
      key={num}
      href={readUrl({ chapter: num })}
      onClick={(e) => {
        // Native build: same-route Link navs hang (see navigateReadUrl) —
        // hard-navigate instead.
        if (IS_MOBILE) {
          e.preventDefault();
          navigateReadUrl(readUrl({ chapter: num }));
        }
      }}
      ref={ref}
      style={{ flexShrink: 0, width: "28px", height: "28px" }}
      className={`flex items-center justify-center rounded text-xs transition-all ${getChapterButtonStyle(num)}`}
    >
      {num}
    </Link>
  );

  // Switching translation keeps the reader where they are: jump back in at the
  // chapter whose heading is nearest the top of the viewport.
  function pickVersion(abbr: string) {
    setSettingsOpen(false);
    if (abbr === versionAbbr) return;
    let bestCh = visibleChapterRef.current;
    let bestDist = Infinity;
    for (const [chNum, el] of headingRefs.current) {
      const dist = Math.abs(el.getBoundingClientRect().top);
      if (dist < bestDist) {
        bestDist = dist;
        bestCh = chNum;
      }
    }
    window.location.href = `/try/bible/read?book=${encodeURIComponent(bookName)}&chapter=${bestCh}&version=${abbr}`;
  }

  // ── Chapter loading ───────────────────────────────────────

  const loadNextChapter = useCallback(
    async (afterChapterNumber: number) => {
      if (loadingRef.current) return;
      const idx = chapterNumbers.indexOf(afterChapterNumber);
      const nextNum = chapterNumbers[idx + 1];
      if (nextNum === undefined) return;
      if (loadedChapterNums.current.has(nextNum)) return;

      loadingRef.current = true;
      loadedChapterNums.current.add(nextNum);
      setLoadingNext(true);

      try {
        const data = await fetchChapter(bookName, nextNum, versionAbbr);
        if (!data.text) {
          loadedChapterNums.current.delete(nextNum);
          return;
        }
        setLoadedChapters((prev) => [
          ...prev,
          {
            chapterNumber: nextNum,
            text: data.text,
            questions: data.questions,
            headings: data.headings,
          },
        ]);
      } finally {
        loadingRef.current = false;
        setLoadingNext(false);
      }
    },
    [bookName, chapterNumbers, versionAbbr],
  );

  const loadPrevChapter = useCallback(async () => {
    if (loadingPrevRef.current) return;
    const firstLoadedNum = Math.min(...Array.from(loadedChapterNums.current));
    const idx = chapterNumbers.indexOf(firstLoadedNum);
    if (idx <= 0) return;
    const prevNum = chapterNumbers[idx - 1];
    if (loadedChapterNums.current.has(prevNum)) return;

    loadingPrevRef.current = true;
    loadedChapterNums.current.add(prevNum);
    setLoadingPrev(true);

    try {
      const data = await fetchChapter(bookName, prevNum, versionAbbr);
      if (!data.text) {
        loadedChapterNums.current.delete(prevNum);
        return;
      }
      const anchor = contentRef.current?.querySelector(
        "section[data-chapter]",
      ) as HTMLElement | null;
      pendingScrollAdjust.current = anchor
        ? { anchor, top: anchor.getBoundingClientRect().top }
        : null;
      setLoadedChapters((prev) => [
        {
          chapterNumber: prevNum,
          text: data.text,
          questions: data.questions,
          headings: data.headings,
        },
        ...prev,
      ]);
    } finally {
      // If a scroll adjustment is pending (success path), keep loadingPrevRef = true
      // so the observer cannot fire again before useLayoutEffect resets it.
      // On the error path (pendingScrollAdjust was never set), reset here.
      if (pendingScrollAdjust.current === null) {
        loadingPrevRef.current = false;
      }
      setLoadingPrev(false);
    }
  }, [bookName, chapterNumbers, versionAbbr]);

  // In read mode, eagerly load all remaining chapters without waiting for scroll
  useEffect(() => {
    if (scrollToOverview) return;
    if (mode !== "read") return;
    if (loadedChapters.length === 0) return;
    const lastChapter = loadedChapters[loadedChapters.length - 1];
    void loadNextChapter(lastChapter.chapterNumber);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, loadedChapters, loadNextChapter]);

  // Load previous chapter when top sentinel becomes visible. Suppressed while
  // a verse deep-link scroll is in flight; when re-armed, the observer's
  // initial callback fires if the sentinel is still in view, so a deep link
  // near the top of a chapter still gets its previous chapter loaded.
  useEffect(() => {
    if (scrollToOverview || suppressPrevLoad) return;
    const el = topSentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) void loadPrevChapter();
      },
      { threshold: 0.1 },
    );
    observer.observe(el);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadPrevChapter, suppressPrevLoad]);

  // ── Chapter section callbacks ─────────────────────────────

  const handleHeadingMount = useCallback((chNum: number, el: HTMLElement | null) => {
    if (el) headingRefs.current.set(chNum, el);
    else headingRefs.current.delete(chNum);
  }, []);

  // A pending debounced position save must land before a completion is
  // recorded, or flagLastReadCompleted checks the previous chapter's saved
  // URL and misses (entering and finishing a short chapter inside one
  // 300 ms debounce window).
  const flushPendingLastRead = useCallback(() => {
    if (pendingLastReadRef.current !== null) {
      window.clearTimeout(lastReadSaveTimerRef.current);
      const ch = pendingLastReadRef.current;
      pendingLastReadRef.current = null;
      lastReadSavedRef.current = true;
      saveLastReadUrl(
        `/try/bible/read?book=${encodeURIComponent(bookName)}&chapter=${ch}&version=${versionAbbr}`,
      );
    }
  }, [bookName, versionAbbr]);

  const handleReadingComplete = useCallback(
    (chNum: number) => {
      flushPendingLastRead();
      void markReadingComplete(bookName, chNum);
      setReadDone((prev) => ({ ...prev, [`${bookName}:${chNum}`]: true }));
    },
    [bookName, flushPendingLastRead],
  );

  const handleReadModeChapterComplete = useCallback(
    (chNum: number) => {
      flushPendingLastRead();
      void markChapterComplete(bookName, chNum);
      setReadDone((prev) => ({ ...prev, [`${bookName}:${chNum}`]: true }));
      setQuizDone((prev) => ({ ...prev, [`${bookName}:${chNum}`]: true }));
      void loadNextChapter(chNum);
    },
    [bookName, loadNextChapter, flushPendingLastRead],
  );

  const handleStudyModeQuizComplete = useCallback(
    (chNum: number) => {
      setQuizDone((prev) => ({ ...prev, [`${bookName}:${chNum}`]: true }));
      void loadNextChapter(chNum);
    },
    [bookName, loadNextChapter],
  );

  // Route the onReadingComplete and onNextChapter to the right handlers
  const handleReadingCompleteForSection = useCallback(
    (chNum: number) => {
      if (mode === "read") {
        handleReadModeChapterComplete(chNum);
      } else {
        handleReadingComplete(chNum);
      }
    },
    [mode, handleReadModeChapterComplete, handleReadingComplete],
  );

  const handleNextChapterForSection = useCallback(
    (chNum: number) => {
      if (mode === "study") {
        handleStudyModeQuizComplete(chNum);
      }
      // read mode is handled in handleReadingCompleteForSection
    },
    [mode, handleStudyModeQuizComplete],
  );

  // Skip the quiz: move on without quiz credit — the chapter keeps its
  // reading-complete mark only, so progress stays honest.
  const handleSkipQuiz = useCallback(
    (chNum: number) => {
      void loadNextChapter(chNum);
    },
    [loadNextChapter],
  );

  // Permanently switch to read mode from the quiz. The reader already hit
  // the end of the chapter, so under read-mode rules it counts as complete.
  const handleSwitchToReadMode = useCallback(
    (chNum: number) => {
      setMode("read");
      setReadingMode("read");
      handleReadModeChapterComplete(chNum);
      // The chapter was usually already marked read on scroll, so the write
      // above won't fire the milestone event itself — but under read-mode
      // rules the chapter just became complete, which is worth a nudge check.
      emitMilestone();
    },
    [handleReadModeChapterComplete],
  );

  // ── Selection-based highlighting ─────────────────────────

  const contentRef = useRef<HTMLDivElement>(null);
  const [selectionToolbar, setSelectionToolbar] = useState<{
    x: number;
    y: number;
    verses: { chapter: number; verse: number }[];
    quote: string;
  } | null>(null);
  const [selectionNote, setSelectionNote] = useState("");
  const [showNoteInput, setShowNoteInput] = useState(false);
  const [copiedRef, setCopiedRef] = useState(false);
  const toolbarRef = useRef<HTMLDivElement>(null);

  // Find the chapter number for a DOM node by walking up to its <section>
  function chapterForNode(node: Node): number {
    const el = node instanceof Element ? node : node.parentElement;
    if (!el) return visibleChapterNumber;
    const section = el.closest("section");
    const attr = section?.getAttribute("data-chapter");
    if (attr) return parseInt(attr, 10);
    return visibleChapterNumber;
  }

  // Find the verse number that "owns" a given DOM node by walking backward
  // through previous siblings / parents to the nearest verse marker. Two things
  // matter for correctness:
  //  - Confine the walk to the node's own chapter <section>. Otherwise a tap at
  //    the top of a chapter walks past its start into the previous chapter and
  //    grabs that chapter's last verse (a tap on Matthew 2:1 once resolved to
  //    "2:25" — Matthew 1's verse 25 — a verse that doesn't exist).
  //  - Recognise both marker kinds: verse-number superscripts carry
  //    data-verse-num, while poetry/continuation lines carry data-verse-id
  //    ("MAT.1.2"). Verse 1's own marker is the drop-cap numeral, which sits
  //    beside the text; a node before any marker within the chapter is verse 1.
  function verseForNode(node: Node): number | null {
    const startEl = node instanceof Element ? node : node.parentElement;
    const section = startEl?.closest("section[data-chapter]") ?? null;
    if (!section) return null;
    let cur: Node | null = node;
    while (cur && section.contains(cur)) {
      if (cur instanceof Element) {
        const num = cur.getAttribute("data-verse-num");
        if (num) return parseInt(num, 10);
        const vid = cur.getAttribute("data-verse-id");
        const m = vid ? /\.(\d+)$/.exec(vid) : null;
        if (m) return parseInt(m[1], 10);
      }
      if (cur.previousSibling) {
        cur = cur.previousSibling;
        while (cur.lastChild) cur = cur.lastChild;
        continue;
      }
      cur = cur.parentNode;
    }
    // No marker precedes this node within the chapter → it belongs to verse 1.
    return 1;
  }

  useEffect(() => {
    function onPointerUp() {
      // Small delay to let the selection finalize
      requestAnimationFrame(() => {
        const sel = window.getSelection();
        if (!sel || sel.isCollapsed || !sel.toString().trim()) {
          // Don't dismiss if toolbar is focused (note input)
          if (toolbarRef.current?.contains(document.activeElement)) return;
          setSelectionToolbar(null);
          setShowNoteInput(false);
          setSelectionNote("");
          return;
        }

        const range = sel.getRangeAt(0);
        const container = contentRef.current;
        if (!container || !container.contains(range.startContainer) || !container.contains(range.endContainer)) {
          return;
        }

        const startVerseNum = verseForNode(range.startContainer);
        const endVerseNum = verseForNode(range.endContainer);
        if (!startVerseNum) return;

        const startChapter = chapterForNode(range.startContainer);
        const endChapter = chapterForNode(range.endContainer);

        // Build verse list
        const verses: { chapter: number; verse: number }[] = [];
        if (startChapter === endChapter && endVerseNum) {
          const lo = Math.min(startVerseNum, endVerseNum);
          const hi = Math.max(startVerseNum, endVerseNum);
          for (let v = lo; v <= hi; v++) {
            verses.push({ chapter: startChapter, verse: v });
          }
        } else {
          // Cross-chapter selection: just use the start verse
          verses.push({ chapter: startChapter, verse: startVerseNum });
          if (endVerseNum && (endChapter !== startChapter || endVerseNum !== startVerseNum)) {
            verses.push({ chapter: endChapter, verse: endVerseNum });
          }
        }

        // Clean quote text: clone the selection and strip verse-number
        // superscripts, buttons, and section headings (h3, editorial — not
        // scripture) so the copied text reads as plain prose, not "5When you
        // pray...".
        //
        // Replace each stripped node with a space rather than removing it
        // outright: textContent does not insert any separator at element
        // boundaries, so deleting an inter-verse <sup> would glue the verses
        // together (e.g. "...the wicked.Nor stand...").
        const frag = range.cloneContents();
        const replaceWithSpace = (el: Element) =>
          el.replaceWith(document.createTextNode(" "));
        frag
          .querySelectorAll("[data-verse-num], button, h3")
          .forEach(replaceWithSpace);
        // Selections that span multiple blocks come back as separate elements
        // with no whitespace between them; mark each block boundary with a
        // newline so the copied quote keeps the paragraph structure. Poetry
        // lines break singly, prose paragraphs get a blank line between them.
        // Poetry is recognized by the pl-6/pl-12 indent classes the formatter
        // puts on q1/q2 lines (format-chunk-text.tsx); if those ever change,
        // copies degrade to blank-line separation rather than breaking.
        //
        // The source chunk HTML carries its own newlines between elements
        // (whitespace text nodes); flatten those to spaces first so only the
        // separators inserted below decide the line structure.
        const walker = document.createTreeWalker(frag, NodeFilter.SHOW_TEXT);
        for (let n = walker.nextNode(); n; n = walker.nextNode()) {
          if (n.nodeValue && /[\r\n]/.test(n.nodeValue)) {
            n.nodeValue = n.nodeValue.replace(/[\r\n]+/g, " ");
          }
        }
        frag
          .querySelectorAll("br")
          .forEach((br) => br.replaceWith(document.createTextNode("\n")));
        frag
          .querySelectorAll("p, div, li, h1, h2, h4, h5, h6, blockquote")
          .forEach((el) => {
            const parent = el.parentNode;
            if (!parent) return;
            const poetryLine =
              el.tagName === "P" && /\bpl-(?:6|12)\b/.test(el.className);
            parent.insertBefore(
              document.createTextNode(poetryLine ? "\n" : "\n\n"),
              el,
            );
          });
        // Collapse whitespace within each line, then squeeze the newline runs
        // left by nested blocks down to at most one blank line.
        const quote = (frag.textContent ?? "")
          .split("\n")
          .map((line) => line.replace(/\s+/g, " ").trim())
          .join("\n")
          .replace(/\n{3,}/g, "\n\n")
          .trim();

        const rect = range.getBoundingClientRect();
        setSelectionToolbar({
          x: rect.left + rect.width / 2,
          y: rect.top + window.scrollY,
          verses,
          quote,
        });
      });
    }

    document.addEventListener("mouseup", onPointerUp);
    document.addEventListener("touchend", onPointerUp);
    return () => {
      document.removeEventListener("mouseup", onPointerUp);
      document.removeEventListener("touchend", onPointerUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleChapterNumber]);

  const handleHighlightColor = useCallback(
    (color: HighlightColor) => {
      if (!selectionToolbar) return;
      for (const { chapter, verse } of selectionToolbar.verses) {
        const key = `${bookName}:${chapter}:${verse}`;
        void saveHighlight(bookName, chapter, verse, color, selectionNote).then((hl) => {
          setAllHighlights((prev) => ({ ...prev, [key]: hl }));
        });
      }
      window.getSelection()?.removeAllRanges();
      if (!showNoteInput) {
        setSelectionToolbar(null);
        setSelectionNote("");
      }
    },
    [bookName, selectionToolbar, selectionNote, showNoteInput],
  );

  const handleSaveNote = useCallback(() => {
    if (!selectionToolbar) return;
    for (const { chapter, verse } of selectionToolbar.verses) {
      const key = `${bookName}:${chapter}:${verse}`;
      const existing = allHighlights[key];
      const color = existing?.color ?? "yellow";
      void saveHighlight(bookName, chapter, verse, color, selectionNote).then((hl) => {
        setAllHighlights((prev) => ({ ...prev, [key]: hl }));
      });
    }
    setSelectionToolbar(null);
    setShowNoteInput(false);
    setSelectionNote("");
  }, [bookName, selectionToolbar, allHighlights, selectionNote]);

  const handleRemoveHighlight = useCallback(() => {
    if (!selectionToolbar) return;
    for (const { chapter, verse } of selectionToolbar.verses) {
      const key = `${bookName}:${chapter}:${verse}`;
      void removeHighlight(bookName, chapter, verse);
      setAllHighlights((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
    setSelectionToolbar(null);
    setShowNoteInput(false);
    setSelectionNote("");
  }, [bookName, selectionToolbar]);

  // ── Verse sheet (tap a verse → study hub) ─────────────────

  const [verseSheet, setVerseSheet] = useState<{
    chapter: number;
    verse: number;
  } | null>(null);

  useEffect(() => {
    const container = contentRef.current;
    if (!container) return;

    function onClick(e: MouseEvent) {
      const target = e.target as Node;
      const el = target instanceof Element ? target : target.parentElement;
      if (!el) return;
      // Only taps on scripture prose: inside a paragraph within the chapter
      // article — not buttons, links, or headings, and not while a text
      // selection (or the selection toolbar) is active.
      if (el.closest("button, a, h1, h2, h3")) return;
      if (!el.closest("article") || !el.closest("p")) return;
      const sel = window.getSelection();
      if (sel && !sel.isCollapsed) return;
      if (selectionToolbar) return;
      const verse = verseForNode(target);
      if (!verse) return;
      setVerseSheet({ chapter: chapterForNode(target), verse });
    }

    container.addEventListener("click", onClick);
    return () => container.removeEventListener("click", onClick);
    // verseForNode/chapterForNode are stable module-pattern helpers defined in
    // this component; the effect re-binds when the toolbar state changes so the
    // guard above sees the current value.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectionToolbar, visibleChapterNumber]);

  // Whole-verse hover highlight (desktop). As the cursor moves over scripture,
  // light up the verse it's on so it reads as tappable — each run of verse text
  // is a .vtext span carrying its verse in data-hv, and we toggle .vh-on across
  // the same-verse spans, plus the verse's own superscript marker, within the
  // hovered chapter. Nothing happens on press;
  // the click handler above opens the tools on release. Suppressed mid-selection
  // so a drag to highlight doesn't flicker the hover.
  useEffect(() => {
    // Hover is a pointer affordance — skip it on touch devices, where a
    // synthetic mousemove on tap could otherwise leave a verse stuck lit.
    if (!window.matchMedia?.("(hover: hover)").matches) return;
    const el0 = contentRef.current;
    if (!el0) return;
    const container: HTMLElement = el0;
    let lastKey: string | null = null;

    function clear() {
      if (!lastKey) return;
      container.querySelectorAll(".vh-on").forEach((s) => s.classList.remove("vh-on"));
      lastKey = null;
    }

    function onMove(e: MouseEvent) {
      const node = e.target as Node;
      const el = node instanceof Element ? node : node.parentElement;
      // A verse's text runs carry data-hv; its superscript number carries
      // data-verse-num. Either lights the verse it belongs to.
      const vt = el?.closest(".vtext") ?? el?.closest("sup[data-verse-num]");
      const sel = window.getSelection();
      if (
        !vt ||
        el?.closest("button, a, h1, h2, h3") ||
        (sel && !sel.isCollapsed)
      ) {
        clear();
        return;
      }
      const section = vt.closest("section[data-chapter]");
      const verse = vt.getAttribute("data-hv") ?? vt.getAttribute("data-verse-num");
      if (!section || !verse) {
        clear();
        return;
      }
      const key = `${section.getAttribute("data-chapter")}:${verse}`;
      if (key === lastKey) return;
      clear();
      lastKey = key;
      section.querySelectorAll(`.vtext[data-hv="${verse}"]`).forEach((s) => {
        if (!s.closest("h1, h2, h3")) s.classList.add("vh-on");
      });
      // The verse's own superscript number precedes its text — light it with
      // the verse. (Verse 1's stand-in marker is the drop-cap numeral, a span
      // not a sup, deliberately left unlit: a gold block that size shouts.)
      section
        .querySelectorAll(`sup[data-verse-num="${verse}"]`)
        .forEach((s) => s.classList.add("vh-on"));
    }

    container.addEventListener("mousemove", onMove);
    container.addEventListener("mouseleave", clear);
    return () => {
      container.removeEventListener("mousemove", onMove);
      container.removeEventListener("mouseleave", clear);
      clear();
    };
  }, []);

  const sheetHighlightKey = verseSheet
    ? `${bookName}:${verseSheet.chapter}:${verseSheet.verse}`
    : null;
  const sheetHighlight = sheetHighlightKey
    ? (allHighlights[sheetHighlightKey] ?? null)
    : null;

  const handleSheetHighlight = useCallback(
    (color: HighlightColor) => {
      if (!verseSheet) return;
      const key = `${bookName}:${verseSheet.chapter}:${verseSheet.verse}`;
      const note = allHighlights[key]?.note ?? "";
      void saveHighlight(bookName, verseSheet.chapter, verseSheet.verse, color, note).then(
        (hl) => setAllHighlights((prev) => ({ ...prev, [key]: hl })),
      );
    },
    [bookName, verseSheet, allHighlights],
  );

  const handleSheetRemoveHighlight = useCallback(() => {
    if (!verseSheet) return;
    const key = `${bookName}:${verseSheet.chapter}:${verseSheet.verse}`;
    void removeHighlight(bookName, verseSheet.chapter, verseSheet.verse);
    setAllHighlights((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, [bookName, verseSheet]);

  const handleSheetSaveNote = useCallback(
    (note: string) => {
      if (!verseSheet) return;
      const key = `${bookName}:${verseSheet.chapter}:${verseSheet.verse}`;
      const color = allHighlights[key]?.color ?? "yellow";
      void saveHighlight(bookName, verseSheet.chapter, verseSheet.verse, color, note).then(
        (hl) => setAllHighlights((prev) => ({ ...prev, [key]: hl })),
      );
    },
    [bookName, verseSheet, allHighlights],
  );

  // ── Chapter strip helpers ─────────────────────────────────

  function isChapterDone(chNum: number): boolean {
    const key = `${bookName}:${chNum}`;
    if (mode === "read") return !!readDone[key];
    return !!readDone[key] && !!quizDone[key];
  }

  function getChapterButtonStyle(chNum: number): string {
    // While the overview is being read, the Overview chip carries the
    // "you are here" ring — no chapter square should compete with it.
    const isCurrent = chNum === visibleChapterNumber && !summaryVisible;
    const isCompleted = isChapterDone(chNum);

    if (isCurrent) {
      // "You are here": a solid gold fill, no ring (owner asked for the box
      // gone). The fill has to carry the whole signal — a recently-read
      // chapter already sits on the same 20% amber tint, so merely dropping
      // the ring would leave the two near-indistinguishable.
      return "bg-amber-500 font-bold text-neutral-950 dark:bg-amber-400 dark:text-neutral-950";
    }
    if (isCompleted) {
      // Completed chapters get a clearly gold-tinted square (graded by age) so
      // they read as "done" at a glance — softer than the current chapter.
      const age = getCompletionAge(chapterTimestamps[`${bookName}:${chNum}`]);
      if (age === "recent")
        return "bg-amber-500/20 text-amber-800 ring-1 ring-inset ring-amber-500/30 font-semibold hover:bg-amber-500/28 dark:bg-amber-400/22 dark:text-amber-200 dark:ring-amber-400/25 dark:hover:bg-amber-400/30";
      if (age === "fading")
        return "bg-amber-500/11 text-amber-700/90 font-semibold hover:bg-amber-500/18 dark:bg-amber-400/13 dark:text-amber-300/85 dark:hover:bg-amber-400/20";
      return "bg-amber-500/6 text-amber-600/70 font-medium hover:bg-amber-500/12 dark:bg-amber-400/7 dark:text-amber-400/60 dark:hover:bg-amber-400/13";
    }
    return "bg-neutral-100 text-neutral-600 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-400 dark:hover:bg-neutral-700";
  }

  // Per-chapter highlight maps, built once per highlights change.
  //
  // ChapterSection is memoised, but this prop used to be built inline in the
  // render, so every chapter got a brand-new object on every ChunkReader state
  // change and the memo never held. Opening the verse sheet re-rendered — and
  // re-parsed the HTML of — every loaded chapter: a measured 160ms main-thread
  // block, and 370ms before the sheet appeared at all.
  const highlightsByChapter = useMemo(() => {
    const map = new Map<number, Record<number, VerseHighlight>>();
    for (const ch of loadedChapters) {
      map.set(
        ch.chapterNumber,
        getHighlightsForChapter(allHighlights, bookName, ch.chapterNumber),
      );
    }
    return map;
  }, [allHighlights, bookName, loadedChapters]);

  // Badge on the Notes button: grouped highlight/note entries for this book
  // (consecutive same-color/note verses count as one), matching how the drawer
  // displays them.
  const notesCount = useMemo(() => {
    const entries = Object.entries(allHighlights)
      .filter(([k]) => k.startsWith(bookName + ":"))
      .map(([k, hl]) => {
        const parts = k.split(":");
        return { chapter: parseInt(parts[1], 10), verse: parseInt(parts[2], 10), hl };
      })
      .sort((a, b) => a.chapter - b.chapter || a.verse - b.verse);
    let count = 0;
    let prev: (typeof entries)[number] | null = null;
    for (const e of entries) {
      const contiguous =
        prev &&
        prev.chapter === e.chapter &&
        prev.hl.color === e.hl.color &&
        prev.hl.note === e.hl.note &&
        e.verse === prev.verse + 1;
      if (!contiguous) count++;
      prev = e;
    }
    return count;
  }, [allHighlights, bookName]);

  // ── Render ────────────────────────────────────────────────

  return (
    <div className="min-h-screen">
      {/* Sticky header — narrow screens only. From xl up its contents move into
          the two side panels below (chapters left, tools right). */}
      <header ref={headerRef} className="sticky top-0 z-10 border-b border-neutral-200 bg-white/95 px-4 py-3 dark:border-neutral-700 dark:bg-neutral-925/95 xl:hidden">
        {/* Controls row */}
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-2">
          {/* Brand + roadmap */}
          <div className="flex min-w-0 items-center gap-2">
            <Logo compact icon={false} />
            <div className="h-5 w-px shrink-0 bg-neutral-200 dark:bg-neutral-700" />
            <button
              onClick={() => router.push("/try/bible/start")}
              aria-label="Back to library"
              title="Back to library"
              className="flex shrink-0 items-center gap-1.5 rounded-md px-1.5 py-1 text-sm font-medium tracking-[0.25px] text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="19" y1="12" x2="5" y2="12" />
                <polyline points="12 19 5 12 12 5" />
              </svg>
              <span className="hidden sm:inline">Library</span>
            </button>
          </div>

          {/* Actions */}
          <div className="flex shrink-0 items-center gap-1">
          {/* Search */}
          <button
            onClick={() => setSearchOpen(true)}
            aria-label="Search"
            className="rounded-md p-1.5 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
            </svg>
          </button>

          {/* Chapter map — only when the visible chapter mentions mappable places */}
          {chapterPlaces && chapterPlaces.places.length > 0 && (
            <button
              data-tutorial="map"
              onClick={() =>
                setMapSheet({ chapter: visibleChapterNumber, data: chapterPlaces })
              }
              aria-label={`Map of ${placeCount} ${placeCount === 1 ? "place" : "places"} in this chapter`}
              className={`relative flex items-center gap-1 rounded-md px-2 py-1 text-[0.65rem] font-medium tracking-[0.25px] leading-none transition-all ${
                mapSheet
                  ? "bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-400"
                  : "text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600 dark:hover:bg-neutral-800 dark:hover:text-neutral-300"
              }`}
            >
              {/* The printed chart needs room: 12px reduced the coastline and
                  compass rose to smudges, so this one runs at 15 — still
                  small against its neighbours, but the detail survives. */}
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z" />
                <path d="M9 4v14" />
                <path d="M15 6v14" />
                <path d="M4 14.8c1.6-1.4 2.4.5 4 .1 1.7-.4 2.2-2.1 3.9-2.1 1.7 0 2.3 1.7 4 1.5 1.6-.2 2.2-1.5 3.4-2.1" />
                <path d="M17.9 6.6l.6 1.6 1.6.6-1.6.6-.6 1.6-.6-1.6-1.6-.6 1.6-.6z" />
              </svg>
              Map <span className="tabular-nums opacity-70">{placeCount}</span>
            </button>
          )}

          {/* Notes panel */}
          <button
            onClick={() => setNotesDrawerOpen((o) => !o)}
            aria-label="View highlights and notes"
            className={`relative flex items-center gap-1 rounded-md px-2 py-1 text-[0.65rem] font-medium tracking-[0.25px] leading-none transition-all ${
              notesDrawerOpen
                ? "bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-400"
                : "text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600 dark:hover:bg-neutral-800 dark:hover:text-neutral-300"
            }`}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
            </svg>
            Notes
            {notesCount > 0 && (
              <span className="ml-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-neutral-200 px-1 text-[0.6rem] font-bold text-neutral-600 dark:bg-neutral-700 dark:text-neutral-300">
                {notesCount}
              </span>
            )}
          </button>

          {/* Settings menu (display preferences) */}
          <div ref={settingsRef} className="relative shrink-0">
            <button
              onClick={() => {
                setSettingsOpen((o) => !o);
                setBookOpen(false);
              }}
              aria-label="Display settings"
              title="Display settings"
              className={`rounded-md p-1.5 transition-colors ${
                settingsOpen
                  ? "bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-200"
                  : "text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
              }`}
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <line x1="4" y1="7" x2="20" y2="7" />
                <circle cx="9" cy="7" r="2.2" fill="currentColor" />
                <line x1="4" y1="17" x2="20" y2="17" />
                <circle cx="15" cy="17" r="2.2" fill="currentColor" />
              </svg>
            </button>
            {settingsOpen && (
              <div className="absolute right-0 top-full z-20 mt-1 w-60 rounded-lg border border-neutral-200 bg-white p-1.5 shadow-lg dark:border-neutral-700 dark:bg-neutral-800">
                <SettingsControls
                  mode={mode}
                  onMode={(m) => { setMode(m); setReadingMode(m); }}
                  fontSize={fontSize}
                  fontSizeMin={FONT_SIZE_MIN}
                  fontSizeMax={FONT_SIZE_MAX}
                  onFontSize={(d) => changeFontSize(d * FONT_SIZE_STEP)}
                  dark={dark}
                  onToggleTheme={toggleTheme}
                  bionic={bionic}
                  onToggleBionic={toggleBionic}
                  verseNumbers={verseNumbers}
                  onToggleVerseNumbers={toggleVerseNumbers}
                  redLetter={redLetter}
                  onToggleRedLetter={toggleRedLetter}
                  showCrossRefs={showCrossRefs}
                  onToggleCrossRefs={toggleCrossRefs}
                  versionAbbr={versionAbbr}
                  availableVersions={availableVersions}
                  onPickVersion={pickVersion}
                  includeTranslation
                />
              </div>
            )}
          </div>
          </div>
        </div>

        {/* Book selector + chapter strip */}
        <div className="mx-auto mt-2 flex max-w-2xl items-center gap-3">
          {/* Book selector */}
          <div ref={bookRef} className="relative shrink-0">
            <button
              onClick={() => {
                setBookOpen((o) => !o);
                setSettingsOpen(false);
              }}
              className="flex h-7 items-center rounded-md border border-neutral-300 px-2.5 text-sm font-medium tracking-[0.25px] text-neutral-700 hover:bg-neutral-50 dark:border-neutral-600 dark:text-neutral-300 dark:hover:bg-neutral-800"
            >
              {bookName}
              <span className="ml-1 text-neutral-400">▾</span>
            </button>
            {bookOpen && (
              <div className="absolute left-0 top-full z-20 mt-1 max-h-64 w-44 overflow-y-auto rounded-lg border border-neutral-200 bg-white py-1 shadow-lg dark:border-neutral-700 dark:bg-neutral-800">
                <BookMenu
                  books={sortedBooks}
                  firstNtBook={firstNtBook}
                  current={bookName}
                  onPick={(name) => {
                    setBookOpen(false);
                    navigateReadUrl(readUrl({ book: name, chapter: 1 }));
                  }}
                />
              </div>
            )}
          </div>

          {/* Chapter strip */}
          <div
            ref={chapterStripRef}
            style={{
              display: "flex",
              flexWrap: "nowrap",
              overflowX: "auto",
              gap: "4px",
              flex: "1 1 auto",
              minWidth: 0,
              paddingTop: "2px",
              paddingBottom: "2px",
              paddingLeft: "3px",
              marginRight: "-16px",
              paddingRight: "16px",
              justifyContent: chapterStripJustify,
              WebkitOverflowScrolling: "touch",
              scrollbarWidth: "none",
              msOverflowStyle: "none",
            } as React.CSSProperties}
          >
            {overviewAtStart && overviewChip(summaryVisible ? summaryStripRef : undefined)}
            {chapterNumbers.map((num) =>
              chapterLink(
                num,
                num === visibleChapterNumber && !summaryVisible ? activeChapterRef : undefined,
              ),
            )}
            {!overviewAtStart && overviewChip(summaryVisible ? summaryStripRef : undefined)}
          </div>
        </div>
      </header>

      {/* ── Wide-screen side panels ──────────────────────────────
          Everything the sticky header carries, split in two and docked to the
          edges from xl up: chapters on the left, reading tools on the right.
          Both are in the DOM at every width — CSS decides which layout shows —
          so the shared open/visible state stays in sync without a media query
          in JS (and without a flash of the wrong one before hydration). */}

      {/* Edge tabs — the only sign a folded rail is there at all. An open book
          for the navigation side, a spanner for the tools side. They fade out
          as their rail comes forward, since the rail itself is then the
          affordance. Clicking one pins its rail out until the cursor leaves. */}
      {autoHideRails && (
        <>
          <button
            onClick={() => setLeftRailOpen(true)}
            aria-label="Show navigation panel"
            title="Navigation"
            className={`fixed left-0 top-24 rounded-r-lg border-l-0 pl-1.5 pr-2 ${BOX_CLASS} ${
              leftRailOpen ? "pointer-events-none opacity-0" : "opacity-100"
            }`}
          >
            {/* Open book */}
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 6.5C10.5 5.2 8.5 4.5 6 4.5H3v14h3c2.5 0 4.5.7 6 2" />
              <path d="M12 6.5c1.5-1.3 3.5-2 6-2h3v14h-3c-2.5 0-4.5.7-6 2" />
              <path d="M12 6.5v14" />
            </svg>
          </button>
          {/* The chapter's map, straight from the text — click it and the
              sheet opens; no detour through the tools panel. It sits directly
              above the spanner in the same box, and only appears on chapters
              that actually map somewhere. The count rides the icon's corner
              rather than taking a second line, so the box stays the size of
              its neighbours. */}
          {placeCount > 0 && chapterPlaces && (
            <button
              onClick={() => setMapSheet({ chapter: visibleChapterNumber, data: chapterPlaces })}
              aria-label={`Map of ${placeCount} ${placeCount === 1 ? "place" : "places"} in this chapter`}
              title={`${placeCount} ${placeCount === 1 ? "place" : "places"} in this chapter`}
              // 42px: the tabs are 46px tall and the spanner's top edge is at
              // 96, so this lands its bottom at 88 — an 8px gap, rather than
              // the two boxes touching or overlapping.
              className={`fixed right-0 top-[2.625rem] rounded-l-lg border-r-0 pl-2 pr-1.5 ${BOX_CLASS} ${
                rightRailOpen ? "pointer-events-none opacity-0" : "opacity-100"
              }`}
            >
              <span className="relative block">
                {/* The same unfurled chart as the rail button. */}
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z" />
                  <path d="M9 4v14" />
                  <path d="M15 6v14" />
                  <path d="M4 14.8c1.6-1.4 2.4.5 4 .1 1.7-.4 2.2-2.1 3.9-2.1 1.7 0 2.3 1.7 4 1.5 1.6-.2 2.2-1.5 3.4-2.1" />
                  <path d="M17.9 6.6l.6 1.6 1.6.6-1.6.6-.6 1.6-.6-1.6-1.6-.6 1.6-.6z" />
                </svg>
                {/* Left of the icon, not right: the tab is flush with the
                    screen edge, so a badge hung off its right side is cut in
                    half by the viewport. */}
                <span className="absolute -left-1.5 -top-2 text-[10px] font-bold leading-none tabular-nums">
                  {placeCount}
                </span>
              </span>
            </button>
          )}
          <button
            onClick={() => setRightRailOpen(true)}
            aria-label="Show reading tools"
            title="Tools"
            className={`fixed right-0 top-24 rounded-l-lg border-r-0 pl-2 pr-1.5 ${BOX_CLASS} ${
              rightRailOpen ? "pointer-events-none opacity-0" : "opacity-100"
            }`}
          >
            {/* Spanner: open jaws at the head, handle running down to the
                left. The previous path collapsed into an unreadable blob. */}
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20.4 4.6a5.5 5.5 0 0 1-7.1 7.1L5.6 19.4a2.1 2.1 0 0 1-3-3l7.7-7.7a5.5 5.5 0 0 1 7.1-7.1l-3.3 3.3.9 3 3 .9 3.4-3.2z" />
            </svg>
          </button>
        </>
      )}

      {/* Left panel — way out, book picker, chapter grid */}
      <aside
        className={`fixed left-0 top-0 z-20 hidden h-screen w-[216px] flex-col border-r border-neutral-200 bg-white transition-[transform,box-shadow,border-color] duration-[420ms] ease-[cubic-bezier(0.32,0.72,0,1)] dark:border-neutral-700 dark:bg-neutral-925 xl:flex ${autoHideRails && leftRailOpen ? RAIL_GLOW_LEFT : ""}`}
        style={{ transform: autoHideRails && !leftRailOpen ? `translateX(-${RAIL_WIDTH}px)` : "translateX(0)" }}
        // A folded rail is off-screen: keep it out of the tab order and away
        // from assistive tech until it comes back.
        inert={autoHideRails && !leftRailOpen}
      >
        {/* Leaving the book sits with choosing one, above the picker. */}
        <div className="shrink-0 px-3 pb-1 pt-3">
          <button
            onClick={() => router.push("/try/bible/start")}
            className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs font-medium tracking-[0.25px] text-neutral-500 dark:text-neutral-400 ${PANEL_ROW_HOVER}`}
          >
            <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="19" y1="12" x2="5" y2="12" />
              <polyline points="12 19 5 12 12 5" />
            </svg>
            Library
          </button>
        </div>
        <div
          ref={panelBookRef}
          className="relative shrink-0 border-b border-neutral-200 px-3 pb-3 pt-1 dark:border-neutral-700"
        >
          <button
            onClick={() => setBookOpen((o) => !o)}
            className="flex h-8 w-full items-center justify-between rounded-md border border-neutral-300 px-2.5 text-sm font-medium tracking-[0.25px] text-neutral-700 hover:bg-neutral-50 dark:border-neutral-600 dark:text-neutral-300 dark:hover:bg-neutral-800"
          >
            <span className="truncate">{bookName}</span>
            <span className="ml-1 shrink-0 text-neutral-400">▾</span>
          </button>
          {bookOpen && (
            <div className="absolute left-3 right-3 top-full z-20 mt-1 max-h-[70vh] overflow-y-auto rounded-lg border border-neutral-200 bg-white py-1 shadow-lg dark:border-neutral-700 dark:bg-neutral-800">
              <BookMenu
                books={sortedBooks}
                firstNtBook={firstNtBook}
                current={bookName}
                onPick={(name) => {
                  setBookOpen(false);
                  navigateReadUrl(readUrl({ book: name, chapter: 1 }));
                }}
              />
            </div>
          )}
        </div>
        <div ref={panelChapterListRef} className="flex-1 overflow-y-auto px-3 py-3">
          {overviewAtStart && hasOverview && (
            <div className="mb-2">{overviewChip(undefined, "w-full")}</div>
          )}
          <div className="flex flex-wrap gap-1">
            {chapterNumbers.map((num) =>
              chapterLink(
                num,
                num === visibleChapterNumber && !summaryVisible
                  ? panelActiveChapterRef
                  : undefined,
              ),
            )}
          </div>
          {!overviewAtStart && hasOverview && (
            <div className="mt-2">{overviewChip(undefined, "w-full")}</div>
          )}
        </div>
      </aside>

      {/* Right panel — brand, tools, and the settings menu */}
      <aside
        className={`fixed right-0 top-0 z-20 hidden h-screen w-[216px] flex-col border-l border-neutral-200 bg-white transition-[transform,box-shadow,border-color] duration-[420ms] ease-[cubic-bezier(0.32,0.72,0,1)] dark:border-neutral-700 dark:bg-neutral-925 xl:flex ${autoHideRails && rightRailOpen ? RAIL_GLOW_RIGHT : ""}`}
        style={{ transform: autoHideRails && !rightRailOpen ? `translateX(${RAIL_WIDTH}px)` : "translateX(0)" }}
        inert={autoHideRails && !rightRailOpen}
      >
        <div className="shrink-0 border-b border-neutral-200 px-3 py-3 dark:border-neutral-700">
          <Logo compact icon={false} />
        </div>

        {/* No overflow on this list: it's a handful of fixed rows that never
            scroll, and a scroll container here would clip the settings menu,
            which is wider than the rail and opens leftward over the column. */}
        <div className="flex-1 p-2">
          <button
            onClick={() => setSearchOpen(true)}
            className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs font-medium tracking-[0.25px] text-neutral-500 dark:text-neutral-400 ${PANEL_ROW_HOVER}`}
          >
            <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
            </svg>
            Search
          </button>

          {chapterPlaces && chapterPlaces.places.length > 0 && (
            <button
              data-tutorial="map"
              onClick={() =>
                setMapSheet({ chapter: visibleChapterNumber, data: chapterPlaces })
              }
              className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs font-medium tracking-[0.25px] ${
                mapSheet
                  ? "bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-400"
                  : `text-neutral-500 dark:text-neutral-400 ${PANEL_ROW_HOVER}`
              }`}
            >
              <svg className="h-[18px] w-[18px] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z" />
                <path d="M9 4v14" />
                <path d="M15 6v14" />
                <path d="M4 14.8c1.6-1.4 2.4.5 4 .1 1.7-.4 2.2-2.1 3.9-2.1 1.7 0 2.3 1.7 4 1.5 1.6-.2 2.2-1.5 3.4-2.1" />
                <path d="M17.9 6.6l.6 1.6 1.6.6-1.6.6-.6 1.6-.6-1.6-1.6-.6 1.6-.6z" />
              </svg>
              Map <span className="tabular-nums opacity-70">{placeCount}</span>
            </button>
          )}

          <button
            onClick={() => setNotesDrawerOpen((o) => !o)}
            className={`flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-xs font-medium tracking-[0.25px] ${
              notesDrawerOpen
                ? "bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-400"
                : `text-neutral-500 dark:text-neutral-400 ${PANEL_ROW_HOVER}`
            }`}
          >
            <span className="flex items-center gap-2">
              <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
              </svg>
              Notes
            </span>
            {notesCount > 0 && (
              <span className="flex h-4 min-w-[16px] shrink-0 items-center justify-center rounded-full bg-neutral-200 px-1 text-[0.6rem] font-bold text-neutral-600 dark:bg-neutral-700 dark:text-neutral-300">
                {notesCount}
              </span>
            )}
          </button>

          {/* Display settings — behind the same icon as on narrow screens, so
              the rail stays a short list of destinations rather than a wall of
              switches. The menu is wider than the panel and opens leftward
              over the reading column. */}
          <div ref={panelSettingsRef} className="relative">
            <button
              onClick={() => {
                setSettingsOpen((o) => !o);
                setBookOpen(false);
              }}
              aria-label="Display settings"
              className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs font-medium tracking-[0.25px] ${
                settingsOpen
                  ? "bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-200"
                  : `text-neutral-500 dark:text-neutral-400 ${PANEL_ROW_HOVER}`
              }`}
            >
              <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <line x1="4" y1="7" x2="20" y2="7" />
                <circle cx="9" cy="7" r="2.2" fill="currentColor" />
                <line x1="4" y1="17" x2="20" y2="17" />
                <circle cx="15" cy="17" r="2.2" fill="currentColor" />
              </svg>
              Settings
            </button>
            {settingsOpen && (
              <div className="absolute right-0 top-full z-20 mt-1 w-60 rounded-lg border border-neutral-200 bg-white p-1.5 shadow-lg dark:border-neutral-700 dark:bg-neutral-800">
                <SettingsControls
                  mode={mode}
                  onMode={(m) => { setMode(m); setReadingMode(m); }}
                  fontSize={fontSize}
                  fontSizeMin={FONT_SIZE_MIN}
                  fontSizeMax={FONT_SIZE_MAX}
                  onFontSize={(d) => changeFontSize(d * FONT_SIZE_STEP)}
                  dark={dark}
                  onToggleTheme={toggleTheme}
                  bionic={bionic}
                  onToggleBionic={toggleBionic}
                  verseNumbers={verseNumbers}
                  onToggleVerseNumbers={toggleVerseNumbers}
                  redLetter={redLetter}
                  onToggleRedLetter={toggleRedLetter}
                  showCrossRefs={showCrossRefs}
                  onToggleCrossRefs={toggleCrossRefs}
                  versionAbbr={versionAbbr}
                  availableVersions={availableVersions}
                  onPickVersion={pickVersion}
                  includeTranslation={false}
                  autoHideRails={autoHideRails}
                  onToggleAutoHideRails={toggleAutoHideRails}
                />
              </div>
            )}
          </div>

          {/* Display choices the rail keeps in the open rather than behind the
              settings menu. */}
          <div className="mt-2 border-t border-neutral-200 pt-2 dark:border-neutral-800">
            {fullscreenAvailable && (
              <button
                onClick={toggleFullscreen}
                className={`mb-1 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs font-medium tracking-[0.25px] ${
                  fullscreen
                    ? "bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-400"
                    : `text-neutral-500 dark:text-neutral-400 ${PANEL_ROW_HOVER}`
                }`}
              >
                <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  {fullscreen ? (
                    <path d="M9 3v6H3M15 3v6h6M9 21v-6H3M15 21v-6h6" />
                  ) : (
                    <path d="M3 9V3h6M21 9V3h-6M3 15v6h6M21 15v6h-6" />
                  )}
                </svg>
                {fullscreen ? "Exit fullscreen" : "Fullscreen"}
              </button>
            )}
            <TranslationList
              versions={availableVersions}
              current={versionAbbr}
              onPick={pickVersion}
              hover="hover:bg-neutral-100 dark:hover:bg-neutral-800"
            />
          </div>
        </div>

        {/* Foot of the rail. A direct child of the aside, which is the flex
            column — the tools list above it takes flex-1, so this lands at the
            bottom of the screen rather than under the translation list. */}
        <div className="shrink-0 border-t border-neutral-200 px-4 py-3 dark:border-neutral-800">
          <p className="text-[10.5px] font-medium tracking-[0.25px] text-neutral-400 dark:text-neutral-500">
            © {new Date().getFullYear()} Readability
          </p>
          {/* Three links, spread across a single row. Dictionary and Quiz
              came out: both already have their own entries in the tools list
              directly above, and at four the row had to wrap. Three fit the
              216px rail, so justify-between can space them edge to edge
              without wrapping. */}
          <div className="mt-1 flex items-baseline justify-between whitespace-nowrap text-[10.5px] font-medium tracking-[0.25px] text-neutral-400 dark:text-neutral-500">
            <Link href="/credits" className="underline hover:text-neutral-600 dark:hover:text-neutral-300">
              Credits
            </Link>
            <Link href="/support" className="underline hover:text-neutral-600 dark:hover:text-neutral-300">
              Support
            </Link>
            <a href={GITHUB_URL} className="underline hover:text-neutral-600 dark:hover:text-neutral-300">
              GitHub
            </a>
          </div>
        </div>
      </aside>

      {/* Reading column. From xl up it's inset by the two panel widths so the
          centred scripture (and the footer's link row) clear them. */}
      <div className={autoHideRails ? "" : "xl:px-[220px]"}>

      {/* Notes drawer — sticky below header */}
      {notesDrawerOpen && (
        <>
        {/* Backdrop to close on outside click */}
        <div className="fixed inset-0 z-[8]" onClick={() => setNotesDrawerOpen(false)} />
        <div className="sticky z-[9]" style={{ top: headerHeight }}>
          <NotesDrawer
            bookName={bookName}
            highlights={allHighlights}
            onClose={() => setNotesDrawerOpen(false)}
            onScrollToVerse={(chapter, verse) => {
              setNotesDrawerOpen(false);
              scrollToVerse(chapter, verse);
            }}
          />
        </div>
        </>
      )}

      {/* Continuous chapter content */}
      <div className="px-4 py-10">
        <div
          ref={contentRef}
          className={`mx-auto max-w-2xl ${verseNumbers ? "" : "hide-verse-nums"}`}
        >
          {/* Top sentinel — triggers loading the previous chapter on scroll */}
          <div ref={topSentinelRef} className="h-1" />
          {loadingPrev && (
            <div className="flex items-center justify-center py-6">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
            </div>
          )}
          {/* Book overview — shown collapsed above chapter 1 */}
          {hasOverview &&
            overviewAtStart &&
            loadedChapters[0]?.chapterNumber === chapterNumbers[0] && (
              <section className="mb-10">
                <div
                  ref={summaryHeadingRef}
                  className="overflow-hidden rounded-2xl border border-amber-200 bg-white shadow-sm dark:border-amber-300/10 dark:bg-amber-400/5"
                >
                  <button
                    onClick={() => setOverviewExpanded((v) => !v)}
                    aria-expanded={overviewExpanded}
                    className="flex w-full items-center justify-between gap-3 px-6 py-4 text-left transition-colors hover:bg-amber-50 dark:hover:bg-amber-400/10"
                  >
                    <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-amber-800 dark:text-gold-bright">
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                      </svg>
                      {bookName} Overview
                    </span>
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className={`shrink-0 text-amber-800 transition-transform dark:text-gold-bright ${
                        overviewExpanded ? "rotate-90" : ""
                      }`}
                    >
                      <path d="M9 18l6-6-6-6" />
                    </svg>
                  </button>
                  {overviewExpanded && (
                    <div className="border-t border-amber-200 px-6 pb-6 pt-5 dark:border-amber-300/10 md:px-8">
                      <BookOverviewBody
                        bookName={bookName}
                        intro={bookIntro}
                        summary={bookSummary}
                        fontSize={fontSize}
                        versionAbbr={versionAbbr}
                      />
                    </div>
                  )}
                </div>
              </section>
            )}

          {loadedChapters.map((ch) => (
            <ChapterSection
              key={ch.chapterNumber}
              bookName={bookName}
              chapter={ch}
              bionic={bionic}
              showCrossRefs={showCrossRefs}
              redLetter={redLetter}
              fontSize={fontSize}
              mode={mode}
              chapterHighlights={highlightsByChapter.get(ch.chapterNumber) ?? EMPTY_HIGHLIGHTS}
              onHeadingMount={handleHeadingMount}
              onReadingComplete={handleReadingCompleteForSection}
              onNextChapter={handleNextChapterForSection}
              onSkipQuiz={handleSkipQuiz}
              onSwitchToReadMode={handleSwitchToReadMode}
            />
          ))}

          {/* The overview is now an introduction shown at the START of the book
              (above chapter 1), so there is no end-of-book recap here anymore. */}

          {/* Loading indicator */}
          {loadingNext && (
            <div className="flex items-center justify-center py-10">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
            </div>
          )}

          {/* End of book */}
          {!loadingNext &&
            loadedChapters.length > 0 &&
            chapterNumbers.indexOf(
              loadedChapters[loadedChapters.length - 1].chapterNumber,
            ) === chapterNumbers.length - 1 && (
              <div className="py-10 text-center">
                <p className="mb-4 text-sm font-medium text-neutral-500 dark:text-neutral-400">
                  End of {bookName}
                </p>
                <button
                  onClick={() => router.push("/try/bible/start")}
                  className="rounded-lg bg-amber-600 px-5 py-2.5 text-sm font-semibold text-neutral-950 shadow-sm transition-colors hover:bg-amber-700"
                >
                  Back to Library →
                </button>
              </div>
            )}
        </div>
      </div>

      <SiteFooter />
      </div>

      {/* Selection highlight toolbar — rendered via portal to avoid nesting issues */}
      {selectionToolbar &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={toolbarRef}
            className="absolute z-50"
            style={{
              left: `${selectionToolbar.x}px`,
              top: `${selectionToolbar.y - 8}px`,
              transform: "translate(-50%, -100%)",
            }}
          >
            <div className="rounded-xl bg-white shadow-xl ring-1 ring-neutral-200 dark:bg-neutral-800 dark:ring-neutral-700">
              <div className="flex items-center gap-1.5 px-2.5 py-2">
                <span className="text-sm font-bold text-neutral-500 dark:text-neutral-400">Highlight</span>
                {HIGHLIGHT_COLORS.map((c) => (
                  <button
                    key={c.name}
                    onClick={() => handleHighlightColor(c.name)}
                    className={`h-7 w-7 shrink-0 rounded-full ${c.dot} transition-transform hover:scale-110 active:scale-95`}
                  />
                ))}
                <button
                  onClick={() => setShowNoteInput((o) => !o)}
                  className={`shrink-0 rounded p-0.5 ${showNoteInput ? "text-amber-700 dark:text-amber-400" : "text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300"}`}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                </button>
                <button
                  onClick={() => {
                    const { quote, verses } = selectionToolbar;
                    // Copy the selected text, its reference, and the deep link.
                    const reference = formatReference(bookName, verses);
                    const text = quote ? `“${quote}” — ${reference}` : reference;
                    const first = [...verses].sort(
                      (a, b) => a.chapter - b.chapter || a.verse - b.verse,
                    )[0];
                    // Deep link to the first verse; the reader scrolls to
                    // ?verse=N on load. Always link to the production site —
                    // shared quotes should point people at the real website,
                    // not a dev server or the mobile app's local origin.
                    const link = `${SITE_URL}${readUrl({ chapter: first.chapter })}&verse=${first.verse}`;
                    void navigator.clipboard?.writeText(`${text}\n${link}`);
                    setCopiedRef(true);
                    window.setTimeout(() => setCopiedRef(false), 1500);
                  }}
                  title={`Copy quote (${formatReference(bookName, selectionToolbar.verses)})`}
                  aria-label="Copy quote"
                  className={`shrink-0 rounded p-0.5 ${copiedRef ? "text-amber-700 dark:text-amber-400" : "text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300"}`}
                >
                  {copiedRef ? (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
                  ) : (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                  )}
                </button>
                {selectionToolbar.verses.some((v) => allHighlights[`${bookName}:${v.chapter}:${v.verse}`]) && (
                  <button
                    onClick={handleRemoveHighlight}
                    className="shrink-0 rounded p-0.5 text-neutral-400 hover:text-red-500"
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                  </button>
                )}
              </div>
              {showNoteInput && (
                <div className="border-t border-neutral-100 px-2 py-1.5 dark:border-neutral-700">
                  <textarea
                    value={selectionNote}
                    onChange={(e) => setSelectionNote(e.target.value)}
                    placeholder="Add a note..."
                    rows={4}
                    className="w-full resize-none rounded border border-neutral-200 bg-neutral-50 px-2 py-1 text-xs text-neutral-700 placeholder-neutral-400 focus:border-amber-400 focus:outline-none dark:border-neutral-600 dark:bg-neutral-700 dark:text-neutral-200"
                    autoFocus
                    onMouseDown={(e) => e.stopPropagation()}
                  />
                  <button
                    onClick={handleSaveNote}
                    className="mt-1 w-full rounded bg-amber-600 py-1 text-xs font-semibold text-neutral-950 hover:bg-amber-700"
                  >
                    Save
                  </button>
                </div>
              )}
            </div>
            {/* Arrow pointing down */}
            <div className="flex justify-center">
              <div className="h-2 w-2 rotate-45 border-b border-r border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-800" />
            </div>
          </div>,
          document.body,
        )}

      <SearchModal open={searchOpen} onClose={() => setSearchOpen(false)} version={versionAbbr} />
      {mapSheet && (
        <ChapterMapSheet
          bookName={bookName}
          chapter={mapSheet.chapter}
          data={mapSheet.data}
          onClose={() => setMapSheet(null)}
          onGoToVerse={(verse) => {
            setMapSheet(null);
            scrollToVerse(mapSheet.chapter, verse);
          }}
        />
      )}
      {verseSheet && (
        <VerseSheet
          bookName={bookName}
          chapter={verseSheet.chapter}
          verse={verseSheet.verse}
          versionAbbr={versionAbbr}
          highlight={sheetHighlight}
          onHighlight={handleSheetHighlight}
          onRemoveHighlight={handleSheetRemoveHighlight}
          onSaveNote={handleSheetSaveNote}
          onClose={() => setVerseSheet(null)}
        />
      )}
      {/* The chapter Map button isn't on every chapter, so it's taught on
          first contact rather than up front. */}
      <FirstContactHint
        selector='[data-tutorial="map"]'
        storageKey="hint-map-seen"
        title="This chapter has a map"
        description="When a chapter names real places, a Map button appears here. Open it to see where they are, and tap any place to read about it."
      />
    </div>
  );
}
