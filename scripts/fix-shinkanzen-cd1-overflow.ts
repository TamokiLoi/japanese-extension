// CD1 only has 53 real tracks, but several extracted items reference
// "cd1-trackNN" with NN in the 60s-80s -- clearly a disc mislabel (this
// book's 模擬試験 mock-test section is on CD2, and the disc icon got
// misread). Remaps cd1->cd2 for any item with track > 53, re-verifies
// against the real audio (same "does this audio contain this dialogue"
// check as verify-shinkanzen-final.ts), and merges confirmed ones back in.
// Also fixes verify-shinkanzen-final.ts's own bug where an all-missing
// batch silently skipped adding its items to the bad-id set at all.
//
// Usage: node --experimental-strip-types scripts/fix-shinkanzen-cd1-overflow.ts

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..");
const MODEL = "gemini-flash-lite-latest";
const AUDIO_DIR = join(ROOT, "assets/data/chou-kai/shinkanzen-audio-for-upload");
const RELEASE_BASE = "https://github.com/TamokiLoi/japanese-extension/releases/download/audio-choukai-shinkanzen-v1";
const DATA_FILE = join(ROOT, "src/data/listening-shinkanzen-n3.json");
const ORIGINAL_93_FILE = join(ROOT, "_scratch/shinkanzen-original-93.json");
const CD1_MAX_TRACK = 53;

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
  [key: string]: unknown;
}

function parseTrack(audioUrl: string): { cd: number; track: number } {
  const m = audioUrl.match(/cd(\d)-track(\d+)\.mp3/)!;
  return { cd: Number(m[1]), track: Number(m[2]) };
}

function fileFor(cd: number, track: number): string {
  return join(AUDIO_DIR, `cd${cd}-track${String(track).padStart(2, "0")}.mp3`);
}

async function checkBatch(apiKey: string, items: Question[]): Promise<Map<string, boolean>> {
  const parts: object[] = [
    {
      text:
        `Dưới đây là ${items.length} cặp (audio, đoạn hội thoại trích từ sách). Với MỖI cặp, nghe file audio tương ứng và xác nhận ` +
        `xem đoạn hội thoại/câu hỏi có TRỰC TIẾP xuất hiện trong audio đó không.\n\n`,
    },
  ];
  for (const [i, it] of items.entries()) {
    const { cd, track } = parseTrack(it.audioUrl);
    parts.push({
      text: `Cặp ${i + 1} [id=${it.id}]: Bối cảnh: ${it.scenario}\nHội thoại: ${it.turns.map((t) => `${t.speaker}: ${t.text}`).join(" / ")}\nCâu hỏi: ${it.question}`,
    });
    parts.push({ inlineData: { mimeType: "audio/mpeg", data: readFileSync(fileFor(cd, track)).toString("base64") } });
  }
  parts.push({ text: `\nTrả lời DUY NHẤT 1 JSON array cùng thứ tự, mỗi phần tử {"id": "...", "matches": true|false}.` });

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
  const parsed: { id: string; matches: boolean }[] = JSON.parse(text);
  return new Map(parsed.map((p) => [p.id, p.matches]));
}

async function main() {
  const apiKey = readApiKey();
  const current = JSON.parse(readFileSync(DATA_FILE, "utf8"));
  const original = JSON.parse(readFileSync(ORIGINAL_93_FILE, "utf8"));

  const currentIds = new Set(current.questions.map((q: Question) => q.id));
  // Union: items currently shipped (may include the overflow bug) + items
  // dropped earlier that also had the overflow pattern -- both need the
  // cd1->cd2 remap attempt.
  const candidates: Question[] = [
    ...current.questions,
    ...original.questions.filter((q: Question) => !currentIds.has(q.id)),
  ];

  const overflow = candidates.filter((q) => {
    const { cd, track } = parseTrack(q.audioUrl);
    return cd === 1 && track > CD1_MAX_TRACK;
  });
  console.log(`${overflow.length} items reference cd1 track > ${CD1_MAX_TRACK} -- remapping to cd2 and re-verifying...`);

  const remapped = overflow.map((q) => {
    const { track } = parseTrack(q.audioUrl);
    return { ...q, audioUrl: `${RELEASE_BASE}/cd2-track${String(track).padStart(2, "0")}.mp3` };
  });

  const stillMissing = remapped.filter((q) => !existsSync(fileFor(...(Object.values(parseTrack(q.audioUrl)) as [number, number]))));
  if (stillMissing.length > 0) console.log(`  still no file after remap: ${stillMissing.map((q) => q.id).join(", ")}`);
  const toVerify = remapped.filter((q) => existsSync(fileFor(...(Object.values(parseTrack(q.audioUrl)) as [number, number]))));

  const confirmed: Question[] = [];
  const BATCH = 6;
  for (let i = 0; i < toVerify.length; i += BATCH) {
    const batch = toVerify.slice(i, i + BATCH);
    console.log(`Verifying remapped ${batch.map((b) => b.id).join(", ")}...`);
    const results = await checkBatch(apiKey, batch);
    for (const item of batch) {
      if (results.get(item.id)) confirmed.push(item);
      else console.log(`  NOT confirmed after remap: ${item.id}`);
    }
    await new Promise((r) => setTimeout(r, 3000));
  }

  // Rebuild final dataset: keep current items that were NOT part of the
  // overflow set untouched, replace/add confirmed remapped ones, drop the
  // rest (both original overflow entries and any that failed remap+verify).
  const overflowIds = new Set(overflow.map((q) => q.id));
  const untouched = current.questions.filter((q: Question) => !overflowIds.has(q.id));
  const finalQuestions = [...untouched, ...confirmed];

  current.questions = finalQuestions;
  writeFileSync(DATA_FILE, JSON.stringify(current, null, 2) + "\n");
  console.log(`Recovered ${confirmed.length}/${overflow.length} overflow items via cd2 remap.`);
  console.log(`Final: ${finalQuestions.length} questions -> ${DATA_FILE}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
