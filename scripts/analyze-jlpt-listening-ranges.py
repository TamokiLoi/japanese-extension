"""Use Gemini to locate each JLPT listening question in its full MP3.

The output is an ignored scratch JSON; this tool never edits the exam data or
publishes/segments audio. Question ranges can be consumed by AudioPlayer's
optional start/end offsets so one hosted full-paper track is reused safely.

Usage:
  python scripts/analyze-jlpt-listening-ranges.py --exam cacnam-n3-2026-07
  python scripts/analyze-jlpt-listening-ranges.py --exam cacnam-n1-2026-07
"""

import argparse
import json
import os
import re
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MODEL = os.environ.get("JLPT_AUDIO_RANGE_MODEL", "gemini-3.8-flash")
OUTPUT = ROOT / "_scratch" / "jlpt-listening-2026-07-audio-ranges.json"

EXAMS = {
    "cacnam-n3-2026-07": {
        "data": ROOT / "src/data/dethi-n3-cac-nam.json",
        "audio": ROOT / "assets/data/de-thi-cac-nam/N3 7-2026/Nghe N3 T7-2026 (Yuuki Bui).mp3",
        "audio_url": "https://github.com/TamokiLoi/japanese-extension/releases/download/audio-choukai-cacnam-2026-07-v1/N3-2026-07.mp3",
    },
    "cacnam-n1-2026-07": {
        "data": ROOT / "src/data/dethi-n1-cac-nam.json",
        "audio": ROOT / "assets/data/de-thi-cac-nam/N1/N1 7-2026/Nghe N1 T7-2026 (Yuuki Bui).mp3",
        "audio_url": "https://github.com/TamokiLoi/japanese-extension/releases/download/audio-choukai-cacnam-n1-2026-07-v1/N1-2026-07.mp3",
    },
}


def read_keys():
    env_path = ROOT / "_scratch/.env.gemini"
    entries = []
    for raw_line in env_path.read_text(encoding="utf-8").splitlines():
        match = re.match(r"\s*(GEMINI_API_KEY(?:_[A-Z0-9_]+)?)\s*=\s*(.*?)\s*$", raw_line)
        if not match:
            continue
        label, value = match.groups()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
            value = value[1:-1]
        if value:
            entries.append((label, value))
    if not entries:
        raise RuntimeError("No Gemini API keys found in _scratch/.env.gemini")
    return entries


def parse_json(text):
    text = text.strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[1]
        text = text.rsplit("```", 1)[0]
    return json.loads(text)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--exam", choices=sorted(EXAMS), required=True)
    args = parser.parse_args()

    from google import genai
    from mutagen import File as AudioFile

    config = EXAMS[args.exam]
    source = json.loads(config["data"].read_text(encoding="utf-8"))
    exam = next((item for item in source["exams"] if item["id"] == args.exam), None)
    paper = next((item for item in exam["papers"] if item["id"] == "choukai"), None) if exam else None
    if not paper or not paper.get("questions"):
        raise RuntimeError(f"No choukai paper/questions for {args.exam}")
    audio_path = config["audio"]
    if not audio_path.is_file():
        raise RuntimeError(f"Source audio missing: {audio_path}")
    audio_meta = AudioFile(str(audio_path))
    if not audio_meta or not audio_meta.info.length:
        raise RuntimeError("Could not read audio duration")
    duration = float(audio_meta.info.length)

    questions = [
        {
            "number": item["number"],
            "problemGroup": item["problemGroup"],
            "question": item.get("question", ""),
            "knownStartSec": item.get("audioStartSec"),
        }
        for item in paper["questions"]
    ]
    prompt = (
        f"Đây là audio nguyên đề JLPT {exam['examLabel']} phần 聴解, độ dài {duration:.1f} giây. "
        "Hãy xác định mốc bắt đầu và kết thúc của nội dung audio cần nghe cho TỪNG câu trong danh sách. "
        "startSec là ngay trước khi audio của câu bắt đầu (bao gồm lời dẫn/tình huống nếu có). "
        "endSec là ngay sau câu hỏi/đáp án được đọc xong, không bao gồm khoảng lặng dài hoặc hướng dẫn của câu kế tiếp. "
        "Mốc phải là giây tuyệt đối tính từ đầu file, không ước lượng theo thời lượng trung bình; hãy đối chiếu số câu, 問題 và nội dung prompt với audio. "
        "Nếu hai câu dùng chung một hội thoại (ví dụ hai tiểu câu cuối cùng), hãy cho chúng cùng startSec; endSec mỗi câu có thể lần lượt kết thúc sau prompt tương ứng. "
        "Với N3, knownStartSec là mốc Gemini đã định vị trước đó: dùng để đối chiếu, chỉ trả mốc start mới nếu nghe thấy sai rõ ràng. "
        "Trả về JSON array đủ đúng số lượng và thứ tự câu, chỉ gồm number, startSec, endSec.\n\n"
        + json.dumps(questions, ensure_ascii=False, indent=2)
    )
    schema = {
        "type": "array",
        "items": {
            "type": "object",
            "properties": {
                "number": {"type": "integer"},
                "startSec": {"type": "number"},
                "endSec": {"type": "number"},
            },
            "required": ["number", "startSec", "endSec"],
        },
    }

    errors = []
    result = None
    for label, key in read_keys():
        client = genai.Client(api_key=key)
        try:
            print(f"[{args.exam}] trying configured Gemini key alias {label} with {MODEL} (value hidden)", flush=True)
            with audio_path.open("rb") as stream:
                uploaded = client.files.upload(
                    file=stream,
                    config={"mime_type": "audio/mpeg", "display_name": args.exam},
                )
            while uploaded.state.name == "PROCESSING":
                time.sleep(5)
                uploaded = client.files.get(name=uploaded.name)
            if uploaded.state.name != "ACTIVE":
                errors.append(f"{label}: upload state {uploaded.state.name}")
                continue
            interaction = client.interactions.create(
                model=MODEL,
                input=[
                    {"type": "text", "text": prompt},
                    {"type": "audio", "uri": uploaded.uri, "mime_type": uploaded.mime_type},
                ],
                response_format=schema,
                background=True,
            )
            while interaction.status in {"queued", "in_progress"}:
                print(f"[{args.exam}] Gemini audio analysis status: {interaction.status}", flush=True)
                time.sleep(10)
                interaction = client.interactions.get(id=interaction.id)
            if interaction.status != "completed":
                raise RuntimeError(f"Gemini interaction ended with status {interaction.status}")
            result = parse_json(interaction.output_text)
            print(f"[{args.exam}] Gemini returned {len(result)} audio ranges", flush=True)
            break
        except Exception as error:
            # Do not dump request headers, key values, or a potentially large
            # provider response body into the terminal/log.
            status = getattr(error, "status_code", None) or getattr(error, "code", None) or type(error).__name__
            errors.append(f"{label}: {status}")
            detail = re.sub(r"AIza[\w-]+", "[REDACTED]", str(error))[:240]
            print(f"[{args.exam}] key alias {label} failed ({status}): {detail}", flush=True)
            if str(status) in {"503", "UNAVAILABLE"}:
                print(f"[{args.exam}] service/model unavailable; stopping instead of retrying another key", flush=True)
                break

    if result is None:
        raise RuntimeError("No Gemini key/model succeeded: " + ", ".join(errors))
    if not isinstance(result, list) or len(result) != len(questions):
        raise RuntimeError(f"Expected {len(questions)} ranges, got {len(result) if isinstance(result, list) else type(result).__name__}")

    expected_numbers = [item["number"] for item in questions]
    actual_numbers = [int(item["number"]) for item in result]
    if actual_numbers != expected_numbers:
        raise RuntimeError(f"Question numbering mismatch: {actual_numbers}")
    normalized = []
    for item, known in zip(result, questions):
        start = float(item["startSec"])
        end = float(item["endSec"])
        if not (0 <= start < end <= duration + 1):
            raise RuntimeError(f"Invalid range for Q{item['number']}: {start:.1f}-{end:.1f}/{duration:.1f}")
        known_start = known["knownStartSec"]
        if known_start is not None and abs(start - float(known_start)) > 5:
            raise RuntimeError(f"Gemini start disagrees with existing Q{item['number']} start ({start:.1f} vs {known_start})")
        normalized.append({"number": item["number"], "startSec": round(start, 2), "endSec": round(end, 2)})

    payload = json.loads(OUTPUT.read_text(encoding="utf-8")) if OUTPUT.exists() else {}
    payload[args.exam] = {
        "audioUrl": config["audio_url"],
        "durationSec": round(duration, 2),
        "model": MODEL,
        "method": "Gemini audio boundary analysis; requires representative playback verification before app integration",
        "ranges": normalized,
    }
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    temporary = OUTPUT.with_suffix(".tmp")
    temporary.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temporary.replace(OUTPUT)
    print(f"Saved verified-shape range draft to {OUTPUT.relative_to(ROOT)}; audio content still needs spot playback QA.")


if __name__ == "__main__":
    main()
