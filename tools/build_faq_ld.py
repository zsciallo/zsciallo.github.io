"""Regenerate the FAQ page's structured data from src/data/faq.json.

The FAQ page renders faq.json, and search engines read the same questions
from an FAQPage JSON-LD block in faq/index.html. Writing the block from the
same file keeps them identical; editing it by hand is how the old copy ended
up advertising prizes the FAQ no longer mentioned.

  python tools/build_faq_ld.py

Replaces the first <script type="application/ld+json"> block in faq/index.html.
Answers have their light markup stripped: **bold** and `code` become plain
text and [text](href) keeps only the text.
"""

import json
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FAQ = os.path.join(ROOT, "src", "data", "faq.json")
PAGE = os.path.join(ROOT, "faq", "index.html")

BLOCK = re.compile(r'(<script type="application/ld\+json">)(.*?)(</script>)', re.S)


def plain(text):
    text = re.sub(r"\*\*([^*]+)\*\*", r"\1", text)
    text = re.sub(r"`([^`]+)`", r"\1", text)
    text = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", text)
    return text.strip()


def main():
    with open(FAQ, encoding="utf-8") as fh:
        faq = json.load(fh)

    entity = [
        {"@type": "Question", "name": item["q"],
         "acceptedAnswer": {"@type": "Answer", "text": plain(item["a"])}}
        for group in faq["groups"] for item in group["items"]
    ]
    doc = {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        "url": "https://chromabit.us/faq/",
        "isPartOf": {"@type": "WebSite", "name": "Chromabit SMP", "url": "https://chromabit.us"},
        "mainEntity": entity,
    }
    body = json.dumps(doc, indent=2, ensure_ascii=False)
    body = "\n" + "\n".join("  " + line for line in body.splitlines()) + "\n  "

    with open(PAGE, encoding="utf-8") as fh:
        html = fh.read()
    if not BLOCK.search(html):
        raise SystemExit("faq/index.html has no JSON-LD block to replace")
    html = BLOCK.sub(lambda m: m.group(1) + body + m.group(3), html, count=1)
    with open(PAGE, "w", encoding="utf-8") as fh:
        fh.write(html)
    print(f"wrote {len(entity)} questions into faq/index.html")


if __name__ == "__main__":
    main()
