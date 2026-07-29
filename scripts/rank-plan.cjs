// Plan a redistribution so the correct answer's length-RANK (1=longest .. 4=shortest)
// is uniform across all 4-option MCQs (~25% each), with MINIMAL changes:
// keep every question already at its target rank; only move surplus rank-2 items.
//
//   node scripts/rank-plan.cjs                 # global summary + per-book edit counts
//   node scripts/rank-plan.cjs "Genesis"       # per-question to-edit list for a book
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const QDIR = "data/questions";

function rankOf(ans, opts) {
  const al = ans.length;
  return opts.filter((o) => o !== ans && o.length > al).length + 1; // 1=longest
}
const h = (s) => parseInt(crypto.createHash("sha1").update(s).digest("hex").slice(0, 8), 16);

// Collect every 4-option MCQ.
const all = [];
for (const book of fs.readdirSync(QDIR)) {
  const dir = path.join(QDIR, book);
  if (!fs.statSync(dir).isDirectory()) continue;
  for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith(".json")) continue;
    const data = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8"));
    for (const q of data.questions || []) {
      if (q.type !== "multiple_choice" || !Array.isArray(q.options) || q.options.length !== 4) continue;
      const ans = q.answer ?? q.correct;
      if (typeof ans !== "string") continue;
      all.push({ id: q.id, book, q, ans, rank: rankOf(ans, q.options) });
    }
  }
}

const N = all.length;
// Target counts: as even as possible.
const base = Math.floor(N / 4), rem = N - base * 4;
const target = { 1: base, 2: base, 3: base, 4: base };
for (let i = 1; i <= rem; i++) target[i]++; // give remainder to lowest ranks

// Current counts.
const cur = { 1: 0, 2: 0, 3: 0, 4: 0 };
for (const e of all) cur[e.rank]++;

// Frozen target assignment (computed once, then reused so it stays stable while
// the underlying files are edited). Min-change: keep everyone at their current
// rank; pull the surplus only from rank 2 into the deficit ranks, spread by hash.
const FROZEN = "scripts/rank-targets.json";
let assign;
if (fs.existsSync(FROZEN)) {
  assign = new Map(Object.entries(JSON.parse(fs.readFileSync(FROZEN, "utf8"))));
} else {
  assign = new Map(all.map((e) => [e.id, e.rank]));
  const pool = all.filter((e) => e.rank === 2).sort((a, b) => h(a.id) - h(b.id));
  const need = { 1: Math.max(0, target[1] - cur[1]), 3: Math.max(0, target[3] - cur[3]), 4: Math.max(0, target[4] - cur[4]) };
  let i = 0;
  for (const r of [1, 3, 4]) for (let k = 0; k < need[r] && i < pool.length; k++, i++) assign.set(pool[i].id, r);
  fs.writeFileSync(FROZEN, JSON.stringify(Object.fromEntries(assign), null, 0) + "\n");
  console.error(`Wrote frozen targets to ${FROZEN}`);
}
const tnum = (id) => Number(assign.get(id));

if (!process.argv[2]) {
  console.log(`Total 4-option MCQs: ${N}`);
  console.log("Current rank counts:", JSON.stringify(cur));
  console.log("Target  rank counts:", JSON.stringify(target));
  const moves = all.filter((e) => tnum(e.id) !== e.rank);
  console.log(`Questions to edit: ${moves.length}`);
  const byBook = {};
  for (const e of moves) byBook[e.book] = (byBook[e.book] || 0) + 1;
  for (const b of Object.keys(byBook).sort()) console.log(`  ${b}: ${byBook[b]}`);
  process.exit(0);
}

// Per-book to-edit list.
const book = process.argv[2];
let n = 0;
for (const e of all.filter((x) => x.book === book && tnum(x.id) !== x.rank)) {
  n++;
  const tr = tnum(e.id);
  console.log(`\n${e.id}  rank ${e.rank} -> TARGET ${tr}  (need ${tr - 1} distractors longer than answer; answer len ${e.ans.length})`);
  for (const o of e.q.options) console.log(`   ${o === e.ans ? "A" : " "} (${o.length}) ${o}`);
}
console.error(`${book}: ${n} to edit`);
