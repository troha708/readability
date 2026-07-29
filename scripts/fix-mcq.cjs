// Apply a hand-vetted map of new option arrays for multiple-choice questions
// whose correct answer was a length giveaway. The answer string is unchanged;
// it must still appear verbatim in the new options. Edit MAP, then run.
const fs = require("fs");
const path = require("path");

const MAP = require("./mcq-map.json");

const QDIR = "data/questions";
let applied = 0;
const ids = new Set(Object.keys(MAP));
const errors = [];
for (const book of fs.readdirSync(QDIR)) {
  const dir = path.join(QDIR, book);
  if (!fs.statSync(dir).isDirectory()) continue;
  for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith(".json")) continue;
    const fp = path.join(dir, file);
    const data = JSON.parse(fs.readFileSync(fp, "utf8"));
    let dirty = false;
    for (const q of data.questions || []) {
      const entry = MAP[q.id];
      if (!entry) continue;
      // Entry is either an options array (answer unchanged) or
      // { answer, options } to also rewrite the answer text.
      const opts = Array.isArray(entry) ? entry : entry.options;
      const newAnswer = Array.isArray(entry) ? null : entry.answer;
      if (newAnswer && "answer" in q) q.answer = newAnswer;
      else if (newAnswer && "correct" in q) q.correct = newAnswer;
      const ans = q.answer ?? q.correct;
      if (!opts.includes(ans)) {
        errors.push(`${q.id}: answer "${ans}" not in new options`);
        ids.delete(q.id);
        continue;
      }
      if (new Set(opts.map((o) => o.toLowerCase())).size !== opts.length) {
        errors.push(`${q.id}: duplicate options`);
        ids.delete(q.id);
        continue;
      }
      q.options = opts;
      ids.delete(q.id);
      applied++;
      dirty = true;
    }
    if (dirty) fs.writeFileSync(fp, JSON.stringify(data, null, 2) + "\n");
  }
}
console.log(`Applied ${applied} option rewrites.`);
if (ids.size) console.log(`NOT FOUND: ${[...ids].join(", ")}`);
if (errors.length) console.log("ERRORS:\n  " + errors.join("\n  "));
