"""Corpus-wide redundancy detectors for explanation notes.
A: note sentence duplicates the book overview (shared distinctive content)
B: label-then-proof ("signature word" pattern)
C: throat-clearing openers (first sentence is book-level / other-chapter preamble)
Output: scratchpad/redundancy-report.txt (grouped by detector, then book)
"""
import json, os, re, sys
from collections import Counter

import bsb_lib as _B
EXPL = os.path.join(_B.ROOT, "data", "explanations")
SUMM = os.path.join(_B.ROOT, "data", "summaries")
SCRATCH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "out")
os.makedirs(SCRATCH, exist_ok=True)

STOP = set("""the a an and or but of in on at to for with by from as is are was were be been
being he she it they them his her its their this that these those who whom which what when
where why how not no nor so if then than too very can will just also over more most other
some such only own same s t don now into out up down about after before again once all any
both each few between through during under until while do does did have has had having god
jesus christ lord one two three says said say verse chapter book reader readers note notes
paul john peter israel people man men new old""".split())

WORD = re.compile(r"[A-Za-zāēīōūĀĒĪŌŪ']+")

def sentences(text):
    # split on sentence enders followed by space+capital; keep it simple
    parts = re.split(r"(?<=[.!?])\s+(?=[A-Z'\"‘“])", text)
    return [p.strip() for p in parts if len(p.strip()) > 20]

def rare_tokens(s):
    return {w.lower() for w in WORD.findall(s) if len(w) > 3 and w.lower() not in STOP}

def ngrams4(s):
    toks = [w.lower() for w in WORD.findall(s)]
    return {" ".join(toks[i:i+4]) for i in range(len(toks) - 3)}

LABEL = re.compile(r"\b(signature|hallmark|characteristic(?:ally)?|trademark|defining (?:word|image|theme|feature)|central theme|key ?word|keynote|recurring (?:word|theme|refrain)|favorite (?:word|term))\b", re.I)
PROOF = re.compile(r"\b(appears?|occurs?|uses?|used|repeats?|times|twice|\d+)\b", re.I)

BOOKLEVEL = re.compile(
    r"\b(appears?|occurs?|uses?|used|repeated)\b[^.]*\b(times|throughout)\b"
    r"|\bthroughout (?:the|this) (?:book|letter|gospel|psalm)"
    r"|\bthe (?:book|letter|gospel) (?:as a whole|opens|closes|begins|ends)\b"
    r"|\b(?:over|more than|nearly|some) (?:twenty|thirty|forty|fifty|sixty|a hundred|\d+) times\b",
    re.I)

OPENER_BOOKLEVEL = re.compile(r"\b(throughout (?:the|this) (?:book|letter|gospel)|the (?:letter|book|gospel) (?:as a whole|opens|now|has been)|from \d+:\d+|in chapter \d+|the previous chapter|carries? forward|continues? (?:the|a) (?:theme|argument|reflection)|extends? into|picks? up (?:the|a) theme)\b", re.I)

def ch_of(fname):
    m = re.search(r"-(\d+)-explanations\.json$", fname)
    return int(m.group(1)) if m else None

def main():
    out = {"A": [], "B": [], "C": []}
    books = sorted(os.listdir(EXPL))
    for book in books:
        d = os.path.join(EXPL, book)
        if not os.path.isdir(d):
            continue
        # load overview
        spath = os.path.join(SUMM, book, f"{book}-book-summary.json")
        summ_sents = []
        if os.path.exists(spath):
            try:
                sj = json.load(open(spath, encoding="utf-8"))
                summ_sents = [(s, rare_tokens(s), ngrams4(s)) for s in sentences(sj.get("summary", ""))]
            except Exception:
                pass
        for fname in sorted(os.listdir(d), key=lambda f: (ch_of(f) or 0)):
            ch = ch_of(fname)
            if ch is None:
                continue
            try:
                j = json.load(open(os.path.join(d, fname), encoding="utf-8"))
            except Exception:
                continue
            for p in j.get("passages", []):
                text = p["explanation"]
                key = f"{book} {ch}:{p['verses']}"
                sents = sentences(text)
                if not sents:
                    continue
                # A: overview duplication — shared 4-gram OR >=5 shared rare tokens
                for s in sents:
                    if not BOOKLEVEL.search(s):
                        continue
                    rt = rare_tokens(s)
                    ng = ngrams4(s)
                    if len(rt) < 3:
                        continue
                    for ss, srt, sng in summ_sents:
                        shared = rt & srt
                        shared_ng = {g for g in (ng & sng) if rare_tokens(g)}
                        if shared_ng or len(shared) >= 4:
                            tag = f"4gram: {sorted(shared_ng)[:2]}" if shared_ng else f"tokens: {sorted(shared)[:8]}"
                            out["A"].append(f"{key}\n  NOTE: {s[:180]}\n  OVW:  {ss[:180]}\n  {tag}")
                            break
                # B: label-then-proof
                for i, s in enumerate(sents):
                    if LABEL.search(s):
                        nxt = sents[i+1] if i+1 < len(sents) else ""
                        if PROOF.search(s) or PROOF.search(nxt):
                            out["B"].append(f"{key}\n  {s[:170]}\n  NEXT: {nxt[:150]}")
                # C: throat-clearing opener
                if OPENER_BOOKLEVEL.search(sents[0]):
                    out["C"].append(f"{key}\n  OPENER: {sents[0][:200]}")
    with open(os.path.join(SCRATCH, "redundancy-report.txt"), "w", encoding="utf-8") as f:
        for k, title in [("A", "OVERVIEW DUPLICATION"), ("B", "LABEL-THEN-PROOF"), ("C", "THROAT-CLEARING OPENERS")]:
            f.write(f"{'='*20} {title} ({len(out[k])})\n\n")
            f.write("\n\n".join(out[k]))
            f.write("\n\n")
    print({k: len(v) for k, v in out.items()})

if __name__ == "__main__":
    main()
