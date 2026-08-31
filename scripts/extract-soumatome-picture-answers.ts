// Pass 2 for picture-option items: re-scans the same answer+script booklet
// pages (already rasterized by extract-soumatome-listening.ts), this time
// extracting scenario/turns/question/correctIndex for EVERY item regardless
// of whether text options are printed (no options field needed/expected here
// -- the picture-option items never had text options to print). Cross-
// referenced against _scratch/soumatome-picture-options.json (from
// identify-soumatome-picture-options.ts) to keep only the tracks we actually
// need images for.
//
// Usage: node --experimental-strip-types scripts/extract-soumatome-picture-answers.ts

import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..");
const MODEL = "gemini-flash-lite-latest";
const PAGES_DIR = join(ROOT, "_scratch/soumatome-answer-script-pages");
const OUT_FILE = join(ROOT, "_scratch/soumatome-picture-scripts.json");
const BATCH_SIZE = 12;

function readApiKey(): string {
  const text = readFileSync(join(ROOT, "_scratch/.env.gemini"), "utf8");
  const match = text.match(/GEMINI_API_KEY=(\S+)/);
  if (!match) throw new Error("No GEMINI_API_KEY found");
  return match[1];
}

interface WantedTrack {
  pageFile: string;
  cd: number;
  track: number;
}

interface ScriptItem {
  cd: number;
  track: number;
  scenario: string;
  turns: { speaker: string; text: string }[];
  question: string;
  correctIndex: number; // 0-based
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
    },
    required: ["cd", "track", "scenario", "turns", "question", "correctIndex"],
  },
};

const PROMPT = `Đây là các trang scan từ phần "別冊 解答・スクリプト" (đáp án + transcript) của sách luyện Nghe N3 "Nihongo Sou Matome". Mỗi câu hỏi có icon tròn ghi số CD/track, số đáp án đúng (cột "こたえ", 1-based), và script hội thoại đầy đủ kết thúc bằng câu hỏi.

Trích xuất TẤT CẢ câu hỏi thấy được (bất kể có in 4 phương án chữ hay không -- lần này không cần phương án chữ, chỉ cần script + đáp án):
- cd, track: đọc từ icon tròn.
- scenario: câu mở đầu mô tả bối cảnh.
- turns: mảng {speaker, text} (speaker "男"/"女", thêm số nếu nhiều người cùng giới). Không gồm câu bối cảnh hay câu hỏi cuối.
- question: câu hỏi cuối cùng.
- correctIndex: số đáp án đúng trừ 1 (0-based).

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
  const wanted: WantedTrack[] = JSON.parse(readFileSync(join(ROOT, "_scratch/soumatome-picture-options.json"), "utf8"));
  const existing = JSON.parse(readFileSync(join(ROOT, "src/data/listening-soumatome-n3.json"), "utf8")).questions as { audioUrl: string }[];
  const existingKeys = new Set(
    existing.map((q) => {
      const m = q.audioUrl.match(/cd(\d)-track(\d+)\.mp3/);
      return m ? `${m[1]}-${Number(m[2])}` : null;
    }),
  );
  const wantedKeys = new Set(wanted.filter((w) => !existingKeys.has(`${w.cd}-${w.track}`)).map((w) => `${w.cd}-${w.track}`));
  console.log(`Need scripts for ${wantedKeys.size} picture-option tracks:`, [...wantedKeys]);

  const files = readdirSync(PAGES_DIR)
    .filter((f) => f.endsWith(".jpg"))
    .sort();

  const found: ScriptItem[] = [];
  for (let i = 0; i < files.length; i += BATCH_SIZE) {
    if (found.length >= wantedKeys.size) break;
    const batchFiles = files.slice(i, i + BATCH_SIZE);
    console.log(`Scanning ${batchFiles[0]}..${batchFiles[batchFiles.length - 1]}...`);
    const images = batchFiles.map((f) => ({ mimeType: "image/jpeg", data: readFileSync(join(PAGES_DIR, f)).toString("base64") }));
    const items = await extractBatch(apiKey, images);
    for (const item of items) {
      const key = `${item.cd}-${item.track}`;
      if (wantedKeys.has(key) && !found.some((f) => `${f.cd}-${f.track}` === key)) {
        found.push(item);
      }
    }
    console.log(`  -> ${found.length}/${wantedKeys.size} found so far`);
    await new Promise((r) => setTimeout(r, 3000));
  }

  writeFileSync(OUT_FILE, JSON.stringify(found, null, 2) + "\n");
  console.log(`Wrote ${found.length} scripts -> ${OUT_FILE}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
