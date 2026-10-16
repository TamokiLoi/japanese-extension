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
import { normalizePeopleCounterReadings } from "./furiganaCounterReadings.ts";

const ROOT = join(import.meta.dirname, "..");
const MODEL = "gemini-3.5-flash-lite";
const CACHE_VERSION = 2;
const DATA_FILES = ["src/data/dethi-n1-cac-nam.json", "src/data/dethi-n3-cac-nam.json", "src/data/de-n3-set-01.json", "src/data/de-n3-set-02.json", "src/data/de-n3-set-03.json", "src/data/de-n3-set-04.json", "src/data/de-n3-set-05.json", "src/data/de-n3-set-06.json", "src/data/de-n3-set-07.json", "src/data/de-n3-set-08.json", "src/data/de-n3-set-09.json", "src/data/de-n3-set-10.json"];
const CACHE_PATH = join(ROOT, `_scratch/dethi-question-furigana-cache-${MODEL}.json`);
const DELAY_MS = 6_000;
const BATCH_SIZE = 8;
const CONCURRENCY = 6;
const HAS_KANJI = /[\u3400-\u9fff々〆ヶ]/u;
const KANA_ONLY = /^[\u3041-\u3096\u30a1-\u30faー]+$/u;

interface SourceFile { path: string; data: DeThiDataset }
interface Target { id: string; file: string; question: DeThiQuestion; source: string; context: string; slot: "question" | "option"; optionIndex?: number }
interface Annotation { word: string; reading: string }
interface Enrichment { id: string; annotations: Annotation[] }
interface CacheEntry { version: number; source: string; context?: string; annotations: Annotation[]; partial?: boolean }
interface CandidateTarget { target: Target; annotations: Annotation[] }
interface BatchValidation {
  accepted: Enrichment[];
  rejected: { target: CandidateTarget; error: string; annotations: Annotation[] }[];
}
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

function hasValidFurigana(source: string, segments: { text: string; furigana: string | null }[] | undefined): boolean {
  if (!segments?.length || segments.map(({ text }) => text).join("") !== source) return false;
  if (segments.some(({ text, furigana }) => furigana && (text.length > 20 || /[\s、。！？!?・,，.（）()「」『』【】\n\r]/u.test(text)))) return false;
  try {
    buildSegments({ id: "furigana-validation", file: "", question: {} as DeThiQuestion, source, context: "", slot: "question" }, segments.flatMap(({ text, furigana }) =>
      furigana && HAS_KANJI.test(text) ? [{ word: text, reading: furigana }] : [],
    ));
    return true;
  } catch {
    return false;
  }
}

function collectTargets(sources: SourceFile[]): Target[] {
  const targets: Target[] = [];
  for (const source of sources) {
    for (const exam of source.data.exams) {
      for (const paper of exam.papers) {
        for (const question of paper.questions) {
          const questionId = enrichmentQuestionId(exam.id, paper, question);
          const context = JSON.stringify({ question: question.question, passage: question.passage ?? "", options: question.options });
          if (HAS_KANJI.test(question.question) && !hasValidFurigana(question.question, question.questionFurigana)) {
            targets.push({ id: questionId, file: source.path, question, source: question.question, context, slot: "question" });
          }
          question.options.forEach((option, optionIndex) => {
            if (!HAS_KANJI.test(option) || hasValidFurigana(option, question.optionsFurigana?.[optionIndex])) return;
            targets.push({ id: `${questionId}/option-${optionIndex + 1}`, file: source.path, question, source: option, context, slot: "option", optionIndex });
          });
        }
      }
    }
  }
  return targets;
}

function makePrompt(targets: CandidateTarget[], correction?: string): string {
  return [
    "Bạn là biên tập viên tiếng Nhật tạo dữ liệu furigana cho đề JLPT.",
    "Trả về DUY NHẤT một JSON array đủ phần tử, đúng thứ tự và giữ nguyên id.",
    "Mỗi source text có existingAnnotations đã được xác minh. Giữ nguyên chúng và chỉ bổ sung từ/cụm từ cần thiết để phủ các vị trí trong missing; không lặp annotation đã có. Chỉ dùng chuỗi con nguyên văn; không chép lại, sửa, hoàn thiện hay đoán nội dung câu. Không biến kana như ほか thành kanji 他.",
    "Tuyệt đối không điền đáp án vào chỗ trống. Giữ nguyên mọi （ ）, ( ), ★, số thứ tự, dấu câu, ký hiệu và xuống dòng bằng cách KHÔNG đưa chúng vào annotations.",
    "Mỗi annotation phải có word là chuỗi con nguyên văn trong source question và reading chỉ gồm hiragana/katakana. Bao gồm okurigana trong word khi cần, ví dụ 食べて -> たべて; 鈴木さん -> すずきさん; 一つ -> ひとつ; 最も -> もっとも. Chỉ tập trung phủ các kanji còn thiếu được liệt kê.",
    "Mỗi phần tử có đúng dạng {id, annotations:[{word,reading}]}.",
    correction ? `KẾT QUẢ TRƯỚC CHƯA HỢP LỆ: ${correction}. Sửa chỉ annotations; không thay đổi văn bản nguồn.` : "",
    JSON.stringify(targets.map(({ target, annotations }) => ({
      id: target.id, slot: target.slot, questionContext: target.question.question, passageContext: target.question.passage ?? "",
      sourceText: target.source, existingAnnotations: annotations, missing: missingKanji(target, annotations),
    }))),
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
    if ([401, 403, 404].includes(response.status)) unavailableApiKeys.add(apiKey);
    throw new Error(`Gemini HTTP ${response.status}: ${details}`);
  }
  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error(`Gemini returned no JSON text: ${JSON.stringify(data).slice(0, 500)}`);
  return JSON.parse(text);
}

function buildSegments(target: Target, annotations: Annotation[]): { text: string; furigana: string | null }[] {
  annotations = normalizePeopleCounterReadings(target.source, annotations);
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

function isValidCacheEntry(target: Target, entry: CacheEntry | undefined): entry is CacheEntry {
  if (!entry || ![1, CACHE_VERSION].includes(entry.version) || entry.source !== target.source || !Array.isArray(entry.annotations)) return false;
  try { buildSegments(target, entry.annotations); return true; }
  catch { return false; }
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
  return repairKnownReadings(target, ranges.sort((a, b) => a.start - b.start).map(({ annotation }) => annotation));
}

function missingKanji(target: Target, annotations: Annotation[]): { position: number; character: string; context: string }[] {
  const ranges = (() => {
    let cursor = 0;
    return validPartialAnnotations(target, annotations).flatMap((annotation) => {
      const start = target.source.indexOf(annotation.word, cursor);
      if (start < 0) return [];
      cursor = start + annotation.word.length;
      return [{ start, end: cursor }];
    });
  })();
  const missing: { position: number; character: string; context: string }[] = [];
  for (let position = 0; position < target.source.length; position++) {
    const character = target.source[position];
    if (HAS_KANJI.test(character) && !ranges.some((range) => position >= range.start && position < range.end)) {
      missing.push({ position, character, context: target.source.slice(Math.max(0, position - 8), position + 10) });
    }
  }
  return missing;
}

function validCachedPartial(target: Target, entry: CacheEntry | undefined): Annotation[] {
  return entry?.version === CACHE_VERSION && entry.source === target.source && entry.context === target.context
    ? validPartialAnnotations(target, entry.annotations)
    : [];
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

function validateBatch(result: unknown, targets: CandidateTarget[]): BatchValidation {
  const byId = new Map<string, unknown>();
  if (Array.isArray(result)) for (const item of result) if (item && typeof (item as Enrichment).id === "string") byId.set((item as Enrichment).id, item);
  const accepted: Enrichment[] = [];
  const rejected: BatchValidation["rejected"] = [];
  for (const candidateTarget of targets) {
    const { target } = candidateTarget;
    const item = byId.get(target.id);
    if (!item || typeof item !== "object" || !Array.isArray((item as Enrichment).annotations)) {
      rejected.push({ target: candidateTarget, error: "missing/malformed item in JSON response", annotations: candidateTarget.annotations });
      continue;
    }
    const candidate = item as Enrichment;
    const annotations = mergePartialAnnotations(target, candidateTarget.annotations, candidate.annotations);
    try {
      buildSegments(target, annotations);
      accepted.push({ id: target.id, annotations });
    } catch (error) {
      rejected.push({ target: candidateTarget, error: `${(error as Error).message}; remaining=${JSON.stringify(missingKanji(target, annotations))}`, annotations });
    }
  }
  return { accepted, rejected };
}

async function generateBatch(apiKeys: string[], targets: CandidateTarget[]): Promise<{ accepted: Enrichment[]; partial: { target: Target; annotations: Annotation[] }[]; failures: string[] }> {
  const accepted = new Map<string, Enrichment>();
  let remaining = targets;
  let correction: string | undefined;
  for (let attempt = 1; attempt <= 4 && remaining.length; attempt++) {
    try {
      const result = validateBatch(await sendGeminiJson(apiKeys, makePrompt(remaining, correction)), remaining);
      result.accepted.forEach((item) => accepted.set(item.id, item));
      remaining = result.rejected.map(({ target, annotations }) => ({ target: target.target, annotations }));
      if (!remaining.length) break;
      correction = result.rejected.map(({ target, error }) => `${target.target.id}: ${error}`).join("\n");
      console.warn(`JLPT question furigana repair attempt ${attempt}: ${remaining.length}/${targets.length} field(s) remain invalid.`);
    } catch (error) {
      correction = (error as Error).message;
      if (attempt === 4) break;
      console.warn(`  furigana validation/request attempt ${attempt} failed; retrying batch`);
      await new Promise((resolve) => setTimeout(resolve, Math.min(1_500 * attempt, 5_000)));
    }
  }
  return {
    accepted: [...accepted.values()],
    partial: remaining.map(({ target, annotations }) => ({ target, annotations })),
    failures: remaining.map(({ target }) => `${target.id}: ${correction ?? "furigana validation failed"}`),
  };
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const levelIndex = args.indexOf("--level");
  const level = levelIndex >= 0 ? args[levelIndex + 1] : undefined;
  if (levelIndex >= 0 && !["N3", "N1"].includes(level ?? "")) throw new Error("--level must be N3 or N1");
  const limitIndex = args.indexOf("--limit");
  const limit = limitIndex >= 0 ? Number(args[limitIndex + 1]) : undefined;
  if (limitIndex >= 0 && (!Number.isInteger(limit) || (limit ?? 0) < 1)) throw new Error("--limit must be a positive number");
  const force = args.includes("--force");
  const setIndex = args.indexOf("--set");
  const setNumber = setIndex >= 0 ? args[setIndex + 1] : undefined;
  if (setIndex >= 0 && (!setNumber || !/^\d{2}$/u.test(setNumber))) throw new Error("--set must be a two-digit collection number");
  const idsIndex = args.indexOf("--ids");
  const ids = idsIndex >= 0 ? args[idsIndex + 1]?.split(",").filter(Boolean) : undefined;
  if (idsIndex >= 0 && (!ids?.length || ids.some((id) => id.startsWith("--")))) throw new Error("--ids must be followed by comma-separated stable question IDs");
  const sources = DATA_FILES.map((path) => ({ path, data: JSON.parse(readFileSync(join(ROOT, path), "utf8")) as DeThiDataset }))
    .filter((source) => !level || source.data.meta.level === level);
  const allTargets = collectTargets(sources);
  const setTargets = setNumber ? allTargets.filter((target) => target.id.startsWith(`de-n3-${setNumber}/`)) : allTargets;
  const targets = ids ? setTargets.filter((target) => ids.includes(target.id)) : setTargets;
  const missingIds = ids?.filter((id) => !targets.some((target) => target.id === id));
  if (missingIds?.length) throw new Error(`No question-furigana target found for ID(s): ${missingIds.join(", ")}`);
  const cache = existsSync(CACHE_PATH) ? JSON.parse(readFileSync(CACHE_PATH, "utf8")) as Cache : {};
  const pending = targets.filter((target) => force || !isValidCacheEntry(target, cache[target.id]));
  const questionTargets = targets.filter((target) => target.slot === "question").length;
  const optionTargets = targets.length - questionTargets;
  console.log(`JLPT exact-source furigana targets (${level ?? "all"}): ${targets.length} total (${questionTargets} prompts, ${optionTargets} options); pending Gemini repairs: ${pending.length}`);
  if (dryRun) return;

  const apiKeys = readApiKeys();
  const generated = new Map<string, Enrichment>();
  const runTargets = limit ? pending.slice(0, limit) : pending;
  const runFailures: string[] = [];
  for (let start = 0; start < runTargets.length; start += BATCH_SIZE * CONCURRENCY) {
    const batches = Array.from({ length: CONCURRENCY }, (_, index) => runTargets.slice(start + index * BATCH_SIZE, start + (index + 1) * BATCH_SIZE)
      .map((target) => ({ target, annotations: validCachedPartial(target, cache[target.id]) }))
    ).filter((batch) => batch.length);
    const settled = await Promise.allSettled(batches.map((batch) => generateBatch(apiKeys, batch)));
    let completed = 0;
    settled.forEach((result, index) => {
      const batch = batches[index];
      if (result.status !== "fulfilled") {
        runFailures.push(`${batch[0]?.target.id}: ${(result.reason as Error)?.message ?? String(result.reason)}`);
        return;
      }
      runFailures.push(...result.value.failures);
      result.value.accepted.forEach((enrichment) => {
        const candidate = batch.find((item) => item.target.id === enrichment.id);
        const target = candidate?.target;
        if (!target) {
          runFailures.push(`${enrichment.id}: response was not part of the request batch`);
          return;
        }
        cache[target.id] = { version: CACHE_VERSION, source: target.source, context: target.context, annotations: enrichment.annotations };
        generated.set(target.id, enrichment);
        completed++;
      });
      result.value.partial.forEach(({ target, annotations }) => {
        if (annotations.length) cache[target.id] = { version: CACHE_VERSION, source: target.source, context: target.context, annotations, partial: true };
      });
    });
    writeJsonAtomic(CACHE_PATH, cache);
    console.log(`Generated ${Math.min(start + completed, runTargets.length)}/${runTargets.length} fields (${apiCallCount} Gemini requests)`);
  }

  let repairedCount = 0;
  for (const target of runTargets) {
    const cacheEntry = cache[target.id];
    const result = generated.get(target.id);
    if (!isValidCacheEntry(target, cacheEntry)) continue;
    const segments = buildSegments(target, result?.annotations ?? cacheEntry.annotations);
    if (target.slot === "question") target.question.questionFurigana = segments;
    else {
      target.question.optionsFurigana ??= target.question.options.map((option) => [{ text: option, furigana: null }]);
      while (target.question.optionsFurigana.length < target.question.options.length) {
        const missingOption = target.question.options[target.question.optionsFurigana.length];
        target.question.optionsFurigana.push([{ text: missingOption, furigana: null }]);
      }
      target.question.optionsFurigana[target.optionIndex!] = segments;
    }
    repairedCount++;
  }
  const updatedPaths = new Set(runTargets.filter((target) => isValidCacheEntry(target, cache[target.id])).map(({ file }) => file));
  for (const source of sources) {
    if (updatedPaths.has(source.path)) writeJsonAtomic(join(ROOT, source.path), source.data);
  }
  console.log(`Repaired ${repairedCount}/${runTargets.length} exact-source furigana fields.`);
  if (runFailures.length) {
    console.error(`${runFailures.length} JLPT question field(s) remain unannotated; valid exact-source furigana was applied:`);
    for (const failure of runFailures.slice(0, 40)) console.error(`- ${failure}`);
    if (runFailures.length > 40) console.error(`... ${runFailures.length - 40} more`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error((error as Error).stack ?? error);
  process.exitCode = 1;
});
