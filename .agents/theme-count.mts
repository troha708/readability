import { loadDictionaryIndex } from "../src/lib/content/dictionary-server.ts";
const all = loadDictionaryIndex();
const themes = all.filter((e) => e.cat === "theme");
console.log("dictionary entries :", all.length);
console.log("cat === 'theme'    :", themes.length);
console.log("distinct cats      :", [...new Set(all.map((e) => e.cat))].join(", "));
