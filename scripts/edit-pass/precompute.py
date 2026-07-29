"""Precompute for the NT edit pass: BSB plaintext dumps, quote-mismatch hit lists,
banned-word hits, citation/gloss baselines."""
import json, os, re, sys
import bsb_lib as B

SCRATCH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "out")
os.makedirs(SCRATCH, exist_ok=True)
EXPL = os.path.join(B.ROOT, "data", "explanations")

# slug -> BSB filename stem
BOOKS = {
    "2 corinthians": "2 Corinthians", "galatians": "Galatians", "ephesians": "Ephesians",
    "philippians": "Philippians", "colossians": "Colossians",
    "1 thessalonians": "1 Thessalonians", "2 thessalonians": "2 Thessalonians",
    "1 timothy": "1 Timothy", "2 timothy": "2 Timothy", "titus": "Titus",
    "philemon": "Philemon", "hebrews": "Hebrews", "james": "James",
    "1 peter": "1 Peter", "2 peter": "2 Peter", "1 john": "1 John",
    "2 john": "2 John", "3 john": "3 John", "jude": "Jude", "revelation": "Revelation",
}

BANNED = re.compile(r"most famous|strikingly|striking|remarkabl|devastat|astonish|revolutionary|breathtak|stunning|one of the most|the bible's most|first time in the bible|the bible's first", re.I)

CITE = re.compile(r"\b(?:Genesis|Exodus|Leviticus|Numbers|Deuteronomy|Joshua|Judges|Ruth|1 Samuel|2 Samuel|1 Kings|2 Kings|1 Chronicles|2 Chronicles|Ezra|Nehemiah|Esther|Job|Psalms?|Proverbs|Ecclesiastes|Song of (?:Solomon|Songs)|Isaiah|Jeremiah|Lamentations|Ezekiel|Daniel|Hosea|Joel|Amos|Obadiah|Jonah|Micah|Nahum|Habakkuk|Zephaniah|Haggai|Zechariah|Malachi|Matthew|Mark|Luke|John|Acts|Romans|1 Corinthians|2 Corinthians|Galatians|Ephesians|Philippians|Colossians|1 Thessalonians|2 Thessalonians|1 Timothy|2 Timothy|Titus|Philemon|Hebrews|James|1 Peter|2 Peter|1 John|2 John|3 John|Jude|Revelation)\s+\d+(?::\d+(?:[-–]\d+)?)?")
GLOSS = re.compile(r"[^.]*\b(?:means|literally|translates|translated|— Greek|— Hebrew|the Greek|the Hebrew|the Aramaic|a Greek|a Hebrew|an Aramaic)\b[^.]*\.", re.I)

def ch_of(fname):
    m = re.search(r"-(\d+)-explanations\.json$", fname)
    return int(m.group(1)) if m else None

def main():
    corpus = B.full_corpus()
    os.makedirs(os.path.join(SCRATCH, "bsb"), exist_ok=True)
    report = {}
    baseline = {}
    for slug, bsbname in BOOKS.items():
        bj = B.load_book(bsbname)
        # 1. dump marked plaintext per chapter
        for c in bj["chapters"]:
            out = os.path.join(SCRATCH, "bsb", f"{slug}-{c['chapter']}.txt")
            with open(out, "w", encoding="utf-8") as f:
                f.write(B.html_to_marked_text(c["html"]))
        # 2/3/4. scan explanations
        d = os.path.join(EXPL, slug)
        book_rep = {"quote_mismatches": [], "banned": [], "json_errors": []}
        book_base = {}
        for fname in sorted(os.listdir(d)):
            ch = ch_of(fname)
            if ch is None: continue
            path = os.path.join(d, fname)
            try:
                j = json.load(open(path, encoding="utf-8"))
            except Exception as e:
                book_rep["json_errors"].append(f"{fname}: {e}")
                continue
            chap_flat = B.flat_chapter_text(B.chapter_html(bj, ch) or "")
            for p in j.get("passages", []):
                text = p["explanation"]
                key = f"{ch}:{p['verses']}"
                for q in B.extract_quotes(text):
                    for seg in B.check_quote(q, chap_flat, corpus):
                        book_rep["quote_mismatches"].append({"ref": key, "quote": seg})
                for m in BANNED.finditer(text):
                    book_rep["banned"].append({"ref": key, "hit": m.group(0), "ctx": text[max(0,m.start()-60):m.end()+60]})
                book_base[key] = {
                    "words": len(text.split()),
                    "citations": sorted(set(CITE.findall(text))),
                    "glosses": [g.strip()[:120] for g in GLOSS.findall(text)],
                }
        report[slug] = book_rep
        baseline[slug] = book_base
    with open(os.path.join(SCRATCH, "precompute-report.json"), "w", encoding="utf-8") as f:
        json.dump(report, f, indent=1, ensure_ascii=False)
    with open(os.path.join(SCRATCH, "baseline.json"), "w", encoding="utf-8") as f:
        json.dump(baseline, f, indent=1, ensure_ascii=False)
    for slug, r in report.items():
        print(f"{slug:20s} quotes:{len(r['quote_mismatches']):4d} banned:{len(r['banned']):3d} json_err:{len(r['json_errors'])}")

if __name__ == "__main__":
    main()
