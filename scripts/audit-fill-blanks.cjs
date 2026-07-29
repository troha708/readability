// Audit fill_blank quiz answers against actual verse text in each translation.
// Flags questions whose answer word is absent from a translation a reader could
// be using (esp. BSB, the default) — i.e. translation-variant answers that would
// be marked wrong.
const fs = require("fs");
const path = require("path");

const TRANS = ["BSB", "KJV", "WEB"];
const QDIR = "data/questions";
const cache = {}; // trans -> book -> {chapter:{verse:text}}

function loadBook(trans, book) {
  cache[trans] = cache[trans] || {};
  if (book in cache[trans]) return cache[trans][book];
  const f = path.join("data", trans, book + ".json");
  if (!fs.existsSync(f)) return (cache[trans][book] = null);
  const data = JSON.parse(fs.readFileSync(f, "utf8"));
  const chapters = {};
  for (const ch of data.chapters) chapters[ch.chapter] = parseVerses(ch.html);
  return (cache[trans][book] = chapters);
}

function parseVerses(html) {
  const verses = {};
  const re = /<span[^>]*data-number="(\d+)"[^>]*class="v"[^>]*>\d+<\/span>/g;
  const marks = [];
  let m;
  while ((m = re.exec(html)) !== null)
    marks.push({ num: +m[1], end: re.lastIndex, start: m.index });
  for (let i = 0; i < marks.length; i++) {
    const seg = html
      .slice(marks[i].end, i + 1 < marks.length ? marks[i + 1].start : html.length)
      .replace(/<[^>]+>/g, " ")
      .replace(/&#?[a-z0-9]+;/gi, " ")
      .replace(/\s+/g, " ")
      .trim();
    verses[marks[i].num] = (verses[marks[i].num] ? verses[marks[i].num] + " " : "") + seg;
  }
  return verses;
}

function refText(trans, ref) {
  const mt = ref.match(/^(.+?)\s+(\d+):(\d+)(?:[-–](\d+))?/);
  if (!mt) return null;
  const [, book, ch, v1, v2] = mt;
  const chapters = loadBook(trans, book);
  if (!chapters || !chapters[ch]) return null;
  const from = +v1,
    to = v2 ? +v2 : +v1;
  let txt = "";
  for (let v = from; v <= to; v++) if (chapters[ch][v]) txt += " " + chapters[ch][v];
  return txt.toLowerCase();
}

function norm(s) {
  return s.toLowerCase().replace(/[^\w\s]/g, "").trim();
}
function present(answer, text) {
  if (!text) return false;
  const a = norm(answer);
  if (!a) return false;
  // whole-word/phrase match
  return new RegExp(`(^|\\W)${a.replace(/\s+/g, "\\s+")}(\\W|$)`).test(text);
}

let totalFB = 0;
const flags = []; // {file, id, ref, answer, inBSB, inKJV, inWEB}
for (const book of fs.readdirSync(QDIR)) {
  const dir = path.join(QDIR, book);
  if (!fs.statSync(dir).isDirectory()) continue;
  for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith(".json")) continue;
    const fp = path.join(dir, file);
    const data = JSON.parse(fs.readFileSync(fp, "utf8"));
    for (const q of data.questions || []) {
      if (q.type !== "fill_blank") continue;
      totalFB++;
      const inBSB = present(q.answer, refText("BSB", q.verse_reference));
      const inKJV = present(q.answer, refText("KJV", q.verse_reference));
      const inWEB = present(q.answer, refText("WEB", q.verse_reference));
      if (!(inBSB && inKJV)) {
        flags.push({ fp, id: q.id, ref: q.verse_reference, answer: q.answer, inBSB, inKJV, inWEB });
      }
    }
  }
}

const notInBSB = flags.filter((f) => !f.inBSB);
const variantInBSBnotKJV = flags.filter((f) => f.inBSB && !f.inKJV);
const inNeither = flags.filter((f) => !f.inBSB && !f.inKJV);
const kjvNotBsb = flags.filter((f) => f.inKJV && !f.inBSB);

console.log(`Total fill_blank questions: ${totalFB}`);
console.log(`Flagged (answer not in BOTH BSB & KJV): ${flags.length}`);
console.log(`  • answer missing from BSB (default reader fails): ${notInBSB.length}`);
console.log(`      — of those, present in KJV (classic variant bug): ${kjvNotBsb.length}`);
console.log(`  • answer in BSB but not KJV (KJV reader fails): ${variantInBSBnotKJV.length}`);
console.log(`  • answer in NEITHER (paraphrase / bad ref — needs manual): ${inNeither.length}`);
fs.writeFileSync("scripts/fill-blank-flags.json", JSON.stringify(flags, null, 2));
console.log(`\nWrote ${flags.length} flagged questions to scripts/fill-blank-flags.json`);
console.log(`\nSample (first 15):`);
for (const f of flags.slice(0, 15))
  console.log(`  ${f.ref.padEnd(22)} "${f.answer}"  BSB:${f.inBSB?1:0} KJV:${f.inKJV?1:0} WEB:${f.inWEB?1:0}  (${f.id})`);
