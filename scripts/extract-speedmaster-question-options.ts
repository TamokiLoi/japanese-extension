// Speed Master prints text options directly on the QUESTION pages (both
// Part1 practice -- with the correct answer circled/underlined -- and Part2
// mock tests -- without marking, kept blank for a real test feel). Scans
// those pages for {cd, track, options[]} wherever options are plain text;
// items with no printed text (概要理解/発話表現/即時応答 in the mock-test
// sections) simply won't appear in the output and get audio-transcribed
// options in a later pass, same as Sou Matome.
//
// Usage: node --experimental-strip-types scripts/extract-speedmaster-question-options.ts

import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..");
const MODEL = "gemini-flash-lite-latest";
const PAGES_DIR = join(ROOT, "_scratch/speedmaster-question-pages");
const OUT_FILE = join(ROOT, "_scratch/speedmaster-question-options.json");
const BATCH_SIZE = 10;

function readApiKey(): string {
  const text = readFileSync(join(ROOT, "_scratch/.env.gemini"), "utf8");
  const match = text.match(/GEMINI_API_KEY=(\S+)/);
  if (!match) throw new Error("No GEMINI_API_KEY found");
  return match[1];
}

interface OptionsItem {
  cd: number;
  track: number;
  options: string[];
}

const RESPONSE_SCHEMA = {
  type: "ARRAY",
  items: {
    type: "OBJECT",
    properties: {
      cd: { type: "INTEGER" },
      track: { type: "INTEGER" },
      options: { type: "ARRAY", items: { type: "STRING" } },
    },
    required: ["cd", "track", "options"],
  },
};

const PROMPT = `Đây là các trang câu hỏi (問題1-5, cả phần luyện tập lẫn mô phỏng thi) từ sách luyện Nghe N3 "Speed Master". Mỗi câu có icon tròn ghi số CD/track, và một số câu có in sẵn 3-4 phương án trả lời bằng CHỮ ngay dưới (đôi khi đáp án đúng được khoanh tròn/gạch chân -- BỎ QUA việc đó, chỉ cần lấy nguyên văn 4 phương án theo đúng thứ tự 1-2-3-4).

CHỈ trích xuất câu nào có phương án in bằng CHỮ. Bỏ qua hoàn toàn câu không có phương án chữ nào (chỉ có vòng tròn CD/track, không có gì khác).

Với mỗi câu hợp lệ: {"cd": <1|2>, "track": <số track>, "options": ["...", "...", ...]} theo đúng thứ tự in trên trang.

Trả lời DUY NHẤT 1 JSON array theo schema, không giải thích thêm.`;

async function extractBatch(apiKey: string, images: { mimeType: string; data: string }[]): Promise<OptionsItem[]> {
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

  const all: OptionsItem[] = [];
  for (let i = 0; i < files.length; i += BATCH_SIZE) {
    const batch = files.slice(i, i + BATCH_SIZE);
    console.log(`Scanning ${batch[0]}..${batch[batch.length - 1]}...`);
    const images = batch.map((f) => ({ mimeType: "image/jpeg", data: readFileSync(join(PAGES_DIR, f)).toString("base64") }));
    const items = await extractBatch(apiKey, images);
    console.log(`  -> ${items.length} items with printed options`);
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
