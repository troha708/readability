"use client";

/**
 * Small bottom sheet opened by tapping a scripture reference inside a note or
 * book introduction: the referenced verses shown in place, with a link out for
 * whoever wants the full context. A peek, not a navigation — closing it
 * leaves the reader exactly where they were.
 */
import { type MouseEvent, type ReactNode, useEffect, useState } from "react";
import Link from "next/link";
import {
  type ScripturePassage,
  scriptureRefLabel,
} from "@/lib/scripture-refs";
import { fetchPassage, type PassageVerse } from "@/lib/content/client";
import { useDragToExpand, SheetGrabber } from "@/components/draggable-sheet";

/** Verses shown for a chapter-only reference before "Read the chapter". */
const CHAPTER_PREVIEW_VERSES = 3;

export function VersePeek({
  reference,
  versionAbbr,
  onClose,
}: {
  reference: ScripturePassage;
  versionAbbr: string;
  onClose: () => void;
}) {
  const [result, setResult] = useState<{
    version: string;
    verses: PassageVerse[];
  } | null>(null);
  const [failed, setFailed] = useState(false);

  const { sheetRef, dragging, maxHeight, grabberProps } = useDragToExpand({
    snapPoints: [0.6, 0.94],
    onClose,
  });

  const label = scriptureRefLabel(reference);
  const chapterOnly = reference.verse == null;
  const start = reference.verse ?? 1;
  // Cross-chapter ranges peek only the opening chapter's tail (the API caps
  // and skips past-the-end verses); chapter-only refs get a short preview.
  const end = chapterOnly
    ? CHAPTER_PREVIEW_VERSES
    : reference.endChapter != null
      ? start + 11
      : (reference.endVerse ?? start);
  const partial = chapterOnly || reference.endChapter != null;

  useEffect(() => {
    let cancelled = false;
    setResult(null);
    setFailed(false);
    fetchPassage(reference.book, reference.chapter, start, end, versionAbbr).then(
      (r) => {
        if (cancelled) return;
        if (r.verses.length === 0) setFailed(true);
        else setResult(r);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [reference, versionAbbr, start, end]);

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const passageHref =
    `/try/bible/read?book=${encodeURIComponent(reference.book)}&chapter=${reference.chapter}&version=${versionAbbr}` +
    (reference.verse != null ? `&verse=${reference.verse}` : "");

  // Plain click closes the peek and navigates in place; Ctrl/Cmd/middle click
  // is left to the browser so "Read in context" opens in a new tab.
  function handleNavigate(e: MouseEvent<HTMLAnchorElement>) {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      {/* Sheet */}
      <div
        ref={sheetRef}
        className="relative flex w-full max-w-2xl flex-col rounded-t-2xl border border-b-0 border-neutral-200 bg-paper shadow-2xl dark:border-neutral-700 dark:bg-neutral-900"
        style={{
          maxHeight,
          transition: dragging ? "none" : "max-height 300ms ease",
        }}
      >
        <SheetGrabber {...grabberProps} dragging={dragging} />
        <div className="flex items-center justify-between px-5 pb-2 pt-1">
          <span className="text-base font-semibold text-amber-700 dark:text-amber-400">
            {label}
            <span className="ml-2 text-xs font-medium text-neutral-400">
              {result?.version ?? versionAbbr}
            </span>
          </span>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-xl leading-none text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-600 dark:hover:bg-neutral-800 dark:hover:text-neutral-300"
            aria-label="Close verse preview"
          >
            ×
          </button>
        </div>

        <div className="overflow-y-auto px-5 pb-8">
          {result === null && !failed ? (
            <div className="flex justify-center py-4">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-neutral-300 border-t-amber-500" />
            </div>
          ) : failed ? (
            <p className="py-1 text-sm text-neutral-400">
              This passage couldn&rsquo;t be loaded.
            </p>
          ) : (
            <p className="leading-relaxed text-neutral-800 dark:text-neutral-100">
              {result!.verses.map((v) => (
                <span key={v.verse}>
                  <sup className="mr-px select-none align-super text-[0.6em] leading-none text-neutral-400/70 dark:text-neutral-500/70">
                    {v.verse}
                  </sup>{" "}
                  {v.text}{" "}
                </span>
              ))}
              {partial && <span className="text-neutral-400">…</span>}
            </p>
          )}

          <Link
            href={passageHref}
            onClick={handleNavigate}
            className="mt-4 inline-block text-sm font-medium text-amber-600 hover:underline dark:text-amber-400"
          >
            Read in context →
          </Link>
        </div>
      </div>
    </div>
  );
}

/**
 * Self-contained tappable reference for prose outside the reader (e.g. the
 * landing page's sample note): the same dotted underline scripture refs get
 * in-app, opening the peek sheet on tap.
 */
export function VersePeekLink({
  reference,
  versionAbbr = "BSB",
  className,
  children,
}: {
  reference: ScripturePassage;
  versionAbbr?: string;
  /** Override the default dotted-underline styling (e.g. a calmer look in
   *  the reference-dense book overview). */
  className?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={
          className ??
          "cursor-pointer underline decoration-dotted decoration-neutral-400/70 underline-offset-2 transition-colors hover:text-amber-700 hover:decoration-amber-500 dark:decoration-neutral-500/70 dark:hover:text-amber-400"
        }
        aria-label={`Preview ${scriptureRefLabel(reference)}`}
      >
        {children}
      </button>
      {open && (
        <VersePeek
          reference={reference}
          versionAbbr={versionAbbr}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
