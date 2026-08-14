import { loadAtlasData } from "../src/lib/content/atlas-server.ts";
const a = loadAtlasData();
console.log("located places  :", a.places.length);
console.log("unlocated places:", a.unlocated.length);
console.log("total named     :", a.places.length + a.unlocated.length);
console.log("journeys        :", a.journeys.length);
