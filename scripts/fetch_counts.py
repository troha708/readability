import urllib.request, json, re, sys
def counts(book, nch):
    out = {}
    for c in range(1, nch+1):
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
import urllib.parse
books = {"Isaiah":66}
res = {b: counts(b, n) for b, n in books.items()}
print(json.dumps(res))
