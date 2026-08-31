// One-off: adds scenarioVi (Vietnamese translation of the `scenario` field)
// to every question in listening-soumatome-n3.json. Added after the fact --
// the earlier extraction/translation passes only covered question/options,
// leaving the scenario sentence (which carries the situational vocabulary a
// learner most needs after getting a 発話表現/即時応答 item wrong) untranslated.
//
// Usage: node --experimental-strip-types scripts/translate-soumatome-scenarios.ts

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..");
const MODEL = "gemini-flash-lite-latest";
const DATA_FILE = join(ROOT, "src/data/listening-soumatome-n3.json");
const BATCH_SIZE = 20;

function readApiKey(): string {
  const text = readFileSync(join(ROOT, "_scratch/.env.gemini"), "utf8");
  const match = text.match(/GEMINI_API_KEY=(\S+)/);
  if (!match) throw new Error("No GEMINI_API_KEY found");
  return match[1];
}

async function translateBatch(apiKey: string, scenarios: string[]): Promise<string[]> {
  const prompt =
    `Dịch các câu tiếng Nhật sau (mô tả bối cảnh hội thoại nghe hiểu JLPT) sang tiếng Việt tự nhiên, súc tích. ` +
    `Trả lời DUY NHẤT 1 JSON array cùng thứ tự, mỗi phần tử là 1 chuỗi tiếng Việt.\n\n` +
    scenarios.map((s, i) => `${i + 1}. ${s}`).join("\n");

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
  return JSON.parse(text);
}

async function main() {
  const apiKey = readApiKey();
  const dataset = JSON.parse(readFileSync(DATA_FILE, "utf8"));
  const questions = dataset.questions as { scenario: string; scenarioVi?: string; question: string }[];

  // 発話表現/即時応答 items have scenario === question (no separate setup
  // sentence) -- questionVi already covers those, so skip re-translating.
  const needsTranslation = questions.filter((q) => q.scenario && q.scenario !== q.question);
  console.log(`${needsTranslation.length}/${questions.length} need scenarioVi (rest have empty or duplicate-of-question scenario).`);

  for (let i = 0; i < needsTranslation.length; i += BATCH_SIZE) {
    const batch = needsTranslation.slice(i, i + BATCH_SIZE);
    console.log(`Translating ${i + 1}..${i + batch.length}...`);
    const translations = await translateBatch(
      apiKey,
      batch.map((q) => q.scenario),
    );
    batch.forEach((q, j) => {
      q.scenarioVi = translations[j] ?? "";
    });
    await new Promise((r) => setTimeout(r, 3000));
  }

  for (const q of questions) {
    if (q.scenarioVi === undefined) q.scenarioVi = "";
  }

  writeFileSync(DATA_FILE, JSON.stringify(dataset, null, 2) + "\n");
  console.log(`Wrote scenarioVi for ${needsTranslation.length} questions -> ${DATA_FILE}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
