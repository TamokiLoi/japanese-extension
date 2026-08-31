// For items whose original book page never printed the multiple-choice
// options as text (options were read aloud only, matching real N3 exam
// format) -- has Gemini LISTEN to the actual audio track and transcribe just
// the spoken options. Scenario/turns/question/correctIndex are already known
// from the answer/script booklet text extraction (extract-soumatome-all-
// scripts.ts); this only needs to recover the option wording.
//
// Usage: node --experimental-strip-types scripts/transcribe-soumatome-audio-options.ts

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..");
const MODEL = "gemini-flash-lite-latest";
const AUDIO_DIR = join(ROOT, "assets/data/chou-kai/soumatome-audio-for-upload");
const REMAINING_FILE = join(ROOT, "_scratch/soumatome-remaining.json");
const OUT_FILE = join(ROOT, "_scratch/soumatome-audio-options.json");
const RELEASE_BASE = "https://github.com/TamokiLoi/japanese-extension/releases/download/audio-choukai-soumatome-v1";
const BATCH_SIZE = 8;

function readApiKey(): string {
  const text = readFileSync(join(ROOT, "_scratch/.env.gemini"), "utf8");
  const match = text.match(/GEMINI_API_KEY=(\S+)/);
  if (!match) throw new Error("No GEMINI_API_KEY found");
  return match[1];
}

interface RemainingItem {
  cd: number;
  track: number;
  scenario: string;
  turns: { speaker: string; text: string }[];
  question: string;
  correctIndex: number;
}

interface AudioOptionsResult {
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

function trackFile(item: RemainingItem): string {
  return join(AUDIO_DIR, `cd${item.cd}-track${String(item.track).padStart(2, "0")}.mp3`);
}

async function transcribeBatch(apiKey: string, batch: RemainingItem[]): Promise<AudioOptionsResult[]> {
  const audioParts = batch.map((item) => ({
    inlineData: { mimeType: "audio/mpeg", data: readFileSync(trackFile(item)).toString("base64") },
  }));
  const labels = batch.map((item, i) => `File thứ ${i + 1} = CD${item.cd} track${item.track}.`).join(" ");

  const prompt =
    `Đây là ${batch.length} file audio JLPT N3 聴解, mỗi file là 1 câu hỏi độc lập. ${labels}\n\n` +
    `Với MỖI file, hãy nghe và CHỈ chép lại phần các phương án trả lời được đọc ở cuối (thường đọc số 1, 2, 3 (đôi khi 4) rồi tới nội dung ngắn gọn) -- KHÔNG cần chép lại phần hội thoại/bối cảnh phía trước, chỉ cần phần đáp án.\n\n` +
    `Trả về JSON array, mỗi phần tử {"cd": <1|2>, "track": <số track>, "options": ["...", "...", ...]} theo đúng thứ tự số phương án đọc được. Trả lời DUY NHẤT JSON, không giải thích thêm.`;

  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
    method: "POST",
    headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }, ...audioParts] }],
      generationConfig: { responseMimeType: "application/json", responseSchema: RESPONSE_SCHEMA },
    }),
  });
  if (!res.ok) throw new Error(`Gemini call failed: HTTP ${res.status} ${await res.text()}`);
  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error(`No text in response: ${JSON.stringify(data).slice(0, 500)}`);
  return JSON.parse(text);
}

async function translateBatch(apiKey: string, items: { question: string; options: string[] }[]) {
  const prompt =
    `Dịch các câu hỏi và phương án trắc nghiệm tiếng Nhật sau sang tiếng Việt tự nhiên, súc tích. ` +
    `Trả lời DUY NHẤT 1 JSON array cùng thứ tự, mỗi phần tử {"questionVi": "...", "optionsVi": ["...", ...]}.\n\n` +
    items.map((it, i) => `${i + 1}. Câu hỏi: ${it.question}\nPhương án: ${it.options.join(" / ")}`).join("\n\n");
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
            properties: { questionVi: { type: "STRING" }, optionsVi: { type: "ARRAY", items: { type: "STRING" } } },
            required: ["questionVi", "optionsVi"],
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

function guessTaskType(options: string[]): "point" | "gaiyou" | "sokuji" {
  if (options.length <= 3) return "sokuji";
  const avgLen = options.reduce((s, o) => s + o.length, 0) / options.length;
  return avgLen > 12 ? "point" : "gaiyou";
}

async function main() {
  const apiKey = readApiKey();
  const remaining: RemainingItem[] = JSON.parse(readFileSync(REMAINING_FILE, "utf8"));

  const transcribed: AudioOptionsResult[] = [];
  for (let i = 0; i < remaining.length; i += BATCH_SIZE) {
    const batch = remaining.slice(i, i + BATCH_SIZE);
    console.log(`Transcribing ${batch.map((b) => `cd${b.cd}-t${b.track}`).join(", ")}...`);
    const results = await transcribeBatch(apiKey, batch);
    console.log(`  -> ${results.length} results`);
    transcribed.push(...results);
    await new Promise((r) => setTimeout(r, 3000));
  }

  const byKey = new Map(transcribed.map((t) => [`${t.cd}-${t.track}`, t.options]));
  const merged = remaining
    .map((item) => ({ ...item, options: byKey.get(`${item.cd}-${item.track}`) ?? [] }))
    .filter((item) => item.options.length >= 2);

  console.log(`Translating ${merged.length} items...`);
  const translations: { questionVi: string; optionsVi: string[] }[] = [];
  const TRANSLATE_BATCH = 15;
  for (let i = 0; i < merged.length; i += TRANSLATE_BATCH) {
    const batch = merged.slice(i, i + TRANSLATE_BATCH);
    const t = await translateBatch(apiKey, batch);
    translations.push(...t);
    await new Promise((r) => setTimeout(r, 3000));
  }

  const final = merged.map((item, i) => ({
    cd: item.cd,
    track: item.track,
    taskType: guessTaskType(item.options),
    audioUrl: `${RELEASE_BASE}/cd${item.cd}-track${String(item.track).padStart(2, "0")}.mp3`,
    scenario: item.scenario,
    turns: item.turns,
    question: item.question,
    questionVi: translations[i]?.questionVi ?? "",
    options: item.options,
    optionsVi: translations[i]?.optionsVi ?? [],
    correctIndex: item.correctIndex,
    explanation: "",
  }));

  writeFileSync(OUT_FILE, JSON.stringify(final, null, 2) + "\n");
  console.log(`Wrote ${final.length} audio-transcribed questions -> ${OUT_FILE}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
