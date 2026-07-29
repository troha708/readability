#!/usr/bin/env node
/**
 * Build the Tyndale Open Bible Dictionary into per-letter JSON + a slim search
 * index, consumed by the dictionary UI (web /api/dictionary and the offline
 * mobile provider).
 *
 * Source: https://tyndaleopenresources.com/ ("Tyndale Open Bible Dictionary"
 * zip → Articles/A.xml … Z.xml). © Tyndale House Publishers, CC BY-SA 4.0. The
 * output here is an adaptation (reformatted to JSON, scripture links flattened
 * to plain references, cross-references kept as internal id links, images/maps
 * dropped) and therefore remains CC BY-SA 4.0 — see
 * data/tyndale-dictionary/_attribution.json.
 *
 * Usage:
 *   node scripts/build-tyndale-dictionary.mjs path/to/dict/Articles
 *   node scripts/build-tyndale-dictionary.mjs path/to/dict     # dir with Articles/
 *
 * Output: data/tyndale-dictionary/
 *   _index.json    { generatedAt, count, entries: [[id, title, letter, words]] }
 *   _attribution.json
 *   {LETTER}.json  { letter, articles: { id: { t: title, b: blocks } } }
 *
 * A block is { h?: 2|3, runs: Run[] }  (h = subhead level; absent = paragraph)
 * A run is one of:
 *   { s }            plain text (scripture references written out in full,
 *                    linkified at render by parseScriptureRefs → verse peek)
 *   { s, i: 1 }      italic text
 *   { s, x: id }     cross-reference link to another dictionary entry
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, "..", "data", "tyndale-dictionary");

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
};

/** Parse a Tyndale bref like "Matt.5.13", "Gen.1.1-2.3". Returns parts or null. */
function parseRef(ref) {
  const m = /^([A-Za-z]+)\.(\d+)\.(\d+)[a-z]?(?:[-–](?:(\d+)\.)?(\d+)[a-z]?)?$/.exec(ref);
  if (!m) return null;
  const book = BOOK_CODES[m[1]];
  if (!book) return null;
  const c = parseInt(m[2], 10);
  const v = parseInt(m[3], 10);
  const ec = m[4] ? parseInt(m[4], 10) : c;
  const ev = m[5] ? parseInt(m[5], 10) : v;
  return { book, c, v, ec, ev };
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

/** Strip inner tags and decode a link's label. */
function linkLabel(inner) {
  return decodeEntities(inner.replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
}

/** The article id a "?item=Name_Article_Product" link points at, or null. */
function itemTarget(href) {
  const m = /^\?item=(.+?)_Article_/.exec(href);
  return m ? m[1] : null;
}

/**
 * Tokenize one block's inline HTML into runs. `ids` is the set of valid article
 * ids so cross-references to real entries become links and the rest fall back
 * to plain text. Adjacent same-kind runs are merged; whitespace collapsed.
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
      italStack.push(/class="[^"]*\bital\b[^"]*"/.test(tok));
    } else if (tok === "</span>") {
      italStack.pop();
    } else if (tok.startsWith("<")) {
      // Other tags (br, etc.) → soft space.
      push({ s: " " });
    } else {
      push({ s: decodeEntities(tok), i: italActive() ? 1 : undefined });
    }
  }

  // Trim and collapse whitespace across runs.
  for (const r of runs) r.s = r.s.replace(/\s+/g, " ");
  while (runs.length && !runs[0].s.trim()) runs.shift();
  while (runs.length && !runs[runs.length - 1].s.trim()) runs.pop();
  if (runs.length) {
    runs[0].s = runs[0].s.replace(/^\s+/, "");
    runs[runs.length - 1].s = runs[runs.length - 1].s.replace(/\s+$/, "");
  }
  return runs.filter((r) => r.s.length);
}

// Paragraph classes that are structural noise for a reading view.
const SKIP_CLASS = /^(toc|artfile|caption-head|caption-text)$/;
const HEAD_LEVEL = { h2: 2, "h2-preview": 2, "h2-list": 2, h3: 3, h4: 3, h5: 3 };

/** Turn one article body's <p> blocks into structured blocks. */
function parseBody(body, ids) {
  const blocks = [];
  const pRe = /<p\b([^>]*)>([\s\S]*?)<\/p>/g;
  let firstH1 = true;
  let m;
  while ((m = pRe.exec(body)) !== null) {
    const cls = (/class="([^"]*)"/.exec(m[1]) || [])[1] || "";
    const key = cls.trim().split(/\s+/)[0] || "";
    if (SKIP_CLASS.test(key)) continue;
    // The leading h1 repeats the headword we already show as the title.
    if (key === "h1" && firstH1) {
      firstH1 = false;
      continue;
    }
    const runs = tokenizeInline(m[2], ids);
    if (!runs.length) continue;
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

function letterOf(id) {
  const c = (id[0] || "").toUpperCase();
  return c >= "A" && c <= "Z" ? c : "#";
}

function main() {
  let src = process.argv[2];
  if (!src) {
    console.error("Usage: node scripts/build-tyndale-dictionary.mjs path/to/Articles");
    process.exit(1);
  }
  if (fs.existsSync(path.join(src, "Articles"))) src = path.join(src, "Articles");
  if (!fs.existsSync(src)) {
    console.error(`No such directory: ${src}`);
    process.exit(1);
  }

  const files = fs.readdirSync(src).filter((f) => /\.xml$/i.test(f));
  const itemRe =
    /<item typename="Article"[^>]*\bname="([^"]+)">([\s\S]*?)<\/item>/g;

  // Pass 1: collect ids, titles, and raw bodies (so cross-refs can be validated).
  const raw = []; // { id, title, body }
  const ids = new Set();
  for (const f of files) {
    const xml = fs.readFileSync(path.join(src, f), "utf-8");
    let m;
    while ((m = itemRe.exec(xml)) !== null) {
      const id = m[1];
      const inner = m[2];
      const titleRaw = (/<title>([\s\S]*?)<\/title>/.exec(inner) || [])[1] || id;
      const body = (/<body>([\s\S]*?)<\/body>/.exec(inner) || [, inner])[1];
      const title = decodeEntities(titleRaw).replace(/\*/g, "").replace(/\s+/g, " ").trim();
      if (ids.has(id)) continue; // names are unique keys; first wins
      ids.add(id);
      raw.push({ id, title, body });
    }
  }

  // Pass 2: parse bodies into blocks, bucket by letter.
  const byLetter = new Map(); // letter → { id: { t, b } }
  const index = []; // [id, title, letter, words]
  let empty = 0;
  for (const { id, title, body } of raw) {
    const blocks = parseBody(body, ids);
    if (!blocks.length) {
      empty++;
      continue;
    }
    const letter = letterOf(id);
    if (!byLetter.has(letter)) byLetter.set(letter, {});
    byLetter.get(letter)[id] = { t: title, b: blocks };
    index.push([id, title, letter, wordCount(blocks)]);
  }

  index.sort((a, b) => a[1].localeCompare(b[1]));

  fs.rmSync(OUT_DIR, { recursive: true, force: true });
  fs.mkdirSync(OUT_DIR, { recursive: true });

  for (const [letter, articles] of byLetter) {
    fs.writeFileSync(
      path.join(OUT_DIR, `${letter}.json`),
      JSON.stringify({ letter, articles }),
    );
  }

  fs.writeFileSync(
    path.join(OUT_DIR, "_index.json"),
    JSON.stringify({ count: index.length, entries: index }),
  );

  fs.writeFileSync(
    path.join(OUT_DIR, "_attribution.json"),
    JSON.stringify(
      {
        source: "Tyndale Open Bible Dictionary, Tyndale House Publishers",
        license: "CC BY-SA 4.0",
        url: "https://tyndaleopenresources.com/",
        attribution:
          "Adapted from Tyndale Open Bible Dictionary. The original work by Tyndale House Publishers is available for free at http://www.tyndaleopenresources.com.",
        notes:
          "Reformatted from Articles/*.xml to per-letter JSON by scripts/build-tyndale-dictionary.mjs; scripture links flattened to full references, cross-references kept as internal id links, images/maps/charts dropped. This adapted dataset remains CC BY-SA 4.0.",
      },
      null,
      2,
    ) + "\n",
  );

  const letters = [...byLetter.keys()].sort().join("");
  console.log(
    `Articles: ${index.length} (skipped ${empty} empty), letters: ${letters}`,
  );
}

main();
