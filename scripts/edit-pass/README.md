# Edit-pass tooling

Scripted checks used by the explanation edit passes (built during the NT epistles pass, 2026-07-08).
All output goes to `out/` (gitignored).

- `bsb_lib.py` — BSB text access + quote extraction/matching. The single-quote extractor is
  STATEFUL (an apostrophe after "s" closes a quote only if one is open — regex approaches
  misfire on `'super-apostles'` vs `believers'`). Quotes are checked against the target chapter
  first, then the whole BSB corpus (so cross-book quotes don't false-positive).
- `precompute.py` — run BEFORE a pass: dumps per-chapter BSB plaintext (`out/bsb/`), builds
  per-book quote-mismatch hit lists, banned-word hits, and citation/gloss/word-count baselines
  (`out/baseline.json`). Edit the `BOOKS` dict to the target books first.
- `verify_book.py <slug>` — run AFTER editing a book: re-checks quotes, banned words, JSON,
  and diffs citations/glosses against the baseline. Most residual "quote mismatches" are
  deliberate (named-KJV renderings, literal-Greek glosses, variant discussions) — judge each;
  the real defects are tense/person-adapted quotes.
- `redundancy_sweep.py` — corpus-wide detectors: (A) book-level claims in passage notes that
  duplicate the book overview, (B) label-then-proof sentence pairs ("X is the signature word.
  It appears forty times."), (C) throat-clearing openers. Candidates only — every hit needs a
  human delete-test judgment; notes on a book's first/last passage legitimately overlap the
  overview (narrative-book overviews recap endings by design).

Windows console is cp1252 — run with `PYTHONIOENCODING=utf-8 python scripts/edit-pass/<script>`.
