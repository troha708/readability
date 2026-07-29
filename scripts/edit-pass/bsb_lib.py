import json, os, re, html as html_mod

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
BSB_DIR = os.path.join(ROOT, "data", "BSB")

TAG = re.compile(r"<[^>]+>")
VNUM = re.compile(r'<span data-number="(\d+)"[^>]*>\s*\d*\s*</span>')
HEADING = re.compile(r'<p class="(s1|s2|r|d)">(.*?)</p>')

def load_book(name):
    with open(os.path.join(BSB_DIR, name + ".json"), encoding="utf-8") as f:
        return json.load(f)

def chapter_html(book_json, ch):
    for c in book_json["chapters"]:
        if c["chapter"] == ch:
            return c["html"]
    return None

def html_to_marked_text(h):
    """Readable text with [v] verse markers and headings on own lines."""
    h = h.replace("</p>", "\n")
    h = re.sub(r'<p class="[srd]\d?">', "\n## ", h)
    h = re.sub(r'<p class="r">', "\n## ", h)
    h = VNUM.sub(lambda m: f"[{m.group(1)}] ", h)
    h = re.sub(r'<span data-number="(\d+)"[^>]*>[^<]*</span>', lambda m: f"[{m.group(1)}] ", h)
    h = TAG.sub(" ", h)
    h = html_mod.unescape(h)
    h = re.sub(r"[ \t]+", " ", h)
    h = re.sub(r"\n{2,}", "\n", h)
    return h.strip()

def normalize(s):
    """Normalization for quote matching: lowercase, unify quotes/dashes, drop verse nums & punct, squeeze spaces."""
    s = html_mod.unescape(s)
    s = s.replace("‘", "'").replace("’", "'").replace("“", '"').replace("”", '"')
    s = s.replace("—", " ").replace("–", " ").replace("…", " ")
    s = s.lower()
    s = re.sub(r"[^a-z' ]+", " ", s)
    s = re.sub(r"(?<![a-z])'|'(?![a-z])", " ", s)  # keep only in-word apostrophes
    s = re.sub(r"\s+", " ", s)
    return s.strip()

def flat_chapter_text(h):
    """Chapter text flattened for matching: headings removed, verse numbers removed."""
    h = HEADING.sub(" ", h)
    h = VNUM.sub(" ", h)
    h = re.sub(r'<span data-number="(\d+)"[^>]*>[^<]*</span>', " ", h)
    h = TAG.sub(" ", h)
    return normalize(h)

_corpus_cache = None
def full_corpus():
    """Normalized text of the whole BSB, for cross-book quote checks."""
    global _corpus_cache
    if _corpus_cache is None:
        parts = []
        for f in os.listdir(BSB_DIR):
            if not f.endswith(".json"):
                continue
            j = json.load(open(os.path.join(BSB_DIR, f), encoding="utf-8"))
            for c in j.get("chapters", []):
                if isinstance(c, dict) and "html" in c:
                    parts.append(flat_chapter_text(c["html"]))
        _corpus_cache = "\n".join(parts)
    return _corpus_cache

APOS_PROTECT = re.compile(r"(?<=[A-Za-z0-9])'(?=[A-Za-z])")   # in-word apostrophes
TRAIL_POSS = re.compile(r"(?<=[sS])'(?=[\s,.;:)\-])")           # plural possessive: believers'

def extract_quotes(text):
    """Stateful extraction: handles double/curly quotes and single-quote scripture
    style, disambiguating possessives (believers') from closing quotes (standards')
    by whether a quote is open."""
    spans = []
    t = text.replace("“", '"').replace("”", '"')
    for m in re.finditer(r'"([^"]+)"', t):
        spans.append(m.group(1))
    t = re.sub(r'"[^"]*"', " ", t)
    t = t.replace("’", "'").replace("‘", "'")
    start = None
    i = 0
    n = len(t)
    while i < n:
        if t[i] == "'":
            prev = t[i-1] if i > 0 else " "
            nxt = t[i+1] if i+1 < n else " "
            if prev.isalnum() and nxt.isalpha():
                i += 1; continue          # in-word apostrophe
            if start is None:
                if (not prev.isalnum()) and (nxt.isalnum()):
                    start = i + 1          # opening quote
                # else: stray/possessive outside a quote — ignore
            else:
                spans.append(t[start:i])   # closing quote
                start = None
        i += 1
    return spans

def _old_extract_quotes(text):
    """Return quoted spans from an explanation. Handles double quotes, curly quotes,
    and straight-single-quote scripture quoting (Psalms-pass style)."""
    spans = []
    t = text.replace("“", '"').replace("”", '"')
    for m in re.finditer(r'"([^"]+)"', t):
        spans.append(m.group(1))
    t2 = t.replace("’", "'").replace("‘", "'")
    t2 = re.sub(r'"[^"]*"', " ", t2)  # remove double-quoted spans already captured
    t2 = APOS_PROTECT.sub("", t2)
    t2 = TRAIL_POSS.sub("", t2)
    for m in re.finditer(r"'([^']+)'", t2):
        spans.append(m.group(1).replace("", "'"))
    return spans

def check_quote(q, chap_flat, corpus):
    """Return list of unmatched segments (>=4 words) of quote q."""
    bad = []
    for seg in re.split(r"\.\.\.|…", q):
        n = normalize(seg)
        if len(n.split()) < 4:
            continue
        if n in chap_flat:
            continue
        if n in corpus:
            continue
        bad.append(seg.strip())
    return bad
