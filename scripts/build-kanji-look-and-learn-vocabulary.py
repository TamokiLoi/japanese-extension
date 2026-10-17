#!/usr/bin/env python3
"""Build the compact app vocabulary supplement from the private KLL catalog."""

from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CATALOG = ROOT / "src/data/kanji-look-and-learn-catalog.json"
KANJI = ROOT / "src/data/kanji-all.json"
OUTPUT = ROOT / "src/data/vocab-kanji-look-and-learn.json"

JAPANESE_WORD = re.compile(r"^[\u3040-\u30ff\u3400-\u9fffー々〆ヶ・]+$")
JAPANESE_READING = re.compile(r"^[\u3040-\u30ffー・々]+$")
BOOK_SOURCE = {"b1": "kll-n5n4", "b2": "kll-n2n1", "b3": "kll-n3n2"}


def clean(value: str | None) -> str:
    return re.sub(r"\s+", " ", (value or "").replace("Ƣ", "Ư").replace("ƣ", "ư")).strip()


def main() -> None:
    catalog = json.loads(CATALOG.read_text(encoding="utf-8"))
    kanji_data = json.loads(KANJI.read_text(encoding="utf-8"))
    level_by_char = {item["character"]: item["level"] for item in kanji_data["kanji"]}
    words: list[dict] = []
    for entry in catalog["entries"]:
        book = entry["book"]
        if book not in BOOK_SOURCE:
            continue
        level = level_by_char.get(entry["kanji"])
        if level is None:
            continue
        for row in entry.get("vocabulary", []):
            if row.get("needsReview"):
                continue
            word = clean(row.get("word"))
            reading = clean(row.get("reading"))
            han_viet = clean(row.get("hanViet"))
            meaning = clean(row.get("meaning"))
            # The scanned source's southern-France example is 南仏; the embedded
            # PDF text layer misdecodes the first glyph as a simplified form.
            if word in {"单仏", "単仏"}:
                word = "南仏"
            if not (JAPANESE_WORD.fullmatch(word) and JAPANESE_READING.fullmatch(reading)
                    and han_viet and meaning and len(word) <= 14 and len(reading) <= 20
                    and len(meaning) <= 260):
                continue
            words.append({
                "id": f"kll-{book}-{entry['entry']}-{row['index']}",
                "word": word,
                "reading": reading,
                "level": level,
                "source": BOOK_SOURCE[book],
                "hanViet": [han_viet],
                "meaningVi": meaning,
                "entryKanji": entry["kanji"],
                "entry": entry["entry"],
                "pdfPage": entry["pdfPage"],
                "printedPage": entry.get("printedPage"),
            })
    result = {
        "meta": {
            "generatedFrom": "kanji-look-and-learn-catalog.json",
            "notes": [
                "Rows marked needsReview are omitted.",
                "JLPT level follows the associated Kanji card.",
                "Existing app vocabulary keeps its id and progress when merged.",
            ],
            "counts": {source: sum(word["source"] == source for word in words)
                       for source in BOOK_SOURCE.values()},
            "wordCount": len(words),
        },
        "words": words,
    }
    OUTPUT.write_text(json.dumps(result, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"Wrote {OUTPUT.relative_to(ROOT)} ({len(words)} source rows)")
    print(json.dumps(result["meta"]["counts"], ensure_ascii=False))


if __name__ == "__main__":
    main()
