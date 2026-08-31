// Sanity check for the audio-transcribed subset: found a real bug where one
// item's script (from the answer booklet, correctly matched by its own
// track number) got paired with the WRONG audio file because the track
// number read off the booklet had a 1-off misread for that item -- the
// transcribed "options" ended up being some other track's actual spoken
// content, topically unrelated to the dialogue.
//
// Rather than re-OCR every item's track number against the question page
// (expensive, still error-prone), this asks Gemini a cheap yes/no per item:
// "do these options plausibly answer this question given this dialogue?"
// Flagged items get dropped from the dataset -- losing a few real questions
// is a much smaller problem than silently shipping wrong audio/answer pairs.
//
// Usage: node --experimental-strip-types scripts/validate-speedmaster-audio-items.ts

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..");
const MODEL = "gemini-flash-lite-latest";
const DATA_FILE = join(ROOT, "src/data/listening-speedmaster-n3.json");
const BATCH_SIZE = 15;

function readApiKey(): string {
  const text = readFileSync(join(ROOT, "_scratch/.env.gemini"), "utf8");
  const match = text.match(/GEMINI_API_KEY=(\S+)/);
  if (!match) throw new Error("No GEMINI_API_KEY found");
  return match[1];
}

interface Question {
  id: string;
  scenario: string;
  turns: { speaker: string; text: string }[];
  question: string;
  options: string[];
  notes?: string;
}

async function checkBatch(apiKey: string, items: Question[]): Promise<{ id: string; consistent: boolean; reason: string }[]> {
  const prompt =
    `Với mỗi câu hỏi nghe hiểu tiếng Nhật dưới đây (bối cảnh + hội thoại + câu hỏi + 4 phương án), hãy đánh giá xem ` +
    `4 phương án có LIÊN QUAN CHỦ ĐỀ tới nội dung hội thoại/câu hỏi hay không (không cần biết đáp án nào đúng, chỉ cần ` +
    `kiểm tra xem các phương án có nói về cùng chủ đề/tình huống với hội thoại không, hay hoàn toàn lạc đề -- dấu hiệu bị ghép nhầm audio khác).\n\n` +
    items
      .map(
        (it, i) =>
          `${i + 1}. [id=${it.id}]\nBối cảnh: ${it.scenario}\nHội thoại: ${it.turns.map((t) => `${t.speaker}: ${t.text}`).join(" / ")}\nCâu hỏi: ${it.question}\nPhương án: ${it.options.join(" / ")}`,
      )
      .join("\n\n") +
    `\n\nTrả lời DUY NHẤT 1 JSON array cùng thứ tự, mỗi phần tử {"id": "...", "consistent": true|false, "reason": "giải thích ngắn nếu false"}.`;

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
            properties: { id: { type: "STRING" }, consistent: { type: "BOOLEAN" }, reason: { type: "STRING" } },
            required: ["id", "consistent", "reason"],
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
  const audioTranscribed = questions.filter((q) => q.notes);
  console.log(`Checking ${audioTranscribed.length} audio-transcribed items for topic consistency...`);

  const results: { id: string; consistent: boolean; reason: string }[] = [];
  for (let i = 0; i < audioTranscribed.length; i += BATCH_SIZE) {
    const batch = audioTranscribed.slice(i, i + BATCH_SIZE);
    const r = await checkBatch(apiKey, batch);
    results.push(...r);
    await new Promise((res) => setTimeout(res, 3000));
  }

  const badIds = new Set(results.filter((r) => !r.consistent).map((r) => r.id));
  console.log(`Flagged ${badIds.size} inconsistent items:`);
  for (const r of results) if (!r.consistent) console.log(` - ${r.id}: ${r.reason}`);

  dataset.questions = questions.filter((q) => !badIds.has(q.id));
  writeFileSync(DATA_FILE, JSON.stringify(dataset, null, 2) + "\n");
  console.log(`Removed ${badIds.size} items. ${dataset.questions.length} remain -> ${DATA_FILE}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
