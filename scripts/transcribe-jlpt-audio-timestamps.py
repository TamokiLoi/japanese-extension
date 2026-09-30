"""Transcribe one source JLPT listening MP3 with Gemini word-level timestamps.

API keys are loaded only from ignored _scratch/.env.gemini. The raw response is
written only to _scratch and is not an app asset.

Example:
  python scripts/transcribe-jlpt-audio-timestamps.py \
    --audio "assets/data/de-thi-cac-nam/N1/N1 12-2025/JLPT N1 12.2025 Choukai.mp3" \
    --out "_scratch/n1-2025-12-transcription-raw.json"
"""

import argparse
import json
import re
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MODEL = "gemini-3.5-transcribe"


def read_keys():
    env_path = ROOT / "_scratch/.env.gemini"
    keys = []
    for raw_line in env_path.read_text(encoding="utf-8").splitlines():
        match = re.match(r"\s*(GEMINI_API_KEY(?:_[A-Z0-9_]+)?)\s*=\s*(.*?)\s*$", raw_line)
        if not match:
            continue
        label, value = match.groups()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
            value = value[1:-1]
        if value:
            keys.append((label, value))
    return keys


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--audio", required=True)
    parser.add_argument("--out", required=True)
    args = parser.parse_args()
    audio_path = (ROOT / args.audio).resolve()
    out_path = (ROOT / args.out).resolve()
    if not audio_path.is_file():
        raise RuntimeError(f"Audio file missing: {args.audio}")
    if ROOT not in out_path.parents:
        raise RuntimeError("Output must remain within the workspace.")

    from google import genai
    from google.genai import types

    output = None
    last_error = None
    for label, key in read_keys():
        client = genai.Client(api_key=key)
        try:
            print(f"Uploading {audio_path.name} with configured alias {label} (key hidden).", flush=True)
            with audio_path.open("rb") as stream:
                uploaded = client.files.upload(
                    file=stream,
                    config={"mime_type": "audio/mpeg", "display_name": audio_path.stem},
                )
            while uploaded.state.name == "PROCESSING":
                time.sleep(5)
                uploaded = client.files.get(name=uploaded.name)
            if uploaded.state.name != "ACTIVE":
                raise RuntimeError(f"Gemini file upload state: {uploaded.state.name}")
            print(f"Requesting {MODEL} word timestamps and speaker diarization.", flush=True)
            response = client.models.generate_content(
                model=MODEL,
                contents=[uploaded],
                config=types.GenerateContentConfig(
                    audio_transcription_config=types.AudioTranscriptionConfig(
                        diarization=True,
                        word_timestamp=True,
                    ),
                ),
            )
            output = response.model_dump(exclude_none=True)
            break
        except Exception as error:
            status = getattr(error, "status_code", None) or getattr(error, "code", None) or type(error).__name__
            print(f"Gemini alias {label} failed with {status}; provider body and key omitted.", flush=True)
            last_error = status
            if str(status) in {"503", "UNAVAILABLE"}:
                break
    if output is None:
        raise RuntimeError(f"No Gemini transcription succeeded; last status={last_error}.")

    parts = output.get("candidates", [{}])[0].get("content", {}).get("parts", [])
    word_count = sum(len(part.get("audio_transcription", {}).get("words", [])) for part in parts)
    if word_count == 0:
        raise RuntimeError("Gemini returned no word-level transcript; raw response was not saved.")
    out_path.parent.mkdir(parents=True, exist_ok=True)
    temp_path = out_path.with_suffix(out_path.suffix + ".tmp")
    temp_path.write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temp_path.replace(out_path)
    print(f"Saved {word_count} timestamped words to {out_path.relative_to(ROOT)}.")


if __name__ == "__main__":
    main()
