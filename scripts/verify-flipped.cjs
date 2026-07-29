// Verify that for every id in mcq-map.json, the correct answer is NO LONGER the
// strictly-longest option (i.e., some distractor is now strictly longer).
//   node scripts/verify-flipped.cjs
const fs = require("fs");
const path = require("path");
const MAP = require("./mcq-map.json");
const ids = new Set(Object.keys(MAP));
const QDIR = "data/questions";
const fails = [];
const found = new Set();
for (const book of fs.readdirSync(QDIR)) {
  const dir = path.join(QDIR, book);
  if (!fs.statSync(dir).isDirectory()) continue;
  for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith(".json")) continue;
    const data = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8"));
    for (const q of data.questions || []) {
      if (!ids.has(q.id)) continue;
      found.add(q.id);
      const ans = q.answer ?? q.correct;
      const maxOther = Math.max(
        ...q.options.filter((o) => o !== ans).map((o) => o.length),
      );
      if (ans.length >= maxOther)
        fails.push(`${q.id}: answer(${ans.length}) still >= longest distractor(${maxOther})`);
    }
  }
}
for (const id of ids) if (!found.has(id)) fails.push(`${id}: NOT FOUND`);
if (fails.length) {
  console.log("NOT FLIPPED:\n  " + fails.join("\n  "));
  process.exit(1);
}
console.log(`OK: all ${ids.size} flipped (a distractor is now strictly longest).`);
