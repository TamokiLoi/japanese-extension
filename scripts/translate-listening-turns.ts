// One-off: adds textVi (Vietnamese translation) to every turn in all 3 real
// listening datasets. Mirrors translate-soumatome-scenarios.ts's approach
// (same model/batching), but covers `turns[].text` across soumatome,
// speedmaster, and shinkanzen instead of just soumatome's `scenario`.
//
// Usage: node --experimental-strip-types scripts/translate-listening-turns.ts

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..");
const MODEL = "gemini-flash-lite-latest";
const DATA_FILES = ["listening-soumatome-n3.json", "listening-speedmaster-n3.json", "listening-shinkanzen-n3.json"];
const BATCH_SIZE = 20;

function readApiKey(): string {
  const text = readFileSync(join(ROOT, "_scratch/.env.gemini"), "utf8");
  const match = text.match(/GEMINI_API_KEY=(\S+)/);
  if (!match) throw new Error("No GEMINI_API_KEY found");
  return match[1];
}

async function translateBatchRaw(apiKey: string, lines: string[]): Promise<string[]> {
  const prompt =
    `Dịch các câu thoại tiếng Nhật sau (trích từ hội thoại nghe hiểu JLPT) sang tiếng Việt tự nhiên, súc tích, giữ đúng văn phong hội thoại đời thường. ` +
    `Trả lời DUY NHẤT 1 JSON array cùng thứ tự, ĐÚNG ${lines.length} phần tử (1 phần tử cho mỗi câu đánh số bên dưới, kể cả khi 1 câu có xuống dòng bên trong), mỗi phần tử là 1 chuỗi tiếng Việt.\n\n` +
    lines.map((s, i) => `${i + 1}. ${s}`).join("\n");

  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
    method: "POST",
    headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: "application/json", responseSchema: { type: "ARRAY", items: { type: "STRING" } } },
    }),
  });
  if (!res.ok) throw new Error(`Gemini call failed: HTTP ${res.status} ${await res.text()}`);
  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error(`No text in response: ${JSON.stringify(data).slice(0, 500)}`);
  const parsed = JSON.parse(text);
  if (!Array.isArray(parsed)) throw new Error(`Expected array, got ${typeof parsed}`);
  return parsed;
}

// The model occasionally splits/merges a line (e.g. one with an embedded
// line break), throwing off the 1:1 count. Recurse into halves on mismatch
// instead of failing the whole run -- down to single lines in the worst
// case, which always aligns 1:1.
async function translateBatch(apiKey: string, lines: string[]): Promise<string[]> {
  if (lines.length === 1) {
    const [result] = await translateBatchRaw(apiKey, lines);
    return [result ?? lines[0]];
  }
  const result = await translateBatchRaw(apiKey, lines);
  if (result.length === lines.length) return result;
  const mid = Math.ceil(lines.length / 2);
  const [a, b] = await Promise.all([translateBatch(apiKey, lines.slice(0, mid)), translateBatch(apiKey, lines.slice(mid))]);
  return [...a, ...b];
}

async function main() {
  const apiKey = readApiKey();

  for (const file of DATA_FILES) {
    const dataPath = join(ROOT, "src/data", file);
    const dataset = JSON.parse(readFileSync(dataPath, "utf8")) as { questions: { turns: { speaker: string; text: string; textVi?: string }[] }[] };

    // Flatten every turn across every question into one list so batches
    // aren't wasted on questions with few turns -- textVi is filled in place
    // afterward by walking the same (question, turn) order.
    const pending: { text: string }[] = [];
    for (const q of dataset.questions) {
      for (const t of q.turns) {
        if (!t.textVi) pending.push(t);
      }
    }
    console.log(`${file}: ${pending.length} turns need translation`);

    for (let i = 0; i < pending.length; i += BATCH_SIZE) {
      const batch = pending.slice(i, i + BATCH_SIZE);
      const translations = await translateBatch(apiKey, batch.map((t) => t.text));
      batch.forEach((t, j) => {
        t.textVi = translations[j];
      });
      console.log(`  -> translated ${Math.min(i + BATCH_SIZE, pending.length)}/${pending.length}`);
      await new Promise((r) => setTimeout(r, 1500));
    }

    writeFileSync(dataPath, JSON.stringify(dataset, null, 2) + "\n");
    console.log(`Wrote ${dataPath}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
