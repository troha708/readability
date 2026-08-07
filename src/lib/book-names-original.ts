/**
 * Each book's name in the language it was written in, for the library page's
 * canon table.
 *
 * Hebrew for the Old Testament, Greek for the New — not Greek throughout.
 * The English OT names mostly came to us *through* the Greek already
 * ("Genesis" is Γένεσις carried over via the Vulgate), so pairing them with
 * the Greek teaches a reader nothing they can't already see. The Hebrew name
 * is a different thing: Jewish tradition names the Torah books by their
 * opening word rather than their subject, so Genesis is בְּרֵאשִׁית — "In the
 * beginning".
 *
 * NT titles are the traditional manuscript forms (Κατὰ Μᾶρκον, Πρὸς
 * Ῥωμαίους), not modern descriptive ones. Numbered books use the Greek
 * numeral letters with the keraia (Αʹ, Βʹ, Γʹ) as the manuscripts do; the
 * Hebrew pair use א / ב.
 *
 * Transliterations are the point of the third column: most readers can't
 * sound out שְׁמוֹת, and "Shemot" is what makes it speakable rather than
 * decorative. They follow a plain reading-aloud scheme, not a strict
 * academic one — ch for ח, kh for כ, tz for צ, q for ק.
 */
export type OriginalName = {
  /** The name in Hebrew (OT) or Greek (NT). */
  original: string;
  /** A plain, speakable transliteration. */
  translit: string;
  /** Which script `original` is in — drives the font and text direction. */
  script: "hebrew" | "greek";
};

const ORIGINAL_NAMES: Record<string, OriginalName> = {
  // ── Law ──
  Genesis: { original: "בְּרֵאשִׁית", translit: "Bereshit", script: "hebrew" },
  Exodus: { original: "שְׁמוֹת", translit: "Shemot", script: "hebrew" },
  Leviticus: { original: "וַיִּקְרָא", translit: "Vayikra", script: "hebrew" },
  Numbers: { original: "בְּמִדְבַּר", translit: "Bemidbar", script: "hebrew" },
  Deuteronomy: { original: "דְּבָרִים", translit: "Devarim", script: "hebrew" },

  // ── History (OT) ──
  Joshua: { original: "יְהוֹשֻׁעַ", translit: "Yehoshua", script: "hebrew" },
  Judges: { original: "שׁוֹפְטִים", translit: "Shofetim", script: "hebrew" },
  Ruth: { original: "רוּת", translit: "Rut", script: "hebrew" },
  "1 Samuel": { original: "שְׁמוּאֵל א", translit: "Shemuel Alef", script: "hebrew" },
  "2 Samuel": { original: "שְׁמוּאֵל ב", translit: "Shemuel Bet", script: "hebrew" },
  "1 Kings": { original: "מְלָכִים א", translit: "Melakhim Alef", script: "hebrew" },
  "2 Kings": { original: "מְלָכִים ב", translit: "Melakhim Bet", script: "hebrew" },
  "1 Chronicles": {
    original: "דִּבְרֵי הַיָּמִים א",
    translit: "Divrei haYamim Alef",
    script: "hebrew",
  },
  "2 Chronicles": {
    original: "דִּבְרֵי הַיָּמִים ב",
    translit: "Divrei haYamim Bet",
    script: "hebrew",
  },
  Ezra: { original: "עֶזְרָא", translit: "Ezra", script: "hebrew" },
  Nehemiah: { original: "נְחֶמְיָה", translit: "Nechemyah", script: "hebrew" },
  Esther: { original: "אֶסְתֵּר", translit: "Ester", script: "hebrew" },

  // ── Wisdom & Poetry ──
  Job: { original: "אִיּוֹב", translit: "Iyyov", script: "hebrew" },
  Psalms: { original: "תְּהִלִּים", translit: "Tehillim", script: "hebrew" },
  Proverbs: { original: "מִשְׁלֵי", translit: "Mishlei", script: "hebrew" },
  Ecclesiastes: { original: "קֹהֶלֶת", translit: "Qohelet", script: "hebrew" },
  "Song of Solomon": {
    original: "שִׁיר הַשִּׁירִים",
    translit: "Shir haShirim",
    script: "hebrew",
  },

  // ── Major Prophets ──
  Isaiah: { original: "יְשַׁעְיָהוּ", translit: "Yeshayahu", script: "hebrew" },
  Jeremiah: { original: "יִרְמְיָהוּ", translit: "Yirmeyahu", script: "hebrew" },
  Lamentations: { original: "אֵיכָה", translit: "Eikhah", script: "hebrew" },
  Ezekiel: { original: "יְחֶזְקֵאל", translit: "Yechezqel", script: "hebrew" },
  Daniel: { original: "דָּנִיֵּאל", translit: "Daniyyel", script: "hebrew" },

  // ── Minor Prophets ──
  Hosea: { original: "הוֹשֵׁעַ", translit: "Hoshea", script: "hebrew" },
  Joel: { original: "יוֹאֵל", translit: "Yoel", script: "hebrew" },
  Amos: { original: "עָמוֹס", translit: "Amos", script: "hebrew" },
  Obadiah: { original: "עֹבַדְיָה", translit: "Ovadyah", script: "hebrew" },
  Jonah: { original: "יוֹנָה", translit: "Yonah", script: "hebrew" },
  Micah: { original: "מִיכָה", translit: "Mikhah", script: "hebrew" },
  Nahum: { original: "נַחוּם", translit: "Nachum", script: "hebrew" },
  Habakkuk: { original: "חֲבַקּוּק", translit: "Chavaqquq", script: "hebrew" },
  Zephaniah: { original: "צְפַנְיָה", translit: "Tzefanyah", script: "hebrew" },
  Haggai: { original: "חַגַּי", translit: "Chaggai", script: "hebrew" },
  Zechariah: { original: "זְכַרְיָה", translit: "Zekharyah", script: "hebrew" },
  Malachi: { original: "מַלְאָכִי", translit: "Malakhi", script: "hebrew" },

  // ── Gospels ──
  Matthew: { original: "Κατὰ Μαθθαῖον", translit: "Kata Maththaion", script: "greek" },
  Mark: { original: "Κατὰ Μᾶρκον", translit: "Kata Markon", script: "greek" },
  Luke: { original: "Κατὰ Λουκᾶν", translit: "Kata Loukan", script: "greek" },
  John: { original: "Κατὰ Ἰωάννην", translit: "Kata Ioannen", script: "greek" },

  // ── History (NT) ──
  Acts: { original: "Πράξεις Ἀποστόλων", translit: "Praxeis Apostolon", script: "greek" },

  // ── Paul's Letters ──
  Romans: { original: "Πρὸς Ῥωμαίους", translit: "Pros Rhomaious", script: "greek" },
  "1 Corinthians": {
    original: "Πρὸς Κορινθίους Αʹ",
    translit: "Pros Korinthious A",
    script: "greek",
  },
  "2 Corinthians": {
    original: "Πρὸς Κορινθίους Βʹ",
    translit: "Pros Korinthious B",
    script: "greek",
  },
  Galatians: { original: "Πρὸς Γαλάτας", translit: "Pros Galatas", script: "greek" },
  Ephesians: { original: "Πρὸς Ἐφεσίους", translit: "Pros Ephesious", script: "greek" },
  Philippians: {
    original: "Πρὸς Φιλιππησίους",
    translit: "Pros Philippesious",
    script: "greek",
  },
  Colossians: { original: "Πρὸς Κολοσσαεῖς", translit: "Pros Kolossaeis", script: "greek" },
  "1 Thessalonians": {
    original: "Πρὸς Θεσσαλονικεῖς Αʹ",
    translit: "Pros Thessalonikeis A",
    script: "greek",
  },
  "2 Thessalonians": {
    original: "Πρὸς Θεσσαλονικεῖς Βʹ",
    translit: "Pros Thessalonikeis B",
    script: "greek",
  },
  "1 Timothy": { original: "Πρὸς Τιμόθεον Αʹ", translit: "Pros Timotheon A", script: "greek" },
  "2 Timothy": { original: "Πρὸς Τιμόθεον Βʹ", translit: "Pros Timotheon B", script: "greek" },
  Titus: { original: "Πρὸς Τίτον", translit: "Pros Titon", script: "greek" },
  Philemon: { original: "Πρὸς Φιλήμονα", translit: "Pros Philemona", script: "greek" },

  // ── General Letters ──
  Hebrews: { original: "Πρὸς Ἑβραίους", translit: "Pros Hebraious", script: "greek" },
  James: { original: "Ἰακώβου", translit: "Iakobou", script: "greek" },
  "1 Peter": { original: "Πέτρου Αʹ", translit: "Petrou A", script: "greek" },
  "2 Peter": { original: "Πέτρου Βʹ", translit: "Petrou B", script: "greek" },
  "1 John": { original: "Ἰωάννου Αʹ", translit: "Ioannou A", script: "greek" },
  "2 John": { original: "Ἰωάννου Βʹ", translit: "Ioannou B", script: "greek" },
  "3 John": { original: "Ἰωάννου Γʹ", translit: "Ioannou G", script: "greek" },
  Jude: { original: "Ἰούδα", translit: "Iouda", script: "greek" },

  // ── Prophecy ──
  Revelation: {
    original: "Ἀποκάλυψις Ἰωάννου",
    translit: "Apokalypsis Ioannou",
    script: "greek",
  },
};

const BY_LOWER = new Map<string, OriginalName>(
  Object.entries(ORIGINAL_NAMES).map(([name, v]) => [name.toLowerCase(), v]),
);

/**
 * The original-language name for a book, or null if unknown. Case-insensitive
 * to match `bookGenre` — the data files use "Song of Solomon" while some
 * canon lists title-case the "of".
 */
export function originalName(book: string): OriginalName | null {
  return BY_LOWER.get(book.toLowerCase()) ?? null;
}

/**
 * Original-language names for the canon divisions, given only where they're
 * honest. Law maps cleanly onto תּוֹרָה — same five books, same boundary — and
 * the NT groupings below are the traditional Greek terms. The other OT
 * divisions are deliberately absent: "Wisdom & Poetry" and "Major/Minor
 * Prophets" are Christian arrangements, and the Hebrew canon's Nevi'im
 * includes Joshua, Judges, Samuel and Kings, which we file under History.
 * Inventing a Hebrew label for those would be a mapping we made up.
 */
const DIVISION_NAMES: Record<string, OriginalName> = {
  Law: { original: "תּוֹרָה", translit: "Torah", script: "hebrew" },
  Gospels: { original: "Εὐαγγέλια", translit: "Euangelia", script: "greek" },
  "Paul's Letters": {
    original: "Ἐπιστολαὶ Παύλου",
    translit: "Epistolai Paulou",
    script: "greek",
  },
  "General Letters": {
    original: "Καθολικαὶ Ἐπιστολαί",
    translit: "Katholikai Epistolai",
    script: "greek",
  },
};

/** The original-language name for a canon division, or null where none is honest. */
export function divisionOriginalName(genre: string): OriginalName | null {
  return DIVISION_NAMES[genre] ?? null;
}
