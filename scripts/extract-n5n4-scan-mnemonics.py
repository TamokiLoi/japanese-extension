#!/usr/bin/env python3
"""Align Vietnamese N5–N4 mnemonic text from the scanned companion PDF.

Entry numbers printed beside each kanji are used as the only alignment key.
OCR output keeps page/confidence provenance and is explicitly labelled as OCR;
manually verified entries are preserved as visual checks.

Run from any directory with: python scripts/extract-n5n4-scan-mnemonics.py
Requires the local EasyOCR, OpenCV, PyMuPDF, NumPy and Pillow environment.
"""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from typing import Any

import cv2
import easyocr
import numpy as np
import pymupdf


ROOT = Path(__file__).resolve().parents[1]
SOURCE_DIR = ROOT / "assets" / "FPT-N3" / "kanji-look-and-learn"
SCAN_FILE = SOURCE_DIR / "1. Kanji Look and learn (Sách giáo khoa) n5-n4-tieng-viet.pdf"
SOURCE_INDEX = ROOT / "src" / "data" / "kanji-look-and-learn-source-index.json"
MNEMONICS_TS = ROOT / "src" / "data" / "kanjiMapBookMnemonics.ts"
CACHE_FILE = ROOT / "src" / "data" / "kanji-look-and-learn-n5n4-scan-ocr.json"
TS_PREFIX = "export const KANJI_MAP_BOOK_MNEMONICS: Record<string, KanjiMapMnemonicTip[]> = "

# The first nine entry labels are single digits; EasyOCR drops them on the
# pale blue scan. These coordinates were checked against the printed labels.
VISUALLY_CONFIRMED_LABELS = {
    18: [(1, 794), (2, 1445)],
    19: [(3, 136), (4, 790), (5, 1440)],
    20: [(6, 136), (7, 795), (8, 1450)],
    21: [(9, 136)],
}
MANUALLY_TRANSCRIBED_TIPS = {
    1: (18, "Số 1 được biểu thị bằng 1 ngón tay."),
    2: (18, "Số 2 được biểu thị bằng 2 ngón tay."),
    3: (19, "Số 3 được biểu thị bằng 3 ngón tay."),
    4: (19, "Hình tứ giác có 4 góc."),
    5: (19, "Bạn có thể tạo ra chữ Ngũ bằng 5 que diêm được không?"),
    6: (20, "Đây là cách người Trung Quốc biểu thị số 6."),
    7: (20, "2 cộng 5 là 7."),
    8: (20, "Đây là chữ ハ trong ハチ, viết bằng Katakana."),
    9: (21, "Bạn có chống đẩy được 9 cái không?"),
    33: (30, "Chỗ này phía trên đoạn nằm ngang."),
    34: (30, "Chỗ này phía dưới đoạn nằm ngang."),
    63: (43, "Đức vua đang đứng."),
    67: (45, "Đây là hình ảnh một bông lúa."),
    77: (48, "Đây là hình ảnh một người đang đứng."),
    88: (52, "Nếu bạn thở quá mạnh, bạn có thể làm ‘khí chất’ thoát ra ngoài."),
    94: (54, "Nếu đặt mặt trời (日) và mặt trăng (月) cạnh nhau thì mặt trời sẽ sáng hơn."),
    96: (55, "Bạn bè cùng hỗ trợ mỗi đứa một tay."),
    192: (93, "Thấy một con cừu (羊) mặc áo len."),
    221: (104, "Ảnh hưởng ở giữa (央) bức hình sinh ra từ sự chuyển mình có cây."),
    280: (126, "Bọ cạp ở dưới đất (土) này."),
    296: (132, "Đáp án của trúc (竹) và tôi giống sự phù hợp (合) của nứa và vung."),
    379: (165, "Hai người đang ngủ."),
    414: (178, "Vào ngày (日) tiết khí tốt trời, Kinh đô (京) phong cảnh đẹp tươi rõ ràng."),
}


def read_mnemonics() -> dict[str, list[dict[str, Any]]]:
    source = MNEMONICS_TS.read_text(encoding="utf-8")
    raw = source.split(TS_PREFIX, 1)[1].rsplit(";", 1)[0]
    return json.loads(raw)


def write_mnemonics(data: dict[str, list[dict[str, Any]]]) -> None:
    MNEMONICS_TS.write_text(TS_PREFIX + json.dumps(data, ensure_ascii=False, indent=2) + ";\n", encoding="utf-8")


def clean_text(text: str) -> str:
    text = re.sub(r"\s+", " ", text).strip(" \t\r\n|~`'\"“”‘’.,;:!?、。")
    text = re.sub(r"\s+([,.;:!?])", r"\1", text)
    # OCR can mistake a leading letter-like mark for a quote at the left edge.
    text = re.sub(r"^[^\wÀ-ỹ]+", "", text, flags=re.UNICODE)
    return text.strip()


def text_quality(results: list[Any]) -> tuple[float, str, float]:
    pieces: list[tuple[float, float, float, str]] = []
    for box, raw_text, raw_conf in results:
        confidence = float(raw_conf)
        text = clean_text(str(raw_text))
        if confidence < 0.22 or len(text) < 2:
            continue
        if any("\u3040" <= char <= "\u30ff" or "\u3400" <= char <= "\u9fff" for char in text):
            continue
        alpha = [char for char in text if char.isalpha()]
        if len(alpha) < 2 or len(alpha) / max(1, len(text)) < 0.48:
            continue
        y = sum(point[1] for point in box) / len(box)
        x = sum(point[0] for point in box) / len(box)
        pieces.append((y, x, confidence, text))

    pieces.sort(key=lambda item: (round(item[0] / 18), item[1]))
    text = clean_text(" ".join(piece[3] for piece in pieces))
    if not text:
        return 0.0, "", 0.0
    confidence = sum(piece[2] for piece in pieces) / len(pieces)
    letters = sum(char.isalpha() for char in text)
    vietnamese = sum(char in "ăâđêôơưĂÂĐÊÔƠƯ" or "\u00c0" <= char <= "\u1ef9" for char in text)
    # Prefer a longer Vietnamese sentence while mildly penalizing weak OCR.
    score = letters + vietnamese * 1.5 + confidence * 18
    return score, text, confidence


def recognize_tip(reader: easyocr.Reader, image: np.ndarray, label_y: float) -> dict[str, Any]:
    height, width = image.shape[:2]
    x0, x1 = int(width * 0.53), int(width * 0.97)
    y0, y1 = max(0, int(label_y + 10)), min(height, int(label_y + 240))
    crop = image[y0:y1, x0:x1]
    gray = cv2.cvtColor(crop, cv2.COLOR_RGB2GRAY)
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8)).apply(gray)
    candidates = [crop]
    best: tuple[float, str, float] = (0.0, "", 0.0)
    for candidate in candidates:
        results = reader.readtext(
            candidate,
            detail=1,
            paragraph=False,
            text_threshold=0.22,
            low_text=0.12,
            contrast_ths=0.05,
            adjust_contrast=0.8,
        )
        quality = text_quality(results)
        if quality[0] > best[0]:
            best = quality

    # Only spend another OCR pass on tips that are short or uncertain.
    if len(best[1]) < 20 or best[2] < 0.72:
        alternate = cv2.resize(clahe, None, fx=1.5, fy=1.5, interpolation=cv2.INTER_CUBIC)
        results = reader.readtext(
            alternate,
            detail=1,
            paragraph=False,
            text_threshold=0.22,
            low_text=0.12,
            contrast_ths=0.05,
            adjust_contrast=0.8,
        )
        quality = text_quality(results)
        if quality[0] > best[0]:
            best = quality

    return {"text": best[1], "confidence": round(best[2], 3)}


def write_b1_mnemonics(output: dict[str, Any]) -> None:
    mnemonics = read_mnemonics()
    current_by_entry = {
        int(tip["entry"]): tip
        for tips in mnemonics.values()
        for tip in tips
        if tip.get("book") == "b1" and tip.get("transcription") == "visual-check"
    }
    for char in list(mnemonics):
        mnemonics[char] = [tip for tip in mnemonics[char] if tip.get("book") != "b1"]
        if not mnemonics[char]:
            del mnemonics[char]

    for entry, item in output["entries"].items():
        entry_number = int(entry)
        char = item["kanji"]
        if entry_number in MANUALLY_TRANSCRIBED_TIPS:
            tip = {
                "id": f"b1-{entry_number}",
                "book": "b1",
                "entry": entry_number,
                "pdfPage": item["scanPdfPage"],
                "sourceEdition": "vietnamese-scan",
                "kind": "excerpt",
                "transcription": "visual-check",
                "text": item["text"],
            }
        elif entry_number in current_by_entry:
            tip = dict(current_by_entry[entry_number])
            tip["sourceEdition"] = "vietnamese-scan"
        else:
            text = item["text"]
            if not text:
                continue
            tip = {
                "id": f"b1-{entry_number}",
                "book": "b1",
                "entry": entry_number,
                "pdfPage": item["scanPdfPage"],
                "sourceEdition": "vietnamese-scan",
                "kind": "excerpt",
                "transcription": item["transcription"],
                "text": text,
            }
            if item["transcription"] == "ocr" and item.get("textConfidence") is not None:
                tip["ocrConfidence"] = item["textConfidence"]
        mnemonics.setdefault(char, []).append(tip)

    write_mnemonics(mnemonics)
    output["mnemonicTipsWritten"] = sum(
        1 for tips in mnemonics.values()
        for tip in tips if tip.get("book") == "b1" and tip.get("sourceEdition") == "vietnamese-scan"
    )


def apply_manual_repairs(b1_entries: dict[int, dict[str, Any]]) -> dict[str, Any]:
    output = json.loads(CACHE_FILE.read_text(encoding="utf-8"))
    if output.get("source") != SCAN_FILE.relative_to(ROOT).as_posix():
        raise RuntimeError("The existing OCR output belongs to a different source PDF.")

    entries = output.setdefault("entries", {})
    for entry, (scan_page, text) in MANUALLY_TRANSCRIBED_TIPS.items():
        row = b1_entries[entry]
        entries[str(entry)] = {
            "kanji": row["kanji"],
            "entry": entry,
            "scanPdfPage": scan_page,
            "text": text,
            "textConfidence": 1.0,
            "transcription": "visual-check",
            "labelConfidence": 1.0,
        }

    output["method"] = "EasyOCR Vietnamese aligned by printed entry number; flagged entries visually transcribed"
    output["alignedCount"] = len(entries)
    output["withRecognizedTextCount"] = sum(bool(item.get("text")) for item in entries.values())
    output["unmatchedEntries"] = sorted(set(b1_entries) - {int(entry) for entry in entries})
    output["emptyTextEntries"] = sorted(int(entry) for entry, item in entries.items() if not item.get("text"))
    output["manuallyTranscribedEntries"] = sorted(MANUALLY_TRANSCRIBED_TIPS)
    write_b1_mnemonics(output)
    CACHE_FILE.write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return output


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit-pages", type=int, default=0, help="Process only this many pages (for a pilot run).")
    parser.add_argument("--fresh", action="store_true", help="Ignore and replace the page cache.")
    parser.add_argument("--repair-manual", action="store_true", help="Apply visually checked repairs to existing OCR output without rescanning.")
    args = parser.parse_args()

    index = json.loads(SOURCE_INDEX.read_text(encoding="utf-8"))
    b1_entries = {int(row["entry"]): row for row in index["entries"] if row["book"] == "b1"}
    if not b1_entries:
        raise RuntimeError("The source index contains no b1 entries.")

    if args.repair_manual:
        output = apply_manual_repairs(b1_entries)
        print(json.dumps({key: output[key] for key in (
            "entryCount", "alignedCount", "withRecognizedTextCount", "unmatchedEntries", "emptyTextEntries",
            "mnemonicTipsWritten", "manuallyTranscribedEntries"
        )}, ensure_ascii=False, indent=2))
        return

    cache: dict[str, Any] = {"schemaVersion": 1, "source": SCAN_FILE.relative_to(ROOT).as_posix(), "pages": {}}
    if CACHE_FILE.exists() and not args.fresh:
        cache = json.loads(CACHE_FILE.read_text(encoding="utf-8"))
        if cache.get("source") != SCAN_FILE.relative_to(ROOT).as_posix():
            raise RuntimeError("The existing cache belongs to a different source PDF; rerun with --fresh.")
    pages: dict[str, Any] = cache.setdefault("pages", {})

    document = pymupdf.open(SCAN_FILE)
    reader = easyocr.Reader(["vi"], gpu=False, verbose=False)
    page_numbers = range(18, len(document) + 1)
    if args.limit_pages:
        page_numbers = range(18, min(len(document), 17 + args.limit_pages) + 1)

    for page_number in page_numbers:
        page_key = str(page_number)
        if page_key in pages:
            continue
        page = document[page_number - 1]
        pix = page.get_pixmap(matrix=pymupdf.Matrix(3, 3), alpha=False)
        image = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width, pix.n)
        margin_results = reader.readtext(image[:, :180], detail=1, paragraph=False, allowlist="0123456789")
        detections: list[dict[str, Any]] = []
        for box, raw_number, raw_confidence in margin_results:
            if not str(raw_number).isdigit():
                continue
            entry_number = int(raw_number)
            x = sum(point[0] for point in box) / len(box)
            y = sum(point[1] for point in box) / len(box)
            confidence = float(raw_confidence)
            if (entry_number not in b1_entries or x > image.shape[1] * 0.11
                    or y < 45 or y > image.shape[0] - 220 or confidence < 0.55):
                continue
            tip = recognize_tip(reader, image, y)
            detections.append({
                "entry": entry_number,
                "labelConfidence": round(confidence, 3),
                "labelX": round(x, 1),
                "labelY": round(y, 1),
                "text": tip["text"],
                "textConfidence": tip["confidence"],
            })
        detected_entries = {int(item["entry"]) for item in detections}
        for entry_number, y in VISUALLY_CONFIRMED_LABELS.get(page_number, []):
            if entry_number in b1_entries and entry_number not in detected_entries:
                tip = recognize_tip(reader, image, y)
                detections.append({
                    "entry": entry_number,
                    "labelConfidence": 1.0,
                    "labelX": 0.0,
                    "labelY": float(y),
                    "labelSource": "visual-check",
                    "text": tip["text"],
                    "textConfidence": tip["confidence"],
                })
        pages[page_key] = {"detections": detections}
        CACHE_FILE.write_text(json.dumps(cache, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        if page_number % 10 == 0 or page_number == page_numbers.stop - 1:
            print(f"Scanned page {page_number}/{len(document)} · {sum(len(p['detections']) for p in pages.values())} entry labels", flush=True)

    candidates: dict[int, list[dict[str, Any]]] = {entry: [] for entry in b1_entries}
    for page_text, page_data in pages.items():
        page_number = int(page_text)
        for detection in page_data.get("detections", []):
            candidates[int(detection["entry"])].append({"scanPage": page_number, **detection})

    aligned: dict[str, Any] = {}
    unmatched: list[int] = []
    empty_text: list[int] = []
    duplicated: dict[str, list[dict[str, Any]]] = {}
    for entry, row in b1_entries.items():
        matches = candidates[entry]
        if not matches:
            unmatched.append(entry)
            continue
        if len(matches) > 1:
            duplicated[str(entry)] = matches
        # The Vietnamese PDF contains a few repeated scans of the same spread.
        # Keep the first occurrence in book order rather than letting an OCR
        # score choose a later duplicate or a nearby printed number.
        best = min(matches, key=lambda item: item["scanPage"])
        manual_tip = MANUALLY_TRANSCRIBED_TIPS.get(entry)
        scan_page = manual_tip[0] if manual_tip else best["scanPage"]
        text = manual_tip[1] if manual_tip else best["text"]
        aligned[str(entry)] = {
            "kanji": row["kanji"],
            "entry": entry,
            "scanPdfPage": scan_page,
            "text": text,
            "textConfidence": 1.0 if manual_tip else best["textConfidence"],
            "transcription": "visual-check" if manual_tip else "ocr",
            "labelConfidence": best["labelConfidence"],
        }
        if not text:
            empty_text.append(entry)

    output = {
        "schemaVersion": 1,
        "source": SCAN_FILE.relative_to(ROOT).as_posix(),
        "method": "EasyOCR Vietnamese, aligned by printed entry number",
        "entryCount": len(b1_entries),
        "alignedCount": len(aligned),
        "withRecognizedTextCount": len(aligned) - len(empty_text),
        "unmatchedEntries": unmatched,
        "emptyTextEntries": empty_text,
        "duplicateEntryCandidates": duplicated,
        "entries": aligned,
    }
    CACHE_FILE.write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    if not args.limit_pages:
        write_b1_mnemonics(output)
        CACHE_FILE.write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    print(json.dumps({key: output[key] for key in (
        "entryCount", "alignedCount", "withRecognizedTextCount", "unmatchedEntries", "emptyTextEntries", "mnemonicTipsWritten"
    ) if key in output}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
