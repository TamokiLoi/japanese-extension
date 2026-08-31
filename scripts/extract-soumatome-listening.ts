// Extracts N3 聴解 items from Nihongo Sou Matome N3 Choukai's answer+script
// booklet (別冊 解答・スクリプト) via Gemini vision -- unlike the exam-paper
// quizbook extraction, this book HAS real printed answers and full dialogue
// scripts, so there's no "AI-inferred answer" caveat here: Gemini is just
// reading back what's printed, not guessing.
//
// Scope deliberately narrowed to items with a printed TEXT question + 4
// numbered TEXT options in the script/answer page (ポイント理解 / 概要理解
// style). 課題理解 items in this book mostly use illustrated (picture-based)
// options with no text equivalent printed here -- those aren't extractable
// from text/OCR alone and are skipped rather than guessed at.
//
// Audio: each item's page shows a "CD1/45"-style icon giving the exact track
// number -- mapped here to the GitHub Release asset URL (cd{N}-track{NN}.mp3)
// created for this book's ripped audio.
//
// Usage: node --experimental-strip-types scripts/extract-soumatome-listening.ts

import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..");
const MODEL = "gemini-flash-lite-latest";
const PAGES_DIR = join(ROOT, "_scratch/soumatome-answer-script-pages");
const OUT_FILE = join(ROOT, "src/data/listening-soumatome-n3.json");
const RELEASE_BASE = "https://github.com/TamokiLoi/japanese-extension/releases/download/audio-choukai-soumatome-v1";
const BATCH_SIZE = 12; // pages per Gemini call

function readApiKey(): string {
  const text = readFileSync(join(ROOT, "_scratch/.env.gemini"), "utf8");
  const match = text.match(/GEMINI_API_KEY=(\S+)/);
  if (!match) throw new Error("No GEMINI_API_KEY found");
  return match[1];
}

interface ExtractedItem {
  cd: 1 | 2;
  track: number;
  taskTypeGuess: "point" | "gaiyou" | "kadai" | "sokuji";
  scenario: string;
  turns: { speaker: string; text: string }[];
  question: string;
  options: string[];
  correctIndex: number;
}

const RESPONSE_SCHEMA = {
  type: "ARRAY",
  items: {
    type: "OBJECT",
    properties: {
      cd: { type: "INTEGER" },
      track: { type: "INTEGER" },
      taskTypeGuess: { type: "STRING", enum: ["point", "gaiyou", "kadai", "sokuji"] },
      scenario: { type: "STRING" },
      turns: {
        type: "ARRAY",
        items: {
          type: "OBJECT",
          properties: { speaker: { type: "STRING" }, text: { type: "STRING" } },
          required: ["speaker", "text"],
        },
      },
      question: { type: "STRING" },
      options: { type: "ARRAY", items: { type: "STRING" } },
      correctIndex: { type: "INTEGER" },
    },
    required: ["cd", "track", "taskTypeGuess", "scenario", "turns", "question", "options", "correctIndex"],
  },
};

const PROMPT = `Đây là các trang scan từ phần "別冊 解答・スクリプト" (đáp án + transcript) của sách luyện Nghe N3 "Nihongo Sou Matome". Mỗi câu hỏi có: icon tròn xanh ghi số CD và track (vd "CD1" với số "45" bên dưới -- đó là CD 1, track 45), số thứ tự đáp án đúng (cột "こたえ"), và script hội thoại đầy đủ (cột "スクリプト") kết thúc bằng câu hỏi, đôi khi kèm 4 phương án đánh số 1-4 in ngay dưới câu hỏi.

CHỈ trích xuất những câu hỏi có ĐẦY ĐỦ 4 phương án trả lời in thành CHỮ ngay trên trang (dạng "1 ... / 2 ... / 3 ... / 4 ..." dưới câu hỏi). BỎ QUA hoàn toàn các câu chỉ có script + đáp án số nhưng KHÔNG có 4 phương án chữ in kèm (những câu đó dùng tranh minh họa làm đáp án, không trích xuất được).

Với mỗi câu hợp lệ, trả về:
- cd: 1 hoặc 2 (đọc từ icon tròn).
- track: số track (đọc từ icon tròn, phần số bên dưới "CD1"/"CD2").
- taskTypeGuess: đoán dạng câu hỏi dựa vào tiêu đề chương/mục nếu thấy (課題理解→"kadai", ポイント理解→"point", 概要理解→"gaiyou", 発話表現/即時応答→"sokuji"); nếu không thấy tiêu đề rõ, đoán theo cấu trúc: có 4 phương án dài diễn giải nội dung → "point" hoặc "gaiyou" tuỳ ngữ cảnh.
- scenario: câu mở đầu mô tả bối cảnh (vd "会社の昼休みに、男の人と女の人が話しています。").
- turns: mảng các lượt thoại {speaker, text} -- speaker là "男"/"女" (thêm số nếu có nhiều hơn 1 người cùng giới như "男1"/"男2"), text là nguyên văn câu nói. KHÔNG bao gồm câu mở đầu bối cảnh hay câu hỏi cuối trong turns.
- question: câu hỏi cuối cùng (vd "男の学生は、このあとまず何をしますか。").
- options: đúng 4 chuỗi text của 4 phương án (bỏ số thứ tự 1/2/3/4 phía trước).
- correctIndex: chỉ số 0-3 tương ứng với số đáp án đúng in trong cột "こたえ" (số đó là 1-based, trừ đi 1 để ra correctIndex).

Trả lời DUY NHẤT 1 JSON array theo schema, không giải thích thêm.`;

async function extractBatch(apiKey: string, images: { mimeType: string; data: string }[]): Promise<ExtractedItem[]> {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
    method: "POST",
    headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: PROMPT }, ...images.map((img) => ({ inlineData: { mimeType: img.mimeType, data: img.data } }))] }],
      generationConfig: { responseMimeType: "application/json", responseSchema: RESPONSE_SCHEMA },
    }),
  });
  if (!res.ok) throw new Error(`Gemini call failed: HTTP ${res.status} ${await res.text()}`);
  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error(`No text in response: ${JSON.stringify(data).slice(0, 500)}`);
  return JSON.parse(text);
}

interface TranslatedFields {
  questionVi: string;
  optionsVi: string[];
}

async function translateBatch(apiKey: string, items: ExtractedItem[]): Promise<TranslatedFields[]> {
  const prompt =
    `Dịch các câu hỏi và phương án trắc nghiệm tiếng Nhật sau sang tiếng Việt tự nhiên, súc tích. ` +
    `Trả lời DUY NHẤT 1 JSON array cùng thứ tự, mỗi phần tử {"questionVi": "...", "optionsVi": ["...", "...", "...", "..."]}.\n\n` +
    items.map((it, i) => `${i + 1}. Câu hỏi: ${it.question}\nPhương án: ${it.options.join(" / ")}`).join("\n\n");

  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
    method: "POST",
    headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "ARRAY",
          items: {
            type: "OBJECT",
            properties: { questionVi: { type: "STRING" }, optionsVi: { type: "ARRAY", items: { type: "STRING" } } },
            required: ["questionVi", "optionsVi"],
          },
        },
      },
    }),
  });
  if (!res.ok) throw new Error(`Gemini translate call failed: HTTP ${res.status} ${await res.text()}`);
  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  return JSON.parse(text);
}

function audioUrl(item: ExtractedItem): string {
  const track = String(item.track).padStart(2, "0");
  return `${RELEASE_BASE}/cd${item.cd}-track${track}.mp3`;
}

async function main() {
  const apiKey = readApiKey();
  const files = readdirSync(PAGES_DIR)
    .filter((f) => f.endsWith(".jpg"))
    .sort();

  const extracted: ExtractedItem[] = [];
  for (let i = 0; i < files.length; i += BATCH_SIZE) {
    const batchFiles = files.slice(i, i + BATCH_SIZE);
    console.log(`Extracting pages ${batchFiles[0]}..${batchFiles[batchFiles.length - 1]} (${batchFiles.length} pages)...`);
    const images = batchFiles.map((f) => ({ mimeType: "image/jpeg", data: readFileSync(join(PAGES_DIR, f)).toString("base64") }));
    const items = await extractBatch(apiKey, images);
    console.log(`  -> ${items.length} items with full text options`);
    extracted.push(...items);
    await new Promise((r) => setTimeout(r, 3000));
  }

  console.log(`Total extracted: ${extracted.length}. Translating to Vietnamese in batches...`);
  const translations: TranslatedFields[] = [];
  const TRANSLATE_BATCH = 15;
  for (let i = 0; i < extracted.length; i += TRANSLATE_BATCH) {
    const batch = extracted.slice(i, i + TRANSLATE_BATCH);
    const t = await translateBatch(apiKey, batch);
    translations.push(...t);
    await new Promise((r) => setTimeout(r, 3000));
  }

  const questions = extracted.map((item, i) => ({
    id: `listening-soumatome-n3-${String(i + 1).padStart(3, "0")}`,
    level: "N3",
    taskType: item.taskTypeGuess,
    audioUrl: audioUrl(item),
    scenario: item.scenario,
    turns: item.turns,
    question: item.question,
    questionVi: translations[i]?.questionVi ?? "",
    options: item.options,
    optionsVi: translations[i]?.optionsVi ?? [],
    correctIndex: item.correctIndex,
    explanation: "",
  }));

  writeFileSync(OUT_FILE, JSON.stringify({ questions }, null, 2) + "\n");
  console.log(`Wrote ${questions.length} questions -> ${OUT_FILE}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
