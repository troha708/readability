# -*- coding: utf-8 -*-
import urllib.request, urllib.parse, json, re, sys, os

def counts(book, nch):
    out = {}
    for c in range(1, nch + 1):
        url = f"http://localhost:3000/api/chapter?book={urllib.parse.quote(book)}&chapter={c}&version=WEB"
        try:
            d = json.load(urllib.request.urlopen(url, timeout=30))
            t = "".join(d.get("chunks", []))
            nums = [int(x) for x in re.findall(r'data-number="(\d+)"', t)]
            out[c] = max(nums) if nums else 0
        except Exception as e:
            out[c] = 0
            print(f"ERR {book} {c}: {e}", file=sys.stderr)
    return out

books = {
    "Isaiah": 66, "Jeremiah": 52, "Lamentations": 5, "Ezekiel": 48, "Daniel": 12,
    "Hosea": 14, "Joel": 3, "Amos": 9, "Obadiah": 1, "Jonah": 4, "Micah": 7,
    "Nahum": 3, "Habakkuk": 3, "Zephaniah": 3, "Haggai": 2, "Zechariah": 14, "Malachi": 4,
}
res = {b: counts(b, n) for b, n in books.items()}
path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "counts.json")
with open(path, "w") as f:
    json.dump(res, f)
zeros = {b: [k for k, v in res[b].items() if v == 0] for b in res}
zeros = {b: z for b, z in zeros.items() if z}
print("wrote", path)
print("zeros:", zeros if zeros else "none")
