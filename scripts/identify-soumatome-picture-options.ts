// Pass 1 of the "picture-option" listening items: scans the Sou Matome N3
// Choukai question pages (chapters 2-5 main body, not the answer booklet)
// and asks Gemini to identify which numbered items use ILLUSTRATED (picture)
// answer choices rather than printed text -- for those, we don't crop
// individual pictures out (extra Gemini calls for bounding boxes, more
// tokens, more to get wrong); we just keep the whole page image as-is and
// show it in the UI as "here are the choices", identified only by which
// page file it came from. Output: a JSON list of {cd, track, pageFile}.
//
// Usage: node --experimental-strip-types scripts/identify-soumatome-picture-options.ts

import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..");
const MODEL = "gemini-flash-lite-latest";
const PAGES_DIR = join(ROOT, "_scratch/soumatome-question-pages");
const OUT_FILE = join(ROOT, "_scratch/soumatome-picture-options.json");
const BATCH_SIZE = 10;

function readApiKey(): string {
  const text = readFileSync(join(ROOT, "_scratch/.env.gemini"), "utf8");
  const match = text.match(/GEMINI_API_KEY=(\S+)/);
  if (!match) throw new Error("No GEMINI_API_KEY found");
  return match[1];
}

interface PictureItem {
  pageFile: string;
  cd: number;
  track: number;
}

const RESPONSE_SCHEMA = {
  type: "ARRAY",
  items: {
    type: "OBJECT",
    properties: {
      pageFile: { type: "STRING" },
      cd: { type: "INTEGER" },
      track: { type: "INTEGER" },
    },
    required: ["pageFile", "cd", "track"],
  },
};

const PROMPT = `Đây là các trang câu hỏi (không phải đáp án) từ sách luyện Nghe N3 "Nihongo Sou Matome". Mỗi câu hỏi có 1 icon tròn ghi "CD1" hoặc "CD2" kèm số track bên dưới.

Với MỖI trang ảnh, xác định các câu hỏi mà 4 (hoặc 3) phương án trả lời là TRANH MINH HOẠ (hình vẽ, ảnh, bản đồ, lịch trình...) chứ KHÔNG PHẢI chữ viết. Bỏ qua hoàn toàn các câu có phương án là CHỮ VIẾT (dù ngắn hay dài).

Tôi sẽ gửi kèm tên file của từng ảnh trang trong prompt (ví dụ "p-023.jpg"). Với mỗi câu hỏi dùng tranh làm đáp án, trả về {"pageFile": "<tên file trang chứa câu đó>", "cd": <1 hoặc 2>, "track": <số track>}.

Trả lời DUY NHẤT 1 JSON array, không giải thích thêm. Nếu 1 trang không có câu nào dùng tranh làm đáp án thì đơn giản là không xuất phần tử nào cho trang đó.`;

async function identifyBatch(apiKey: string, files: string[]): Promise<PictureItem[]> {
  const images = files.map((f) => ({ mimeType: "image/jpeg", data: readFileSync(join(PAGES_DIR, f)).toString("base64") }));
  const labeledPrompt = PROMPT + "\n\nThứ tự file ảnh gửi kèm: " + files.join(", ");
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
    method: "POST",
    headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: labeledPrompt }, ...images.map((img) => ({ inlineData: { mimeType: img.mimeType, data: img.data } }))] }],
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

  const results: PictureItem[] = [];
  for (let i = 0; i < files.length; i += BATCH_SIZE) {
    const batch = files.slice(i, i + BATCH_SIZE);
    console.log(`Scanning ${batch[0]}..${batch[batch.length - 1]}...`);
    const items = await identifyBatch(apiKey, batch);
    console.log(`  -> ${items.length} picture-option items found`);
    results.push(...items);
    await new Promise((r) => setTimeout(r, 3000));
  }

  writeFileSync(OUT_FILE, JSON.stringify(results, null, 2) + "\n");
  console.log(`Total: ${results.length} picture-option items -> ${OUT_FILE}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
