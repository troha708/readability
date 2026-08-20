/**
 * A single verse as a self-contained HTML fragment, for copying to the
 * clipboard with its formatting intact.
 *
 * The verse text the sheet displays comes from extractVerses (verse-search),
 * which flattens every tag to a space — right for a search index, wrong for a
 * quote. Copying Psalm 23:1 that way yields one run-on line where the source
 * has two, and loses the italics KJV uses for supplied words and the small
 * caps it uses for the divine name.
 *
 * What the sources actually carry, and what is kept here:
 *   <p class="q1"> / "q2" ...  poetry lines, q2+ indented   -> <br> + indent
 *   <span class="add">         words supplied by the translator -> italic
 *   <span class="tl">          transliterated words             -> italic
 *   <span class="nd">          the divine name                  -> small caps
 *   <wj> / <span class="wj">   words of Jesus                   -> red
 *
 * Styling is INLINE rather than class-based on purpose: this fragment is
 * pasted into Word, Docs or an email, none of which have the app's stylesheet.
 * Everything else is dropped — a paste should carry the verse, not the app's
 * markup.
 */

// A private-use character: it cannot occur in scripture text, and unlike a
// NUL it survives RegExp construction intact.
const VERSE_SENTINEL = String.fromCharCode(0xe000);

/** Words of Jesus, in the reader's own rubric vermilion. */
const WJ_COLOR = "#a6453a";

type Fragment = { html: string; text: string };

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

const escapeHtml = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

/**
 * Walk one verse's slice of chapter HTML, keeping only the marks above.
 * Written as a scan rather than a chain of replaces so that an unclosed or
 * unexpected tag closes cleanly instead of leaking style into the rest.
 */
function renderFragment(slice: string): Fragment {
  let html = "";
  let text = "";
  const open: string[] = [];
  let i = 0;

  const push = (h: string, t: string) => {
    html += h;
    text += t;
  };

  while (i < slice.length) {
    const lt = slice.indexOf("<", i);
    if (lt === -1) {
      const rest = decodeEntities(slice.slice(i));
      push(escapeHtml(rest), rest);
      break;
    }
    if (lt > i) {
      const chunk = decodeEntities(slice.slice(i, lt));
      push(escapeHtml(chunk), chunk);
    }
    const gt = slice.indexOf(">", lt);
    if (gt === -1) break;
    const tag = slice.slice(lt, gt + 1);
    i = gt + 1;

    const closing = /^<\//.test(tag);
    const name = (tag.match(/^<\/?\s*([a-zA-Z0-9]+)/) ?? [])[1]?.toLowerCase() ?? "";
    const cls = (tag.match(/class="([^"]*)"/) ?? [])[1] ?? "";

    if (closing) {
      // Only close what we opened; stray closers are ignored. A span we chose
      // not to style opened nothing, so it closes nothing.
      if ((name === "span" || name === "wj") && open.length) {
        if (open.pop() !== "plain") html += "</span>";
      }
      continue;
    }

    if (name === "p") {
      // A new block is a new line. q2 and deeper are the indented run-ons of
      // the line above, which is the whole point of the poetry setting.
      const q = /\bq(\d)\b/.exec(cls);
      if (html) {
        html += "<br>";
        text += "\n";
      }
      if (q && Number(q[1]) > 1) {
        html += "&nbsp;&nbsp;&nbsp;&nbsp;";
        text += "    ";
      }
      continue;
    }

    if (name === "wj" || cls.split(/\s+/).includes("wj")) {
      html += `<span style="color:${WJ_COLOR}">`;
      open.push("wj");
      continue;
    }
    if (name === "span") {
      const names = cls.split(/\s+/);
      if (names.includes("nd")) {
        html += '<span style="font-variant:small-caps">';
        open.push("nd");
        continue;
      }
      if (names.includes("add") || names.includes("tl")) {
        html += '<span style="font-style:italic">';
        open.push("add");
        continue;
      }
      // Verse-number and continuation markers carry no words worth keeping.
      // They still have a closing tag, so they are pushed to keep the stack
      // aligned — but nothing is emitted, or every verse would come out
      // wrapped in a litter of empty spans.
      open.push("plain");
      continue;
    }
    // Anything else (br, i, b, ...) is dropped, tag and all.
  }

  while (open.length) {
    if (open.pop() !== "plain") html += "</span>";
  }

  return {
    html: html.replace(/(<br>|&nbsp;|\s)+$/g, "").trim(),
    // Per line, so the poetry indent survives: collapsing whitespace across
    // the whole string would flatten it back out, and that indent is exactly
    // the formatting this copy exists to keep.
    text: text
      .split("\n")
      .map((line) => {
        const indent = (line.match(/^ +/) ?? [""])[0];
        return indent + line.trim().replace(/[ \t]+/g, " ");
      })
      .join("\n")
      .trim(),
  };
}

/**
 * Every verse of a chapter as a formatted fragment, keyed by verse number.
 * Mirrors extractVerses' splitting so the two always agree on where a verse
 * begins and ends — only what survives inside differs.
 */
export function extractVerseFragments(html: string): Map<number, Fragment> {
  const marked = html
    .replace(/<h[1-6][^>]*>[\s\S]*?<\/h[1-6]>/gi, " ")
    .replace(/<p class="(?:s1|s2|r)"[^>]*>[\s\S]*?<\/p>/gi, " ")
    .replace(
      /<span[^>]*class="[^"]*chapter-num[^"]*"[^>]*>[\s\S]*?<\/span>/gi,
      `${VERSE_SENTINEL}1${VERSE_SENTINEL}`,
    )
    .replace(
      /<span\b[^>]*\bdata-number="(\d+)[^"]*"[^>]*>[\s\S]*?<\/span>/gi,
      `${VERSE_SENTINEL}$1${VERSE_SENTINEL}`,
    )
    .replace(
      /<span\b[^>]*\bclass="v(?:\s[^"]*)?"[^>]*>\s*(\d+)\s*<\/span>/gi,
      `${VERSE_SENTINEL}$1${VERSE_SENTINEL}`,
    );

  const parts = marked.split(new RegExp(VERSE_SENTINEL + "([0-9]+)" + VERSE_SENTINEL));
  const bySlice = new Map<number, string>();
  for (let i = 1; i < parts.length; i += 2) {
    const num = parseInt(parts[i], 10);
    if (!Number.isFinite(num)) continue;
    bySlice.set(num, (bySlice.get(num) ?? "") + (parts[i + 1] ?? ""));
  }

  const out = new Map<number, Fragment>();
  for (const [verse, slice] of bySlice) {
    const fragment = renderFragment(slice);
    if (fragment.text) out.set(verse, fragment);
  }
  return out;
}
