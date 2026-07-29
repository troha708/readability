"""Post-edit verification for one book: quote re-check, banned grep, JSON validity,
citation/gloss diff vs baseline, word tier distribution.
Usage: python verify_book.py "<slug>" """
import json, os, re, sys
import bsb_lib as B
from precompute import BOOKS, BANNED, CITE, GLOSS, ch_of, EXPL

SCRATCH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "out")

def main(slug):
    bsbname = BOOKS[slug]
    bj = B.load_book(bsbname)
    corpus = B.full_corpus()
    baseline = json.load(open(os.path.join(SCRATCH, "baseline.json"), encoding="utf-8"))[slug]
    d = os.path.join(EXPL, slug)
    problems = {"json": [], "quotes": [], "banned": []}
    dropped_cites, dropped_gloss = [], []
    tiers = {"tight(<=85)": 0, "medium(86-155)": 0, "rich(156-235)": 0, "over(>235)": 0}
    tot_before = tot_after = 0
    for fname in sorted(os.listdir(d)):
        ch = ch_of(fname)
        if ch is None: continue
        path = os.path.join(d, fname)
        try:
            j = json.load(open(path, encoding="utf-8"))
        except Exception as e:
            problems["json"].append(f"{fname}: {e}")
            continue
        raw = open(path, encoding="utf-8").read()
        if "�" in raw:
            problems["json"].append(f"{fname}: contains U+FFFD replacement char")
        chap_flat = B.flat_chapter_text(B.chapter_html(bj, ch) or "")
        for p in j.get("passages", []):
            text = p["explanation"]
            key = f"{ch}:{p['verses']}"
            w = len(text.split())
            tot_after += w
            if w <= 85: tiers["tight(<=85)"] += 1
            elif w <= 155: tiers["medium(86-155)"] += 1
            elif w <= 235: tiers["rich(156-235)"] += 1
            else: tiers["over(>235)"] += 1
            for q in B.extract_quotes(text):
                for seg in B.check_quote(q, chap_flat, corpus):
                    problems["quotes"].append(f"{key} | {seg[:100]}")
            for m in BANNED.finditer(text):
                problems["banned"].append(f"{key} | {m.group(0)}")
            base = baseline.get(key)
            if base:
                tot_before += base["words"]
                now_c = set(CITE.findall(text))
                now_bookch = {re.match(r"(.+?)\s+(\d+)", c).groups() for c in now_c}
                for c in base["citations"]:
                    bc = re.match(r"(.+?)\s+(\d+)", c).groups()
                    if c not in now_c and bc not in now_bookch:
                        dropped_cites.append(f"{key} | {c}")
                now_g = " ".join(GLOSS.findall(text)).lower()
                for g in base["glosses"]:
                    # crude survival check: first foreign/key token of the gloss sentence
                    toks = [t for t in re.findall(r"[A-Za-zōēīūαβγ']+", g) if len(t) > 3][:3]
                    if toks and not any(t.lower() in text.lower() for t in toks):
                        dropped_gloss.append(f"{key} | {g[:90]}")
            else:
                problems["json"].append(f"{key}: passage key not in baseline (verses changed?)")
    print(f"== {slug}: words {tot_before} -> {tot_after} ({(tot_after-tot_before)*100//max(tot_before,1):+d}%)")
    print("tiers:", tiers)
    for k in ("json", "quotes", "banned"):
        print(f"{k}: {len(problems[k])}")
        for line in problems[k][:40]:
            print("  ", line)
    print(f"dropped citations: {len(dropped_cites)}")
    for line in dropped_cites: print("  ", line)
    print(f"possibly-dropped glosses: {len(dropped_gloss)}")
    for line in dropped_gloss: print("  ", line)

if __name__ == "__main__":
    main(sys.argv[1])
