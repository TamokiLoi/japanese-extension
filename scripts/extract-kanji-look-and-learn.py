#!/usr/bin/env python3
"""Extract a private, normalized catalog from the supplied Kanji Look and Learn PDFs.

The script is safe to rerun: it overwrites its generated JSON/Markdown files and
rebuilds the generated illustration folders. Source PDFs remain untouched.
Run from any directory with: python scripts/extract-kanji-look-and-learn.py
"""

from __future__ import annotations

import json
import re
import shutil
from collections import defaultdict
from pathlib import Path
from typing import Any

import pymupdf
from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
SOURCE_DIR = ROOT / "assets" / "FPT-N3" / "kanji-look-and-learn"
CATALOG_PATH = ROOT / "src" / "data" / "kanji-look-and-learn-catalog.json"
ASSET_DIR = ROOT / "assets" / "kanji-look-and-learn"
BOOK_MNEMONICS = ROOT / "src" / "data" / "kanjiMapBookMnemonics.ts"
SOURCE_INDEX = ROOT / "src" / "data" / "kanji-look-and-learn-source-index.json"

SOURCE_FILES = {
    "b1": "1. Kanji Look and learn (Sách giáo khoa) n5-n4.pdf",
    "b2": "2. Kanji Look and learn (Sách giáo khoa) n2-n1.pdf",
    "b3": "3. Kanji Look and learn (Sách giáo khoa) n3-n2.pdf",
}
VIETNAMESE_N5N4 = "1. Kanji Look and learn (Sách giáo khoa) n5-n4-tieng-viet.pdf"
def load_mnemonics() -> dict[str, list[dict[str, Any]]]:
    source = BOOK_MNEMONICS.read_text(encoding="utf-8")
    start = "export const KANJI_MAP_BOOK_MNEMONICS: Record<string, KanjiMapMnemonicTip[]> = "
    raw = source.split(start, 1)[1].rsplit(";", 1)[0]
    return json.loads(raw)


def load_records() -> list[dict[str, Any]]:
    """Combine b2/b3 app tips with b1 source metadata and verified scan tips."""
    app_tips = load_mnemonics()
    records = [{**tip, "kanji": char} for char, tips in app_tips.items()
               for tip in tips if tip["book"] in ("b2", "b3")]
    verified_b1 = {(char, tip["entry"]): tip for char, tips in app_tips.items()
                   for tip in tips if tip["book"] == "b1"}
    index = json.loads(SOURCE_INDEX.read_text(encoding="utf-8"))
    for source in index["entries"]:
        record = dict(source)
        record["verifiedVietnameseTip"] = verified_b1.get((source["kanji"], source["entry"]))
        if record["verifiedVietnameseTip"]:
            record["mnemonicPage"] = record["verifiedVietnameseTip"]["pdfPage"]
            record["mnemonicPrintedPage"] = record["verifiedVietnameseTip"].get("printedPage")
        records.append(record)
    return records


def b1_illustration_crop(page: pymupdf.Page, entry_no: int,
                         page_records: list[dict[str, Any]]) -> pymupdf.Rect:
    """Estimate the original-book illustration panel from entry order only."""
    numeric_entries = sorted(int(item["entry"]) for item in page_records)
    min_entry, max_entry = min(numeric_entries), max(numeric_entries)
    slots = max(1, max_entry - min_entry + 1)
    slot = max(0, min(slots - 1, entry_no - min_entry))
    lesson_grid = any("この課の漢字" in block[4] for block in page.get_text("blocks"))
    body_top = 245 if lesson_grid else 38
    body_bottom = page.rect.height - 38
    row_height = (body_bottom - body_top) / slots
    y0 = body_top + slot * row_height + 4
    y1 = min(body_bottom, body_top + slot * row_height + row_height * 0.62)
    return pymupdf.Rect(145, y0, min(310, page.rect.width - 8), y1)


def split_vocab_rows(page: pymupdf.Page, bounds: pymupdf.Rect) -> list[dict[str, Any]]:
    """Read the book's four-column vocabulary table by word position."""
    words = [word for word in page.get_text("words", clip=bounds)
             if bounds.y0 <= word[1] <= bounds.y1]
    lines: dict[int, list[tuple]] = defaultdict(list)
    for word in words:
        lines[round(word[1] * 2)].append(word)

    rows: list[dict[str, Any]] = []
    current: dict[str, Any] | None = None
    for y in sorted(lines):
        line = sorted(lines[y], key=lambda item: item[0])
        number = next((int(w[4]) for w in line
                       if 132 <= w[0] <= 177 and w[4].isdigit()), None)
        if number is not None:
            current = {"index": number, "word": "", "reading": "", "hanViet": "", "meaning": "", "raw": ""}
            rows.append(current)
        if current is None:
            continue
        raw = " ".join(w[4] for w in line if w[0] >= 178)
        if raw:
            current["raw"] = (current["raw"] + " " + raw).strip()
        positioned = [w for w in line if w[0] >= 178]
        meaning_started = False
        previous_x1 = None
        japanese_tokens = 0
        for x0, _y0, x1, _y1, token, *_rest in positioned:
            has_japanese = any("\u3040" <= char <= "\u30ff" or "\u3400" <= char <= "\u9fff" for char in token)
            letters = [char for char in token if char.isalpha()]
            if has_japanese:
                field = "word" if japanese_tokens == 0 else "reading"
                japanese_tokens += 1
            else:
                if letters and token.upper() == token:
                    field = "hanViet"
                    meaning_started = False
                else:
                    field = "meaning"
                    meaning_started = True
            current[field] = (current[field] + " " + token).strip()
            previous_x1 = x1

    for row in rows:
        row["word"] = re.sub(r"\s+", " ", row["word"])
        row["reading"] = re.sub(r"\s+", " ", row["reading"])
        row["hanViet"] = re.sub(r"\s+", " ", row["hanViet"])
        row["meaning"] = re.sub(r"\s+", " ", row["meaning"])
        row["raw"] = re.sub(r"\s+", " ", row["raw"])
        # Geometry is useful but some fonts wrap a Japanese form between lines.
        row["needsReview"] = not bool(row["word"] and row["reading"] and row["hanViet"] and row["meaning"])
    return rows


def save_crop(page: pymupdf.Page, rect: pymupdf.Rect, destination: Path, scale: float = 2.2) -> None:
    rect = rect & page.rect
    if rect.is_empty or rect.width < 10 or rect.height < 10:
        raise ValueError(f"Invalid image crop: {rect}")
    destination.parent.mkdir(parents=True, exist_ok=True)
    pixmap = page.get_pixmap(matrix=pymupdf.Matrix(scale, scale), clip=rect, alpha=False)
    image = Image.frombytes("RGB", (pixmap.width, pixmap.height), pixmap.samples)
    image.save(destination, format="WEBP", quality=88, method=5)


def normalize_record(record: dict[str, Any], char: str, page: pymupdf.Page,
                     all_entries: list[dict[str, Any]], book: str) -> dict[str, Any]:
    page_no = int(record["pdfPage"])
    entry_no = int(record["entry"])
    page_records = sorted((entry for entry in all_entries
                           if entry["book"] == book and int(entry["pdfPage"]) == page_no),
                          key=lambda entry: int(entry["entry"]))
    verified_tip = record.get("verifiedVietnameseTip") if book == "b1" else None
    result: dict[str, Any] = {
        "id": record["id"],
        "kanji": char,
        "book": book,
        "entry": entry_no,
        "pdfPage": page_no,
        "printedPage": record.get("printedPage"),
        "mnemonic": ({
            "text": verified_tip["text"],
            "kind": verified_tip.get("kind"),
            "transcription": verified_tip.get("transcription"),
            "sourceEdition": verified_tip.get("sourceEdition"),
            "ocrConfidence": verified_tip.get("ocrConfidence"),
            "language": "vi",
            "basis": "visual-check-of-vietnamese-companion-scan" if verified_tip.get("transcription") == "visual-check" else "ocr-of-vietnamese-companion-scan",
            "sourcePdf": f"assets/FPT-N3/kanji-look-and-learn/{VIETNAMESE_N5N4}",
            "pdfPage": int(record["mnemonicPage"]),
            "printedPage": record.get("mnemonicPrintedPage"),
        } if book == "b1" and verified_tip else ({
            "text": record["text"],
            "kind": record.get("kind"),
            "transcription": record.get("transcription"),
            "language": "vi",
            "basis": "existing-curated-record",
        } if book in ("b2", "b3") else None)),
        "illustration": None,
        "vocabulary": [],
        "sourcePageText": None,
    }

    if book == "b1":
        filename = f"{book}-{entry_no:03d}-{ord(char):x}.webp"
        destination = ASSET_DIR / book / filename
        # If an original illustration crop is missing, estimate the panel from
        # entry position only. Never retain or export the original English tip.
        if not destination.exists():
            rect = b1_illustration_crop(page, entry_no, page_records)
            save_crop(page, rect, destination, scale=2.8)
            crop_kind = "estimated-entry-panel"
            needs_visual_review = True
        else:
            crop_kind = "original-book-illustration-crop"
            needs_visual_review = False
        result["illustration"] = {
            "path": destination.relative_to(ROOT).as_posix(),
            "crop": crop_kind,
            "needsVisualReview": needs_visual_review,
        }
        result["vocabularyStatus"] = "unavailable-low-confidence-original-pdf-ocr"
        result["mnemonicScanAlignment"] = {
            "pdf": f"assets/FPT-N3/kanji-look-and-learn/{VIETNAMESE_N5N4}",
            "pdfPage": record.get("mnemonicPage"),
            "printedPage": record.get("mnemonicPrintedPage"),
            "status": ("visually-verified" if verified_tip.get("transcription") == "visual-check" else "ocr-aligned") if verified_tip else "not-yet-aligned-to-kanji",
        }
        result["sourcePageText"] = None
        return result

    # Higher-level PDFs have one embedded illustration per kanji entry. Match
    # it to the numbered heading and bound its vocabulary rows by the next image.
    heading_y: float | None = None
    heading_re = re.compile(rf"(?m)^\s*{entry_no}\.\s*{re.escape(char)}(?:\s|$)")
    for block in page.get_text("blocks"):
        if heading_re.search(block[4]):
            heading_y = block[1]
            break
    image_infos = sorted(page.get_image_info(xrefs=True), key=lambda info: info["bbox"][1])
    selected = None
    if image_infos:
        if heading_y is not None:
            selected = min(image_infos, key=lambda info: abs((info["bbox"][1] + info["bbox"][3]) / 2 - heading_y))
        else:
            index = page_records.index(record) if record in page_records else 0
            selected = image_infos[min(index, len(image_infos) - 1)]

    if selected:
        x0, y0, x1, y1 = selected["bbox"]
        filename = f"{book}-{entry_no:03d}-{ord(char):x}.webp"
        destination = ASSET_DIR / book / filename
        crop = pymupdf.Rect(x0 - 4, y0 - 4, x1 + 4, y1 + 4)
        save_crop(page, crop, destination, scale=2.2)
        result["illustration"] = {
            "path": destination.relative_to(ROOT).as_posix(),
            "crop": "embedded-kanji-illustration",
            "needsVisualReview": heading_y is None,
        }
        ordered = sorted(image_infos, key=lambda info: info["bbox"][1])
        image_index = ordered.index(selected)
        next_y = ordered[image_index + 1]["bbox"][1] if image_index + 1 < len(ordered) else page.rect.height - 40
        vocab_top = min(y1 + 3, next_y)
        vocab_bounds = pymupdf.Rect(0, vocab_top, page.rect.width, max(vocab_top, next_y - 3))
        result["vocabulary"] = split_vocab_rows(page, vocab_bounds)
        result["vocabularySource"] = "selectable-pdf-text-and-column-positions"
    else:
        result["sourcePageText"] = page.get_text("text", sort=True)[:7000]
        result["needsManualReview"] = True
    return result


def main() -> None:
    records = load_records()
    assets_root = ASSET_DIR
    for book in ("b2", "b3"):
        book_assets = assets_root / book
        if book_assets.exists():
            shutil.rmtree(book_assets)
        (assets_root / book).mkdir(parents=True, exist_ok=True)
    (assets_root / "b1").mkdir(parents=True, exist_ok=True)

    catalog: dict[str, Any] = {
        "schemaVersion": 1,
        "generatedBy": "scripts/extract-kanji-look-and-learn.py",
        "privacy": "Private workspace data. Redistribution rights for the supplied books are unverified.",
        "sources": {},
        "entries": [],
    }
    stats: dict[str, dict[str, int]] = {}
    pdfs: dict[str, pymupdf.Document] = {}
    for book, filename in SOURCE_FILES.items():
        source = SOURCE_DIR / filename
        document = pymupdf.open(source)
        pdfs[book] = document
        catalog["sources"][book] = {
            "file": source.relative_to(ROOT).as_posix(),
            "pageCount": len(document),
            "role": "Vietnamese mnemonic, illustration and vocabulary" if book in ("b2", "b3") else "original-book illustration source; N5–N4 mnemonics come from the Vietnamese scan; original compound vocabulary is unavailable because the OCR is too noisy",
        }
        stats[book] = {
            "records": 0,
            "tipsAttached": 0,
            "visualCheckTips": 0,
            "ocrTips": 0,
            "images": 0,
            "vocabRows": 0,
            "vocabReview": 0,
            "manualReview": 0,
        }

    for record in sorted(records, key=lambda item: (item["book"], item["pdfPage"], item["entry"])):
        book = record["book"]
        page_no = int(record["pdfPage"])
        if not (1 <= page_no <= len(pdfs[book])):
            continue
        page = pdfs[book][page_no - 1]
        normalized = normalize_record(record, record["kanji"], page, records, book)
        catalog["entries"].append(normalized)
        stats[book]["records"] += 1
        mnemonic = normalized.get("mnemonic") or {}
        stats[book]["tipsAttached"] += int(bool(mnemonic))
        if book == "b1":
            stats[book]["visualCheckTips"] += int(mnemonic.get("transcription") == "visual-check")
            stats[book]["ocrTips"] += int(mnemonic.get("transcription") == "ocr")
        if normalized.get("illustration"):
            stats[book]["images"] += 1
        if normalized.get("needsManualReview") or (normalized.get("illustration") or {}).get("needsVisualReview"):
            stats[book]["manualReview"] += 1
        stats[book]["vocabRows"] += len(normalized.get("vocabulary", []))
        stats[book]["vocabReview"] += sum(bool(row.get("needsReview")) for row in normalized.get("vocabulary", []))

    vi_path = SOURCE_DIR / VIETNAMESE_N5N4
    vi_pdf = pymupdf.open(vi_path)
    catalog["sources"]["b1VietnameseMnemonic"] = {
        "file": vi_path.relative_to(ROOT).as_posix(),
        "pageCount": len(vi_pdf),
        "role": "N5–N4 mnemonic text only; original book remains the image source",
        "textLayer": "image-only; no selectable text",
        "alignment": "Matched by the printed entry number beside each kanji; OCR transcripts retain confidence and are labelled for review",
    }
    catalog["coverage"] = stats
    asset_files = list(ASSET_DIR.rglob("*.webp"))
    asset_bytes = sum(path.stat().st_size for path in asset_files)
    catalog["assetSummary"] = {
        "format": "WebP",
        "count": len(asset_files),
        "totalBytes": asset_bytes,
        "totalMiB": round(asset_bytes / (1024 * 1024), 2),
    }
    CATALOG_PATH.parent.mkdir(parents=True, exist_ok=True)
    CATALOG_PATH.write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    report = [
        "# Kanji Look and Learn extraction report",
        "",
        "Generated by `scripts/extract-kanji-look-and-learn.py`. All outputs stay in the private workspace.",
        "",
        "| Source | Records | Tips attached | Illustration crops | Vocabulary rows | Vocabulary review | Visual/manual review |",
        "|---|---:|---:|---:|---:|---:|---:|",
    ]
    for book, label in (("b1", "N5–N4 original"), ("b2", "N2–N1"), ("b3", "N3–N2")):
        stat = stats[book]
        report.append(f"| {label} | {stat['records']} | {stat['tipsAttached']} | {stat['images']} | {stat['vocabRows']} | {stat['vocabReview']} | {stat['manualReview']} |")
    report.extend([
        "",
        f"- Illustrations: {len(asset_files)} WebP files, {asset_bytes:,} bytes ({asset_bytes / (1024 * 1024):.2f} MiB).",
        "## Source notes",
        "",
        f"- Vietnamese N5–N4 companion: {len(vi_pdf)} scanned pages, no selectable text. It is the only N5–N4 mnemonic source and is aligned by the printed entry number beside each kanji.",
        f"- N5–N4 tips attached: {stats['b1']['tipsAttached']} of {stats['b1']['records']}; {stats['b1']['visualCheckTips']} were visually checked and {stats['b1']['ocrTips']} were transcribed by OCR.",
        "- Tips marked `visual-check` were compared directly with the scan. Tips marked `ocr` are machine transcriptions and may contain recognition errors; the source edition and PDF page are kept in the catalog.",
        "- N5–N4 illustration crops come from the original PDF. N2–N1 and N3–N2 illustrations are cropped from their mapped PDF entries.",
        "- The original N5–N4 PDF's searchable layer is noisy OCR. Japanese compound rows could not be separated from readings and English glosses with enough confidence, so this catalog marks N5–N4 book vocabulary unavailable rather than exporting unreliable rows.",
        "- Compound rows from the two Vietnamese PDFs are split by text coordinates and retain raw row text. Rows with missing columns are marked `needsReview` in the JSON.",
        "- The catalog is derived from the existing source-specific mnemonic index; entries absent from that index are outside this extraction coverage.",
        "- Rights for public redistribution of the books and extracted illustrations/text have not been verified; keep this catalog and its assets private.",
        "",
    ])
    (ROOT / "src" / "data" / "kanji-look-and-learn-extraction-report.md").write_text("\n".join(report), encoding="utf-8")
    print(json.dumps({"catalog": str(CATALOG_PATH), "coverage": stats, "viScanPages": len(vi_pdf)}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
