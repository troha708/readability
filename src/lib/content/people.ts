/**
 * People hub — shared types for the web API route, the offline (mobile)
 * provider, and the people UI, so every surface reads the same data.
 *
 * Data: data/people/ built by scripts/build-people.mjs from STEPBible TIPNR
 * (CC BY 4.0 — data/people/_attribution.json). The structured graph + verse
 * index are TIPNR's; prose is not stored here — each person links to their
 * Tyndale Bible Dictionary article (`dict`).
 */

/**
 * A relationship target: a name, plus the person id when it links to a record.
 * q:1 marks a link TIPNR flags as uncertain ("(?)") — a traditional
 * identification (e.g. Naamah as Noah's wife) not stated in the biblical text.
 */
export type PersonRel = { id?: string; n: string; q?: 1 };

export type PersonRelations = {
  /** Father. */ f?: PersonRel;
  /** Mother. */ m?: PersonRel;
  /** Siblings. */ sib?: PersonRel[];
  /** Partners (spouse/wife/husband). */ par?: PersonRel[];
  /** Offspring. */ off?: PersonRel[];
};

/** A full person record. */
export type PersonRecord = {
  id: string;
  /** Name. */ n: string;
  /** Unified Strong's number (stable individual id). */ u: string;
  /** Type: "Male" | "Female" | "Group". */ ty: string;
  /** Tribe/nation, when known. */ tr?: string;
  /** One-line TIPNR description. */ d?: string;
  /** Family graph. */ rel?: PersonRelations;
  /** Every reference where this person is named, spelled out. */ refs: string[];
  /** Dictionary article id for the "read full article" link, when one exists. */ dict?: string;
};

/** Which per-letter file a person id lives in ("A"–"Z", else "#"). */
export function personLetterOf(id: string): string {
  const c = (id[0] ?? "").toUpperCase();
  return c >= "A" && c <= "Z" ? c : "#";
}
