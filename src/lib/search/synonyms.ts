/**
 * Words a reader may type in place of the one the translation uses.
 *
 * Search matches words, not meanings, which is fine until a half-remembered
 * line turns on a substituted verb: "pick up your cross" finds nothing in a
 * Bible that says "take up his cross". This table is the bridge, and it is
 * deliberately a hand-written one. The alternative — inferring synonyms by
 * aligning the seven translations on disk — learns that "works" and "deeds"
 * trade places, but never that "pick" means "take", because no translation
 * here says pick.
 *
 * What earns a place: words that genuinely stand in for each other *in these
 * texts*, where a reader is likely to reach for the wrong one. What does not:
 * words merely related in subject. "lord" and "god" are not synonyms here even
 * though they often point the same way — collapsing them would fold two
 * different searches into one. Neither are "wisdom" and "knowledge", or
 * "heart" and "soul": scripture distinguishes them, and so should search.
 *
 * A synonym match is worth half a literal one (see SYNONYM_CREDIT), so a verse
 * using the reader's actual word always outranks one that merely means it.
 * That halving is also the safety margin on a borderline entry: the cost of a
 * loose pair is a verse ranked lower down, not a wrong answer at the top.
 */
export const SYNONYM_GROUPS: readonly (readonly string[])[] = [
  // ── Paraphrase: the verb goes first when a line is misremembered ──
  ["pick", "take", "carry", "lift"],
  ["works", "deeds"],
  ["forgive", "pardon"],
  ["save", "deliver", "rescue"],
  ["mercy", "compassion"],
  ["anger", "wrath", "fury", "indignation"],
  ["sin", "trespass", "transgression", "iniquity"],
  ["wicked", "evil"],
  ["righteous", "upright"],
  ["strength", "might", "power"],
  ["glad", "joyful", "rejoice"],
  ["afraid", "fearful"],
  ["speak", "say", "tell"],
  ["ask", "request"],
  ["answer", "reply"],
  ["path", "way", "road"],
  ["house", "home", "dwelling"],
  ["servant", "slave", "bondservant"],
  ["enemy", "enemies", "foe", "foes", "adversary", "adversaries"],
  ["garment", "robe", "clothes", "clothing"],
  ["boat", "ship", "vessel"],

  // ── Archaic wording a reader may carry over from the King James ──
  ["love", "charity"],
  ["blessed", "happy"],
  ["saith", "says", "said", "say"],
  ["alms", "charity"],

  // ── British spellings, which the older public-domain translations use ──
  ["honor", "honour"],
  ["savior", "saviour"],
  ["labor", "labour"],
  ["neighbor", "neighbour"],
  ["favor", "favour"],
  ["marvelous", "marvellous"],

  // ── Irregular plurals, which no suffix rule reaches ──
  ["child", "children"],
  ["man", "men"],
  ["woman", "women"],
  ["foot", "feet"],
  ["tooth", "teeth"],
  ["ox", "oxen"],
];

/** word -> the other words in its group(s). */
export const SYNONYMS: ReadonlyMap<string, readonly string[]> = (() => {
  const map = new Map<string, string[]>();
  for (const group of SYNONYM_GROUPS) {
    for (const word of group) {
      const others = group.filter((w) => w !== word);
      const existing = map.get(word);
      // "charity" sits in two groups (love, alms); keep both sets.
      if (existing) existing.push(...others.filter((w) => !existing.includes(w)));
      else map.set(word, [...others]);
    }
  }
  return map;
})();
