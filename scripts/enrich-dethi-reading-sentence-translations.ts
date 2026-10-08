// Add explicit one-to-one Vietnamese translations for JLPT reading passages
// that cannot be safely aligned sentence-by-sentence from passageVi alone.
// API key and resumable cache stay in ignored local _scratch.
//
// Usage:
//   node --experimental-strip-types scripts/enrich-dethi-reading-sentence-translations.ts --dry-run
//   node --experimental-strip-types scripts/enrich-dethi-reading-sentence-translations.ts --preview --limit 1
//   node --experimental-strip-types scripts/enrich-dethi-reading-sentence-translations.ts

import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { DeThiDataset, DeThiPaper, DeThiQuestion } from "../src/types/dethi.ts";
import type { ReadingBodySegment } from "../src/types/reading.ts";
import { findMarkdownPipeTables } from "../src/lib/markdownpipetable.ts";
import { splitBodyIntoSentences } from "../src/lib/readingSentences.ts";
import { enrichmentQuestionId } from "./jlptEnrichmentIds.ts";

const ROOT = join(import.meta.dirname, "..");
const MODEL = "gemini-3.5-flash-lite";
const CACHE_VERSION = 1;
const DATASETS = [
  { path: "src/data/dethi-n3-cac-nam.json", paperId: "bunpou-dokkai", readingGroups: ["問題3", "問題4", "問題5", "問題6", "問題7"] },
  { path: "src/data/de-n3-set-02.json", paperId: "bunpou-dokkai", readingGroups: ["問題3", "問題4", "問題5", "問題6", "問題7"] },
  { path: "src/data/de-n3-set-03.json", paperId: "bunpou-dokkai", readingGroups: ["問題3", "問題4", "問題5", "問題6", "問題7"] },
  { path: "src/data/de-n3-set-04.json", paperId: "bunpou-dokkai", readingGroups: ["問題3", "問題4", "問題5", "問題6", "問題7"] },
  { path: "src/data/de-n3-set-05.json", paperId: "bunpou-dokkai", readingGroups: ["問題3", "問題4", "問題5", "問題6", "問題7"] },
  { path: "src/data/de-n3-set-06.json", paperId: "bunpou-dokkai", readingGroups: ["問題3", "問題4", "問題5", "問題6", "問題7"] },
  { path: "src/data/de-n3-set-07.json", paperId: "bunpou-dokkai", readingGroups: ["問題3", "問題4", "問題5", "問題6", "問題7"] },
  { path: "src/data/de-n3-set-08.json", paperId: "bunpou-dokkai", readingGroups: ["問題3", "問題4", "問題5", "問題6", "問題7"] },
  { path: "src/data/de-n3-set-09.json", paperId: "bunpou-dokkai", readingGroups: ["問題3", "問題4", "問題5", "問題6", "問題7"] },
  { path: "src/data/de-n3-set-10.json", paperId: "bunpou-dokkai", readingGroups: ["問題3", "問題4", "問題5", "問題6", "問題7"] },
  { path: "src/data/dethi-n1-cac-nam.json", paperId: "language-reading", readingGroups: ["問題7", "問題8", "問題9", "問題10", "問題11", "問題12", "問題13"] },
];
const CACHE_PATH = join(ROOT, `_scratch/dethi-reading-sentence-translations-cache-${MODEL}.json`);
const DELAY_MS = 6_000;
const MAX_UNITS_PER_BATCH = 20;
const SAME_PASSAGE_MARKERS = new Set(["（上記と同じ）", "（同上）"]);

function looksLikeJapaneseText(value: string): boolean {
  const letters = Array.from(value).filter((char) => /\p{L}/u.test(char));
  if (!letters.length) return false;
  const japaneseLetters = letters.filter((char) => /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}々〆ヶ]/u.test(char));
  return japaneseLetters.length / letters.length > 0.25;
}

interface SourceFile { path: string; data: DeThiDataset }
interface TargetQuestion { id: string; question: DeThiQuestion }
interface Target {
  id: string;
  file: string;
  examLabel: string;
  problemGroup: string;
  passage: string;
  passageVi: string;
  units: string[];
  questions: TargetQuestion[];
}
interface Enrichment { id: string; translations: string[] }
interface CacheEntry { version: number; source: string; result: Enrichment }
type Cache = Record<string, CacheEntry>;

const lastGeminiRequestAt = new Map<string, number>();
let apiCallCount = 0;

function parseArgs() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const preview = args.includes("--preview");
  const listIds = args.includes("--list-ids");
  const setIndex = args.indexOf("--set");
  const setNumber = setIndex >= 0 ? args[setIndex + 1] : undefined;
  if (setIndex >= 0 && (!setNumber || !/^\d{2}$/u.test(setNumber))) throw new Error("--set must be a two-digit collection number");
  const idsIndex = args.indexOf("--ids");
  const ids = idsIndex >= 0 ? args[idsIndex + 1]?.split(",").filter(Boolean) : undefined;
  const limitIndex = args.indexOf("--limit");
  const limit = limitIndex >= 0 ? Number(args[limitIndex + 1]) : undefined;
  if (idsIndex >= 0 && (!ids?.length || ids.some((id) => id.startsWith("--")))) throw new Error("--ids must be followed by comma-separated passage-group IDs");
  if (limitIndex >= 0 && (!Number.isInteger(limit) || (limit ?? 0) < 1)) throw new Error("--limit must be a positive number of passage groups");
  if (dryRun && preview) throw new Error("Use either --dry-run or --preview, not both");
  if (preview && !limit && !ids) throw new Error("--preview requires --limit N or --ids so it only translates a small sample");
  return { dryRun, preview, limit, ids, listIds, setNumber };
}

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

function sleep(ms: number): Promise<void> { return new Promise((resolve) => setTimeout(resolve, ms)); }

function writeJsonAtomic(path: string, data: unknown): void {
  const tempPath = `${path}.tmp`;
  writeFileSync(tempPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  renameSync(tempPath, path);
}

function splitTextIntoSentenceUnits(text: string, japanese: boolean): string[] {
  const units: string[] = [];
  let buffer = "";
  const endings = new Set(japanese ? ["。", "！", "？"] : [".", "!", "?"]);
  const closing = new Set(["」", "』", "）", ")", "\"", "’", "”"]);
  const push = () => {
    const value = buffer.trim();
    if (value) units.push(value);
    buffer = "";
  };
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === "\n") { push(); continue; }
    buffer += char;
    if (endings.has(char)) {
      while (i + 1 < text.length && closing.has(text[i + 1])) buffer += text[++i];
      push();
    }
  }
  push();
  return units;
}

function resolvePassage(paper: DeThiPaper, index: number): string | null {
  const current = paper.questions[index];
  if (!current?.passage) return null;
  if (!SAME_PASSAGE_MARKERS.has(current.passage)) return current.passage;
  for (let i = index - 1; i >= 0; i--) {
    const earlier = paper.questions[i];
    if (earlier.problemGroup !== current.problemGroup) break;
    if (earlier.passage && !SAME_PASSAGE_MARKERS.has(earlier.passage)) return earlier.passage;
  }
  return current.passage;
}

function readingBody(question: DeThiQuestion | undefined, passage: string): ReadingBodySegment[] {
  const furiganaBody = question?.passageFurigana;
  if (furiganaBody?.length && furiganaBody.map(({ text }) => text).join("") === passage) return furiganaBody;
  return [{ text: passage, furigana: null }];
}

function autoAligns(body: ReadingBodySegment[], passage: string, translation: string): boolean {
  if (looksLikeJapaneseText(translation)) return false;
  const japaneseUnits = splitBodyIntoSentences(body).map((segments) => segments.map(({ text }) => text).join(""));
  const vietnameseUnits = splitTextIntoSentenceUnits(translation, false);
  if (japaneseUnits.length === vietnameseUnits.length) return true;
  const japaneseParagraphs = passage.split(/\n\s*\n/u).map((part) => part.trim()).filter(Boolean);
  const vietnameseParagraphs = translation.split(/\n\s*\n/u).map((part) => part.trim()).filter(Boolean);
  return japaneseParagraphs.length === vietnameseParagraphs.length && japaneseParagraphs.length > 0 &&
    japaneseParagraphs.every((paragraph, index) =>
      splitTextIntoSentenceUnits(paragraph, true).length === splitTextIntoSentenceUnits(vietnameseParagraphs[index], false).length,
    );
}

function collectTargets(): { sources: SourceFile[]; targets: Target[] } {
  const sources: SourceFile[] = [];
  const targets: Target[] = [];
  for (const spec of DATASETS) {
    const data = JSON.parse(readFileSync(join(ROOT, spec.path), "utf8")) as DeThiDataset;
    sources.push({ path: spec.path, data });
    for (const exam of data.exams) {
      for (const paper of exam.papers) {
        if (paper.id !== spec.paperId) continue;
        for (const problemGroup of spec.readingGroups) {
          const seenPassages = new Set<string>();
          for (let index = 0; index < paper.questions.length; index++) {
            const question = paper.questions[index];
            if (question.problemGroup !== problemGroup || !question.options.length) continue;
            const passage = resolvePassage(paper, index);
            if (!passage || SAME_PASSAGE_MARKERS.has(passage) || seenPassages.has(passage)) continue;
            seenPassages.add(passage);
            const groupQuestions: TargetQuestion[] = [];
            for (let groupIndex = index; groupIndex < paper.questions.length; groupIndex++) {
              const candidate = paper.questions[groupIndex];
              if (candidate.problemGroup !== problemGroup) break;
              if (resolvePassage(paper, groupIndex) === passage) groupQuestions.push({ id: enrichmentQuestionId(exam.id, paper, candidate), question: candidate });
            }
            const passageVi = groupQuestions.find(({ question: q }) => q.passageVi?.trim())?.question.passageVi ?? "";
            const firstQuestion = groupQuestions[0]?.question;
            const body = readingBody(firstQuestion, passage);
            const units = splitBodyIntoSentences(body).map((segments) => segments.map(({ text }) => text).join(""));
            const alignedSentenceVi = firstQuestion?.passageSentencesVi;
            const sentenceTranslationsAreVietnamese = Boolean(alignedSentenceVi?.length === units.length &&
              alignedSentenceVi.every((line, unitIndex) => line.trim() && line !== units[unitIndex] && !looksLikeJapaneseText(line)));
            if (!units.length || (passageVi && autoAligns(body, passage, passageVi)) || sentenceTranslationsAreVietnamese) continue;
            targets.push({
              id: enrichmentQuestionId(exam.id, paper, groupQuestions[0].question, problemGroup),
              file: spec.path,
              examLabel: exam.examLabel,
              problemGroup,
              passage,
              passageVi,
              units,
              questions: groupQuestions,
            });
          }
        }
      }
    }
  }
  return { sources, targets };
}

function makePrompt(targets: Target[], correction?: string): string {
  const input = targets.map(({ id, examLabel, problemGroup, units, passageVi }) => ({
    id,
    exam: examLabel,
    problemGroup,
    japaneseUnits: units.map((text, index) => ({ index: index + 1, text })),
    existingTranslationForReferenceOnly: passageVi,
  }));
  return [
    "Bạn là dịch giả Nhật-Việt chuyên dịch bài đọc JLPT.",
    "Trả về DUY NHẤT JSON array đúng thứ tự và đủ số nhóm, giữ nguyên id.",
    "Với mỗi nhóm, trả translations có đúng số phần tử và thứ tự 1..N của japaneseUnits. Mỗi phần tử là bản dịch tiếng Việt tự nhiên, đầy đủ CHỈ cho câu/tiêu đề/dòng ở cùng index; không gộp hai đơn vị, không tách một đơn vị thành nhiều phần tử, không bỏ sót tiêu đề hay dòng bảng.",
    "Bản dịch hiện có chỉ để tham khảo nghĩa và cách gọi; nó có thể thiếu chi tiết hoặc không chia câu đúng, vì vậy tiếng Nhật trong japaneseUnits là nguồn chuẩn. Giữ nguyên tên riêng, số liệu, ngày giờ, đơn vị, dấu tham chiếu và nội dung bảng; không suy diễn hay lược bỏ.",
    "Mỗi phần tử JSON có đúng các trường id, translations. Không thêm lời dẫn hay markdown.",
    correction ? `KẾT QUẢ TRƯỚC KHÔNG HỢP LỆ: ${correction}. Sửa số lượng hoặc bản dịch đơn vị tương ứng.` : "",
    JSON.stringify(input),
  ].filter(Boolean).join("\n");
}

function responseSchema() {
  return {
    type: "ARRAY",
    items: {
      type: "OBJECT",
      properties: {
        id: { type: "STRING" },
        translations: { type: "ARRAY", items: { type: "STRING" } },
      },
      required: ["id", "translations"],
    },
  };
}

async function sendGeminiJson(apiKeys: string[], targets: Target[], correction?: string): Promise<unknown> {
  const apiKey = apiKeys[apiCallCount % apiKeys.length];
  const waitMs = DELAY_MS - (Date.now() - (lastGeminiRequestAt.get(apiKey) ?? 0));
  if (waitMs > 0) await sleep(waitMs);
  lastGeminiRequestAt.set(apiKey, Date.now());
  apiCallCount++;
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
    method: "POST",
    headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: makePrompt(targets, correction) }] }],
      generationConfig: { responseMimeType: "application/json", responseSchema: responseSchema(), temperature: 0.15, maxOutputTokens: 8192 },
    }),
    signal: AbortSignal.timeout(90_000),
  });
  if (!response.ok) throw new Error(`Gemini HTTP ${response.status}: ${(await response.text()).slice(0, 500)}`);
  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error(`Gemini returned no JSON text: ${JSON.stringify(data).slice(0, 500)}`);
  return JSON.parse(text);
}

function sourceSignature(target: Target): string { return JSON.stringify({ passage: target.passage, passageVi: target.passageVi, units: target.units }); }

function validateBatch(result: unknown, targets: Target[]): Enrichment[] {
  if (!Array.isArray(result) || result.length !== targets.length) throw new Error(`Expected ${targets.length} translation groups, got ${Array.isArray(result) ? result.length : "non-array"}`);
  return result.map((item, index) => {
    const target = targets[index];
    if (!item || typeof item !== "object") throw new Error(`Result ${index + 1} is not an object`);
    const candidate = item as Enrichment;
    if (candidate.id !== target.id) throw new Error(`Result ${index + 1}: expected ${target.id}, got ${candidate.id}`);
    if (!Array.isArray(candidate.translations) || candidate.translations.length !== target.units.length) {
      throw new Error(`${target.id}: expected ${target.units.length} sentence translations, got ${candidate.translations?.length ?? "no array"}`);
    }
    if (candidate.translations.some((text) => typeof text !== "string" || !text.trim())) throw new Error(`${target.id}: an aligned translation is empty`);
    return candidate;
  });
}

async function generateBatch(apiKeys: string[], targets: Target[]): Promise<Enrichment[]> {
  let correction: string | undefined;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try { return validateBatch(await sendGeminiJson(apiKeys, targets, correction), targets); }
    catch (error) {
      correction = (error as Error).message;
      if (attempt === 3) throw error;
      console.warn(`  validation/request attempt ${attempt} failed; retrying sentence-translation batch`);
    }
  }
  throw new Error("Unreachable translation batch retry state");
}

function makeBatches(targets: Target[]): Target[][] {
  const batches: Target[][] = [];
  let current: Target[] = [];
  let unitCount = 0;
  for (const target of targets) {
    if (current.length && unitCount + target.units.length > MAX_UNITS_PER_BATCH) {
      batches.push(current);
      current = [];
      unitCount = 0;
    }
    current.push(target);
    unitCount += target.units.length;
  }
  if (current.length) batches.push(current);
  return batches;
}

async function main() {
  const { dryRun, preview, limit, ids, listIds, setNumber } = parseArgs();
  const { sources, targets: allTargets } = collectTargets();
  const setTargets = setNumber ? allTargets.filter((target) => target.id.startsWith(`de-n3-${setNumber}/`)) : allTargets;
  const idTargets = ids ? setTargets.filter((target) => ids.includes(target.id)) : setTargets;
  const runTargets = limit ? idTargets.slice(0, limit) : idTargets;
  const totalUnits = allTargets.reduce((sum, target) => sum + target.units.length, 0);
  const cache = existsSync(CACHE_PATH) ? JSON.parse(readFileSync(CACHE_PATH, "utf8")) as Cache : {};
  const pending = runTargets.filter((target) => cache[target.id]?.version !== CACHE_VERSION || cache[target.id]?.source !== sourceSignature(target));
  console.log(`Passages needing explicit sentence alignment: ${allTargets.length}; selected: ${runTargets.length}; source units: ${totalUnits}; Gemini cache hits: ${runTargets.length - pending.length}; pending: ${pending.length}`);
  if (listIds) pending.forEach(({ id }) => console.log(id));
  if (dryRun || !pending.length) return;

  const apiKeys = readApiKeys();
  const generated = new Map<string, Enrichment>();
  const batches = makeBatches(pending);
  for (const [batchIndex, batch] of batches.entries()) {
    const results = await generateBatch(apiKeys, batch);
    results.forEach((result, index) => {
      const target = batch[index];
      cache[target.id] = { version: CACHE_VERSION, source: sourceSignature(target), result };
      generated.set(target.id, result);
    });
    writeJsonAtomic(CACHE_PATH, cache);
    console.log(`Translated ${Math.min(batchIndex + 1, batches.length)}/${batches.length} batches (${apiCallCount} Gemini requests)`);
  }

  if (preview) {
    for (const target of runTargets) console.log(JSON.stringify({ id: target.id, units: target.units, translations: generated.get(target.id) ?? cache[target.id]?.result }, null, 2));
    return;
  }

  for (const target of runTargets) {
    const result = generated.get(target.id) ?? cache[target.id]?.result;
    if (!result) throw new Error(`${target.id}: no validated sentence translations available`);
    const first = target.questions[0].question;
    first.passageSentencesVi = result.translations;
    // Keep the full translation intact for table rendering. The line-aligned
    // translations remain available in passageSentencesVi, while rebuilding
    // passageVi from sentence strings would flatten Markdown table rows/cells.
    if (findMarkdownPipeTables(target.passage).length === 0) {
      first.passageVi = result.translations.join("\n");
    }
  }
  const changedPaths = new Set(runTargets.map(({ file }) => file));
  for (const source of sources) {
    if (changedPaths.has(source.path)) writeJsonAtomic(join(ROOT, source.path), source.data);
  }
  console.log(`Saved aligned sentence translations for ${runTargets.length} reading passages.`);
}

main().catch((error) => {
  console.error((error as Error).stack ?? error);
  process.exitCode = 1;
});
