// List MCQs where the correct answer is STRICTLY the longest option, and mark a
// deterministic ~50% selection (every other one, in file/qid order) to be flipped
// so that a plausible WRONG answer becomes the longest option instead.
//   node scripts/dump-longest.cjs "Genesis"          # show selected (to edit)
//   node scripts/dump-longest.cjs "Genesis" all      # show all longest
//   node scripts/dump-longest.cjs --counts           # per-book selected counts
const fs = require("fs");
const path = require("path");
const QDIR = "data/questions";
const num = (x) => +(x.match(/\d+/) || [0])[0];

function longestList(book) {
  const dir = path.join(QDIR, book);
  const out = [];
  for (const file of fs.readdirSync(dir).sort((a, b) => num(a) - num(b))) {
    if (!file.endsWith(".json")) continue;
    const data = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8"));
    for (const q of data.questions || []) {
      if (q.type !== "multiple_choice" || !Array.isArray(q.options)) continue;
      const ans = q.answer ?? q.correct;
      if (typeof ans !== "string") continue;
      const maxOther = Math.max(
        ...q.options.filter((o) => o !== ans).map((o) => o.length),
      );
      if (ans.length > maxOther) out.push({ q, ans, gap: ans.length - maxOther });
    }
  }
  // Deterministic ~70%: skip 3 of every 10, spread out (indices %10 in {2,5,8}).
  return out.map((e, i) => {
    const r = i % 10;
    return { ...e, selected: !(r === 2 || r === 5 || r === 8) };
  });
}

if (process.argv[2] === "--counts") {
  let total = 0,
    sel = 0;
  for (const book of fs.readdirSync(QDIR)) {
    const d = path.join(QDIR, book);
    if (!fs.statSync(d).isDirectory()) continue;
    const list = longestList(book);
    const s = list.filter((e) => e.selected).length;
    total += list.length;
    sel += s;
    if (list.length) console.log(`${book}: ${s}/${list.length}`);
  }
  console.error(`TOTAL longest=${total} selected=${sel}`);
  process.exit(0);
}

const book = process.argv[2];
const showAll = process.argv[3] === "all";
const list = longestList(book);
let n = 0;
for (const e of list) {
  if (!showAll && !e.selected) continue;
  n++;
  const mark = e.selected ? "*SEL*" : "     ";
  console.log(`\n${mark} ${e.q.id}  ans=${e.ans.length} gap=+${e.gap}`);
  console.log(`  Q: ${e.q.question}`);
  for (const o of e.q.options)
    console.log(`   ${o === e.ans ? "A" : " "} (${o.length}) ${o}`);
}
console.error(
  `${book}: ${list.filter((x) => x.selected).length} selected of ${list.length} longest`,
);
