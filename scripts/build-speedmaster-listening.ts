// Final assembly for Speed Master N3 Choukai listening data: merges
// printed-text options (extract-speedmaster-question-options.ts) with
// audio-transcribed options for everything else (概要理解/発話表現・即時応答,
// which this book never prints as text), then translates and writes
// src/data/listening-speedmaster-n3.json.
//
// Usage: node --experimental-strip-types scripts/build-speedmaster-listening.ts

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..");
const MODEL = "gemini-flash-lite-latest";
const AUDIO_DIR = join(ROOT, "assets/data/chou-kai/speedmaster-audio-for-upload");
const RELEASE_BASE = "https://github.com/TamokiLoi/japanese-extension/releases/download/audio-choukai-speedmaster-v1";
const OUT_FILE = join(ROOT, "src/data/listening-speedmaster-n3.json");

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
  options?: string[];
}

function trackFile(item: ScriptItem): string {
  return join(AUDIO_DIR, `cd${item.cd}-track${String(item.track).padStart(2, "0")}.mp3`);
}

async function transcribeBatch(apiKey: string, batch: ScriptItem[]): Promise<{ cd: number; track: number; options: string[] }[]> {
  const audioParts = batch.map((item) => ({
    inlineData: { mimeType: "audio/mpeg", data: readFileSync(trackFile(item)).toString("base64") },
  }));
  const labels = batch.map((item, i) => `File thứ ${i + 1} = CD${item.cd} track${item.track}.`).join(" ");
  const prompt =
    `Đây là ${batch.length} file audio JLPT N3 聴解, mỗi file là 1 câu hỏi độc lập. ${labels}\n\n` +
    `Với MỖI file, hãy nghe và CHỈ chép lại phần các phương án trả lời được đọc ở cuối (số 1, 2, 3, đôi khi 4, rồi tới nội dung ngắn gọn) -- KHÔNG cần chép lại phần hội thoại/bối cảnh phía trước.\n\n` +
    `Trả về JSON array, mỗi phần tử {"cd": <1|2>, "track": <số track>, "options": ["...", ...]}. Trả lời DUY NHẤT JSON.`;

  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
    method: "POST",
    headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }, ...audioParts] }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "ARRAY",
          items: {
            type: "OBJECT",
            properties: { cd: { type: "INTEGER" }, track: { type: "INTEGER" }, options: { type: "ARRAY", items: { type: "STRING" } } },
            required: ["cd", "track", "options"],
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

interface Translated {
  scenarioVi: string;
  questionVi: string;
  optionsVi: string[];
}

async function translateBatch(apiKey: string, items: ScriptItem[]): Promise<Translated[]> {
  const prompt =
    `Dịch các câu tiếng Nhật sau (nghe hiểu JLPT N3) sang tiếng Việt tự nhiên, súc tích. ` +
    `Trả lời DUY NHẤT 1 JSON array cùng thứ tự, mỗi phần tử {"scenarioVi": "...", "questionVi": "...", "optionsVi": ["...", ...]} ` +
    `(scenarioVi để chuỗi rỗng "" nếu câu gốc không có bối cảnh riêng).\n\n` +
    items
      .map(
        (it, i) =>
          `${i + 1}. Bối cảnh: ${it.scenario || "(không có)"}\nCâu hỏi: ${it.question}\nPhương án: ${(it.options ?? []).join(" / ")}`,
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
            },
            required: ["scenarioVi", "questionVi", "optionsVi"],
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
  const withOptions: ScriptItem[] = JSON.parse(readFileSync(join(ROOT, "_scratch/speedmaster-with-options.json"), "utf8"));
  const withoutOptions: ScriptItem[] = JSON.parse(readFileSync(join(ROOT, "_scratch/speedmaster-without-options.json"), "utf8"));

  const availableWithoutOptions = withoutOptions.filter((item) => existsSync(trackFile(item)));
  const missingAudio = withoutOptions.length - availableWithoutOptions.length;
  if (missingAudio > 0) {
    console.log(`Skipping ${missingAudio} items -- audio file missing (original CD2 rip incomplete, tracks unrecoverable).`);
  }
  console.log(`${withOptions.length} with printed options, ${availableWithoutOptions.length} need audio transcription.`);

  const AUDIO_BATCH = 8;
  const transcribed: { cd: number; track: number; options: string[] }[] = [];
  for (let i = 0; i < availableWithoutOptions.length; i += AUDIO_BATCH) {
    const batch = availableWithoutOptions.slice(i, i + AUDIO_BATCH);
    console.log(`Transcribing ${batch.map((b) => `cd${b.cd}-t${b.track}`).join(", ")}...`);
    const results = await transcribeBatch(apiKey, batch);
    transcribed.push(...results);
    await new Promise((r) => setTimeout(r, 3000));
  }

  const transcribedByKey = new Map(transcribed.map((t) => [`${t.cd}-${t.track}`, t.options]));
  const audioResolved = availableWithoutOptions
    .map((item) => ({ ...item, options: transcribedByKey.get(`${item.cd}-${item.track}`) ?? [] }))
    .filter((item) => item.options.length >= 2);

  const allItems: ScriptItem[] = [...withOptions, ...audioResolved];
  console.log(`Translating ${allItems.length} items...`);

  const translations: Translated[] = [];
  const TRANSLATE_BATCH = 15;
  for (let i = 0; i < allItems.length; i += TRANSLATE_BATCH) {
    const batch = allItems.slice(i, i + TRANSLATE_BATCH);
    const t = await translateBatch(apiKey, batch);
    translations.push(...t);
    await new Promise((r) => setTimeout(r, 3000));
  }

  const withOptionsKeys = new Set(withOptions.map((i) => `${i.cd}-${i.track}`));
  const questions = allItems.map((item, i) => ({
    id: `listening-speedmaster-n3-${String(i + 1).padStart(3, "0")}`,
    level: "N3",
    book: "speedmaster",
    taskType: item.taskType,
    audioUrl: `${RELEASE_BASE}/cd${item.cd}-track${String(item.track).padStart(2, "0")}.mp3`,
    scenario: item.scenario,
    scenarioVi: translations[i]?.scenarioVi ?? "",
    turns: item.turns,
    question: item.question,
    questionVi: translations[i]?.questionVi ?? "",
    options: item.options ?? [],
    optionsVi: translations[i]?.optionsVi ?? [],
    correctIndex: item.correctIndex,
    explanation: "",
    ...(withOptionsKeys.has(`${item.cd}-${item.track}`)
      ? {}
      : {
          notes:
            "⚠️ Đề gốc không in phương án bằng chữ -- đáp án đúng lấy từ sách (chắc chắn), nhưng nội dung 4 phương án do Gemini nghe audio rồi gõ lại, có thể không khớp 100% từng chữ.",
        }),
  }));

  writeFileSync(OUT_FILE, JSON.stringify({ questions }, null, 2) + "\n");
  console.log(`Wrote ${questions.length} questions -> ${OUT_FILE}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
