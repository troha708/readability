"use client";

/**
 * Renders chunk HTML (from api.bible) with Tailwind styling.
 *
 * Handles both the new HTML format (paragraphs, headings, verse spans)
 * and falls back to plain-text rendering for legacy data.
 *
 * When `bionic` is true, the first ~40% of each word is bolded to
 * guide the reader's eye (bionic reading technique).
 *
 * When `highlights` are provided, highlighted verses get a colored
 * background. Verse number elements carry data-verse-num attributes
 * so the selection toolbar can identify which verses are selected.
 */
import { type ReactNode } from "react";
import parse, {
  type DOMNode,
  type HTMLReactParserOptions,
  domToReact,
  Element,
} from "html-react-parser";
import {
  type VerseHighlight,
  highlightColorInfo,
} from "@/lib/highlights-service";

export type SectionHeading = {
  beforeVerse: number;
  heading: string;
};

function isElement(node: DOMNode): node is Element {
  return node.type === "tag";
}

// A verse-number marker span in the source HTML — the boundary where one
// verse's text ends and the next begins.
function isVerseMarker(node: unknown): boolean {
  if (!(node instanceof Element) || node.name !== "span") return false;
  const cls = node.attribs?.class ?? "";
  return cls === "v" || cls.startsWith("v ") || !!node.attribs?.["data-number"];
}

// Section headings in the manner of esv.org: the scripture serif, italic, at
// body size — one weight step above the body text (500/450 vs the body's
// 450/400) so they hold their own without shouting. The hand-tuned halfway
// gold, in its `deep` shade on the light page: the DEFAULT token's 3.5:1
// there was the faintest text on the reading surface, so headings take the
// same hue with more ink (4.9:1). Dark mode keeps `bright`. Margins per site.
const HEADING_CLASS =
  "font-scripture text-[1em] font-medium italic text-gold-deep dark:font-[450] dark:text-gold-bright";

// KJV paragraph mark (pilcrow). Shown but de-emphasised — the same muted grey as
// the verse-number superscripts — and excluded from text selection and screen
// readers, since it is an editorial mark rather than part of the words.
const PILCROW_CLASS = "select-none text-neutral-400/70 dark:text-neutral-500/70";

// ── Bionic reading helper ────────────────────────────────────────────

function bionicifyText(text: string): ReactNode {
  const tokens = text.split(/(\s+)/);
  return tokens.map((token, i) => {
    if (!token || /^\s+$/.test(token)) return token;
    const boldLen = Math.max(1, Math.ceil(token.length * 0.4));
    return (
      <span key={i}>
        <b>{token.slice(0, boldLen)}</b>
        {token.slice(boldLen)}
      </span>
    );
  });
}

// ── Paragraph / heading placement helpers ────────────────────────────

type ParagraphMeta = { firstVerse: number | null; isHeading: boolean };

function extractVerseNumbersFromHtml(html: string): number[] {
  const nums: number[] = [];
  let m: RegExpExecArray | null;

  const dataNum = /data-number="(\d+)"/g;
  while ((m = dataNum.exec(html)) !== null) nums.push(parseInt(m[1], 10));

  if (nums.length === 0) {
    const vSpan = /<span[^>]*class="v[" ][^>]*>\s*(\d+)/g;
    while ((m = vSpan.exec(html)) !== null) nums.push(parseInt(m[1], 10));
  }

  if (nums.length === 0) {
    const chNum = /<span[^>]*class="[^"]*chapter-num[^"]*"[^>]*>\s*(\d+)/g;
    while ((m = chNum.exec(html)) !== null) nums.push(parseInt(m[1], 10));
  }

  if (nums.length === 0) {
    // Poetry continuation lines (e.g. <p class="q2">) carry no verse number,
    // only a data-verse-id like "PSA.3.8". Resolve the verse from it so the
    // paragraph is still associated with its verse. Without this, the trailing
    // line(s) of a verse have no verse number and a section heading anchored to
    // it can land on the verse's first line instead.
    const vid = /data-verse-id="[^"]*\.(\d+)"/g;
    while ((m = vid.exec(html)) !== null) nums.push(parseInt(m[1], 10));
  }

  return nums;
}

function extractParagraphMetas(html: string): ParagraphMeta[] {
  const result: ParagraphMeta[] = [];
  const pRegex = /<p\b([^>]*)>([\s\S]*?)<\/p>/g;
  let match: RegExpExecArray | null;

  while ((match = pRegex.exec(html)) !== null) {
    const attrs = match[1];
    const content = match[2];
    const isHeading =
      /class="s\d?"/.test(attrs) || /class="r"/.test(attrs);
    const verses = extractVerseNumbersFromHtml(content);
    result.push({
      firstVerse: verses.length > 0 ? verses[0] : null,
      isHeading,
    });
  }

  return result;
}

/** Compute which headings should be prepended before each paragraph index. */
function computeParagraphHeadings(
  metas: ParagraphMeta[],
  headings: SectionHeading[],
): Map<number, SectionHeading[]> {
  const result = new Map<number, SectionHeading[]>();
  const used = new Set<number>();

  // The verse span actually present in this chunk. A heading whose anchor
  // verse falls outside this span belongs to a different chunk and must be
  // skipped — otherwise out-of-range headings pile up on the first paragraph.
  const versesPresent = metas
    .filter((m) => !m.isHeading && m.firstVerse != null)
    .map((m) => m.firstVerse as number);
  if (versesPresent.length === 0) return result;
  const chunkMinVerse = Math.min(...versesPresent);

  for (const h of headings) {
    if (used.has(h.beforeVerse)) continue;

    // Section starts before this chunk begins → it belongs to an earlier chunk.
    if (h.beforeVerse < chunkMinVerse) continue;

    // Place the heading before the first non-heading paragraph at/after its
    // anchor verse. If none exists, the section starts in a later chunk → skip
    // it here (do NOT fall back to the first paragraph, which would dump every
    // out-of-range heading onto the top of the chunk).
    let bestIdx = -1;
    for (let i = 0; i < metas.length; i++) {
      if (metas[i].isHeading) continue;
      if (metas[i].firstVerse != null && metas[i].firstVerse! >= h.beforeVerse) {
        bestIdx = i;
        break;
      }
    }
    if (bestIdx === -1) continue;
    used.add(h.beforeVerse);

    const existing = result.get(bestIdx) ?? [];
    existing.push(h);
    result.set(bestIdx, existing);
  }

  return result;
}

// ── Highlighted verse text wrapper ───────────────────────────────────

function HighlightedVerseSpan({
  highlight,
  children,
}: {
  highlight: VerseHighlight;
  children: ReactNode;
}) {
  const colorInfo = highlightColorInfo(highlight.color);
  return (
    <span className={`rounded-sm px-0.5 -mx-0.5 ${colorInfo.bg}`}>
      {children}
    </span>
  );
}

// ── HTML parser options ──────────────────────────────────────────────

function getParserOptions(
  bionic: boolean,
  highlights?: Record<number, VerseHighlight>,
  paragraphHeadings?: Map<number, SectionHeading[]>,
  chapterNumber?: number,
  redLetter?: boolean,
): HTMLReactParserOptions {
  let pIdx = 0;
  let currentVerse: number | null = null;
  // When a chapter number is supplied, the first body paragraph opens with a
  // large drop-cap numeral (ESV-style) that the text wraps around, and verse
  // 1's small marker is suppressed since the drop cap stands in for it.
  let dropCapEmitted = false;

  const opts: HTMLReactParserOptions = {
    replace(domNode) {
      if (domNode.type === "text") {
        // Digits inside a verse-number marker (or the chapter numeral) are
        // labels, not scripture text. The parser visits an element's children
        // before its own branch runs, so currentVerse still holds the
        // PREVIOUS verse here — wrapping the digit would tag verse N+1's
        // number as part of verse N and hover would light the wrong marker.
        const parent = (domNode as unknown as { parent: unknown }).parent;
        if (
          isVerseMarker(parent) ||
          (parent instanceof Element &&
            (parent.attribs?.class ?? "").includes("chapter-num"))
        ) {
          return;
        }
        const raw = (domNode as unknown as { data: string }).data;
        if (!raw.trim()) return;

        // A leading ¶ (KJV paragraph mark) opens a paragraph — render it in muted
        // grey, then feed the rest of the text through the normal pipeline.
        const pil = /^\s*¶\s?/.exec(raw);
        const text = pil ? raw.slice(pil[0].length) : raw;

        // A verse's last run ends with the inter-verse space; keep that space
        // outside the wraps below so the hover/highlight band stops at the
        // verse's final word instead of running up under the next verse's
        // number.
        const trail = isVerseMarker(domNode.next)
          ? /\s+$/.exec(text)?.[0]
          : undefined;
        const body = trail ? text.slice(0, -trail.length) : text;

        let content: ReactNode = bionic ? bionicifyText(body) : body;
        if (currentVerse && highlights?.[currentVerse]) {
          content = (
            <HighlightedVerseSpan highlight={highlights[currentVerse]}>
              {content}
            </HighlightedVerseSpan>
          );
        }

        // Wrap scripture text so the whole verse under the cursor can be lit on
        // hover (the reader's hover handler toggles .vh-on on same-verse spans)
        // and so it reads as tappable (.vtext gets a pointer cursor). Text before
        // verse 1 has no verse yet and stays unwrapped.
        if (currentVerse) {
          content = (
            <span className="vtext" data-hv={currentVerse}>
              {content}
            </span>
          );
        }
        if (trail) {
          content = (
            <>
              {content}{" "}
            </>
          );
        }

        if (pil) {
          return (
            <>
              <span className={PILCROW_CLASS} aria-hidden="true">
                ¶
              </span>{" "}
              {content}
            </>
          );
        }
        return <>{content}</>;
      }

      if (!isElement(domNode)) return;

      const tag = domNode.name;
      const cls = domNode.attribs?.class ?? "";
      const children = domToReact(domNode.children as DOMNode[], opts);

      if (tag === "p") {
        const currentIdx = pIdx++;

        if (/^s\d?$/.test(cls)) {
          return (
            <h3 className={`${HEADING_CLASS} mb-3 mt-8 first:mt-0`}>
              {children}
            </h3>
          );
        }

        if (cls === "r") {
          return (
            <p className="mb-[1.5em] text-sm italic text-neutral-500 dark:text-neutral-400">
              {children}
            </p>
          );
        }

        let pClassName: string;
        if (cls === "q1") {
          pClassName =
            "mb-1 pl-6 leading-relaxed text-neutral-700 dark:text-neutral-300";
        } else if (/^q[2-9]$/.test(cls)) {
          pClassName =
            "mb-1 pl-12 leading-relaxed text-neutral-700 dark:text-neutral-300";
        } else {
          pClassName =
            "mb-[1.5em] leading-relaxed text-neutral-700 dark:text-neutral-300";
        }

        // Section headings to prepend before this paragraph
        const pHeadings = paragraphHeadings?.get(currentIdx);

        // First body paragraph (not a heading/ref/psalm-title — those returned
        // above or are excluded): prepend the big drop-cap chapter numeral.
        const emitDropCap =
          chapterNumber != null && !dropCapEmitted && cls !== "d";
        if (emitDropCap) dropCapEmitted = true;
        const bodyChildren = emitDropCap ? (
          <>
            {/* The drop cap stands in for verse 1's suppressed marker, so it
                carries data-verse-num={1} — otherwise verseForNode finds no
                anchor for verse-1 text and the selection toolbar never opens. */}
            <span
              data-verse-num={1}
              className="float-left mr-2.5 mt-[0.08em] font-display text-[3.4em] font-semibold leading-[0.78] text-amber-700 dark:text-amber-400"
            >
              {chapterNumber}
            </span>
            {children}
          </>
        ) : (
          children
        );

        const paragraphElement: ReactNode = (
          <p className={pClassName}>{bodyChildren}</p>
        );

        if (pHeadings?.length) {
          return (
            <>
              {pHeadings.map((h, i) => (
                <h3
                  key={i}
                  className={`${HEADING_CLASS} mb-3 ${
                    h.beforeVerse === 1 ? "mt-0" : "mt-8"
                  }`}
                >
                  {h.heading}
                </h3>
              ))}
              {paragraphElement}
            </>
          );
        }

        return paragraphElement;
      }

      if (
        tag === "span" &&
        (cls === "v" || cls.startsWith("v ") || domNode.attribs?.["data-number"])
      ) {
        const verseNum =
          parseInt(domNode.attribs?.["data-number"] ?? "", 10) ||
          parseInt(
            (domNode.children[0] as unknown as { data?: string })?.data ?? "",
            10,
          );

        if (verseNum) currentVerse = verseNum;

        // The drop-cap chapter numeral stands in for verse 1's marker, so its
        // little "1" is suppressed.
        if (verseNum === 1 && chapterNumber != null) {
          return <></>;
        }

        const hl = verseNum ? highlights?.[verseNum] : null;
        const hlColor = hl ? highlightColorInfo(hl.color) : null;

        return (
          <sup
            data-verse-num={verseNum || undefined}
            title="Verse tools"
            className={`verse-num ml-1 mr-px cursor-pointer select-none align-super font-sans text-[0.6em] leading-none transition-colors hover:text-amber-600 dark:hover:text-amber-400 ${
              hlColor
                ? `font-bold ${hlColor.dot.replace("bg-", "text-")}`
                : "font-normal text-neutral-500/80 dark:text-neutral-500/70"
            }`}
          >
            {children}
            {hl?.note && <span className="ml-0.5 text-[0.8em]">✎</span>}
          </sup>
        );
      }

      if (tag === "span" && cls.includes("chapter-num")) {
        const chapterNum = parseInt(
          (domNode.children[0] as unknown as { data?: string })?.data ?? "",
          10,
        );
        if (chapterNum) currentVerse = 1;

        return (
          <sup
            data-verse-num={1}
            title="Verse tools"
            className="mr-0.5 cursor-pointer select-none align-super font-sans text-[0.65em] font-semibold leading-none text-neutral-400/70 transition-colors hover:text-amber-600 dark:text-neutral-500/70 dark:hover:text-amber-400"
          >
            {children}
          </sup>
        );
      }

      if (tag === "span" && cls === "nd") {
        return <span className="font-semibold tracking-wide">{children}</span>;
      }

      // Parallel-passage reference folded onto a section heading (see
      // inlineHeadingRefs): a small italic serif suffix, reset out of the
      // heading's small-caps so the reference reads normally.
      if (tag === "span" && cls === "rh") {
        return (
          <span className="ml-2 align-baseline text-sm font-normal italic text-neutral-500 [font-variant:normal] dark:text-neutral-400">
            {children}
          </span>
        );
      }

      // Words of Jesus. The source marks these only in parts of the NT (the
      // Gospels, Acts, Revelation, and a few epistles), so colouring them
      // would make scripture text an inconsistent colour both across the NT
      // and against the OT (which has no such markup). Plain by default;
      // readers can opt into red letters via the settings menu. The muted
      // vermilion is the rubric pair from the discarded heading trial
      // (64db98d2): light #a6453a reads APCA Lc ~76 on white; dark #db9c8d
      // Lc ~55 on the 925 ground.
      if (tag === "wj") {
        if (redLetter) {
          return (
            <span className="text-[#a6453a] dark:text-[#db9c8d]">
              {children}
            </span>
          );
        }
        return <>{children}</>;
      }

      if (["span", "sup", "b", "i", "em", "strong", "br"].includes(tag)) {
        return undefined;
      }

      return <>{children}</>;
    },
  };
  return opts;
}

/**
 * BSB ships a parallel-passage reference paragraph (`<p class="r">(Psalm
 * 84:1–12)</p>`) right after many section headings. Fold that reference onto
 * the heading itself as a small muted suffix (dropping the outer parens) so it
 * reads as part of the heading rather than a separate quote line. Run before
 * any paragraph-index analysis so the merged paragraph count stays consistent
 * with the parse pass.
 */
function inlineHeadingRefs(html: string): string {
  return html.replace(
    /<p class="(s[12]?)">([\s\S]*?)<\/p>\s*<p class="r">([\s\S]*?)<\/p>/g,
    (_m, scls, head, ref) => {
      return `<p class="${scls}">${head}<span class="rh">${ref.trim()}</span></p>`;
    },
  );
}

function renderHtml(
  html: string,
  bionic: boolean,
  highlights?: Record<number, VerseHighlight>,
  headings?: SectionHeading[],
  chapterNumber?: number,
  showCrossRefs?: boolean,
  redLetter?: boolean,
) {
  if (showCrossRefs) {
    // Fold each cross-reference paragraph onto the heading above it.
    html = inlineHeadingRefs(html);
  } else {
    // Cross-references off (the default): drop the reference paragraphs
    // entirely before any paragraph-index analysis so counts stay consistent.
    html = html.replace(/<p class="r">[\s\S]*?<\/p>/g, "");
  }
  const metas = extractParagraphMetas(html);

  let paragraphHeadings: Map<number, SectionHeading[]> | undefined;
  if (headings?.length) {
    paragraphHeadings = computeParagraphHeadings(metas, headings);
  }

  return parse(
    html,
    getParserOptions(bionic, highlights, paragraphHeadings, chapterNumber, redLetter),
  );
}

/** Detect whether the chunk text contains HTML tags. */
function isHtml(text: string): boolean {
  return /<[a-z][\s>]/i.test(text);
}

// ── Legacy plain-text fallback ───────────────────────────────────────

const VERSE_SPLIT = /(?=\s\d+\S)/;
const VERSE_NUM_RE = /^\s*(\d+)([\s\S]*)/;
const VERSES_PER_PARA = 5;

function renderPlainText(
  text: string,
  bionic: boolean,
  highlights?: Record<number, VerseHighlight>,
  headings?: SectionHeading[],
) {
  const segments = text
    .trim()
    .split(VERSE_SPLIT)
    .map((s) => s.trim())
    .filter(Boolean);

  const verses: { num: string; body: string }[] = [];
  for (const seg of segments) {
    const m = seg.match(VERSE_NUM_RE);
    if (m) verses.push({ num: m[1], body: m[2].trim() });
    else verses.push({ num: "", body: seg });
  }

  const hasNums = verses.some((v) => v.num);
  if (!hasNums) {
    return (
      <p className="leading-relaxed text-neutral-700 dark:text-neutral-300">
        {bionic ? bionicifyText(text) : text}
      </p>
    );
  }

  const paragraphs: (typeof verses)[] = [];
  for (let i = 0; i < verses.length; i += VERSES_PER_PARA) {
    paragraphs.push(verses.slice(i, i + VERSES_PER_PARA));
  }

  const ptMetas: ParagraphMeta[] = paragraphs.map((pv) => {
    const first = pv.find((v) => v.num);
    return {
      firstVerse: first ? parseInt(first.num, 10) : null,
      isHeading: false,
    };
  });

  let ptParagraphHeadings: Map<number, SectionHeading[]> | undefined;
  if (headings?.length) {
    ptParagraphHeadings = computeParagraphHeadings(ptMetas, headings);
  }

  const pClassName = "leading-relaxed text-neutral-700 dark:text-neutral-300";

  return (
    <div className="space-y-5">
      {paragraphs.map((pv, idx) => {
        const pHeadings = ptParagraphHeadings?.get(idx);
        const content = pv.map((v, i) => {
          const verseNum = v.num ? parseInt(v.num, 10) : null;
          const hl = verseNum ? highlights?.[verseNum] : null;
          const hlColor = hl ? highlightColorInfo(hl.color) : null;
          const bodyContent = bionic ? bionicifyText(v.body) : v.body;

          return (
            <span key={i}>
              {v.num ? (
                <sup
                  data-verse-num={verseNum || undefined}
                  title="Verse tools"
                  className={`ml-1 mr-px cursor-pointer select-none align-super font-sans text-[0.6em] leading-none transition-colors hover:text-amber-600 dark:hover:text-amber-400 ${
                    hlColor
                      ? `font-bold ${hlColor.dot.replace("bg-", "text-")}`
                      : "font-normal text-neutral-500/80 dark:text-neutral-500/70"
                  }`}
                >
                  {v.num}
                  {hl?.note && <span className="ml-0.5 text-[0.8em]">✎</span>}
                </sup>
              ) : null}
              {hl ? (
                <HighlightedVerseSpan highlight={hl}>
                  {bodyContent}
                </HighlightedVerseSpan>
              ) : (
                bodyContent
              )}
              {i < pv.length - 1 ? " " : null}
            </span>
          );
        });

        const paragraphElement: ReactNode = (
          <p key={idx} className={pClassName}>
            {content}
          </p>
        );

        if (pHeadings?.length) {
          return (
            <div key={idx}>
              {pHeadings.map((h, i) => (
                <h3
                  key={i}
                  className={`${HEADING_CLASS} mb-3 ${
                    h.beforeVerse === 1 ? "mt-0" : "mt-8"
                  }`}
                >
                  {h.heading}
                </h3>
              ))}
              {paragraphElement}
            </div>
          );
        }

        return paragraphElement;
      })}
    </div>
  );
}

// ── Exported component ───────────────────────────────────────────────

export function FormattedChunkText({
  chunkText,
  bionic = false,
  highlights,
  headings,
  chapterNumber,
  showCrossRefs = false,
  redLetter = false,
}: {
  chunkText: string;
  bionic?: boolean;
  highlights?: Record<number, VerseHighlight>;
  headings?: SectionHeading[];
  chapterNumber?: number;
  showCrossRefs?: boolean;
  redLetter?: boolean;
}) {
  if (!chunkText?.trim()) {
    return (
      <p className="leading-relaxed text-neutral-700 dark:text-neutral-300">
        {chunkText}
      </p>
    );
  }

  return isHtml(chunkText) ? (
    <div>
      {renderHtml(chunkText, bionic, highlights, headings, chapterNumber, showCrossRefs, redLetter)}
    </div>
  ) : (
    renderPlainText(chunkText, bionic, highlights, headings)
  );
}
