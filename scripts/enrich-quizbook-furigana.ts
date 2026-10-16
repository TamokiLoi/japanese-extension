// Add optional exact-source furigana to quizbook question, option, and passage
// text. Gemini output is cached in ignored _scratch and merged only after strict
// validation; question text, IDs, choices, answers, and explanations are never
// edited by this script.
// Usage:
//   node --experimental-strip-types scripts/enrich-quizbook-furigana.ts --dry-run
//   node --experimental-strip-types scripts/enrich-quizbook-furigana.ts --level N3
//   node --experimental-strip-types scripts/enrich-quizbook-furigana.ts --level N3 --limit 24

import { existsSync, readFileSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ReadingBodySegment } from "../src/types/reading.ts";
import { normalizePeopleCounterReadings } from "./furiganaCounterReadings.ts";

const ROOT = join(import.meta.dirname, "..");
const MODEL = "gemini-3.5-flash-lite";
const CACHE_VERSION = 2;
const CACHE_PATH = join(ROOT, `_scratch/quizbook-furigana-cache-${MODEL}.json`);
const BATCH_SIZE = 12;
const CONCURRENCY = 6;
const DELAY_MS = 6_000;
const HAS_KANJI = /[\u3400-\u9fff々〆ヶ]/u;
const KANA_ONLY = /^[\u3041-\u3096\u30a1-\u30faー]+$/u;

interface Question {
  id: string; level: string; question: string; options: string[];
  questionFurigana?: ReadingBodySegment[]; optionsFurigana?: ReadingBodySegment[][];
  passage?: string; passageFurigana?: ReadingBodySegment[];
}
interface Dataset { questions: Question[] }
interface Source { path: string; data: Dataset }
interface Target { id: string; source: string; context: string; question: Question; field: "questionFurigana" | "passageFurigana" | "optionsFurigana"; optionIndex?: number }
interface Annotation { word: string; reading: string }
interface Enrichment { id: string; annotations: Annotation[] }
interface Entry { version: number; source: string; context?: string; segments: ReadingBodySegment[]; partialAnnotations?: Annotation[] }
interface CandidateTarget { target: Target; annotations: Annotation[] }
interface BatchValidation {
  accepted: { target: Target; entry: Entry }[];
  rejected: { target: CandidateTarget; error: string; annotations: Annotation[] }[];
}
type Cache = Record<string, Entry>;

const lastRequestAt = new Map<string, number>();
const unavailableKeys = new Set<string>();
let keyCursor = 0;

function hasCompleteFurigana(source: string | undefined, segments: ReadingBodySegment[] | undefined): boolean {
  if (!source || !segments?.length || segments.map(({ text }) => text).join("") !== source) return false;
  let cursor = 0;
  const covered = new Array<boolean>(source.length).fill(false);
  for (const segment of segments) {
    if (!segment || typeof segment.text !== "string" || segment.text !== source.slice(cursor, cursor + segment.text.length)) return false;
    if (segment.furigana !== null) {
      if (typeof segment.furigana !== "string" || !KANA_ONLY.test(segment.furigana) || !HAS_KANJI.test(segment.text)) return false;
      for (let index = cursor; index < cursor + segment.text.length; index++) covered[index] = true;
    }
    cursor += segment.text.length;
  }
  if (cursor !== source.length) return false;
  for (let index = 0; index < source.length; index++) {
    if (HAS_KANJI.test(source[index]) && !covered[index]) return false;
  }
  return true;
}

function readApiKeys(): string[] {
  const envPath = join(ROOT, "_scratch/.env.gemini");
  const keys = readFileSync(envPath, "utf8").split(/\r?\n/u).flatMap((line) => {
    const match = line.trim().match(/^GEMINI_API_KEY(?:_[A-Z0-9_]+)?=(.*)$/u);
    if (!match) return [];
    let key = match[1].trim();
    if ((key.startsWith('"') && key.endsWith('"')) || (key.startsWith("'") && key.endsWith("'"))) key = key.slice(1, -1);
    return key ? [key] : [];
  });
  if (!keys.length) throw new Error("No Gemini API keys found in _scratch/.env.gemini");
  return keys;
}

function writeJsonAtomic(path: string, data: unknown): void {
  const tempPath = `${path}.tmp`;
  writeFileSync(tempPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  renameSync(tempPath, path);
}

function buildSegments(target: Target, annotations: Annotation[]): ReadingBodySegment[] {
  annotations = normalizePeopleCounterReadings(target.source, annotations);
  let cursor = 0;
  const ranges: { start: number; end: number; reading: string }[] = [];
  for (const annotation of annotations) {
    if (!annotation || typeof annotation.word !== "string" || !annotation.word || typeof annotation.reading !== "string" || !KANA_ONLY.test(annotation.reading)) {
      throw new Error(`${target.id}: invalid annotation ${JSON.stringify(annotation)}`);
    }
    if (!HAS_KANJI.test(annotation.word)) throw new Error(`${target.id}: annotation has no kanji: ${JSON.stringify(annotation.word)}`);
    const start = target.source.indexOf(annotation.word, cursor);
    if (start < 0) throw new Error(`${target.id}: ${JSON.stringify(annotation.word)} is not an ordered source substring`);
    ranges.push({ start, end: start + annotation.word.length, reading: annotation.reading });
    cursor = start + annotation.word.length;
  }
  for (let index = 0; index < target.source.length; index++) {
    if (HAS_KANJI.test(target.source[index]) && !ranges.some((range) => index >= range.start && index < range.end)) {
      throw new Error(`${target.id}: missing reading for kanji ${JSON.stringify(target.source[index])} at offset ${index}`);
    }
  }
  const segments: ReadingBodySegment[] = [];
  cursor = 0;
  for (const range of ranges) {
    if (range.start > cursor) segments.push({ text: target.source.slice(cursor, range.start), furigana: null });
    segments.push({ text: target.source.slice(range.start, range.end), furigana: range.reading });
    cursor = range.end;
  }
  if (cursor < target.source.length) segments.push({ text: target.source.slice(cursor), furigana: null });
  if (segments.map(({ text }) => text).join("") !== target.source) throw new Error(`${target.id}: exact source reconstruction failed`);
  return segments;
}

function validPartialAnnotations(target: Target, input: unknown): Annotation[] {
  if (!Array.isArray(input)) return [];
  let cursor = 0;
  const valid: Annotation[] = [];
  for (const item of input) {
    if (!item || typeof item.word !== "string" || typeof item.reading !== "string" || !item.word ||
      !HAS_KANJI.test(item.word) || !KANA_ONLY.test(item.reading)) continue;
    const start = target.source.indexOf(item.word, cursor);
    if (start < 0) continue;
    valid.push({ word: item.word, reading: item.reading });
    cursor = start + item.word.length;
  }
  return valid;
}

function mergePartialAnnotations(target: Target, previous: Annotation[], input: unknown): Annotation[] {
  const toRanges = (items: Annotation[]) => {
    let cursor = 0;
    return items.flatMap((annotation) => {
      const start = target.source.indexOf(annotation.word, cursor);
      if (start < 0) return [];
      cursor = start + annotation.word.length;
      return [{ start, end: cursor, annotation }];
    });
  };
  const ranges = toRanges(validPartialAnnotations(target, previous));
  const incoming = Array.isArray(input) ? input.filter((item): item is Annotation =>
    Boolean(item && typeof item.word === "string" && item.word && HAS_KANJI.test(item.word) &&
      typeof item.reading === "string" && KANA_ONLY.test(item.reading)),
  ) : [];
  let cursor = 0;
  for (const annotation of incoming) {
    let searchFrom = cursor;
    while (searchFrom < target.source.length) {
      const start = target.source.indexOf(annotation.word, searchFrom);
      if (start < 0) break;
      const candidate = { start, end: start + annotation.word.length, annotation };
      const overlaps = ranges.filter((range) => candidate.start < range.end && candidate.end > range.start);
      let addsMissingKanji = false;
      for (let index = candidate.start; index < candidate.end; index++) {
        if (HAS_KANJI.test(target.source[index]) && !ranges.some((range) => index >= range.start && index < range.end)) addsMissingKanji = true;
      }
      const containsOverlaps = overlaps.every((range) => candidate.start <= range.start && candidate.end >= range.end);
      if (!overlaps.length || (addsMissingKanji && containsOverlaps)) {
        for (let index = ranges.length - 1; index >= 0; index--) {
          if (candidate.start < ranges[index].end && candidate.end > ranges[index].start) ranges.splice(index, 1);
        }
        ranges.push(candidate);
        cursor = candidate.end;
        break;
      }
      searchFrom = start + 1;
    }
  }
  return ranges.sort((a, b) => a.start - b.start).map(({ annotation }) => annotation);
}

function missingKanji(target: Target, annotations: Annotation[]): { position: number; character: string; context: string }[] {
  const ranges = toAnnotationRanges(target, annotations);
  const missing: { position: number; character: string; context: string }[] = [];
  for (let position = 0; position < target.source.length; position++) {
    const character = target.source[position];
    if (HAS_KANJI.test(character) && !ranges.some((range) => position >= range.start && position < range.end)) {
      missing.push({ position, character, context: target.source.slice(Math.max(0, position - 8), position + 10) });
    }
  }
  return missing;
}

function toAnnotationRanges(target: Target, annotations: Annotation[]): { start: number; end: number }[] {
  let cursor = 0;
  return validPartialAnnotations(target, annotations).flatMap((annotation) => {
    const start = target.source.indexOf(annotation.word, cursor);
    if (start < 0) return [];
    cursor = start + annotation.word.length;
    return [{ start, end: cursor }];
  });
}

function responseSchema() {
  return {
    type: "ARRAY",
    items: {
      type: "OBJECT",
      properties: {
        id: { type: "STRING" },
        annotations: { type: "ARRAY", items: { type: "OBJECT", properties: { word: { type: "STRING" }, reading: { type: "STRING" } }, required: ["word", "reading"] } },
      },
      required: ["id", "annotations"],
    },
  };
}

function promptFor(targets: CandidateTarget[], correction?: string): string {
  return [
    "Bạn tạo furigana cho dữ liệu câu hỏi JLPT. Trả DUY NHẤT JSON array đúng thứ tự và đủ ID.",
    "Mỗi sourceText có existingAnnotations đã được xác minh. Giữ nguyên và chỉ bổ sung những từ/cụm từ cần thiết để phủ các vị trí trong missing; không lặp annotation đã có. Chỉ dùng chuỗi con nguyên văn; không sửa, hoàn thiện hay thêm nội dung. Mọi câu, lựa chọn và đáp án gốc là dữ liệu bất biến.",
    "Bao phủ mọi ký tự kanji còn thiếu, gồm tên riêng, số đếm, okurigana (ví dụ 食べて -> たべて, 一つ -> ひとつ). Không đưa kana-only vào annotations. Reading chỉ bằng hiragana/katakana.",
    "Sibling text và passage chỉ làm ngữ cảnh để xác định cách đọc; không lấy từ đó làm annotation cho sourceText. Mỗi phần tử: {id, annotations:[{word,reading}]}.",
    correction ? `Kết quả trước không hợp lệ: ${correction}. Chỉ sửa annotations.` : "",
    JSON.stringify(targets.map(({ target, annotations }) => ({
      id: target.id, sourceText: target.source, sourceContext: target.context, existingAnnotations: annotations,
      missing: missingKanji(target, annotations),
    }))),
  ].filter(Boolean).join("\n");
}

async function sendGemini(apiKeys: string[], prompt: string): Promise<unknown> {
  let key: string | undefined;
  for (let attempt = 0; attempt < apiKeys.length; attempt++) {
    const candidate = apiKeys[keyCursor++ % apiKeys.length];
    if (!unavailableKeys.has(candidate)) { key = candidate; break; }
  }
  if (!key) throw new Error("No available Gemini key remains after failed requests");
  const wait = Math.max(0, (lastRequestAt.get(key) ?? 0) + DELAY_MS - Date.now());
  if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
  lastRequestAt.set(key, Date.now());
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
    method: "POST",
    headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseMimeType: "application/json", responseSchema: responseSchema(), temperature: 0.1 } }),
    signal: AbortSignal.timeout(90_000),
  });
  if (!response.ok) {
    if ([401, 403, 404].includes(response.status)) unavailableKeys.add(key);
    throw new Error(`Gemini HTTP ${response.status}: ${(await response.text()).slice(0, 400)}`);
  }
  const body = await response.json();
  const text = body.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Gemini returned no response text");
  return JSON.parse(text);
}

function validateBatch(result: unknown, targets: CandidateTarget[]): BatchValidation {
  const byId = new Map<string, unknown>();
  if (Array.isArray(result)) {
    for (const item of result) if (item && typeof item.id === "string") byId.set(item.id, item);
  }
  const accepted: BatchValidation["accepted"] = [];
  const rejected: BatchValidation["rejected"] = [];
  for (const candidateTarget of targets) {
    const { target } = candidateTarget;
    const item = byId.get(target.id) as Enrichment | undefined;
    if (!item || !Array.isArray(item.annotations)) {
      rejected.push({ target: candidateTarget, error: "missing/malformed item in JSON response", annotations: candidateTarget.annotations });
      continue;
    }
    const annotations = mergePartialAnnotations(target, candidateTarget.annotations, item.annotations);
    try {
      accepted.push({ target, entry: { version: CACHE_VERSION, source: target.source, context: target.context, segments: buildSegments(target, annotations) } });
    } catch (error) {
      rejected.push({ target: candidateTarget, error: `${(error as Error).message}; remaining=${JSON.stringify(missingKanji(target, annotations))}`, annotations });
    }
  }
  return { accepted, rejected };
}

async function processBatch(keys: string[], targets: CandidateTarget[]): Promise<{ accepted: BatchValidation["accepted"]; partial: { target: Target; annotations: Annotation[] }[]; failures: string[] }> {
  const accepted = new Map<string, BatchValidation["accepted"][number]>();
  let remaining = targets;
  let correction: string | undefined;
  for (let attempt = 1; attempt <= 4 && remaining.length; attempt++) {
    try {
      const result = validateBatch(await sendGemini(keys, promptFor(remaining, correction)), remaining);
      result.accepted.forEach((item) => accepted.set(item.target.id, item));
      remaining = result.rejected.map(({ target, annotations }) => ({ target: target.target, annotations }));
      if (!remaining.length) break;
      correction = result.rejected.map(({ target, error }) => `${target.target.id}: ${error}`).join("\n");
      console.warn(`Quiz-book furigana repair attempt ${attempt}: ${remaining.length}/${targets.length} field(s) remain invalid.`);
    }
    catch (error) {
      correction = (error as Error).message;
      if (attempt === 4) break;
      console.warn(`Quiz-book Gemini request attempt ${attempt} failed (${correction.slice(0, 180)}); retrying.`);
    }
  }
  return {
    accepted: [...accepted.values()],
    partial: remaining.map(({ target, annotations }) => ({ target, annotations })),
    failures: remaining.map(({ target }) => `${target.id}: ${correction ?? "furigana validation failed"}`),
  };
}

function isValidCacheEntry(target: Target, entry: Entry | undefined): entry is Entry {
  return !!entry && [1, CACHE_VERSION].includes(entry.version) && entry.source === target.source && hasCompleteFurigana(target.source, entry.segments);
}

function validCachedPartial(target: Target, entry: Entry | undefined): Annotation[] {
  return entry?.version === CACHE_VERSION && entry.source === target.source && entry.context === target.context
    ? validPartialAnnotations(target, entry.partialAnnotations)
    : [];
}

function collectTargets(sources: Source[], level?: string): Target[] {
  const targets: Target[] = [];
  for (const { path, data } of sources) for (const question of data.questions) {
    if (level && question.level !== level) continue;
    const context = JSON.stringify({ question: question.question, options: question.options, passage: question.passage ?? null });
    const add = (field: Target["field"], source: string | undefined, optionIndex?: number) => {
      if (!source || !HAS_KANJI.test(source)) return;
      const present = field === "questionFurigana" ? question.questionFurigana : field === "passageFurigana" ? question.passageFurigana : question.optionsFurigana?.[optionIndex!];
      if (hasCompleteFurigana(source, present)) return;
      targets.push({ id: `${path}/${question.id}/${field}${optionIndex === undefined ? "" : `/${optionIndex}`}`, source, context, question, field, optionIndex });
    };
    add("questionFurigana", question.question);
    add("passageFurigana", question.passage);
    question.options.forEach((option, index) => add("optionsFurigana", option, index));
  }
  return targets;
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const levelIndex = args.indexOf("--level");
  const level = levelIndex >= 0 ? args[levelIndex + 1] : undefined;
  if (levelIndex >= 0 && (!level || level.startsWith("--"))) throw new Error("--level must be followed by a level such as N3");
  const limitIndex = args.indexOf("--limit");
  const limit = limitIndex >= 0 ? Number(args[limitIndex + 1]) : undefined;
  if (limitIndex >= 0 && (!Number.isInteger(limit) || (limit ?? 0) < 1)) throw new Error("--limit must be a positive integer");
  const sourceFiles = readdirSync(join(ROOT, "src/data")).filter((name) => /^quizbook-.*\.json$/u.test(name)).sort();
  const sources = sourceFiles.map((name) => ({ path: `src/data/${name}`, data: JSON.parse(readFileSync(join(ROOT, "src/data", name), "utf8")) as Dataset }));
  const targets = collectTargets(sources, level);
  const cache: Cache = existsSync(CACHE_PATH) ? JSON.parse(readFileSync(CACHE_PATH, "utf8")) as Cache : {};
  const pending = targets.filter((target) => !isValidCacheEntry(target, cache[target.id]));
  const selected = limit ? pending.slice(0, limit) : pending;
  console.log(`Furigana targets${level ? ` at ${level}` : ""}: ${targets.length}; pending Gemini annotations: ${pending.length}; selected: ${selected.length}.`);
  if (dryRun || selected.length === 0) return;
  const keys = readApiKeys();
  const batchCount = Math.ceil(selected.length / BATCH_SIZE);
  const failures: string[] = [];
  for (let start = 0; start < selected.length; start += BATCH_SIZE * CONCURRENCY) {
    const batches = Array.from({ length: CONCURRENCY }, (_, index) => selected.slice(start + index * BATCH_SIZE, start + (index + 1) * BATCH_SIZE)
      .map((target) => ({ target, annotations: validCachedPartial(target, cache[target.id]) }))
    ).filter((batch) => batch.length);
    const settled = await Promise.allSettled(batches.map((batch) => processBatch(keys, batch)));
    const failed: string[] = [];
    settled.forEach((result, batchIndex) => {
      const batch = batches[batchIndex];
      if (result.status === "fulfilled") {
        result.value.accepted.forEach(({ target, entry }) => { cache[target.id] = entry; });
        result.value.partial.forEach(({ target, annotations }) => {
        if (annotations.length) cache[target.id] = { version: CACHE_VERSION, source: target.source, context: target.context, segments: [], partialAnnotations: annotations };
        });
        failures.push(...result.value.failures);
      } else failed.push(`${batch[0]?.target.id}: ${(result.reason as Error)?.message ?? String(result.reason)}`);
    });
    writeJsonAtomic(CACHE_PATH, cache);
    const completed = Math.min(start + batches.reduce((count, batch) => count + batch.length, 0), selected.length);
    console.log(`Cached ${completed}/${selected.length} annotations (${Math.ceil(completed / BATCH_SIZE)}/${batchCount} batches).`);
    failures.push(...failed);
  }
  for (const source of sources) {
    const fileTargets = targets.filter((target) => target.id.startsWith(`${source.path}/`));
    if (!fileTargets.length) continue;
    for (const target of fileTargets) {
      const entry = cache[target.id];
      if (!isValidCacheEntry(target, entry)) continue;
      if (target.field === "questionFurigana") target.question.questionFurigana = entry.segments;
      else if (target.field === "passageFurigana") target.question.passageFurigana = entry.segments;
      else {
        target.question.optionsFurigana ??= target.question.options.map((option) => [{ text: option, furigana: null }]);
        target.question.optionsFurigana[target.optionIndex!] = entry.segments;
      }
    }
    if (fileTargets.some((target) => isValidCacheEntry(target, cache[target.id]))) writeJsonAtomic(join(ROOT, source.path), source.data);
  }
  const applied = targets.filter((target) => isValidCacheEntry(target, cache[target.id])).length;
  console.log(`Applied cached furigana to ${applied} target fields.`);
  if (failures.length) {
    console.error(`${failures.length} quiz-book field(s) remain unannotated; successful exact-source annotations were applied:`);
    for (const failure of failures.slice(0, 40)) console.error(`- ${failure}`);
    if (failures.length > 40) console.error(`... ${failures.length - 40} more`);
    process.exitCode = 1;
  }
}

main().catch((error) => { console.error((error as Error).stack ?? error); process.exitCode = 1; });
