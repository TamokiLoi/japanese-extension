// Extracts EVERY item from Speed Master N3 Choukai's answer/script booklet
// (スクリプトと答え) -- scenario/turns/question/correctIndex/taskType for
// every track, regardless of whether the corresponding question page
// printed text options. Mirrors extract-soumatome-all-scripts.ts.
//
// Usage: node --experimental-strip-types scripts/extract-speedmaster-scripts.ts

import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..");
const MODEL = "gemini-flash-lite-latest";
const PAGES_DIR = join(ROOT, "_scratch/speedmaster-script-pages");
const OUT_FILE = join(ROOT, "_scratch/speedmaster-all-scripts.json");
const BATCH_SIZE = 10;

function readApiKey(): string {
  const text = readFileSync(join(ROOT, "_scratch/.env.gemini"), "utf8");
  const match = text.match(/GEMINI_API_KEY=(\S+)/);
  if (!match) throw new Error("No GEMINI_API_KEY found");
  return match[1];
}

interface ScriptItem {
  cd: number;
  track: number;
  taskType: "kadai" | "point" | "gaiyou" | "sokuji";
  scenario: string;
  turns: { speaker: string; text: string }[];
  question: string;
  correctIndex: number;
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
      correctIndex: { type: "INTEGER" },
    },
    required: ["cd", "track", "taskType", "scenario", "turns", "question", "correctIndex"],
  },
};

const PROMPT = `Đây là các trang scan từ phần "スクリプトと答え" (script + đáp án) của sách luyện Nghe N3 "Speed Master". Mỗi câu hỏi có icon tròn ghi số CD/track, đầu mục "問題1 (課題理解)" / "問題2 (ポイント理解)" / "問題3 (概要理解)" / "問題4 (発話表現)" / "問題5 (即時応答)" cho biết dạng câu hỏi của cả nhóm, scenario mở đầu, script hội thoại (icon 男/女 hoặc M/F đánh dấu người nói), câu hỏi cuối, và dòng "【正解】<số>" ghi đáp án đúng.

Trích xuất TẤT CẢ câu hỏi thấy được, kể cả khi không thấy 4 phương án chữ (phần đó không cần vì đã có trên trang câu hỏi riêng):
- cd, track: đọc từ icon tròn.
- taskType: "kadai" nếu đang ở mục 問題 課題理解, "point" nếu ポイント理解, "gaiyou" nếu 概要理解, "sokuji" nếu 発話表現 hoặc 即時応答. Nếu 1 trang không ghi lại tiêu đề (vì đã ghi ở trang trước), dùng tiêu đề gần nhất phía trên.
- scenario: câu mở đầu mô tả bối cảnh (rỗng nếu không có câu riêng, ví dụ dạng 即時応答 chỉ có 1 câu thoại duy nhất).
- turns: mảng {speaker, text} (speaker "男"/"女", thêm số nếu nhiều người cùng giới như "男1"/"男2"). Không gồm câu bối cảnh hay câu hỏi cuối.
- question: câu hỏi cuối cùng (với dạng 発話表現/即時応答, question có thể trùng với câu thoại duy nhất -- vẫn điền như nhau).
- correctIndex: số trong "【正解】" trừ 1 (0-based).

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
