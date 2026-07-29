#!/usr/bin/env node
/**
 * Build the KJV line for the verse-sheet interlinear: data/interlinear-kjv/<Book>.json.
 *
 * The KJV *text* is taken from data/KJV (what the app actually ships and the
 * reader reads), so the interlinear KJV line always matches the reading text.
 * The Strong's *tags* come from the kaiserlik/kjv dataset (KJV with per-word
 * Strong's numbers, scraped; the KJV text and Strong's numbers are public
 * domain). kaiserlik's OT text drops some translator-supplied phrases, so it's
 * used only to tag the shipped words, never as the line itself. Each tagged
 * word is then linked to a Greek/Hebrew word in data/interlinear by Strong's
 * number, so tapping a KJV word highlights its original.
 *
 * Output: data/interlinear-kjv/<Book>.json
 *   { book, verses: { "3:16": [ [text, link, strong], … ] } }
 *   text  = the shipped KJV word (the line reads these in order)
 *   link  = id (index) of the linked word in data/interlinear/<Book>.json,
 *           or a unique negative number when the word has no Greek partner
 *           (a supplied word, or an NT word the critical text lacks)
 *   strong = "G25" / "H7225" ("" for an untagged supplied word)
 *
 * Usage: node scripts/build-kjv-interlinear.mjs --kjv <kaiserlik-dir>
 *   <kaiserlik-dir> holds the per-book {abbrev}.json files and books.json
 *   from github.com/kaiserlik/kjv.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const KJV_DIR = arg("kjv");
if (!KJV_DIR) {
  console.error("Usage: node scripts/build-kjv-interlinear.mjs --kjv <kaiserlik-dir>");
  process.exit(1);
}

const ALIAS = { Psalms: "Psalm", "Song of Solomon": "Song of Songs" };
const norm = (w) => w.toLowerCase().replace(/[^a-z]/g, "");

// kaiserlik book name -> abbreviation
const kbooks = JSON.parse(fs.readFileSync(path.join(KJV_DIR, "books.json"), "utf8")).books;
const nameToAbbr = {};
for (const o of kbooks) for (const k in o) nameToAbbr[k] = o[k];

// kaiserlik "en" -> word-level [{norm, strong}] (phrases expanded, <em> italics stripped)
function kaiserlikWords(en) {
  if (!en) return [];
  en = en.replace(/<[^>]+>/g, "");
  const out = [];
  const re = /\[([GH]\d+)\]/g;
  let last = 0, m;
  while ((m = re.exec(en))) {
    for (const w of en.slice(last, m.index).trim().split(/\s+/)) {
      if (norm(w)) out.push({ norm: norm(w), strong: m[1] });
    }
    last = m.index + m[0].length;
  }
  for (const w of en.slice(last).trim().split(/\s+/)) {
    if (norm(w)) out.push({ norm: norm(w), strong: "" });
  }
  return out;
}

// Some kaiserlik files are invalid JSON (unescaped quotes in the Bulgarian /
// Chinese fields we don't use). We only need the English, so pull each verse's
// "en" value by regex instead of JSON.parse. Inner keys are always the abbrev
// form ("1Co|1|1"), regardless of the file's top-level key.
function loadKjvEn(file) {
  const raw = fs.readFileSync(file, "utf8");
  const map = {};
  const re = /"([A-Za-z0-9]+\|\d+\|\d+)":\s*\{\s*"en":\s*"((?:\\.|[^"\\])*)"/g;
  let m;
  while ((m = re.exec(raw))) map[m[1]] = m[2].replace(/\\"/g, '"').replace(/\\\\/g, "\\");
  return map;
}

// shipped KJV verse text, sliced between verse-number spans
const VSPAN = /<span[^>]*data-number="(\d+)"[^>]*class="v"[^>]*>\d+<\/span>/g;
function chapterVerses(html) {
  const out = {};
  const ms = [...html.matchAll(VSPAN)];
  for (let i = 0; i < ms.length; i++) {
    const s = ms[i].index + ms[i][0].length;
    const e = i + 1 < ms.length ? ms[i + 1].index : html.length;
    out[+ms[i][1]] = html.slice(s, e).replace(/<[^>]+>/g, " ").replace(/¶/g, " ").replace(/\s+/g, " ").trim();
  }
  return out;
}

// greedy subsequence tag: shipped is the full line, kaiserlik a (mostly) subsequence
function tagShipped(shipNorms, kw) {
  const tags = new Array(shipNorms.length).fill("");
  let ci = 0;
  for (let si = 0; si < shipNorms.length && ci < kw.length; si++) {
    if (shipNorms[si] === kw[ci].norm) { tags[si] = kw[ci].strong; ci++; }
    else if (ci + 1 < kw.length && shipNorms[si] === kw[ci + 1].norm) { tags[si] = kw[ci + 1].strong; ci += 2; }
  }
  return tags;
}

const interDir = path.join(root, "data", "interlinear");
const outDir = path.join(root, "data", "interlinear-kjv");
fs.mkdirSync(outDir, { recursive: true });

let nBooks = 0, nVerses = 0, nWords = 0, nTagged = 0, nLinked = 0;
const skipped = [];

for (const file of fs.readdirSync(interDir).filter((f) => f.endsWith(".json"))) {
  const book = file.replace(/\.json$/, "");
  const abbr = nameToAbbr[book] || nameToAbbr[ALIAS[book]];
  if (!abbr) { skipped.push(book); continue; }

  const inter = JSON.parse(fs.readFileSync(path.join(interDir, file), "utf8")).verses;
  const shipped = JSON.parse(fs.readFileSync(path.join(root, "data", "KJV", file), "utf8"));
  const kjvEn = loadKjvEn(path.join(KJV_DIR, `${abbr}.json`));

  const verses = {};
  for (const ch of shipped.chapters) {
    const sv = chapterVerses(ch.html);
    for (const vnum in sv) {
      const cv = `${ch.chapter}:${vnum}`;
      const shipTokens = sv[vnum].split(/\s+/).filter(Boolean);
      if (!shipTokens.length) continue;
      const shipNorms = shipTokens.map(norm);
      const kw = kaiserlikWords(kjvEn[`${abbr}|${ch.chapter}|${vnum}`]);
      const tags = tagShipped(shipNorms, kw);

      // Strong -> Berean entry indices (ids), in array order
      const pool = {};
      (inter[cv] || []).forEach((e, id) => { if (e[3]) (pool[e[3]] ||= []).push(id); });
      const counter = {};

      const tokens = shipTokens.map((text, i) => {
        const s = shipNorms[i] ? tags[i] : "";
        let link;
        if (s && pool[s]) {
          const ids = pool[s];
          link = ids[Math.min(counter[s] || 0, ids.length - 1)];
          counter[s] = (counter[s] || 0) + 1;
          nLinked++;
        } else {
          link = -(i + 1); // no Greek partner — highlight this word alone
        }
        if (s) nTagged++;
        if (shipNorms[i]) nWords++;
        return [text, link, s];
      });
      verses[cv] = tokens;
      nVerses++;
    }
  }
  fs.writeFileSync(path.join(outDir, file), JSON.stringify({ book, verses }));
  nBooks++;
}

console.log(`Wrote ${nBooks} books, ${nVerses} verses, ${nWords} KJV words → data/interlinear-kjv/`);
console.log(`  tagged with a Strong: ${nTagged} (${(100 * nTagged / nWords).toFixed(1)}%); linked to Greek: ${nLinked} (${(100 * nLinked / nTagged).toFixed(1)}% of tagged)`);
if (skipped.length) console.log(`  SKIPPED (no kaiserlik match): ${skipped.join(", ")}`);
