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
import { enrichmentQuestionId } from "./jlptEnrichmentIds.ts";

const ROOT = join(import.meta.dirname, "..");
const MODEL = "gemini-3.5-flash-lite";
const CACHE_VERSION = 1;
const DATA_FILES = ["src/data/dethi-n1-cac-nam.json", "src/data/dethi-n3-cac-nam.json", "src/data/de-n3-set-01.json", "src/data/de-n3-set-02.json", "src/data/de-n3-set-03.json", "src/data/de-n3-set-04.json", "src/data/de-n3-set-05.json", "src/data/de-n3-set-06.json", "src/data/de-n3-set-07.json", "src/data/de-n3-set-08.json", "src/data/de-n3-set-09.json", "src/data/de-n3-set-10.json"];
const CACHE_PATH = join(ROOT, `_scratch/dethi-question-furigana-cache-${MODEL}.json`);
const DELAY_MS = 6_000;
const CONCURRENCY = 1;
const HAS_KANJI = /[\u3400-\u9fff々〆ヶ]/u;
const KANA_ONLY = /^[\u3041-\u3096\u30a1-\u30faー]+$/u;

interface SourceFile { path: string; data: DeThiDataset }
interface Target { id: string; file: string; question: DeThiQuestion; source: string }
interface Annotation { word: string; reading: string }
interface Enrichment { id: string; annotations: Annotation[] }
interface CacheEntry { version: number; source: string; annotations: Annotation[] }
type Cache = Record<string, CacheEntry>;

const lastGeminiRequestAt = new Map<string, number>();
const unavailableApiKeys = new Set<string>();
let apiCallCount = 0;
let apiKeyCursor = 0;

function readApiKeys(): string[] {
  const text = readFileSync(join(ROOT, "_scratch/.env.gemini"), "utf8");
  const keys = text.split(/\r?\n/u).flatMap((line) => {
    const match = line.trim().match(/^GEMINI_API_KEY(?:_[A-Z0-9_]+)?=(.*)$/u);
    if (!match) return [];
    let value = match[1].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    return value ? [value] : [];
  });
  if (!keys.length) throw new Error("No Gemini API keys found in _scratch/.env.gemini");
  return keys;
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
          if (joined === question.question) continue;
          targets.push({
            id: enrichmentQuestionId(exam.id, paper, question),
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
    "Với từng source question, chỉ liệt kê các từ/cụm từ có kanji xuất hiện nguyên văn trong chính chuỗi đó theo đúng thứ tự; không chép lại, sửa, hoàn thiện hay đoán nội dung câu. Không biến kana như ほか thành kanji 他.",
    "Tuyệt đối không điền đáp án vào chỗ trống. Giữ nguyên mọi （ ）, ( ), ★, số thứ tự, dấu câu, ký hiệu và xuống dòng bằng cách KHÔNG đưa chúng vào annotations.",
    "Mỗi annotation phải có word là chuỗi con nguyên văn trong source question và reading chỉ gồm hiragana/katakana. Bao gồm okurigana trong word khi cần, ví dụ 食べて -> たべて; 鈴木さん -> すずきさん; 一つ -> ひとつ; 最も -> もっとも. Mọi chữ kanji thực sự có trong source đều phải được phủ bởi một annotation, kể cả kanji trong số đếm như 一つ dù xung quanh có số lựa chọn 1・2・3・4.",
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

async function sendGeminiJson(apiKeys: string[], prompt: string): Promise<unknown> {
  let apiKey: string | undefined;
  for (let attempt = 0; attempt < apiKeys.length; attempt++) {
    const candidate = apiKeys[apiKeyCursor % apiKeys.length];
    apiKeyCursor++;
    if (!unavailableApiKeys.has(candidate)) { apiKey = candidate; break; }
  }
  if (!apiKey) throw new Error("No available Gemini keys remain after authorization failures");
  const now = Date.now();
  const scheduledAt = Math.max(now, (lastGeminiRequestAt.get(apiKey) ?? 0) + DELAY_MS);
  lastGeminiRequestAt.set(apiKey, scheduledAt);
  const waitMs = scheduledAt - now;
  if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs));
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
  if (!response.ok) {
    const details = (await response.text()).slice(0, 500);
    // Skip this key for the rest of the run after any failed request. The key
    // rotation can otherwise repeatedly land on a temporarily unavailable key
    // and exhaust retries before reaching healthy configured keys.
    unavailableApiKeys.add(apiKey);
    throw new Error(`Gemini HTTP ${response.status}: ${details}`);
  }
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
      throw new Error(`${target.id}: invalid furigana annotation ${JSON.stringify(annotation)}`);
    }
    if (!HAS_KANJI.test(annotation.word)) throw new Error(`${target.id}: annotation does not contain kanji: ${JSON.stringify(annotation)}`);
    const start = target.source.indexOf(annotation.word, cursor);
    // Discard hallucinated or duplicate annotations; the strict coverage check
    // below still rejects any source kanji that the remaining entries miss.
    if (start < 0) continue;
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

function repairKnownReadings(target: Target, annotations: Annotation[]): Annotation[] {
  // Gemini occasionally omits common, context-stable words even after strict
  // correction. Preserve their exact spans before the kanji-coverage check.
  const knownReadings = [
    { word: "一つ", reading: "ひとつ" },
    { word: "申し込み", reading: "もうしこみ" },
    { word: "引っ越し", reading: "ひっこし" },
    { word: "メモ帳", reading: "めもちょう" },
    { word: "レジ袋", reading: "れじぶくろ" },
    { word: "今から", reading: "いまから" },
    { word: "ケーキ屋", reading: "けーきや" },
    { word: "人は", reading: "ひとは" },
    // The counter 個 is consistently read こ in these printed N3 prompts.
    { word: "個", reading: "こ" },
    { word: "番", reading: "ばん" },
    { word: "振り込まなければ", reading: "ふりこまなければ" },
    { word: "13日", reading: "じゅうさんにち" },
    { word: "15日", reading: "じゅうごにち" },
  ];
  const positioned: { start: number; end: number; annotation: Annotation }[] = [];
  let cursor = 0;
  for (const annotation of annotations) {
    if (!annotation || typeof annotation.word !== "string" || !annotation.word) {
      continue;
    }
    // Ignore kana-only fragments from model output (for example, しい from
    // 新しい). The strict source-kanji coverage check below still requires
    // the actual kanji span and its reading to be supplied.
    if (!HAS_KANJI.test(annotation.word)) continue;
    const start = target.source.indexOf(annotation.word, cursor);
    if (start < 0) continue;
    const end = start + annotation.word.length;
    positioned.push({ start, end, annotation });
    cursor = end;
  }

  for (const known of knownReadings) {
    let searchFrom = 0;
    while (true) {
      const start = target.source.indexOf(known.word, searchFrom);
      if (start < 0) break;
      const end = start + known.word.length;
      const hasUncoveredKanji = Array.from({ length: known.word.length }, (_, offset) => start + offset)
        .some((index) => HAS_KANJI.test(target.source[index]) && !positioned.some((range) => index >= range.start && index < range.end));
      if (hasUncoveredKanji) {
        for (let index = positioned.length - 1; index >= 0; index--) {
          if (positioned[index].start < end && positioned[index].end > start) positioned.splice(index, 1);
        }
        positioned.push({ start, end, annotation: known });
      }
      searchFrom = start + 1;
    }
  }
  return positioned.sort((left, right) => left.start - right.start).map(({ annotation }) => annotation);
}

function validateBatch(result: unknown, targets: Target[]): Enrichment[] {
  if (!Array.isArray(result) || result.length !== targets.length) throw new Error(`Expected ${targets.length} annotations, got ${Array.isArray(result) ? result.length : "non-array"}`);
  return result.map((item, index) => {
    const target = targets[index];
    if (!item || typeof item !== "object") throw new Error(`Result ${index + 1} is not an object`);
    const candidate = item as Enrichment;
    if (candidate.id !== target.id) throw new Error(`Result ${index + 1}: expected ${target.id}, got ${candidate.id}`);
    if (!Array.isArray(candidate.annotations)) throw new Error(`${target.id}: annotations are missing`);
    candidate.annotations = repairKnownReadings(target, candidate.annotations);
    buildSegments(target, candidate.annotations);
    return candidate;
  });
}

async function generateBatch(apiKeys: string[], targets: Target[]): Promise<Enrichment[]> {
  let correction: string | undefined;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      return validateBatch(await sendGeminiJson(apiKeys, makePrompt(targets, correction)), targets);
    } catch (error) {
      correction = (error as Error).message;
      if (attempt === 4) throw error;
      console.warn(`  furigana validation/request attempt ${attempt} failed; retrying batch`);
      await new Promise((resolve) => setTimeout(resolve, Math.min(1_500 * attempt, 5_000)));
    }
  }
  throw new Error("Unreachable furigana batch retry state");
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const force = args.includes("--force");
  const setIndex = args.indexOf("--set");
  const setNumber = setIndex >= 0 ? args[setIndex + 1] : undefined;
  if (setIndex >= 0 && (!setNumber || !/^\d{2}$/u.test(setNumber))) throw new Error("--set must be a two-digit collection number");
  const idsIndex = args.indexOf("--ids");
  const ids = idsIndex >= 0 ? args[idsIndex + 1]?.split(",").filter(Boolean) : undefined;
  if (idsIndex >= 0 && (!ids?.length || ids.some((id) => id.startsWith("--")))) throw new Error("--ids must be followed by comma-separated stable question IDs");
  const sources = DATA_FILES.map((path) => ({ path, data: JSON.parse(readFileSync(join(ROOT, path), "utf8")) as DeThiDataset }));
  const allTargets = collectTargets(sources);
  const setTargets = setNumber ? allTargets.filter((target) => target.id.startsWith(`de-n3-${setNumber}/`)) : allTargets;
  const targets = ids ? setTargets.filter((target) => ids.includes(target.id)) : setTargets;
  const missingIds = ids?.filter((id) => !targets.some((target) => target.id === id));
  if (missingIds?.length) throw new Error(`No question-furigana target found for ID(s): ${missingIds.join(", ")}`);
  const cache = existsSync(CACHE_PATH) ? JSON.parse(readFileSync(CACHE_PATH, "utf8")) as Cache : {};
  const pending = targets.filter((target) => force || cache[target.id]?.version !== CACHE_VERSION || cache[target.id]?.source !== target.source);
  console.log(`Mismatched question-furigana prompts: ${targets.length}; pending Gemini repairs: ${pending.length}`);
  if (dryRun) return;

  const apiKeys = readApiKeys();
  const generated = new Map<string, Enrichment>();
  for (let start = 0; start < pending.length; start += CONCURRENCY) {
    const batch = pending.slice(start, start + CONCURRENCY);
    const settled = await Promise.allSettled(batch.map(async (target) => (await generateBatch(apiKeys, [target]))[0]));
    let completed = 0;
    settled.forEach((result, index) => {
      if (result.status !== "fulfilled") return;
      const target = batch[index];
      cache[target.id] = { version: CACHE_VERSION, source: target.source, annotations: result.value.annotations };
      generated.set(target.id, result.value);
      completed++;
    });
    writeJsonAtomic(CACHE_PATH, cache);
    console.log(`Generated ${Math.min(start + completed, pending.length)}/${pending.length} prompts (${apiCallCount} Gemini requests)`);
    const failedIndex = settled.findIndex((result) => result.status === "rejected");
    if (failedIndex >= 0) throw (settled[failedIndex] as PromiseRejectedResult).reason;
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
