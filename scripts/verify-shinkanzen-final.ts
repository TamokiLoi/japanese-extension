// Full audit of the FINAL Shin Kanzen dataset already shipped to the app:
// resolve-shinkanzen-track-conflicts.ts only verified the 34 groups where
// 2+ candidates claimed the same {cd,track} -- the ~68 "unambiguous" items
// (only one candidate ever claimed that track) were trusted without ever
// actually listening to their audio. Given this book's demonstrated track-
// numbering unreliability, a singleton could still be silently wrong (its
// real track misread, just not colliding with any other extracted item).
// This checks every one of the 93 shipped items against its own real audio
// and drops any that don't actually match.
//
// Usage: node --experimental-strip-types scripts/verify-shinkanzen-final.ts

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..");
const MODEL = "gemini-flash-lite-latest";
const AUDIO_DIR = join(ROOT, "assets/data/chou-kai/shinkanzen-audio-for-upload");
const DATA_FILE = join(ROOT, "src/data/listening-shinkanzen-n3.json");
const BATCH_SIZE = 8;

function readApiKey(): string {
  const text = readFileSync(join(ROOT, "_scratch/.env.gemini"), "utf8");
  const match = text.match(/GEMINI_API_KEY=(\S+)/);
  if (!match) throw new Error("No GEMINI_API_KEY found");
  return match[1];
}

interface Question {
  id: string;
  audioUrl: string;
  scenario: string;
  turns: { speaker: string; text: string }[];
  question: string;
}

function trackFileFromUrl(audioUrl: string): string {
  const name = audioUrl.split("/").pop()!;
  return join(AUDIO_DIR, name);
}

async function checkBatch(apiKey: string, items: Question[]): Promise<{ id: string; matches: boolean }[]> {
  const parts: object[] = [];
  const header =
    `Dưới đây là ${items.length} cặp (audio, đoạn hội thoại trích từ sách). Với MỖI cặp, nghe file audio tương ứng và xác nhận ` +
    `xem đoạn hội thoại/câu hỏi có TRỰC TIẾP xuất hiện trong audio đó không (audio có thể dài hơn, chứa thêm đoạn khác -- ` +
    `chỉ cần đoạn được cho có thực sự được nói trong đó, không cần khớp 100% từng chữ do có thể lỗi phiên âm nhỏ).\n\n`;
  parts.push({ text: header });
  items.forEach((it, i) => {
    parts.push({
      text: `Cặp ${i + 1} [id=${it.id}]: Bối cảnh: ${it.scenario}\nHội thoại: ${it.turns.map((t) => `${t.speaker}: ${t.text}`).join(" / ")}\nCâu hỏi: ${it.question}`,
    });
    parts.push({ inlineData: { mimeType: "audio/mpeg", data: readFileSync(trackFileFromUrl(it.audioUrl)).toString("base64") } });
  });
  parts.push({
    text: `\nTrả lời DUY NHẤT 1 JSON array cùng thứ tự, mỗi phần tử {"id": "...", "matches": true|false}.`,
  });

  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
    method: "POST",
    headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "ARRAY",
          items: {
            type: "OBJECT",
            properties: { id: { type: "STRING" }, matches: { type: "BOOLEAN" } },
            required: ["id", "matches"],
          },
        },
      },
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
  const dataset = JSON.parse(readFileSync(DATA_FILE, "utf8"));
  const questions: Question[] = dataset.questions;

  const results: { id: string; matches: boolean }[] = [];
  for (let i = 0; i < questions.length; i += BATCH_SIZE) {
    const batch = questions.slice(i, i + BATCH_SIZE);
    const missing = batch.filter((q) => !existsSync(trackFileFromUrl(q.audioUrl)));
    if (missing.length > 0) console.warn(`  missing audio file for: ${missing.map((m) => m.id).join(", ")}`);
    const available = batch.filter((q) => existsSync(trackFileFromUrl(q.audioUrl)));
    if (available.length === 0) continue;
    console.log(`Checking ${i + 1}..${i + batch.length}...`);
    const r = await checkBatch(apiKey, available);
    results.push(...r);
    for (const m of missing) results.push({ id: m.id, matches: false });
    await new Promise((res) => setTimeout(res, 3000));
  }

  const badIds = new Set(results.filter((r) => !r.matches).map((r) => r.id));
  console.log(`Flagged ${badIds.size}/${questions.length} items as NOT matching their audio:`);
  for (const id of badIds) console.log(` - ${id}`);

  dataset.questions = questions.filter((q) => !badIds.has(q.id));
  writeFileSync(DATA_FILE, JSON.stringify(dataset, null, 2) + "\n");
  console.log(`Removed ${badIds.size}. ${dataset.questions.length} remain -> ${DATA_FILE}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
