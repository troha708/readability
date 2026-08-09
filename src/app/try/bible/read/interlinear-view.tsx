"use client";

/**
 * The "Original words" body: the verse as two aligned, tappable sentences —
 * the original language on top, and below it the translation you're reading
 * (BSB, or the KJV when that's selected) — that link word by word. Tap a word
 * in either line and its partner highlights in the other, with its gloss,
 * transliteration, Strong's number, and definition shown beneath. Because the
 * two texts run in their own word order, the highlighted partner often sits in
 * a different position — which shows how the translation rearranges.
 *
 * With a word selected, the left/right arrow keys step the selection through
 * the line it was chosen from.
 *
 * The BSB line comes from the Berean word data (one entry per original word).
 * The KJV line comes from the shipped KJV text tagged with Strong's, each token
 * linked to a Greek/Hebrew word by number (or unlinked where the KJV's
 * Textus-Receptus basis differs from the critical text, or the word is supplied).
 */
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import type { InterlinearData, InterlinearWord } from "@/lib/content/client";

type Line = "orig" | "eng";
type El = { text: string; link: number; token?: InterlinearData["kjv"][number] };
type Detail =
  | { supplied: true }
  | { head: string; translit: string; parse: string; strong: string; gloss: string; def: string; kjv: string }
  | null;

export function InterlinearView({
  data,
  version,
}: {
  data: InterlinearData;
  version: string;
}) {
  const { words, kjv } = data;
  const isKjv = version === "KJV" && kjv.length > 0;

  const [sel, setSel] = useState<{ line: Line; idx: number } | null>(null);
  useEffect(() => setSel(null), [data]);

  // The selected word's button, so DOM focus can follow the selection. Without
  // this the focus outline sticks to the word first clicked while the arrows
  // move the highlight to a different word — leaving a stray box behind.
  const btnRefs = useRef(new Map<string, HTMLButtonElement>());

  const originLang = useMemo(
    () => (words.some((w) => w.strong.startsWith("H")) ? "Hebrew" : "Greek"),
    [words],
  );
  const original: El[] = useMemo(
    () =>
      words
        .filter((w) => w.orig)
        .sort((a, b) => a.gkSort - b.gkSort)
        .map((w) => ({ text: w.orig, link: w.id })),
    [words],
  );
  const english: El[] = useMemo(
    () =>
      isKjv
        ? kjv.map((t) => ({ text: t.text, link: t.link, token: t }))
        : words
            .filter((w) => w.bsb)
            .sort((a, b) => a.bsbSort - b.bsbSort)
            .map((w) => ({ text: w.bsb, link: w.id })),
    [words, kjv, isKjv],
  );

  const lineOf = (l: Line) => (l === "orig" ? original : english);
  const selLink = sel ? lineOf(sel.line)[sel.idx]?.link ?? null : null;

  // Left/right arrows step through the line the word was selected from.
  useEffect(() => {
    if (!sel) return;
    const len = lineOf(sel.line).length;
    function onKey(e: KeyboardEvent) {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
      // A selected word owns the arrows — swallow them even at the line's
      // ends so they never reach the reader's chapter-strip scroller.
      e.preventDefault();
      e.stopPropagation();
      const next = sel!.idx + (e.key === "ArrowRight" ? 1 : -1);
      if (next < 0 || next >= len) return;
      setSel({ line: sel!.line, idx: next });
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sel, original, english]);

  // Move DOM focus onto the selected word so the focus outline tracks the
  // highlight instead of lingering on whichever word was first clicked.
  // preventScroll: the words all sit within the open section; no jump wanted.
  useEffect(() => {
    if (!sel) return;
    btnRefs.current.get(`${sel.line}-${sel.idx}`)?.focus({ preventScroll: true });
  }, [sel]);

  const detail: Detail = useMemo(() => {
    if (selLink == null) return null;
    if (selLink >= 0) {
      const w = words.find((x) => x.id === selLink);
      if (!w) return null;
      if (!w.strong) return { supplied: true };
      return { head: w.lemma || w.orig, translit: w.translit, parse: w.parse, strong: w.strong, gloss: w.gloss, def: w.def, kjv: w.kjv };
    }
    const tok = english.find((e) => e.link === selLink)?.token;
    if (!tok) return null;
    if (!tok.strong) return { supplied: true };
    return { head: tok.lemma, translit: tok.translit, parse: "", strong: tok.strong, gloss: "", def: tok.def, kjv: "" };
  }, [selLink, words, english]);

  function renderLine(items: El[], line: Line) {
    return items.map((el, i) => (
      <Fragment key={`${line}-${i}`}>
        {i > 0 && " "}
        <button
          ref={(node) => {
            const k = `${line}-${i}`;
            if (node) btnRefs.current.set(k, node);
            else btnRefs.current.delete(k);
          }}
          onClick={() =>
            setSel((c) => (c && c.line === line && c.idx === i ? null : { line, idx: i }))
          }
          className={`rounded px-0.5 transition-colors ${
            selLink != null && el.link === selLink
              ? "bg-amber-200/80 text-amber-950 dark:bg-amber-500/30 dark:text-amber-100"
              : "hover:bg-neutral-100 dark:hover:bg-neutral-800"
          }`}
        >
          {el.text}
        </button>
      </Fragment>
    ));
  }

  return (
    <div>
      <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-neutral-400">
        {originLang}
      </p>
      <p className="text-[0.95rem] leading-loose text-neutral-800 dark:text-neutral-100">
        {renderLine(original, "orig")}
      </p>

      <p className="mb-1 mt-3 text-[10px] font-bold uppercase tracking-widest text-neutral-400">
        {isKjv ? "KJV" : "BSB"}
      </p>
      <p className="text-[0.95rem] leading-loose text-neutral-700 dark:text-neutral-200">
        {renderLine(english, "eng")}
      </p>

      {detail && (
        <div className="mt-3 rounded-lg bg-neutral-100/80 px-3 py-2 text-sm leading-relaxed text-neutral-600 dark:bg-neutral-800/60 dark:text-neutral-400">
          {"supplied" in detail ? (
            <p className="italic">
              Added by the translators — not a separate {originLang} word.
            </p>
          ) : (
            <>
              <p>
                <span className="font-medium text-neutral-700 dark:text-neutral-300">
                  {detail.head}
                </span>{" "}
                <span className="italic text-neutral-500 dark:text-neutral-400">
                  {detail.translit}
                </span>
                {detail.parse && (
                  <span className="ml-1.5 text-xs text-neutral-400">{detail.parse}</span>
                )}
                <span className="ml-1.5 tabular-nums text-neutral-500 dark:text-neutral-400">
                  {detail.strong}
                </span>
              </p>
              {(detail.gloss || detail.def) && (
                <p className="mt-0.5">
                  {detail.gloss && (
                    <span className="font-medium text-neutral-700 dark:text-neutral-300">
                      {detail.gloss}
                    </span>
                  )}
                  {detail.gloss && detail.def && " — "}
                  {detail.def}
                </p>
              )}
              {detail.kjv && (
                <p className="mt-1 text-xs text-neutral-500">KJV renderings: {detail.kjv}</p>
              )}
            </>
          )}
        </div>
      )}

      <p className="mt-3 text-[11px] text-neutral-400">
        {originLang === "Hebrew" ? "TAHOT" : "TAGNT"} from{" "}
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
    </div>
  );
}
