// Shin Kanzen Master N3 Choukai prints options + full script + answer +
// explanation all together on the same page sequence (no separate script/
// answer booklet like Sou Matome/Speed Master) -- across all 3 sections
// (問題紹介 intro examples, 実力養成編 skill-building, 模擬試験 mock tests).
// One pass extracts everything directly.
//
// Usage: node --experimental-strip-types scripts/extract-shinkanzen-listening.ts

import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..");
const MODEL = "gemini-flash-lite-latest";
const PAGES_DIR = join(ROOT, "_scratch/shinkanzen-pages");
const OUT_FILE = join(ROOT, "_scratch/shinkanzen-all-items.json");
const BATCH_SIZE = 10;

function readApiKey(): string {
  const text = readFileSync(join(ROOT, "_scratch/.env.gemini"), "utf8");
  const match = text.match(/GEMINI_API_KEY=(\S+)/);
  if (!match) throw new Error("No GEMINI_API_KEY found");
  return match[1];
}

interface Item {
  cd: number;
  track: number;
  taskType: "kadai" | "point" | "gaiyou" | "sokuji";
  scenario: string;
  turns: { speaker: string; text: string }[];
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}

const RESPONSE_SCHEMA = {
  type: "ARRAY",
  items: {
    type: "OBJECT",
    properties: {
      cd: { type: "INTEGER" },
      track: { type: "INTEGER" },
      taskType: { type: "STRING", enum: ["kadai", "point", "gaiyou", "sokuji"] },
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
      explanation: { type: "STRING" },
    },
    required: ["cd", "track", "taskType", "scenario", "turns", "question", "options", "correctIndex", "explanation"],
  },
};

const PROMPT = `Đây là các trang scan từ sách luyện Nghe N3 "新完全マスター聴解" (Shin Kanzen Master). Sách này in TẤT CẢ trên cùng chỗ: câu hỏi + phương án (nếu có in chữ) + スクリプト (transcript hội thoại) + 答え/正解 (đáp án đúng) + giải thích, không tách riêng thành sách phụ lục.

Mỗi câu có 1 icon nhỏ (hình tai nghe/nốt nhạc hoặc số trong vòng tròn) cho biết CD nào (1 hoặc 2 -- thường 問題紹介 và 実力養成編 dùng CD1, 模擬試験 dùng CD2, nhưng hãy nhìn kỹ icon thay vì đoán theo vị trí) và số track.

Với MỖI câu hỏi độc lập tìm thấy (bỏ qua phần giải thích lý thuyết đầu mỗi mục "1課題理解"/"2ポイント理解" v.v., chỉ lấy câu hỏi thật -- kể cả 例題 ví dụ mẫu):
- cd, track: đọc kỹ từ icon.
- taskType: "kadai" nếu thuộc mục 課題理解, "point" nếu ポイント理解, "gaiyou" nếu 概要理解, "sokuji" nếu 発話表現 hoặc 即時応答.
- scenario: câu mở đầu mô tả bối cảnh (rỗng nếu không có, ví dụ dạng chỉ có 1 câu thoại ngắn).
- turns: mảng {speaker, text} (speaker "男"/"女", thêm số nếu nhiều người cùng giới). Không gồm câu bối cảnh/câu hỏi cuối.
- question: câu hỏi cuối cùng.
- options: mảng các phương án NẾU có in bằng chữ trên trang (mảng rỗng [] nếu không có -- ví dụ dạng chỉ có vòng tròn số hoặc tranh minh hoạ).
- correctIndex: đọc từ "答え"/"正解" trừ 1 (0-based).
- explanation: đoạn giải thích tiếng Nhật đi kèm nếu có (chuỗi rỗng "" nếu không có).

Trả lời DUY NHẤT 1 JSON array theo schema, không giải thích thêm ngoài JSON.`;

async function extractBatch(apiKey: string, images: { mimeType: string; data: string }[]): Promise<Item[]> {
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

  const all: Item[] = [];
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
