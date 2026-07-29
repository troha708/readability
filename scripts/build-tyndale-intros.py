#!/usr/bin/env python3
r"""Build per-book front-door introductions from the Tyndale Open Study Notes.

The reader's start-of-book "Book Overview" now shows the Tyndale House book
introduction (a blind comparison found theirs orients a first-time reader
better than ours). Two files in the Tyndale download hold it:

    BookIntroSummaries.xml  — the Purpose / Author / Date / Setting sidebar
    BookIntros.xml          — the full introductory essay (sections + prose)

Both list all 66 Protestant-canon books in canon order. This script pairs them
by position, cleans the markup (scripture links flattened to their readable
text, entities decoded), and writes a structured intro per book:

    data/tyndale-intros/{Book}.json
        { book,
          fields:   [{label, value}, ...],              # the sidebar
          sections: [{heading|null, paragraphs:[...]}] } # the essay

© Tyndale House Publishers, CC BY-SA 4.0 — this adapted dataset stays BY-SA;
see the emitted _attribution.json. Usage (from repo root):

    python scripts/build-tyndale-intros.py "<path to Tyndale Open Study Notes dir>"
"""
import html
import json
import os
import re
import sys

sys.stdout.reconfigure(encoding="utf-8")

# Canon order — both XML files list books in this order, so we pair by position.
CANON = [
    "Genesis", "Exodus", "Leviticus", "Numbers", "Deuteronomy",
    "Joshua", "Judges", "Ruth", "1 Samuel", "2 Samuel",
    "1 Kings", "2 Kings", "1 Chronicles", "2 Chronicles",
    "Ezra", "Nehemiah", "Esther", "Job", "Psalms", "Proverbs",
    "Ecclesiastes", "Song of Solomon", "Isaiah", "Jeremiah",
    "Lamentations", "Ezekiel", "Daniel", "Hosea", "Joel", "Amos",
    "Obadiah", "Jonah", "Micah", "Nahum", "Habakkuk", "Zephaniah",
    "Haggai", "Zechariah", "Malachi",
    "Matthew", "Mark", "Luke", "John", "Acts",
    "Romans", "1 Corinthians", "2 Corinthians", "Galatians",
    "Ephesians", "Philippians", "Colossians",
    "1 Thessalonians", "2 Thessalonians", "1 Timothy", "2 Timothy",
    "Titus", "Philemon", "Hebrews", "James",
    "1 Peter", "2 Peter", "1 John", "2 John", "3 John",
    "Jude", "Revelation",
]

OUT_DIR = os.path.join(os.getcwd(), "data", "tyndale-intros")


def clean(inner: str) -> str:
    """One paragraph's inner HTML → plain text.

    Scripture/study links keep their (already readable) link text; every other
    tag is dropped; entities and non-breaking spaces are normalized.
    """
    s = re.sub(r"<a\b[^>]*>([\s\S]*?)</a>", r"\1", inner)  # keep link text
    s = re.sub(r"<[^>]+>", "", s)                          # drop remaining tags
    s = html.unescape(s)
    s = s.replace(" ", " ")
    return re.sub(r"\s+", " ", s).strip()


def items(xml: str, typename: str):
    """Yield the inner body of each <item typename="..."> in document order."""
    for m in re.finditer(
        rf'<item\b[^>]*typename="{typename}"[^>]*>([\s\S]*?)</item>', xml
    ):
        yield m.group(1)


def parse_fields(body: str):
    """Sidebar label/value pairs, in order, from a BookIntroSummary body."""
    fields = []
    label = None
    for m in re.finditer(r'<p class="(intro-sidebar-[^"]+)">([\s\S]*?)</p>', body):
        cls, txt = m.group(1), clean(m.group(2))
        if not txt:
            continue
        if cls == "intro-sidebar-h1":
            label = txt
            fields.append({"label": label, "value": ""})
        elif fields and cls.startswith("intro-sidebar-body"):
            sep = " " if fields[-1]["value"] else ""
            fields[-1]["value"] += sep + txt
    return [f for f in fields if f["value"]]


def parse_sections(body: str):
    """Essay → sections; an intro-h1 paragraph opens a new titled section."""
    sections = [{"heading": None, "paragraphs": []}]
    for m in re.finditer(r'<p class="(intro-[^"]+)">([\s\S]*?)</p>', body):
        cls, txt = m.group(1), clean(m.group(2))
        if not txt:
            continue
        if cls == "intro-h1":
            sections.append({"heading": txt, "paragraphs": []})
        elif cls.startswith("intro-list"):
            sections[-1]["paragraphs"].append("• " + txt)
        else:  # intro-overview / intro-body(-fl)(-sp) / intro-extract / intro-poetry
            sections[-1]["paragraphs"].append(txt)
    return [s for s in sections if s["paragraphs"]]


def main():
    if len(sys.argv) < 2:
        raise SystemExit(
            'Usage: python scripts/build-tyndale-intros.py "<Tyndale Open Study Notes dir>"'
        )
    src = sys.argv[1]
    summ = open(os.path.join(src, "BookIntroSummaries.xml"), encoding="utf-8").read()
    intr = open(os.path.join(src, "BookIntros.xml"), encoding="utf-8").read()

    summ_bodies = list(items(summ, "BookIntroSummary"))
    intr_bodies = list(items(intr, "BookIntro"))
    if not (len(summ_bodies) == len(intr_bodies) == len(CANON)):
        raise SystemExit(
            f"Expected {len(CANON)} of each; got {len(summ_bodies)} summaries, "
            f"{len(intr_bodies)} intros"
        )

    os.makedirs(OUT_DIR, exist_ok=True)
    for book, sbody, ibody in zip(CANON, summ_bodies, intr_bodies):
        intro = {
            "book": book,
            "fields": parse_fields(sbody),
            "sections": parse_sections(ibody),
        }
        with open(os.path.join(OUT_DIR, f"{book}.json"), "w", encoding="utf-8") as f:
            json.dump(intro, f, ensure_ascii=False, indent=2)

    with open(os.path.join(OUT_DIR, "_attribution.json"), "w", encoding="utf-8") as f:
        json.dump(
            {
                "source": "Tyndale Open Study Notes, Tyndale House Publishers",
                "license": "CC BY-SA 4.0",
                "url": "https://tyndaleopenresources.com/",
                "attribution": "Adapted from Tyndale Open Study Notes. The original work by Tyndale House Publishers is available for free at http://www.tyndaleopenresources.com.",
                "notes": "Book introductions reformatted from BookIntros.xml + BookIntroSummaries.xml to per-book JSON by scripts/build-tyndale-intros.py; scripture links flattened to their text. This adapted dataset remains CC BY-SA 4.0.",
            },
            f,
            ensure_ascii=False,
            indent=2,
        )

    print(f"Wrote {len(CANON)} book intros to {OUT_DIR}")


if __name__ == "__main__":
    main()
