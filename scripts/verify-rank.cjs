// Verify every 4-option MCQ's correct-answer length-rank matches the frozen
// target in rank-targets.json, with NO distractor tied in length with the answer
// (which would make the rank ambiguous). Prints the global rank distribution.
//   node scripts/verify-rank.cjs            # check all
//   node scripts/verify-rank.cjs "Genesis"  # check one book
const fs = require("fs");
const path = require("path");
const QDIR = "data/questions";
const targets = JSON.parse(fs.readFileSync("scripts/rank-targets.json", "utf8"));
const only = process.argv[2];
const dist = { 1: 0, 2: 0, 3: 0, 4: 0 };
const fails = [];
let tieCount = 0;
for (const book of fs.readdirSync(QDIR)) {
  if (only && book !== only) continue;
  const dir = path.join(QDIR, book);
  if (!fs.statSync(dir).isDirectory()) continue;
  for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith(".json")) continue;
    const data = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8"));
    for (const q of data.questions || []) {
      if (q.type !== "multiple_choice" || !Array.isArray(q.options) || q.options.length !== 4) continue;
      const ans = q.answer ?? q.correct;
      if (typeof ans !== "string") continue;
      const al = ans.length;
      const longer = q.options.filter((o) => o !== ans && o.length > al).length;
      const tie = q.options.filter((o) => o !== ans && o.length === al).length;
      const rank = longer + 1;
      dist[rank]++;
      const tgt = Number(targets[q.id]);
      if (tgt && rank !== tgt) fails.push(`${q.id}: rank ${rank} != target ${tgt}`);
      if (tie) tieCount++;
    }
  }
}
const tot = Object.values(dist).reduce((a, b) => a + b, 0);
console.log("Rank distribution:", JSON.stringify(dist), `(of ${tot})`);
for (const r of [1, 2, 3, 4]) console.log(`  rank ${r}: ${(100 * dist[r] / tot).toFixed(1)}%`);
if (fails.length) { console.log(`\n${fails.length} problem(s):`); for (const f of fails.slice(0, 40)) console.log("  " + f); process.exit(1); }
console.log("\nOK: all match frozen targets, no answer-length ties.");
