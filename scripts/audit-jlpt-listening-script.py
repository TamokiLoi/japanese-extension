"""Compare generated JLPT listening transcripts with a canonical Script PDF.

Keys are read only from ignored _scratch/.env.gemini. Audit output is scratch-only.
Usage: python scripts/audit-jlpt-listening-script.py <script.pdf> <listening-dataset.json>
"""

import json
import re
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MODEL = "gemini-3.5-flash-lite"
BATCH_SIZE = 5


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


def main():
    if len(sys.argv) != 3:
        raise RuntimeError("Pass source Script PDF and listening dataset JSON.")
    pdf_path = (ROOT / sys.argv[1]).resolve()
    dataset_path = (ROOT / sys.argv[2]).resolve()
    if ROOT not in pdf_path.parents or ROOT not in dataset_path.parents:
        raise RuntimeError("Input files must stay inside the workspace.")
    if not pdf_path.is_file() or not dataset_path.is_file():
        raise RuntimeError("Source PDF or listening dataset is missing.")
    dataset = json.loads(dataset_path.read_text(encoding="utf-8"))
    questions = dataset["questions"]

    from google import genai

    schema = {
        "type": "OBJECT",
        "properties": {
            "findings": {
                "type": "ARRAY",
                "items": {
                    "type": "OBJECT",
                    "properties": {
                        "id": {"type": "STRING"},
                        "issues": {
                            "type": "ARRAY",
                            "items": {
                                "type": "OBJECT",
                                "properties": {
                                    "turnIndex": {"type": "INTEGER"},
                                    "currentText": {"type": "STRING"},
                                    "correction": {"type": "STRING"},
                                    "reason": {"type": "STRING"},
                                },
                                "required": ["turnIndex", "currentText", "correction", "reason"],
                            },
                        },
                    },
                    "required": ["id", "issues"],
                },
            },
        },
        "required": ["findings"],
    }

    findings = None
    for alias, key in read_keys():
        client = genai.Client(api_key=key)
        try:
            print(f"Uploading source PDF with configured alias {alias} (secret hidden).", flush=True)
            with pdf_path.open("rb") as stream:
                uploaded = client.files.upload(file=stream, config={"mime_type": "application/pdf", "display_name": pdf_path.stem})
            while uploaded.state.name == "PROCESSING":
                time.sleep(5)
                uploaded = client.files.get(name=uploaded.name)
            if uploaded.state.name != "ACTIVE":
                raise RuntimeError(f"PDF upload state {uploaded.state.name}")
            current_findings = []
            for start in range(0, len(questions), BATCH_SIZE):
                batch = questions[start : start + BATCH_SIZE]
                prompt = (
                    "Đọc PDF Script nghe JLPT đính kèm làm nguồn chuẩn. Đối chiếu kỹ từng lượt tiếng Nhật trong draft bên dưới với đúng số câu trong PDF.\n"
                    "Bỏ qua khác biệt chính tả nhỏ như dấu câu/khoảng trắng nếu không đổi nội dung. Chỉ báo lỗi transcript thực sự: bỏ sót/thêm/sai từ, gán nhầm nội dung giữa lượt, nhầm câu hỏi/lựa chọn, hoặc thiếu cả một lượt. Không sửa bản dịch tiếng Việt.\n"
                    "Trả findings đúng từng id. Nếu một câu không có lỗi, issues là []. Nếu PDF không đọc rõ hoặc không đủ căn cứ thì để issues=[] và không tự suy đoán. correction chỉ nêu đoạn đúng cần thay cho một lượt, không chép lại cả bài.\n\n"
                    + json.dumps(
                        [
                            {"id": q["id"], "turns": [{"turnIndex": i, "speaker": t["speaker"], "text": t["text"]} for i, t in enumerate(q["turns"])]}
                            for q in batch
                        ],
                        ensure_ascii=False,
                    )
                )
                response = client.models.generate_content(
                    model=MODEL,
                    contents=[uploaded, prompt],
                    config={"response_mime_type": "application/json", "response_schema": schema, "temperature": 0},
                )
                parsed = json.loads(response.text or "{}")
                batch_findings = parsed.get("findings")
                if not isinstance(batch_findings, list) or len(batch_findings) != len(batch):
                    raise RuntimeError(f"Audit result shape mismatch for batch starting at {batch[0]['id']}.")
                if [item.get("id") for item in batch_findings] != [item["id"] for item in batch]:
                    raise RuntimeError("Audit result IDs/order mismatch.")
                current_findings.extend(batch_findings)
                print(f"Audited {min(start + len(batch), len(questions))}/{len(questions)} transcript questions.", flush=True)
            findings = current_findings
            break
        except Exception as error:
            status = str(getattr(error, "status_code", None) or getattr(error, "code", None) or type(error).__name__)
            print(f"Gemini alias {alias} failed ({status}); key and provider body omitted.", flush=True)
            findings = None
            if status in {"503", "UNAVAILABLE"}:
                break
    if findings is None or len(findings) != len(questions):
        raise RuntimeError("Script audit did not complete for every question.")

    output = ROOT / "_scratch" / f"{dataset_path.stem}-script-audit.json"
    output.write_text(json.dumps({"sourcePdf": sys.argv[1], "dataset": sys.argv[2], "model": MODEL, "findings": findings}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    flagged = sum(bool(item["issues"]) for item in findings)
    print(f"Saved {len(findings)} audit entries; {flagged} question(s) flagged; output {output.relative_to(ROOT)}.")


if __name__ == "__main__":
    main()
