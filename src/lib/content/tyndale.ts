/**
 * Tyndale Open Study Notes — shared lookup logic for the web API route and
 * the offline (mobile) provider, so both surfaces show identical notes.
 *
 * Data: data/tyndale/{Book}.json built by scripts/build-tyndale-notes.mjs.
 * © Tyndale House Publishers, CC BY-SA 4.0 — see data/tyndale/_attribution.json.
 */

/** [chapter, verse, endChapter, endVerse, text] */
export type TyndaleTuple = [number, number, number, number, string];

export type TyndaleNote = {
  /** Display range within the book, e.g. "5:13", "5:13-16", "1:1–2:3". */
  range: string;
  text: string;
};

/**
 * Section-intro notes spanning many chapters (e.g. Matt 4:12–11:1) would
 * attach to hundreds of verses; only chapter-local notes and tight
 * cross-chapter ranges (Gen 1:1–2:3) read as verse notes. Approximate the
 * span since chapter lengths aren't known here.
 */
function isVerseScale([c, v, ec, ev]: TyndaleTuple): boolean {
  if (ec === c) return true;
  return ec - c === 1 && ec * 1000 + ev - (c * 1000 + v) <= 1040; // ≲40 verses
}

function covers([c, v, ec, ev]: TyndaleTuple, chapter: number, verse: number): boolean {
  if (chapter < c || chapter > ec) return false;
  if (chapter === c && verse < v) return false;
  if (chapter === ec && verse > ev) return false;
  return true;
}

function rangeLabel([c, v, ec, ev]: TyndaleTuple): string {
  if (ec !== c) return `${c}:${v}–${ec}:${ev}`;
  if (ev !== v) return `${c}:${v}-${ev}`;
  return `${c}:${v}`;
}

/** Notes covering one verse, narrowest first (build order is already sorted). */
export function tyndaleNotesForVerse(
  tuples: TyndaleTuple[],
  chapter: number,
  verse: number,
): TyndaleNote[] {
  const span = (t: TyndaleTuple) => (t[2] - t[0]) * 1000 + (t[3] - t[1]);
  return tuples
    .filter((t) => isVerseScale(t) && covers(t, chapter, verse))
    .sort((a, b) => span(a) - span(b))
    .map((t) => ({ range: rangeLabel(t), text: t[4] }));
}
