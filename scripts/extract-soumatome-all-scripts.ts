// Extracts EVERY item from Sou Matome N3 Choukai's answer+script booklet
// (scenario/turns/question/correctIndex, regardless of whether text options
// exist) -- gives the full universe of {cd,track} -> script+answer, so we
// can diff against the 51 already-built questions and know exactly which
// tracks still need their spoken-only options recovered via audio.
//
// Usage: node --experimental-strip-types scripts/extract-soumatome-all-scripts.ts

import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..");
const MODEL = "gemini-flash-lite-latest";
const PAGES_DIR = join(ROOT, "_scratch/soumatome-answer-script-pages");
const OUT_FILE = join(ROOT, "_scratch/soumatome-all-scripts.json");
const BATCH_SIZE = 12;

function readApiKey(): string {
  const text = readFileSync(join(ROOT, "_scratch/.env.gemini"), "utf8");
  const match = text.match(/GEMINI_API_KEY=(\S+)/);
  if (!match) throw new Error("No GEMINI_API_KEY found");
  return match[1];
}

interface ScriptItem {
  cd: number;
  track: number;
  scenario: string;
  turns: { speaker: string; text: string }[];
  question: string;
  correctIndex: number;
  hasPrintedOptions: boolean;
}

const RESPONSE_SCHEMA = {
  type: "ARRAY",
  items: {
    type: "OBJECT",
    properties: {
      cd: { type: "INTEGER" },
      track: { type: "INTEGER" },
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
      correctIndex: { type: "INTEGER" },
      hasPrintedOptions: { type: "BOOLEAN" },
    },
    required: ["cd", "track", "scenario", "turns", "question", "correctIndex", "hasPrintedOptions"],
  },
};

const PROMPT = `Đây là các trang scan từ phần "別冊 解答・スクリプト" (đáp án + transcript) của sách luyện Nghe N3 "Nihongo Sou Matome". Mỗi câu hỏi có icon tròn ghi số CD/track, số đáp án đúng (cột "こたえ", 1-based), và script hội thoại kết thúc bằng câu hỏi, đôi khi kèm 4 (hoặc 3) phương án chữ in ngay dưới.

Trích xuất TẤT CẢ câu hỏi thấy được, kể cả những câu KHÔNG có phương án chữ in kèm (chỉ có script + đáp án số) -- KHÔNG bỏ qua câu nào:
- cd, track: đọc từ icon tròn.
- scenario: câu mở đầu mô tả bối cảnh.
- turns: mảng {speaker, text}, không gồm câu bối cảnh/câu hỏi cuối.
- question: câu hỏi cuối cùng.
- correctIndex: số đáp án đúng trừ 1 (0-based).
- hasPrintedOptions: true nếu trang có in 4 (hoặc 3) phương án bằng CHỮ ngay dưới câu hỏi, false nếu không có (chỉ có script + số đáp án).

Trả lời DUY NHẤT 1 JSON array theo schema, không giải thích thêm.`;

async function extractBatch(apiKey: string, images: { mimeType: string; data: string }[]): Promise<ScriptItem[]> {
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

async function main() {
  const apiKey = readApiKey();
  const files = readdirSync(PAGES_DIR)
    .filter((f) => f.endsWith(".jpg"))
    .sort();

  const all: ScriptItem[] = [];
  for (let i = 0; i < files.length; i += BATCH_SIZE) {
    const batch = files.slice(i, i + BATCH_SIZE);
    console.log(`Scanning ${batch[0]}..${batch[batch.length - 1]}...`);
    const images = batch.map((f) => ({ mimeType: "image/jpeg", data: readFileSync(join(PAGES_DIR, f)).toString("base64") }));
    const items = await extractBatch(apiKey, images);
    console.log(`  -> ${items.length} items`);
    all.push(...items);
    await new Promise((r) => setTimeout(r, 3000));
  }

  writeFileSync(OUT_FILE, JSON.stringify(all, null, 2) + "\n");
  console.log(`Total: ${all.length} items -> ${OUT_FILE}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
