"use client";

/**
 * Bottom sheet opened by tapping a verse in the reader: the verse as a study
 * hub. The verse text and highlight/note/copy actions stay visible; the study
 * tools below — Tyndale study notes, cross-references, original-language
 * words, and other translations — are collapsed accordion rows so the sheet
 * stays scannable. Which rows are expanded is remembered across opens (and
 * across verses), so a reader who always wants, say, study notes reaches them
 * in one tap.
 */
import {
  type MouseEvent,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { chapterReference } from "@/lib/bible-book-order";
import {
  parseScriptureRefs,
  scriptureRefLabel,
  type ScripturePassage,
} from "@/lib/scripture-refs";
import { VersePeek } from "@/components/verse-peek";
import { useDragToExpand, SheetGrabber } from "@/components/draggable-sheet";
import {
  fetchVerseVersions,
  fetchCrossRefs,
  fetchStrongsWords,
  fetchInterlinear,
  fetchTyndaleNotes,
  type VerseVersion,
  type CrossRef,
  type StrongsWord,
  type InterlinearData,
  type TyndaleNote,
} from "@/lib/content/client";
import { InterlinearView } from "./interlinear-view";
import {
  HIGHLIGHT_COLORS,
  type HighlightColor,
  type VerseHighlight,
} from "@/lib/highlights-service";

/** "Psalm 148:4-5" / "Genesis 1:31-2:1" — a cross-reference's display label. */
function refLabel(r: CrossRef): string {
  let label = `${chapterReference(r.book, r.chapter)}:${r.verse}`;
  if (r.endChapter) label += `-${r.endChapter}:${r.endVerse}`;
  else if (r.endVerse && r.endVerse !== r.verse) label += `-${r.endVerse}`;
  return label;
}

const INITIAL_REFS_SHOWN = 6;

// Persisted accordion state: the section ids the reader last had expanded.
const SECTIONS_KEY = "verseSheetSections";

function readSavedSections(): Set<string> {
  try {
    const raw = localStorage.getItem(SECTIONS_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return new Set(
      Array.isArray(arr) ? arr.filter((s) => typeof s === "string") : [],
    );
  } catch {
    return new Set();
  }
}

/** Collapsible section row: uppercase label, optional count, chevron. */
function SheetSection({
  title,
  count,
  open,
  onToggle,
  children,
}: {
  title: string;
  count?: number;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <div className="border-t border-neutral-100 dark:border-neutral-800">
      <button
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center justify-between py-3 text-left"
      >
        <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-neutral-400">
          {title}
          {count != null && (
            <span className="font-medium tracking-normal text-neutral-400">
              ({count})
            </span>
          )}
        </span>
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`shrink-0 text-neutral-300 transition-transform dark:text-neutral-600 ${
            open ? "rotate-180" : ""
          }`}
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {open && <div className="pb-4">{children}</div>}
    </div>
  );
}

/** Note prose with scripture references linkified for the verse peek. */
function NoteText({
  text,
  book,
  chapter,
  onPeek,
}: {
  text: string;
  book: string;
  chapter: number;
  onPeek: (ref: ScripturePassage) => void;
}) {
  const refs = useMemo(
    () => parseScriptureRefs(text, book, chapter),
    [text, book, chapter],
  );

  const nodes: ReactNode[] = [];
  let last = 0;
  refs.forEach((r, i) => {
    if (r.index > last) nodes.push(text.slice(last, r.index));
    nodes.push(
      <button
        key={i}
        onClick={() => onPeek(r)}
        className="cursor-pointer underline decoration-dotted decoration-neutral-400/70 underline-offset-2 transition-colors hover:text-gold hover:decoration-gold dark:decoration-neutral-500/70 dark:hover:text-gold-bright"
        aria-label={`Preview ${scriptureRefLabel(r)}`}
      >
        {text.slice(r.index, r.index + r.length)}
      </button>,
    );
    last = r.index + r.length;
  });
  if (last < text.length) nodes.push(text.slice(last));

  return (
    // Content grey, not apparatus grey: the note body is the longest prose in
    // the sheet, so it sits at the same step as cross-ref previews and the
    // translation list — only labels/chips stay muted.
    <p className="whitespace-pre-line text-sm leading-relaxed text-neutral-700 dark:text-neutral-300">
      {nodes}
    </p>
  );
}

export function VerseSheet({
  bookName,
  chapter,
  verse,
  versionAbbr,
  highlight,
  onHighlight,
  onRemoveHighlight,
  onSaveNote,
  onClose,
}: {
  bookName: string;
  chapter: number;
  verse: number;
  versionAbbr: string;
  highlight: VerseHighlight | null;
  onHighlight: (color: HighlightColor) => void;
  onRemoveHighlight: () => void;
  onSaveNote: (note: string) => void;
  onClose: () => void;
}) {
  const [versions, setVersions] = useState<VerseVersion[] | null>(null);
  const [crossRefs, setCrossRefs] = useState<CrossRef[] | null>(null);
  const [showAllRefs, setShowAllRefs] = useState(false);
  const [strongsWords, setStrongsWords] = useState<StrongsWord[] | null>(null);
  const [interlinear, setInterlinear] = useState<InterlinearData | null>(null);
  const [tyndaleNotes, setTyndaleNotes] = useState<TyndaleNote[] | null>(null);
  const [openWord, setOpenWord] = useState<number | null>(null);
  const [openSections, setOpenSections] = useState<Set<string>>(new Set());
  const [peek, setPeek] = useState<ScripturePassage | null>(null);
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteDraft, setNoteDraft] = useState(highlight?.note ?? "");
  const [copied, setCopied] = useState(false);
  const noteRef = useRef<HTMLTextAreaElement>(null);

  const reference = `${chapterReference(bookName, chapter)}:${verse}`;

  const { sheetRef, dragging, maxHeight, grabberProps } = useDragToExpand({
    snapPoints: [0.75, 0.94],
    onClose,
  });

  function toggleSection(id: string) {
    const next = new Set(openSections);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setOpenSections(next);
    try {
      localStorage.setItem(SECTIONS_KEY, JSON.stringify([...next]));
    } catch {
      // Storage full/blocked: the toggle still works for this open.
    }
  }

  useEffect(() => {
    let cancelled = false;
    setVersions(null);
    setCrossRefs(null);
    setShowAllRefs(false);
    setStrongsWords(null);
    setInterlinear(null);
    setTyndaleNotes(null);
    setOpenWord(null);
    setOpenSections(readSavedSections());
    setPeek(null);
    fetchVerseVersions(bookName, chapter, verse).then((v) => {
      if (!cancelled) setVersions(v);
    });
    fetchCrossRefs(bookName, chapter, verse, versionAbbr).then((r) => {
      if (!cancelled) setCrossRefs(r);
    });
    fetchStrongsWords(bookName, chapter, verse).then((w) => {
      if (!cancelled) setStrongsWords(w);
    });
    fetchInterlinear(bookName, chapter, verse).then((w) => {
      if (!cancelled) setInterlinear(w);
    });
    fetchTyndaleNotes(bookName, chapter, verse).then((n) => {
      if (!cancelled) setTyndaleNotes(n);
    });
    return () => {
      cancelled = true;
    };
  }, [bookName, chapter, verse, versionAbbr]);

  function refHref(r: CrossRef) {
    return `/try/bible/read?book=${encodeURIComponent(r.book)}&chapter=${r.chapter}&version=${versionAbbr}&verse=${r.verse}`;
  }

  // Plain click closes the sheet and navigates in place; Ctrl/Cmd/middle click
  // is left to the browser so the cross-reference opens in a new tab.
  function handleNavigate(e: MouseEvent<HTMLAnchorElement>) {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    onClose();
  }

  // Close on Escape — unless a verse peek is stacked on top; its own Escape
  // handler closes it, and the sheet should stay put underneath.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && peek === null) onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, peek]);

  useEffect(() => {
    if (noteOpen) noteRef.current?.focus();
  }, [noteOpen]);

  const current = versions?.find((v) => v.abbr === versionAbbr);
  const others = versions?.filter((v) => v.abbr !== versionAbbr) ?? [];

  function copyVerse() {
    const text = current?.text ?? "";
    void navigator.clipboard
      .writeText(`“${text}” — ${reference} (${versionAbbr})`)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      {/* Sheet */}
      <div
        ref={sheetRef}
        className="relative flex w-full max-w-2xl flex-col rounded-t-2xl border border-b-0 border-neutral-200 bg-white shadow-2xl dark:border-neutral-700 dark:bg-neutral-900"
        style={{
          maxHeight,
          transition: dragging ? "none" : "max-height 300ms ease",
        }}
      >
        <SheetGrabber {...grabberProps} dragging={dragging} />
        {/* Header */}
        <div className="flex items-center justify-between px-5 pb-2 pt-1">
          <span className="text-base font-semibold text-gold dark:text-gold-bright">
            {reference}
            <span className="ml-2 text-xs font-medium text-neutral-400">
              {versionAbbr}
            </span>
          </span>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-xl leading-none text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-600 dark:hover:bg-neutral-800 dark:hover:text-neutral-300"
            aria-label="Close verse panel"
          >
            ×
          </button>
        </div>

        <div className="overflow-y-auto px-5 pb-8">
          {/* Verse text (current translation) — set as scripture, matching
              the reading surface behind the sheet */}
          <p className="font-scripture font-[450] leading-relaxed text-neutral-700 dark:font-normal dark:text-neutral-300">
            {current ? (
              current.text
            ) : (
              <span className="text-neutral-400">Loading…</span>
            )}
          </p>

          {/* Actions: highlight colors, note, copy */}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {HIGHLIGHT_COLORS.map((c) => (
              <button
                key={c.name}
                onClick={() => onHighlight(c.name)}
                className={`h-7 w-7 rounded-full ${c.dot} transition-transform hover:scale-110 ${
                  highlight?.color === c.name
                    ? "ring-2 ring-offset-2 ring-neutral-400 dark:ring-offset-neutral-900"
                    : ""
                }`}
                aria-label={`Highlight ${c.name}`}
              />
            ))}
            {highlight && (
              <button
                onClick={onRemoveHighlight}
                className="rounded-full border border-neutral-300 px-2.5 py-1 text-xs font-medium text-neutral-500 transition-colors hover:bg-neutral-100 dark:border-neutral-600 dark:text-neutral-400 dark:hover:bg-neutral-800"
              >
                Remove
              </button>
            )}
            <div className="mx-1 h-5 w-px bg-neutral-200 dark:bg-neutral-700" />
            <button
              onClick={() => setNoteOpen((o) => !o)}
              className="rounded-full border border-neutral-300 px-3 py-1 text-xs font-medium text-neutral-600 transition-colors hover:bg-neutral-100 dark:border-neutral-600 dark:text-neutral-300 dark:hover:bg-neutral-800"
            >
              {highlight?.note ? "Edit note" : "Note"}
            </button>
            <button
              onClick={copyVerse}
              disabled={!current}
              className="rounded-full border border-neutral-300 px-3 py-1 text-xs font-medium text-neutral-600 transition-colors hover:bg-neutral-100 disabled:opacity-50 dark:border-neutral-600 dark:text-neutral-300 dark:hover:bg-neutral-800"
            >
              {copied ? "Copied ✓" : "Copy"}
            </button>
          </div>

          {/* Note editor */}
          {noteOpen && (
            <div className="mt-3">
              <textarea
                ref={noteRef}
                value={noteDraft}
                onChange={(e) => setNoteDraft(e.target.value)}
                placeholder="Your note on this verse…"
                rows={3}
                className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-800 outline-none placeholder:text-neutral-400 focus:border-amber-400 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-100"
              />
              <div className="mt-1.5 flex justify-end gap-2">
                <button
                  onClick={() => setNoteOpen(false)}
                  className="rounded-md px-3 py-1 text-xs font-medium text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    onSaveNote(noteDraft.trim());
                    setNoteOpen(false);
                  }}
                  className="rounded-md bg-amber-600 px-3 py-1 text-xs font-semibold text-neutral-950 hover:bg-amber-700"
                >
                  Save note
                </button>
              </div>
            </div>
          )}
          {!noteOpen && highlight?.note && (
            <p className="mt-3 rounded-lg bg-neutral-100/80 px-3 py-2 text-sm italic text-neutral-700 dark:bg-neutral-800/60 dark:text-neutral-300">
              ✎ {highlight.note}
            </p>
          )}

          <div className="mt-5">
            {/* Tyndale study notes — per-verse notes from the Tyndale Open
                Study Notes (Tyndale House Publishers, CC BY-SA 4.0) */}
            {tyndaleNotes !== null && tyndaleNotes.length > 0 && (
              <SheetSection
                title="Study notes"
                count={tyndaleNotes.length}
                open={openSections.has("tyndale")}
                onToggle={() => toggleSection("tyndale")}
              >
                <ul className="space-y-3">
                  {tyndaleNotes.map((n) => (
                    <li key={n.range}>
                      <span className="mb-0.5 mr-2 inline-block rounded-md bg-neutral-100 px-1.5 py-0.5 text-xs font-semibold tabular-nums text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">
                        {n.range}
                      </span>
                      <NoteText
                        text={n.text}
                        book={bookName}
                        chapter={chapter}
                        onPeek={setPeek}
                      />
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-[11px] text-neutral-400">
                  Adapted from{" "}
                  <a
                    href="https://tyndaleopenresources.com/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline decoration-neutral-300 underline-offset-2 hover:text-neutral-500"
                  >
                    Tyndale Open Study Notes
                  </a>
                  , © Tyndale House Publishers (CC BY-SA 4.0)
                </p>
              </SheetSection>
            )}

            {/* Cross-references — "Scripture interprets Scripture" */}
            <SheetSection
              title="Cross-references"
              count={crossRefs?.length}
              open={openSections.has("refs")}
              onToggle={() => toggleSection("refs")}
            >
              {crossRefs === null ? (
                <div className="flex justify-center py-4">
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-neutral-300 border-t-amber-500" />
                </div>
              ) : crossRefs.length === 0 ? (
                <p className="py-1 text-sm text-neutral-400">
                  No cross-references for this verse.
                </p>
              ) : (
                <>
                  <ul className="space-y-1">
                    {(showAllRefs ? crossRefs : crossRefs.slice(0, INITIAL_REFS_SHOWN)).map(
                      (r) => (
                        <li key={refLabel(r)}>
                          <Link
                            href={refHref(r)}
                            onClick={handleNavigate}
                            className="-mx-2 block w-[calc(100%+1rem)] rounded-lg px-2 py-1.5 text-left text-sm transition-colors hover:bg-neutral-50 dark:hover:bg-neutral-800"
                          >
                            <span className="font-semibold text-gold dark:text-gold-bright">
                              {refLabel(r)}
                            </span>{" "}
                            <span className="leading-relaxed text-neutral-600 dark:text-neutral-300">
                              {r.text.length > 160 ? r.text.slice(0, 160).replace(/\s+\S*$/, "") + "…" : r.text}
                            </span>
                          </Link>
                        </li>
                      ),
                    )}
                  </ul>
                  {crossRefs.length > INITIAL_REFS_SHOWN && !showAllRefs && (
                    <button
                      onClick={() => setShowAllRefs(true)}
                      className="mt-1 text-xs font-medium text-gold hover:underline dark:text-gold-bright"
                    >
                      Show all {crossRefs.length}
                    </button>
                  )}
                  <p className="mt-2 text-[11px] text-neutral-400">
                    Treasury of Scripture Knowledge, via{" "}
                    <a
                      href="https://www.openbible.info/labs/cross-references/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline decoration-neutral-300 underline-offset-2 hover:text-neutral-500"
                    >
                      OpenBible.info
                    </a>{" "}
                    (CC-BY)
                  </p>
                </>
              )}
            </SheetSection>

            {/* Original-language words — a reverse interlinear (two linked
                sentences). Falls back to a plain word list when interlinear
                data isn't available (e.g. the offline mobile build). */}
            {((interlinear && interlinear.words.length > 0) ||
              (strongsWords && strongsWords.length > 0)) && (
              <SheetSection
                title="Original words"
                count={
                  interlinear && interlinear.words.length > 0
                    ? undefined
                    : strongsWords?.length
                }
                open={openSections.has("words")}
                onToggle={() => toggleSection("words")}
              >
                {interlinear && interlinear.words.length > 0 ? (
                  <InterlinearView data={interlinear} version={versionAbbr} />
                ) : (
                  <>
                    <ul className="space-y-0.5">
                      {(strongsWords ?? []).map((w, i) => {
                        // the same Strong's number can occur several times in a
                        // verse (articles, repeated words) — key/toggle by position
                        const open = openWord === i;
                        return (
                          <li key={i}>
                            <button
                              onClick={() => setOpenWord(open ? null : i)}
                              className="-mx-2 w-[calc(100%+1rem)] rounded-lg px-2 py-1 text-left text-sm transition-colors hover:bg-neutral-50 dark:hover:bg-neutral-800"
                            >
                              <span className="font-semibold text-neutral-800 dark:text-neutral-100">
                                {w.surface || w.lemma}
                              </span>{" "}
                              <span className="italic text-neutral-500 dark:text-neutral-400">
                                {w.surfaceTranslit || w.translit}
                              </span>{" "}
                              <span className="text-neutral-400">— “{w.word}”</span>
                              <span className="ml-1.5 text-[10px] font-medium tabular-nums text-neutral-300 dark:text-neutral-600">
                                {w.num}
                              </span>
                            </button>
                            {open && (
                              <div className="mb-1.5 ml-2 rounded-lg bg-neutral-100/80 px-3 py-2 text-sm leading-relaxed text-neutral-700 dark:bg-neutral-800/60 dark:text-neutral-300">
                                <p>
                                  <span className="font-medium text-neutral-700 dark:text-neutral-300">
                                    {w.lemma}
                                  </span>{" "}
                                  <span className="italic text-neutral-500 dark:text-neutral-400">
                                    {w.translit}
                                  </span>
                                  {w.def && <> — {w.def}</>}
                                </p>
                                {w.kjv && (
                                  <p className="mt-1 text-xs text-neutral-500">
                                    KJV renderings: {w.kjv}
                                  </p>
                                )}
                              </div>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                    <p className="mt-2 text-[11px] text-neutral-400">
                      {(strongsWords?.[0]?.num ?? "").startsWith("H") ? "TAHOT" : "TAGNT"} from{" "}
                      <a
                        href="https://github.com/STEPBible/STEPBible-Data"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline decoration-neutral-300 underline-offset-2 hover:text-neutral-500"
                      >
                        STEPBible
                      </a>{" "}
                      (CC BY 4.0); definitions from Strong’s via{" "}
                      <a
                        href="https://github.com/openscriptures/strongs"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline decoration-neutral-300 underline-offset-2 hover:text-neutral-500"
                      >
                        Open Scriptures
                      </a>{" "}
                      (CC-BY-SA)
                    </p>
                  </>
                )}
              </SheetSection>
            )}

            {/* Compare translations */}
            <SheetSection
              title="Other translations"
              count={versions === null ? undefined : others.length}
              open={openSections.has("versions")}
              onToggle={() => toggleSection("versions")}
            >
              {versions === null ? (
                <div className="flex justify-center py-4">
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-neutral-300 border-t-amber-500" />
                </div>
              ) : others.length === 0 ? (
                <p className="py-2 text-sm text-neutral-400">
                  No other translations carry this verse.
                </p>
              ) : (
                <ul className="space-y-3">
                  {others.map((v) => (
                    <li key={v.abbr} className="text-sm leading-relaxed">
                      <span
                        className="mr-2 inline-block rounded-md bg-neutral-100 px-1.5 py-0.5 text-xs font-semibold text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400"
                        title={v.name}
                      >
                        {v.abbr}
                      </span>
                      <span className="font-scripture font-[450] text-neutral-600 dark:font-normal dark:text-neutral-300">
                        {v.text}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </SheetSection>

          </div>
        </div>
      </div>

      {/* Verse peek from a reference in a note — stacks on the sheet */}
      {peek && (
        <VersePeek
          reference={peek}
          versionAbbr={versionAbbr}
          onClose={() => setPeek(null)}
        />
      )}
    </div>
  );
}
