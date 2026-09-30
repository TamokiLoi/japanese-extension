"""Build July 2026 N1/N3 listening-question drafts from source JSON + Gemini ASR.

This creates reviewable drafts under _scratch only. It does not publish, cut,
or replace source audio, and it never edits the canonical JLPT exam datasets.
"""

import json
from pathlib import Path

from mutagen import File as AudioFile

ROOT = Path(__file__).resolve().parents[1]
SCRATCH = ROOT / "_scratch"

EXAMS = {
    "N1": {
        "exam_id": "cacnam-n1-2026-07",
        "book": "dethi-n1-2026-07",
        "data": ROOT / "src/data/dethi-n1-cac-nam.json",
        "raw": SCRATCH / "n1-2026-07-transcription-raw.json",
        "audio": ROOT / "assets/data/de-thi-cac-nam/N1/N1 7-2026/Nghe N1 T7-2026 (Yuuki Bui).mp3",
        "audio_url": "https://github.com/TamokiLoi/japanese-extension/releases/download/audio-choukai-cacnam-n1-2026-07-v1/N1-2026-07.mp3",
        "starts": [
            182.0, 268.4, 342.0, 419.5, 524.0,
            783.1, 890.4, 989.5, 1085.4, 1202.6, 1343.3,
            1634.1, 1734.0, 1812.2, 1910.0, 1990.0,
            2157.5, 2187.4, 2216.9, 2254.8, 2285.7, 2317.7,
            2348.4, 2376.8, 2408.5, 2443.5, 2475.7,
            2526.3, 2693.7, 2693.7,
        ],
        "group_end": {"問題1": 633.0, "問題2": 1446.8, "問題3": 2080.5, "問題4": 2511.3},
        "task_type": {"問題1": "kadai", "問題2": "point", "問題3": "gaiyou", "問題4": "sokuji", "問題5": "sougou"},
    },
    "N3": {
        "exam_id": "cacnam-n3-2026-07",
        "book": "dethi-n3-2026-07",
        "data": ROOT / "src/data/dethi-n3-cac-nam.json",
        "raw": SCRATCH / "n3-2026-07-transcription-raw.json",
        "audio": ROOT / "assets/data/de-thi-cac-nam/N3 7-2026/Nghe N3 T7-2026 (Yuuki Bui).mp3",
        "audio_url": "https://github.com/TamokiLoi/japanese-extension/releases/download/audio-choukai-cacnam-2026-07-v1/N3-2026-07.mp3",
        "starts": [192.0, 265.0, 344.8, 427.0, 516.0, 608.0, 826.0, 926.0, 1036.0, 1137.0, 1246.8, 1341.0, 1656.0, 1743.0, 1822.0, 1989.0, 2027.0, 2063.0, 2096.0, 2216.0, 2246.0, 2279.0, 2310.0, 2337.0, 2369.0, 2398.0, 2427.0, 2459.0],
        "group_end": {"問題1": 684.8, "問題2": 1497.2, "問題3": 1910.1, "問題4": 2136.6},
        "task_type": {"問題1": "kadai", "問題2": "point", "問題3": "gaiyou", "問題4": "hatsugen", "問題5": "sokuji"},
    },
}


def read_exam_questions(config):
    data = json.loads(config["data"].read_text(encoding="utf-8"))
    exam = next(item for item in data["exams"] if item["id"] == config["exam_id"])
    paper = next(item for item in exam["papers"] if item["id"] == "choukai")
    return exam, paper["questions"]


def seconds(offset):
    if not offset:
        return None
    try:
        value = float(str(offset).removesuffix("s"))
        # One N3 ASR token was malformed as "99990.100s" while its end and
        # surrounding tokens are around 1000s. Drop that unusable start rather
        # than advancing the entire timeline by ~99k seconds.
        return value if value <= 5000 else None
    except ValueError:
        return None


def transcription_parts(config):
    response = json.loads(config["raw"].read_text(encoding="utf-8"))
    raw_parts = response["candidates"][0]["content"]["parts"]
    parts = []
    previous_global = 0.0
    for raw in raw_parts:
        transcript = raw.get("audio_transcription")
        if not transcript or not transcript.get("words"):
            continue
        words = []
        for word in transcript["words"]:
            start = seconds(word.get("start_offset"))
            end = seconds(word.get("end_offset"))
            if start is None or end is None:
                continue
            # A few ASR words roll back to a local <1000s offset inside an
            # utterance. Repair only the outlier word relative to the previous
            # globally increasing word; don't carry a shift into later words.
            while start < previous_global - 500:
                start += 1000
                end += 1000
            if end < start:
                end = start
            words.append({"word": word.get("word", ""), "start": start, "end": end})
            previous_global = max(previous_global, start)
        if words:
            parts.append({
                "speaker": transcript.get("speaker_label") or "speaker",
                "text": transcript.get("text") or "",
                "words": words,
                "start": min(word["start"] for word in words),
                "end": max(word["end"] for word in words),
            })
    return parts


def selected_turns(parts, start, end, task_type):
    selected = []
    local_speakers = {}
    for part in parts:
        words = [word for word in part["words"] if start <= word["start"] < end]
        if not words:
            continue
        text = "".join(word["word"] for word in words).strip()
        if not text:
            continue
        speaker_id = part["speaker"]
        if speaker_id in {"spk:0", "spk:5"}:
            speaker = "ナレーション"
        elif task_type in {"hatsugen", "sokuji"}:
            speaker = "音声"
        else:
            if speaker_id not in local_speakers:
                local_speakers[speaker_id] = f"話者{len(local_speakers) + 1}"
            speaker = local_speakers[speaker_id]
        if selected and selected[-1]["speaker"] == speaker:
            selected[-1]["text"] += text
        else:
            selected.append({"speaker": speaker, "text": text, "textVi": ""})
    return selected


def canonical_transcript_turns(transcript, number):
    lines = [line.strip() for line in transcript.splitlines() if line.strip()]
    # Question 29 is the first sub-question in shared 問題5 audio; keep the
    # common dialogue and question 1, but reserve question 2 for Q30 review.
    if number == 29:
        lines = [line for line in lines if "質問2" not in line]
    turns = []
    for line in lines:
        if ":" in line:
            speaker, text = line.split(":", 1)
            speaker, text = speaker.strip(), text.strip()
        else:
            speaker, text = "話者", line
        if text:
            turns.append({"speaker": speaker, "text": text, "textVi": ""})
    return turns


def apply_n3_script_corrections(number, turns):
    """Repair ASR-only ambiguities against the visually checked script PDF."""
    if number == 5 and len(turns) > 3:
        turns[3]["text"] = "はい。じゃあ第1会議室を予約しときますね。10時からですよね。"
    elif number == 7 and len(turns) > 3:
        turns[3]["text"] = turns[3]["text"].replace("腕はよく触れていましたね", "腕はよく振れていましたね")
    elif number == 8:
        turns = [
            {"speaker": "ナレーション", "text": "2番 女の人と男の人が温泉について話しています。女の人はこの温泉について最近どう変わったと言っていますか?", "textVi": ""},
            {"speaker": "女", "text": "隣の町の桜温泉って行ったことある?", "textVi": ""},
            {"speaker": "男", "text": "行ったことないな。かなり古い日帰りの温泉だよね?近くに住んでるお年寄りしか行かないって聞いたけど。", "textVi": ""},
            {"speaker": "女", "text": "最近、前とはずいぶんと様子が変わったんだよ。", "textVi": ""},
            {"speaker": "男", "text": "そうなの?", "textVi": ""},
            {"speaker": "女", "text": "温泉の近くにある大学の学生たちが、歴史がある温泉を利用する人が少ないのはもったいないって建物の壁を塗ったり掃除したり、お風呂の壁に絵を描いたりしたんだって。", "textVi": ""},
            {"speaker": "男", "text": "そうなんだ。", "textVi": ""},
            {"speaker": "女", "text": "この間行ったんだけど、すごくきれいになってた。前は薄暗くて入りにくかったけど明るい感じになってたよ。", "textVi": ""},
            {"speaker": "男", "text": "そうなんだ。これからお客さんが増えるといいね。", "textVi": ""},
            {"speaker": "ナレーション", "text": "女の人はこの温泉について最近どう変わったと言っていますか?", "textVi": ""},
        ]
    elif number == 9 and len(turns) > 6:
        turns[6]["text"] = "そうじゃなくて、水泳って基本的に1人でするスポーツでしょ?でも1人だと面白くなくて。テニスみたいに相手がいるスポーツの方が私には向いているのかもしれない。"
    elif number == 10 and len(turns) > 4:
        turns[4]["text"] = "うーん、そういうのより社員で記念パーティーができたらいいな。うちの会社小さいし、できそうじゃない?"
    elif number == 12:
        turns = [turn for turn in turns if turn["text"].strip() != "ここでちょっと休みましょう。"]
    elif number == 20 and turns:
        turns[0]["text"] = "1番\n漢字の授業って昨日は宿題出なかったよね?"
    elif number == 26 and len(turns) > 1:
        turns[1]["text"] = turns[1]["text"].replace("加藤さん港奨学金て", "加藤さん、港奨学金って")
    elif number == 27 and len(turns) > 1:
        turns[1]["text"] = turns[1]["text"].replace("週末実家に帰ったら", "週末、実家に帰ったら")
    elif number == 28:
        if len(turns) > 1:
            turns[1]["text"] = turns[1]["text"].replace("書類の整理量が", "書類の整理、量が")
        if len(turns) > 3:
            turns[3]["text"] = turns[3]["text"].removesuffix("。")
        if len(turns) > 7:
            turns[7]["text"] = turns[7]["text"].replace("整理必要なくなった", "整理、必要なくなった")
    return turns


def build(level, config):
    exam, questions = read_exam_questions(config)
    parts = transcription_parts(config)
    duration = float(AudioFile(str(config["audio"])).info.length)
    if config["starts"]:
        starts = config["starts"]
    else:
        starts = [float(question["audioStartSec"]) for question in questions]
    if len(starts) != len(questions):
        raise ValueError(f"{level}: expected {len(questions)} starts, got {len(starts)}")

    result = []
    for index, source in enumerate(questions):
        task_type = config["task_type"][source["problemGroup"]]
        start = float(starts[index])
        next_start = float(starts[index + 1]) if index + 1 < len(starts) else duration
        if index + 1 < len(questions) and questions[index + 1]["problemGroup"] != source["problemGroup"]:
            next_start = min(next_start, config["group_end"][source["problemGroup"]])
        if level == "N3" and source["number"] == 12:
            # Stop after the actual question prompt, not the intermission
            # announcement which follows 問題2 in the original recording.
            next_start = 1452.75
        if level == "N1" and source["number"] == 29:
            next_start = 2862.1  # after the first spoken sub-question in shared 問題5 audio
        elif level == "N1" and source["number"] == 30:
            next_start = 2881.5  # after the second spoken sub-question
        elif index == len(questions) - 1:
            # Stop before the recorded test-closing announcement.
            next_start = min(next_start, 2493.0 if level == "N3" else 2881.5)

        speech_ends = [word["end"] for part in parts for word in part["words"] if start <= word["start"] < next_start]
        if not speech_ends:
            raise ValueError(f"{level} Q{source['number']}: no timestamped speech in {start:.1f}-{next_start:.1f}")
        end = min(max(speech_ends) + 0.45, next_start - 0.1, duration)
        turns = canonical_transcript_turns(source.get("transcript", ""), source["number"]) if level == "N1" else selected_turns(parts, start, end, task_type)
        if level == "N3":
            turns = apply_n3_script_corrections(source["number"], turns)
        if not turns:
            raise ValueError(f"{level} Q{source['number']}: empty transcript for {start:.1f}-{end:.1f}")

        question_label = source.get("question", f"{source['number']}番")
        options = source.get("options", [])
        options_in_audio = (
            source["problemGroup"] in {"問題3", "問題4", "問題5"}
            if level == "N3"
            else source["problemGroup"] in {"問題3", "問題4"} or source["number"] == 28
        )
        result.append({
            "id": f"listening-dethi-{level.lower()}-2026-07-q{source['number']:02d}",
            "level": level,
            "book": config["book"],
            "taskType": task_type,
            "audioUrl": config["audio_url"],
            "audioStartSec": round(start, 2),
            "audioEndSec": round(end, 2),
            "scenario": "",
            "scenarioVi": "",
            "turns": turns,
            "question": question_label,
            "questionVi": f"Câu {source['number']}",
            "options": options,
            "optionsVi": ["" for _ in options],
            "optionExplanations": ["" for _ in options],
            **({"questionImage": source["questionImage"]} if source.get("questionImage") else {}),
            **({"optionsImage": source["optionsImage"]} if source.get("optionsImage") else {}),
            **({"optionCount": source["optionCount"]} if source.get("optionCount") else {}),
            "optionsInAudio": options_in_audio,
            "optionsInTurns": (level == "N3" and options_in_audio) or (level == "N1" and source["problemGroup"] == "問題4"),
            "correctIndex": source["correctIndex"],
            "explanation": source.get("explanation", ""),
            "notes": "Transcript/timing draft generated from original audio with Gemini 3.5 Transcribe word timestamps; answers/options are mapped from the canonical July 2026 exam data. Compare transcript against the source script before release.",
        })
    return {"questions": result}


def main():
    for level, config in EXAMS.items():
        draft = build(level, config)
        output = SCRATCH / f"listening-dethi-{level.lower()}-2026-07-draft.json"
        output.write_text(json.dumps(draft, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        counts = {}
        for question in draft["questions"]:
            counts[question["taskType"]] = counts.get(question["taskType"], 0) + 1
        print(f"{level}: {len(draft['questions'])} questions, task counts={counts}, draft={output.name}")


if __name__ == "__main__":
    main()
