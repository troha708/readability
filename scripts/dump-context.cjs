// Dump fill_blank questions whose answer is missing from the BSB verse text
// (the default-reader-fails set), with each translation's verse text, for manual
// curation.   node scripts/dump-context.cjs "1 Chronicles"
const fs = require("fs");
const path = require("path");
const book = process.argv[2];
const cache = {};
function loadBook(trans, b) {
  cache[trans] = cache[trans] || {};
  if (b in cache[trans]) return cache[trans][b];
  const f = path.join("data", trans, b + ".json");
  if (!fs.existsSync(f)) return (cache[trans][b] = null);
  const data = JSON.parse(fs.readFileSync(f, "utf8"));
  const ch = {};
  for (const c of data.chapters) ch[c.chapter] = parseVerses(c.html);
  return (cache[trans][b] = ch);
}
function parseVerses(html) {
  const verses = {};
  const re = /<span[^>]*data-number="(\d+)"[^>]*class="v"[^>]*>\d+<\/span>/g;
  const marks = [];
  let m;
  while ((m = re.exec(html)) !== null) marks.push({ num: +m[1], end: re.lastIndex, start: m.index });
  for (let i = 0; i < marks.length; i++) {
    const seg = html.slice(marks[i].end, i + 1 < marks.length ? marks[i + 1].start : html.length)
      .replace(/<[^>]+>/g, " ").replace(/&#?[a-z0-9]+;/gi, " ").replace(/\s+/g, " ").trim();
    verses[marks[i].num] = (verses[marks[i].num] ? verses[marks[i].num] + " " : "") + seg;
  }
  return verses;
}
function refText(trans, ref) {
  const mt = ref.match(/^(.+?)\s+(\d+):(\d+)(?:[-–](\d+))?/);
  if (!mt) return "";
  let [, b, ch, v1, v2] = mt;
  if (b === "Psalm") b = "Psalms";
  const chapters = loadBook(trans, b);
  if (!chapters || !chapters[ch]) return "(verse not found)";
  let t = "";
  for (let v = +v1; v <= (v2 ? +v2 : +v1); v++) if (chapters[ch][v]) t += " " + chapters[ch][v];
  return t.trim();
}
const present = (ans, text) => {
  const a = ans.toLowerCase().replace(/[^\w\s]/g, "").trim();
  const t = text.toLowerCase().replace(/[^\w\s]/g, "");
  return a && new RegExp(`(^|\\W)${a.replace(/\s+/g, "\\s+")}(\\W|$)`).test(t);
};
const dir = path.join("data/questions", book);
for (const file of fs.readdirSync(dir).sort()) {
  if (!file.endsWith(".json")) continue;
  const data = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8"));
  for (const q of data.questions || []) {
    if (q.type !== "fill_blank") continue;
    const bsb = refText("BSB", q.verse_reference);
    // Resolved if any accepted answer is a word the BSB reader would produce.
    if ([q.answer, ...(q.accept || [])].some((a) => present(a, bsb))) continue;
    console.log(`\n${q.id}  [${q.verse_reference}]  answer="${q.answer}"`);
    console.log(`  Q: ${q.question}`);
    console.log(`  BSB: ${bsb}`);
    console.log(`  KJV: ${refText("KJV", q.verse_reference)}`);
    console.log(`  WEB: ${refText("WEB", q.verse_reference)}`);
  }
}
