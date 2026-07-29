#!/usr/bin/env node
/**
 * Build the Tyndale theme articles into a slim search index + one articles
 * file, consumed by the Topics UI (web /api/themes and the offline mobile
 * provider). Sibling of build-tyndale-dictionary.mjs — same block/run format.
 *
 * Source: https://tyndaleopenresources.com/ ("Tyndale Open Study Notes" zip →
 * ThemeNotes.xml — 298 essays on biblical/theological themes). © Tyndale House
 * Publishers, CC BY-SA 4.0. The output is an adaptation (reformatted to JSON,
 * scripture links flattened to plain references, cross-references kept as
 * internal id links) and remains CC BY-SA 4.0 — see _attribution.json.
 *
 * Usage:
 *   node scripts/build-tyndale-themes.mjs path/to/ThemeNotes.xml
 *
 * Output: data/tyndale-themes/
 *   _index.json    { count, entries: [[id, title, letter, words]] }
 *   articles.json  { articles: { id: { t: title, b: blocks } } }
 *   _attribution.json
 *
 * A block is { h?: 2 | 3, runs: Run[] } (h = subhead level; absent = paragraph)
 * A run is { s } plain | { s, i: 1 } italic | { s, x: id } theme cross-link.
 * The corpus is small (~450 KB), so a single articles file is loaded once and
 * cached, rather than the dictionary's per-letter split.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, "..", "data", "tyndale-themes");

// Tyndale book codes (as used in ?bref= links) → canonical names.
const BOOK_CODES = {
  Gen: "Genesis", Exod: "Exodus", Lev: "Leviticus", Num: "Numbers",
  Deut: "Deuteronomy", Josh: "Joshua", Judg: "Judges", Ruth: "Ruth",
  ISam: "1 Samuel", IISam: "2 Samuel", IKgs: "1 Kings", IIKgs: "2 Kings",
  IChr: "1 Chronicles", IIChr: "2 Chronicles", Ezra: "Ezra", Neh: "Nehemiah",
  Esth: "Esther", Job: "Job", Ps: "Psalms", Pr: "Proverbs",
  Eccl: "Ecclesiastes", Song: "Song of Solomon", Isa: "Isaiah",
  Jer: "Jeremiah", Lam: "Lamentations", Ezek: "Ezekiel", Dan: "Daniel",
  Hos: "Hosea", Joel: "Joel", Amos: "Amos", Obad: "Obadiah", Jon: "Jonah",
  Mic: "Micah", Nah: "Nahum", Hab: "Habakkuk", Zeph: "Zephaniah",
  Hagg: "Haggai", Zech: "Zechariah", Mal: "Malachi",
  Matt: "Matthew", Mark: "Mark", Luke: "Luke", John: "John", Acts: "Acts",
  Rom: "Romans", ICor: "1 Corinthians", IICor: "2 Corinthians",
  Gal: "Galatians", Eph: "Ephesians", Phil: "Philippians", Col: "Colossians",
  IThes: "1 Thessalonians", IIThes: "2 Thessalonians", ITim: "1 Timothy",
  IITim: "2 Timothy", Titus: "Titus", Phlm: "Philemon", Heb: "Hebrews",
  Jas: "James", IPet: "1 Peter", IIPet: "2 Peter", IJn: "1 John",
  IIJn: "2 John", IIIJn: "3 John", Jude: "Jude", Rev: "Revelation",
  // Theme notes use arabic-prefixed codes for the numbered books, unlike the
  // dictionary's roman ones — accept both. (2Macc and other apocrypha are
  // intentionally absent: they fall back to their plain label text.)
  "1Sam": "1 Samuel", "2Sam": "2 Samuel", "1Kgs": "1 Kings", "2Kgs": "2 Kings",
  "1Chr": "1 Chronicles", "2Chr": "2 Chronicles", "1Cor": "1 Corinthians",
  "2Cor": "2 Corinthians", "1Thes": "1 Thessalonians", "2Thes": "2 Thessalonians",
  "1Tim": "1 Timothy", "2Tim": "2 Timothy", "1Pet": "1 Peter", "2Pet": "2 Peter",
  "1Jn": "1 John", "2Jn": "2 John", "3Jn": "3 John",
};

/** Parse a Tyndale bref like "Matt.5.13", "Gen.1.1-2.3". Returns parts or null. */
function parseRef(ref) {
  const m = /^([0-9A-Za-z]+)\.(\d+)\.(\d+)[a-z]?(?:[-–](?:(\d+)\.)?(\d+)[a-z]?)?$/.exec(ref);
  if (!m) return null;
  const book = BOOK_CODES[m[1]];
  if (!book) return null;
  const c = parseInt(m[2], 10);
  const v = parseInt(m[3], 10);
  const ec = m[4] ? parseInt(m[4], 10) : c;
  const ev = m[5] ? parseInt(m[5], 10) : v;
  return { book, c, v, ec, ev };
}

// Canonical book order + section, so topics can be organized by WHERE in
// Scripture each one arises (its anchor passage) rather than alphabetically.
const BOOK_ORDER = [
  "Genesis", "Exodus", "Leviticus", "Numbers", "Deuteronomy",
  "Joshua", "Judges", "Ruth", "1 Samuel", "2 Samuel", "1 Kings", "2 Kings",
  "1 Chronicles", "2 Chronicles", "Ezra", "Nehemiah", "Esther",
  "Job", "Psalms", "Proverbs", "Ecclesiastes", "Song of Solomon",
  "Isaiah", "Jeremiah", "Lamentations", "Ezekiel", "Daniel", "Hosea", "Joel",
  "Amos", "Obadiah", "Jonah", "Micah", "Nahum", "Habakkuk", "Zephaniah",
  "Haggai", "Zechariah", "Malachi",
  "Matthew", "Mark", "Luke", "John", "Acts",
  "Romans", "1 Corinthians", "2 Corinthians", "Galatians", "Ephesians",
  "Philippians", "Colossians", "1 Thessalonians", "2 Thessalonians",
  "1 Timothy", "2 Timothy", "Titus", "Philemon", "Hebrews", "James",
  "1 Peter", "2 Peter", "1 John", "2 John", "3 John", "Jude", "Revelation",
];
const BOOK_INDEX = Object.fromEntries(BOOK_ORDER.map((b, i) => [b, i]));

// The eight browse sections, in canon order (the UI keeps its own copy in
// themes.ts). data/tyndale-themes/_index.json carries the section per topic.
const SECTION_ORDER = [
  "The Law", "History", "Wisdom & Psalms", "The Prophets",
  "The Gospels", "Acts", "The Letters", "Revelation",
];
const SECTION_OF = {};
const assign = (section, names) => names.forEach((n) => (SECTION_OF[n] = section));
assign("The Law", BOOK_ORDER.slice(0, 5));
assign("History", BOOK_ORDER.slice(5, 17));
assign("Wisdom & Psalms", BOOK_ORDER.slice(17, 22));
assign("The Prophets", BOOK_ORDER.slice(22, 39));
assign("The Gospels", BOOK_ORDER.slice(39, 43));
assign("Acts", ["Acts"]);
assign("The Letters", BOOK_ORDER.slice(44, 65));
assign("Revelation", ["Revelation"]);

/**
 * The anchor passage a theme attaches to (its <refs> tag, e.g. "Gen.2.18-25"),
 * resolved to { section, sort } where sort orders topics by canonical position.
 * Falls back to History/end for the rare theme with no resolvable anchor.
 */
function anchorInfo(inner) {
  const raw = (/<refs>([\s\S]*?)<\/refs>/.exec(inner) || [])[1] || "";
  const m = /([0-9A-Za-z]+)\.(\d+)/.exec(raw);
  const book = m ? BOOK_CODES[m[1]] : null;
  if (!book || !(book in BOOK_INDEX)) return { section: null, sort: 1e9 };
  return { section: SECTION_OF[book], sort: BOOK_INDEX[book] * 1000 + parseInt(m[2], 10) };
}

/** "Genesis 1:22-25", "Genesis 1:1–2:3" — display text parseScriptureRefs reads. */
function refDisplay(r) {
  const name = r.book === "Psalms" ? "Psalm" : r.book;
  if (r.ec !== r.c) return `${name} ${r.c}:${r.v}–${r.ec}:${r.ev}`;
  if (r.ev !== r.v) return `${name} ${r.c}:${r.v}-${r.ev}`;
  return `${name} ${r.c}:${r.v}`;
}

const ENTITIES = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  ldquo: "“", rdquo: "”", lsquo: "‘", rsquo: "’",
  mdash: "—", ndash: "–", hellip: "…", deg: "°",
};

function decodeEntities(s) {
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&([a-zA-Z]+);/g, (m, name) => ENTITIES[name] ?? m);
}

function linkLabel(inner) {
  return decodeEntities(inner.replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
}

/** The theme id a "?item=Name_ThemeNote_Product" link points at, or null. */
function itemTarget(href) {
  const m = /^\?item=(.+?)_[A-Za-z]+_/.exec(href);
  return m ? m[1] : null;
}

/**
 * Tokenize one block's inline HTML into runs. `ids` is the set of valid theme
 * ids so cross-references to real themes become links and the rest fall back to
 * plain text. Adjacent same-kind runs are merged; whitespace collapsed.
 */
function tokenizeInline(html, ids) {
  const runs = [];
  const italStack = [];
  const italActive = () => italStack.some(Boolean);

  const push = (run) => {
    if (!run.s) return;
    const prev = runs[runs.length - 1];
    if (prev && !prev.x && !run.x && !!prev.i === !!run.i) {
      prev.s += run.s;
    } else {
      runs.push(run);
    }
  };

  const tokenRe = /<a\b[^>]*>[\s\S]*?<\/a>|<span\b[^>]*>|<\/span>|<[^>]+>|[^<]+/g;
  let t;
  while ((t = tokenRe.exec(html)) !== null) {
    const tok = t[0];
    if (tok.startsWith("<a")) {
      const href = (/href="([^"]*)"/.exec(tok) || [])[1] || "";
      const inner = tok.replace(/^<a\b[^>]*>/, "").replace(/<\/a>$/, "");
      const label = linkLabel(inner);
      if (!label) continue;
      if (href.startsWith("?bref=")) {
        const r = parseRef(href.slice(6).trim());
        push({ s: r ? refDisplay(r) : label, i: italActive() ? 1 : undefined });
      } else {
        const target = itemTarget(href);
        if (target && ids.has(target)) push({ s: label, x: target });
        else push({ s: label, i: italActive() ? 1 : undefined });
      }
    } else if (tok.startsWith("<span")) {
      italStack.push(/class="[^"]*\b(?:ital|sc-ital)\b[^"]*"/.test(tok));
    } else if (tok === "</span>") {
      italStack.pop();
    } else if (tok.startsWith("<")) {
      push({ s: " " });
    } else {
      push({ s: decodeEntities(tok), i: italActive() ? 1 : undefined });
    }
  }

  for (const r of runs) r.s = r.s.replace(/\s+/g, " ");
  while (runs.length && !runs[0].s.trim()) runs.shift();
  while (runs.length && !runs[runs.length - 1].s.trim()) runs.pop();
  if (runs.length) {
    runs[0].s = runs[0].s.replace(/^\s+/, "");
    runs[runs.length - 1].s = runs[runs.length - 1].s.replace(/\s+$/, "");
  }
  return runs.filter((r) => r.s.length);
}

const HEAD_LEVEL = { "theme-h2": 2, "theme-refs-title": 2 };
const LIST_CLASS = /^theme-list/;

/** Turn one theme body's <p> blocks into structured blocks. */
function parseBody(body, ids) {
  const blocks = [];
  const pRe = /<p\b([^>]*)>([\s\S]*?)<\/p>/g;
  let firstTitle = true;
  let m;
  while ((m = pRe.exec(body)) !== null) {
    const cls = (/class="([^"]*)"/.exec(m[1]) || [])[1] || "";
    const key = cls.trim().split(/\s+/)[0] || "";
    // The leading theme-title repeats the headword we already show as the title.
    if (key === "theme-title" && firstTitle) {
      firstTitle = false;
      continue;
    }
    const runs = tokenizeInline(m[2], ids);
    if (!runs.length) continue;
    if (LIST_CLASS.test(key)) runs.unshift({ s: "• " });
    const level = HEAD_LEVEL[key];
    blocks.push(level ? { h: level, runs } : { runs });
  }
  return blocks;
}

function wordCount(blocks) {
  let n = 0;
  for (const b of blocks) for (const r of b.runs) n += r.s.split(/\s+/).filter(Boolean).length;
  return n;
}

// Browse letter: first letter of the title, ignoring leading quotes/punctuation
// and a leading article word, so both "The Creation" and "“Belief” in the
// Gospel of John" file under C and B respectively rather than T and #.
function letterOf(title) {
  let t = title.replace(/^[^A-Za-z0-9]+/, "").replace(/^(the|a|an)\s+/i, "");
  t = t.replace(/^[^A-Za-z0-9]+/, "");
  const c = (t[0] || "").toUpperCase();
  return c >= "A" && c <= "Z" ? c : "#";
}

function main() {
  const xmlPath = process.argv[2];
  if (!xmlPath || !fs.existsSync(xmlPath)) {
    console.error("Usage: node scripts/build-tyndale-themes.mjs path/to/ThemeNotes.xml");
    process.exit(1);
  }
  const xml = fs.readFileSync(xmlPath, "utf-8");

  const itemRe = /<item\b[^>]*\bname="([^"]+)"[^>]*\btypename="ThemeNote"[^>]*>([\s\S]*?)<\/item>/g;

  // Pass 1: collect ids, titles, bodies (so cross-refs can be validated).
  const raw = [];
  const ids = new Set();
  let m;
  while ((m = itemRe.exec(xml)) !== null) {
    const id = m[1];
    const inner = m[2];
    const titleRaw = (/<title>([\s\S]*?)<\/title>/.exec(inner) || [])[1] || id;
    const body = (/<body>([\s\S]*?)<\/body>/.exec(inner) || [, inner])[1];
    const title = decodeEntities(titleRaw).replace(/\s+/g, " ").trim();
    if (ids.has(id)) continue;
    ids.add(id);
    const { section, sort } = anchorInfo(inner);
    raw.push({ id, title, body, section, sort });
  }

  // Pass 2: parse bodies into blocks. Order by canonical anchor position so a
  // section browse lists topics as they arise through the Bible; the client
  // filters by section and preserves this order.
  const sortKey = (t) =>
    t.replace(/^[^A-Za-z0-9]+/, "").replace(/^(the|a|an)\s+/i, "").toLowerCase();
  raw.sort((a, b) => a.sort - b.sort || sortKey(a.title).localeCompare(sortKey(b.title)));

  const articles = {};
  const index = [];
  let empty = 0;
  let noSection = 0;
  for (const { id, title, body, section } of raw) {
    const blocks = parseBody(body, ids);
    if (!blocks.length) {
      empty++;
      continue;
    }
    if (!section) noSection++;
    articles[id] = { t: title, b: blocks };
    index.push([id, title, letterOf(title), wordCount(blocks), section ?? "History"]);
  }
  if (noSection) console.warn(`WARNING: ${noSection} themes had no resolvable anchor section`);

  fs.rmSync(OUT_DIR, { recursive: true, force: true });
  fs.mkdirSync(OUT_DIR, { recursive: true });

  fs.writeFileSync(path.join(OUT_DIR, "articles.json"), JSON.stringify({ articles }));
  fs.writeFileSync(
    path.join(OUT_DIR, "_index.json"),
    JSON.stringify({ count: index.length, entries: index }),
  );
  fs.writeFileSync(
    path.join(OUT_DIR, "_attribution.json"),
    JSON.stringify(
      {
        source: "Tyndale Open Study Notes (theme articles), Tyndale House Publishers",
        license: "CC BY-SA 4.0",
        url: "https://tyndaleopenresources.com/",
        attribution:
          "Adapted from Tyndale Open Study Notes. The original work by Tyndale House Publishers is available for free at http://www.tyndaleopenresources.com.",
        notes:
          "Theme articles reformatted from ThemeNotes.xml to JSON by scripts/build-tyndale-themes.mjs; scripture links flattened to full references, cross-references kept as internal id links. This adapted dataset remains CC BY-SA 4.0.",
      },
      null,
      2,
    ) + "\n",
  );

  const bytes = fs.statSync(path.join(OUT_DIR, "articles.json")).size;
  console.log(
    `Themes: ${index.length} (skipped ${empty} empty) · articles.json ${(bytes / 1024).toFixed(0)} KB`,
  );
  const counts = Object.fromEntries(SECTION_ORDER.map((s) => [s, 0]));
  for (const e of index) counts[e[4]] = (counts[e[4]] ?? 0) + 1;
  console.log(
    "  sections: " + SECTION_ORDER.map((s) => `${s} ${counts[s]}`).join(" · "),
  );
}

main();
