// Shin Kanzen Master's track numbering restarts per mini-section (confirmed:
// 32/34 same-{cd,track} groups have genuinely different content, not OCR
// duplication) -- so {cd,track} extracted from the page icon does NOT
// reliably identify which physical audio file a given item's dialogue
// actually plays. Resolves this properly instead of guessing: for every
// {cd,track} claimed by more than one candidate item, feeds Gemini the REAL
// audio file plus all candidates' dialogue text and asks which one(s) are
// actually spoken in it. Keeps only confirmed matches; ambiguous/unconfirmed
// candidates are dropped rather than risk shipping a wrong audio/answer pair.
//
// Usage: node --experimental-strip-types scripts/resolve-shinkanzen-track-conflicts.ts

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..");
const MODEL = "gemini-flash-lite-latest";
const AUDIO_DIR = join(ROOT, "assets/data/chou-kai/shinkanzen-audio-for-upload");
const IN_FILE = join(ROOT, "_scratch/shinkanzen-all-items.json");
const OUT_FILE = join(ROOT, "_scratch/shinkanzen-resolved.json");

function readApiKey(): string {
  const text = readFileSync(join(ROOT, "_scratch/.env.gemini"), "utf8");
  const match = text.match(/GEMINI_API_KEY=(\S+)/);
  if (!match) throw new Error("No GEMINI_API_KEY found");
  return match[1];
}

interface Item {
  cd: number;
  track: number;
  taskType: string;
  scenario: string;
  turns: { speaker: string; text: string }[];
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}

function trackFile(item: Item): string {
  return join(AUDIO_DIR, `cd${item.cd}-track${String(item.track).padStart(2, "0")}.mp3`);
}

async function resolveGroup(apiKey: string, key: string, candidates: Item[]): Promise<number[]> {
  const audioPath = trackFile(candidates[0]);
  if (!existsSync(audioPath)) return [];
  const audioData = readFileSync(audioPath).toString("base64");

  const prompt =
    `Đây là 1 file audio JLPT N3 聴解. Dưới đây là ${candidates.length} đoạn hội thoại/câu hỏi ỨNG VIÊN (trích từ sách, ` +
    `không chắc cái nào thực sự khớp với file audio này vì số track bị trùng khi OCR sách). Hãy NGHE audio và cho biết ` +
    `ứng viên nào (có thể là 1, nhiều, hoặc không cái nào) thực sự xuất hiện trong audio này -- audio có thể chứa nhiều đoạn ` +
    `hội thoại ngắn liên tiếp (dạng bài tập khởi động), nên có thể đúng nhiều hơn 1 ứng viên.\n\n` +
    candidates
      .map((c, i) => `Ứng viên ${i}: Bối cảnh: ${c.scenario}\nHội thoại: ${c.turns.map((t) => `${t.speaker}: ${t.text}`).join(" / ")}\nCâu hỏi: ${c.question}`)
      .join("\n\n") +
    `\n\nTrả lời DUY NHẤT 1 JSON array các số index (0-based) của những ứng viên THỰC SỰ xuất hiện trong audio, ví dụ [0] hoặc [1,2] hoặc [] nếu không cái nào khớp.`;

  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
    method: "POST",
    headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }, { inlineData: { mimeType: "audio/mpeg", data: audioData } }] }],
      generationConfig: { responseMimeType: "application/json", responseSchema: { type: "ARRAY", items: { type: "INTEGER" } } },
    }),
  });
  if (!res.ok) {
    console.warn(`  Gemini call failed for ${key}: HTTP ${res.status}`);
    return [];
  }
  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) return [];
  try {
    return JSON.parse(text);
  } catch {
    return [];
  }
}

async function main() {
  const apiKey = readApiKey();
  const all: Item[] = JSON.parse(readFileSync(IN_FILE, "utf8"));

  const byKey = new Map<string, Item[]>();
  for (const item of all) {
    const k = `${item.cd}-${item.track}`;
    if (!byKey.has(k)) byKey.set(k, []);
    byKey.get(k)!.push(item);
  }

  const resolved: Item[] = [];
  let groupNum = 0;
  const totalGroups = [...byKey.values()].filter((v) => v.length > 1).length;
  for (const [key, candidates] of byKey) {
    if (candidates.length === 1) {
      resolved.push(candidates[0]);
      continue;
    }
    groupNum++;
    console.log(`[${groupNum}/${totalGroups}] Resolving ${key} (${candidates.length} candidates)...`);
    const keepIndexes = await resolveGroup(apiKey, key, candidates);
    console.log(`  -> keeping indexes: ${JSON.stringify(keepIndexes)}`);
    for (const idx of keepIndexes) {
      if (candidates[idx]) resolved.push(candidates[idx]);
    }
    await new Promise((r) => setTimeout(r, 3000));
  }

  writeFileSync(OUT_FILE, JSON.stringify(resolved, null, 2) + "\n");
  console.log(`Resolved: ${resolved.length}/${all.length} items kept -> ${OUT_FILE}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
