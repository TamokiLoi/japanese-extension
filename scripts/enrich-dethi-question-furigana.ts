// Repair JLPT exam question furigana without ever reconstructing an answer into
// the printed prompt. The source question is immutable; only ruby annotations
// are generated and then deterministically merged back into its exact text.
// API key and resumable cache stay in ignored local _scratch.
//
// Usage:
//   node --experimental-strip-types scripts/enrich-dethi-question-furigana.ts --dry-run
//   node --experimental-strip-types scripts/enrich-dethi-question-furigana.ts

import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { DeThiDataset, DeThiQuestion } from "../src/types/dethi.ts";

const ROOT = join(import.meta.dirname, "..");
const MODEL = "gemini-3.1-flash-lite";
const CACHE_VERSION = 1;
const DATA_FILES = ["src/data/dethi-n1-cac-nam.json", "src/data/dethi-n3-cac-nam.json"];
const CACHE_PATH = join(ROOT, `_scratch/dethi-question-furigana-cache-${MODEL}.json`);
const DELAY_MS = 4_300;
const BATCH_SIZE = 1;
const HAS_KANJI = /[\u3400-\u9fff々〆ヶ]/u;
const KANA_ONLY = /^[\u3041-\u3096\u30a1-\u30faー]+$/u;

interface SourceFile { path: string; data: DeThiDataset }
interface Target { id: string; file: string; question: DeThiQuestion; source: string }
interface Annotation { word: string; reading: string }
interface Enrichment { id: string; annotations: Annotation[] }
interface CacheEntry { version: number; source: string; annotations: Annotation[] }
type Cache = Record<string, CacheEntry>;

let lastGeminiRequestAt = 0;
let apiCallCount = 0;

function readApiKey(): string {
  const text = readFileSync(join(ROOT, "_scratch/.env.gemini"), "utf8");
  const match = text.match(/^GEMINI_API_KEY=(\S+)/m);
  if (!match) throw new Error("No GEMINI_API_KEY found in _scratch/.env.gemini");
  return match[1];
}

function writeJsonAtomic(path: string, data: unknown): void {
  const tempPath = `${path}.tmp`;
  writeFileSync(tempPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  renameSync(tempPath, path);
}

function loadCache(): Cache {
  if (!existsSync(CACHE_PATH)) return {};
  return JSON.parse(readFileSync(CACHE_PATH, "utf8")) as Cache;
}

function collectTargets(sources: SourceFile[]): Target[] {
  const targets: Target[] = [];
  for (const source of sources) {
    for (const exam of source.data.exams) {
      for (const paper of exam.papers) {
        for (const question of paper.questions) {
          const joined = question.questionFurigana?.map(({ text }) => text).join("");
          if (joined === question.question || !question.questionFurigana?.length) continue;
          targets.push({
            id: `${exam.id}/${paper.id}/q${question.number}`,
            file: source.path,
            question,
            source: question.question,
          });
        }
      }
    }
  }
  return targets;
}

function makePrompt(targets: Target[], correction?: string): string {
  return [
    "Bạn là biên tập viên tiếng Nhật tạo dữ liệu furigana cho đề JLPT.",
    "Trả về DUY NHẤT một JSON array đủ phần tử, đúng thứ tự và giữ nguyên id.",
    "Với từng source question, chỉ liệt kê các từ/cụm từ có kanji xuất hiện nguyên văn trong chính chuỗi đó theo đúng thứ tự; không chép lại, sửa, hoàn thiện hay đoán nội dung câu.",
    "Tuyệt đối không điền đáp án vào chỗ trống. Giữ nguyên mọi （ ）, ( ), ★, số thứ tự, dấu câu, ký hiệu và xuống dòng bằng cách KHÔNG đưa chúng vào annotations.",
    "Mỗi annotation phải có word là chuỗi con nguyên văn trong source question và reading chỉ gồm hiragana/katakana. Bao gồm okurigana trong word khi cần, ví dụ 食べて -> たべて; 鈴木さん -> すずきさん. Mọi chữ kanji thực sự có trong source đều phải được phủ bởi một annotation.",
    "Mỗi phần tử có đúng dạng {id, annotations:[{word,reading}]}.",
    correction ? `KẾT QUẢ TRƯỚC CHƯA HỢP LỆ: ${correction}. Sửa chỉ annotations; không thay đổi văn bản nguồn.` : "",
    JSON.stringify(targets.map(({ id, source }) => ({ id, sourceQuestion: source }))),
  ].filter(Boolean).join("\n");
}

function responseSchema() {
  return {
    type: "ARRAY",
    items: {
      type: "OBJECT",
      properties: {
        id: { type: "STRING" },
        annotations: {
          type: "ARRAY",
          items: {
            type: "OBJECT",
            properties: { word: { type: "STRING" }, reading: { type: "STRING" } },
            required: ["word", "reading"],
          },
        },
      },
      required: ["id", "annotations"],
    },
  };
}

async function sendGeminiJson(apiKey: string, prompt: string): Promise<unknown> {
  const waitMs = DELAY_MS - (Date.now() - lastGeminiRequestAt);
  if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs));
  lastGeminiRequestAt = Date.now();
  apiCallCount++;
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
    method: "POST",
    headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: "application/json", responseSchema: responseSchema(), temperature: 0.1 },
    }),
    signal: AbortSignal.timeout(90_000),
  });
  if (!response.ok) throw new Error(`Gemini HTTP ${response.status}: ${(await response.text()).slice(0, 500)}`);
  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error(`Gemini returned no JSON text: ${JSON.stringify(data).slice(0, 500)}`);
  return JSON.parse(text);
}

function buildSegments(target: Target, annotations: Annotation[]): { text: string; furigana: string | null }[] {
  let cursor = 0;
  const ranges: { start: number; end: number; reading: string }[] = [];
  for (const annotation of annotations) {
    if (!annotation || typeof annotation.word !== "string" || !annotation.word || typeof annotation.reading !== "string" || !KANA_ONLY.test(annotation.reading)) {
      throw new Error(`${target.id}: invalid furigana annotation`);
    }
    if (!HAS_KANJI.test(annotation.word)) throw new Error(`${target.id}: annotation does not contain kanji: ${annotation.word}`);
    const start = target.source.indexOf(annotation.word, cursor);
    if (start < 0) throw new Error(`${target.id}: annotation is not in exact source order: ${JSON.stringify(annotation.word)}`);
    const end = start + annotation.word.length;
    ranges.push({ start, end, reading: annotation.reading });
    cursor = end;
  }

  for (let index = 0; index < target.source.length; index++) {
    if (!HAS_KANJI.test(target.source[index])) continue;
    if (!ranges.some(({ start, end }) => index >= start && index < end)) {
      throw new Error(`${target.id}: missing kanji ${JSON.stringify(target.source[index])} at source offset ${index}, context=${JSON.stringify(target.source.slice(Math.max(0, index - 8), index + 10))}`);
    }
  }

  const segments: { text: string; furigana: string | null }[] = [];
  cursor = 0;
  for (const range of ranges) {
    if (range.start > cursor) segments.push({ text: target.source.slice(cursor, range.start), furigana: null });
    segments.push({ text: target.source.slice(range.start, range.end), furigana: range.reading });
    cursor = range.end;
  }
  if (cursor < target.source.length) segments.push({ text: target.source.slice(cursor), furigana: null });
  if (segments.map(({ text }) => text).join("") !== target.source) throw new Error(`${target.id}: furigana segments altered the exact source question`);
  return segments;
}

function validateBatch(result: unknown, targets: Target[]): Enrichment[] {
  if (!Array.isArray(result) || result.length !== targets.length) throw new Error(`Expected ${targets.length} annotations, got ${Array.isArray(result) ? result.length : "non-array"}`);
  return result.map((item, index) => {
    const target = targets[index];
    if (!item || typeof item !== "object") throw new Error(`Result ${index + 1} is not an object`);
    const candidate = item as Enrichment;
    if (candidate.id !== target.id) throw new Error(`Result ${index + 1}: expected ${target.id}, got ${candidate.id}`);
    if (!Array.isArray(candidate.annotations)) throw new Error(`${target.id}: annotations are missing`);
    buildSegments(target, candidate.annotations);
    return candidate;
  });
}

async function generateBatch(apiKey: string, targets: Target[]): Promise<Enrichment[]> {
  let correction: string | undefined;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      return validateBatch(await sendGeminiJson(apiKey, makePrompt(targets, correction)), targets);
    } catch (error) {
      correction = (error as Error).message;
      if (attempt === 3) throw error;
      console.warn(`  furigana validation/request attempt ${attempt} failed; retrying batch`);
    }
  }
  throw new Error("Unreachable furigana batch retry state");
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const force = process.argv.includes("--force");
  const sources = DATA_FILES.map((path) => ({ path, data: JSON.parse(readFileSync(join(ROOT, path), "utf8")) as DeThiDataset }));
  const targets = collectTargets(sources);
  const cache = existsSync(CACHE_PATH) ? JSON.parse(readFileSync(CACHE_PATH, "utf8")) as Cache : {};
  const pending = targets.filter((target) => force || cache[target.id]?.version !== CACHE_VERSION || cache[target.id]?.source !== target.source);
  console.log(`Mismatched question-furigana prompts: ${targets.length}; pending Gemini repairs: ${pending.length}`);
  if (dryRun) return;

  const apiKey = readApiKey();
  const generated = new Map<string, Enrichment>();
  for (let start = 0; start < pending.length; start += BATCH_SIZE) {
    const batch = pending.slice(start, start + BATCH_SIZE);
    const results = await generateBatch(apiKey, batch);
    results.forEach((result, index) => {
      const target = batch[index];
      cache[target.id] = { version: CACHE_VERSION, source: target.source, annotations: result.annotations };
      generated.set(target.id, result);
    });
    writeJsonAtomic(CACHE_PATH, cache);
    console.log(`Generated ${Math.min(start + batch.length, pending.length)}/${pending.length} prompts (${apiCallCount} Gemini requests)`);
  }

  let repairedCount = 0;
  for (const target of targets) {
    const cacheEntry = cache[target.id];
    const result = generated.get(target.id);
    if (!cacheEntry || cacheEntry.version !== CACHE_VERSION || cacheEntry.source !== target.source) continue;
    target.question.questionFurigana = buildSegments(target, result?.annotations ?? cacheEntry.annotations);
    repairedCount++;
  }
  const updatedPaths = new Set(targets.map(({ file }) => file));
  for (const source of sources) {
    if (updatedPaths.has(source.path)) writeJsonAtomic(join(ROOT, source.path), source.data);
  }
  console.log(`Repaired ${repairedCount}/${targets.length} exact-source question-furigana prompts.`);
}

main().catch((error) => {
  console.error((error as Error).stack ?? error);
  process.exitCode = 1;
});
