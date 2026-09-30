"""Ask Gemini to align N1 T12/2025 question ranges to the original full MP3.

Writes only an ignored scratch artifact; never modifies exam data or audio.
"""

import json
import re
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MODEL = "gemini-3.5-flash-lite"
EXAM_ID = "cacnam-n1-2025-12"
AUDIO = ROOT / "assets/data/de-thi-cac-nam/N1/N1 12-2025/JLPT N1 12.2025 Choukai.mp3"
EXAM_DATA = ROOT / "src/data/dethi-n1-cac-nam.json"
SCRATCH = ROOT / "_scratch/n1-2025-12"
OUTPUT = ROOT / "_scratch/n1-2025-12-audio-ranges.json"


def read_keys():
    for line in (ROOT / "_scratch/.env.gemini").read_text(encoding="utf-8").splitlines():
        match = re.match(r"\s*(GEMINI_API_KEY(?:_[A-Z0-9_]+)?)\s*=\s*(.*?)\s*$", line)
        if not match:
            continue
        alias, value = match.groups()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
            value = value[1:-1]
        if value:
            yield alias, value


def read_questions():
    groups = [
        json.loads((SCRATCH / "listening-1-2.json").read_text(encoding="utf-8"))["questions"],
        json.loads((SCRATCH / "listening-3-4.json").read_text(encoding="utf-8"))["questions"],
        json.loads((SCRATCH / "listening-5.json").read_text(encoding="utf-8")),
    ]
    questions = [question for group in groups for question in group]
    if len(questions) != 30:
        raise RuntimeError(f"Expected 30 scratch listening audit items, got {len(questions)}.")
    for number, question in enumerate(questions, start=1):
        question["number"] = number
        question.setdefault("problemGroup", question.get("group", ""))
    return questions


def main():
    from mutagen import File as AudioFile
    from google import genai

    if not AUDIO.is_file():
        raise RuntimeError("Original N1 T12/2025 listening audio is missing.")
    duration = float(AudioFile(str(AUDIO)).info.length)
    questions = read_questions()
    prompt_questions = [
        {
            "number": int(question["number"]),
            "group": question["problemGroup"] if "problemGroup" in question else question.get("group", ""),
            "label": question.get("question", ""),
            "transcript": question.get("transcript", ""),
        }
        for question in questions
    ]
    prompt = (
        f"Đây là audio nguyên đề JLPT N1 T12/2025 聴解, dài {duration:.1f} giây, kèm transcript nguồn đã tách theo câu. "
        "Hãy nghe audio gốc và căn từng câu 1-30 vào đúng mốc thời gian tuyệt đối của file. "
        "startSec phải ngay trước phần âm thanh cần nghe của câu (gồm số câu/lời dẫn nếu có); endSec ngay sau câu hỏi/lựa chọn cuối cùng cần thiết để trả lời và trước khi câu kế tiếp bắt đầu. "
        "Bỏ qua phần chỉ dẫn đầu bài, ví dụ luyện tập và phần thông báo đáp án mẫu; không lấy những khoảng đó làm nội dung câu thật. "
        "Các lựa chọn đọc thành tiếng phải nằm trọn trong range. Nếu câu 29 và 30 dùng chung một đoạn hội thoại, cho cùng startSec và endSec lần lượt sau câu hỏi 1 và câu hỏi 2. "
        "Đừng đoán theo độ dài trung bình: đối chiếu nhãn câu và transcript từng câu với audio. Trả JSON array gồm đúng 30 object {number,startSec,endSec}, theo số câu tăng dần, không thêm nội dung khác.\n\n"
        + json.dumps(prompt_questions, ensure_ascii=False)
    )
    schema = {
        "type": "ARRAY",
        "items": {
            "type": "OBJECT",
            "properties": {
                "number": {"type": "INTEGER"},
                "startSec": {"type": "NUMBER"},
                "endSec": {"type": "NUMBER"},
            },
            "required": ["number", "startSec", "endSec"],
        },
    }
    last_status = "none"
    response_data = None
    for alias, key in read_keys():
        try:
            client = genai.Client(api_key=key)
            print(f"Uploading audio and aligning ranges with {MODEL} using {alias} (key hidden).", flush=True)
            with AUDIO.open("rb") as stream:
                uploaded = client.files.upload(
                    file=stream,
                    config={"mime_type": "audio/mpeg", "display_name": "n1-2025-12-range-audit"},
                )
            while uploaded.state.name == "PROCESSING":
                time.sleep(5)
                uploaded = client.files.get(name=uploaded.name)
            if uploaded.state.name != "ACTIVE":
                raise RuntimeError(f"Gemini file state {uploaded.state.name}")
            response = client.models.generate_content(
                model=MODEL,
                contents=[prompt, uploaded],
                config={
                    "response_mime_type": "application/json",
                    "response_schema": schema,
                    "temperature": 0.0,
                },
            )
            response_data = json.loads(response.text)
            break
        except Exception as error:
            last_status = str(getattr(error, "status_code", None) or getattr(error, "code", None) or type(error).__name__)
            print(f"Gemini alias {alias} failed ({last_status}); response body and key omitted.", flush=True)
            if last_status in {"503", "UNAVAILABLE"}:
                break
    if response_data is None:
        raise RuntimeError(f"No Gemini boundary call succeeded; last status={last_status}.")
    if not isinstance(response_data, list) or len(response_data) != 30:
        raise RuntimeError(f"Expected 30 ranges, got {len(response_data) if isinstance(response_data, list) else 'non-array'}.")
    ranges = []
    for expected, item in enumerate(response_data, start=1):
        if int(item["number"]) != expected:
            raise RuntimeError(f"Unexpected question order at {expected}: {item.get('number')}.")
        start = float(item["startSec"])
        end = float(item["endSec"])
        if not (0 <= start < end <= duration):
            raise RuntimeError(f"Invalid Q{expected} range {start:.2f}-{end:.2f}/{duration:.2f}.")
        ranges.append({"number": expected, "startSec": round(start, 2), "endSec": round(end, 2)})
    for number in range(1, 29):
        if ranges[number]["startSec"] <= ranges[number - 1]["startSec"]:
            raise RuntimeError(f"Non-increasing starts around Q{number + 1}.")
    if ranges[28]["startSec"] != ranges[29]["startSec"]:
        raise RuntimeError("Shared N1 question 2番 (Q29/Q30) should use a common start.")
    payload = {
        "examId": EXAM_ID,
        "model": MODEL,
        "durationSec": round(duration, 2),
        "method": "Gemini audio + audited question transcripts; needs playback spot-check before integration",
        "ranges": ranges,
    }
    OUTPUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Saved {len(ranges)} question ranges to {OUTPUT.relative_to(ROOT)}.")


if __name__ == "__main__":
    main()
