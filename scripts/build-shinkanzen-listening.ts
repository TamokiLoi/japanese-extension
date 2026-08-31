// Final assembly for Shin Kanzen Master N3 Choukai listening data, from the
// audio-confirmed items in resolve-shinkanzen-track-conflicts.ts. Options,
// correctIndex, and explanation all came straight off the printed page (this
// book never needed audio-transcribed options), so this step is just
// translation + writing the final schema.
//
// Usage: node --experimental-strip-types scripts/build-shinkanzen-listening.ts

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..");
const MODEL = "gemini-flash-lite-latest";
const RELEASE_BASE = "https://github.com/TamokiLoi/japanese-extension/releases/download/audio-choukai-shinkanzen-v1";
const IN_FILE = join(ROOT, "_scratch/shinkanzen-resolved.json");
const OUT_FILE = join(ROOT, "src/data/listening-shinkanzen-n3.json");

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

interface Translated {
  scenarioVi: string;
  questionVi: string;
  optionsVi: string[];
  explanationVi: string;
}

async function translateBatch(apiKey: string, items: Item[]): Promise<Translated[]> {
  const prompt =
    `Dịch các câu tiếng Nhật sau (nghe hiểu JLPT N3, kèm giải thích đáp án) sang tiếng Việt tự nhiên, súc tích. ` +
    `Trả lời DUY NHẤT 1 JSON array cùng thứ tự, mỗi phần tử {"scenarioVi": "...", "questionVi": "...", "optionsVi": ["...", ...], "explanationVi": "..."} ` +
    `(để chuỗi rỗng "" nếu trường gốc rỗng).\n\n` +
    items
      .map(
        (it, i) =>
          `${i + 1}. Bối cảnh: ${it.scenario || "(không có)"}\nCâu hỏi: ${it.question}\nPhương án: ${it.options.join(" / ") || "(không có)"}\nGiải thích: ${it.explanation || "(không có)"}`,
      )
      .join("\n\n");

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
            properties: {
              scenarioVi: { type: "STRING" },
              questionVi: { type: "STRING" },
              optionsVi: { type: "ARRAY", items: { type: "STRING" } },
              explanationVi: { type: "STRING" },
            },
            required: ["scenarioVi", "questionVi", "optionsVi", "explanationVi"],
          },
        },
      },
    }),
  });
  if (!res.ok) throw new Error(`Gemini translate call failed: HTTP ${res.status} ${await res.text()}`);
  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  return JSON.parse(text);
}

async function main() {
  const apiKey = readApiKey();
  const items: Item[] = JSON.parse(readFileSync(IN_FILE, "utf8")).filter((i: Item) => i.options.length >= 2);
  console.log(`${items.length} items with usable options. Translating...`);

  const translations: Translated[] = [];
  const BATCH = 12;
  for (let i = 0; i < items.length; i += BATCH) {
    const batch = items.slice(i, i + BATCH);
    console.log(`Translating ${i + 1}..${i + batch.length}...`);
    const t = await translateBatch(apiKey, batch);
    translations.push(...t);
    await new Promise((r) => setTimeout(r, 3000));
  }

  const trackCounts = new Map<string, number>();
  for (const item of items) {
    const k = `${item.cd}-${item.track}`;
    trackCounts.set(k, (trackCounts.get(k) ?? 0) + 1);
  }

  const questions = items.map((item, i) => {
    const shared = (trackCounts.get(`${item.cd}-${item.track}`) ?? 1) > 1;
    return {
      id: `listening-shinkanzen-n3-${String(i + 1).padStart(3, "0")}`,
      level: "N3",
      book: "shinkanzen",
      taskType: item.taskType,
      audioUrl: `${RELEASE_BASE}/cd${item.cd}-track${String(item.track).padStart(2, "0")}.mp3`,
      scenario: item.scenario,
      scenarioVi: translations[i]?.scenarioVi ?? "",
      turns: item.turns,
      question: item.question,
      questionVi: translations[i]?.questionVi ?? "",
      options: item.options,
      optionsVi: translations[i]?.optionsVi ?? [],
      correctIndex: item.correctIndex,
      explanation: translations[i]?.explanationVi ?? "",
      ...(shared
        ? {
            notes:
              "⚠️ Track audio này chứa nhiều đoạn hội thoại ngắn gộp chung (dạng bài tập khởi động) -- đoạn liên quan tới câu này có xuất hiện trong track, nhưng có thể không phải đoạn đầu tiên nghe được.",
          }
        : {}),
    };
  });

  writeFileSync(OUT_FILE, JSON.stringify({ questions }, null, 2) + "\n");
  console.log(`Wrote ${questions.length} questions -> ${OUT_FILE}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
