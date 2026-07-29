// Dump multiple-choice questions whose correct answer is the longest option by
// MARGIN chars or more (a visible length tell), with full options, for curation.
//   node scripts/dump-mcq.cjs "Genesis" [margin]
const fs = require("fs");
const path = require("path");
const book = process.argv[2];
const MARGIN = Number(process.argv[3] || 8);
const dir = path.join("data/questions", book);
function gap(q) {
  if (q.type !== "multiple_choice" || !Array.isArray(q.options)) return -1;
  const ans = q.answer ?? q.correct;
  if (typeof ans !== "string") return -1;
  const d = q.options.filter((o) => o !== ans);
  if (!d.length) return -1;
  return ans.length - Math.max(...d.map((o) => o.length));
}
const num = (x) => +(x.match(/\d+/) || [0])[0];
let count = 0;
for (const file of fs.readdirSync(dir).sort((a, b) => num(a) - num(b))) {
  if (!file.endsWith(".json")) continue;
  const data = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8"));
  for (const q of data.questions || []) {
    const g = gap(q);
    if (g < MARGIN) continue;
    count++;
    const ans = q.answer ?? q.correct;
    console.log(`\n${q.id}  ans=${ans.length} gap=+${g}`);
    console.log(`  Q: ${q.question}`);
    for (const o of q.options) console.log(`   ${o === ans ? "*" : " "} ${o}`);
  }
}
console.error(`${book}: ${count} flagged (answer longest by >=${MARGIN})`);
