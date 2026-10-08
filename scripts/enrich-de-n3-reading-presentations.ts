// Build the sentence-by-sentence Reading-practice presentation for the N3
// practice sets. Exam review keeps its own passageSentencesVi boundaries; this
// file follows the exact body groups rendered by splitBodyIntoSentences().
// Gemini keys and resumable output cache stay in ignored local _scratch.
//
// Usage:
//   node --experimental-strip-types scripts/enrich-de-n3-reading-presentations.ts --dry-run --set 02
//   node --experimental-strip-types scripts/enrich-de-n3-reading-presentations.ts --set 02

import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { DeThiDataset, DeThiPaper, DeThiQuestion } from "../src/types/dethi.ts";
import { splitBodyIntoSentences } from "../src/lib/readingSentences.ts";
import { stableHash } from "../src/lib/jlptReading.ts";
import { enrichmentQuestionId } from "./jlptEnrichmentIds.ts";

const ROOT = join(import.meta.dirname, "..");
const MODEL = "gemini-3.5-flash-lite";
const CACHE_VERSION = 1;
const CACHE_PATH = join(ROOT, `_scratch/n3-reading-presentation-cache-${MODEL}.json`);
const DELAY_MS = 6_000;
const MAX_UNITS_PER_REQUEST = 8;
const SAME_PASSAGE = new Set(["（上記と同じ）", "（同上）"]);

interface BodySegment { text: string; furigana: string | null; paragraphStart?: boolean }
interface Target {
  id: string;
  file: string;
  examId: string;
  paper: DeThiPaper;
  question: DeThiQuestion;
  body: BodySegment[];
  units: string[];
  translationVi: string;
  referenceSentencesVi: string[];
  signature: string;
}
interface CacheEntry { version: number; signature: string; sentencesVi: string[] }
type Cache = Record<string, CacheEntry>;

const lastGeminiRequestAt = new Map<string, number>();
let requestCount = 0;

function atomicJson(path: string, value: unknown): void {
  const temp = `${path}.tmp`;
  writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  renameSync(temp, path);
}

function readApiKeys(): string[] {
  const text = readFileSync(join(ROOT, "_scratch/.env.gemini"), "utf8");
  const keys = text.split(/\r?\n/u).flatMap((line) => {
    const match = line.trim().match(/^GEMINI_API_KEY(?:_[A-Z0-9_]+)?=(.*)$/u);
    if (!match) return [];
    let value = match[1].trim();
    if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    return value ? [value] : [];
  });
  if (!keys.length) throw new Error("No Gemini API keys found in _scratch/.env.gemini");
  return keys;
}

function resolvePassage(paper: DeThiPaper, index: number): string | null {
  const current = paper.questions[index];
  if (!current?.passage) return null;
  if (!SAME_PASSAGE.has(current.passage)) return current.passage;
  for (let i = index - 1; i >= 0; i--) {
    const earlier = paper.questions[i];
    if (earlier.problemGroup !== current.problemGroup) break;
    if (earlier.passage && !SAME_PASSAGE.has(earlier.passage)) return earlier.passage;
  }
  return null;
}

function sourceSignature(target: Pick<Target, "body" | "units" | "translationVi" | "referenceSentencesVi">): string {
  return JSON.stringify({ body: target.body, units: target.units, translationVi: target.translationVi, referenceSentencesVi: target.referenceSentencesVi });
}

function collectTargets(setNumbers: string[]): { datasets: { file: string; data: DeThiDataset }[]; targets: Target[] } {
  const datasets = setNumbers.map((set) => {
    const file = `src/data/de-n3-set-${set}.json`;
    return { file, data: JSON.parse(readFileSync(join(ROOT, file), "utf8")) as DeThiDataset };
  });
  const targets: Target[] = [];
  for (const { file, data } of datasets) {
    for (const exam of data.exams) {
      for (const paper of exam.papers) {
        if (paper.id !== "bunpou-dokkai") continue;
        const groups = new Map<string, { problemGroup: string; passage: string; questions: DeThiQuestion[] }>();
        for (let index = 0; index < paper.questions.length; index++) {
          const question = paper.questions[index];
          const passage = resolvePassage(paper, index);
          if (!passage || !question.options.length) continue;
          const key = `${question.problemGroup}\0${passage}`;
          const group = groups.get(key) ?? { problemGroup: question.problemGroup, passage, questions: [] };
          group.questions.push(question);
          groups.set(key, group);
        }
        for (const group of groups.values()) {
          const question = group.questions[0];
          const furigana = group.questions.find((candidate) => candidate.passageFurigana?.length)?.passageFurigana;
          const body: BodySegment[] = furigana?.length
            ? furigana.map(({ text, furigana: reading, paragraphStart }) => ({ text, furigana: reading, ...(paragraphStart ? { paragraphStart: true } : {}) }))
            : [{ text: group.passage, furigana: null }];
          const units = splitBodyIntoSentences(body).map((sentence) => sentence.map(({ text }) => text).join(""));
          const translationVi = group.questions.find((candidate) => candidate.passageVi?.trim())?.passageVi?.trim() ?? "";
          const referenceSentencesVi = group.questions.find((candidate) => candidate.passageSentencesVi?.length)?.passageSentencesVi ?? [];
          const target: Target = {
            id: enrichmentQuestionId(exam.id, paper, question, group.problemGroup),
            file,
            examId: exam.id,
            paper,
            question,
            body,
            units,
            translationVi,
            referenceSentencesVi,
            signature: "",
          };
          target.signature = sourceSignature(target);
          const current = question.readingPresentation;
          const currentBody = stableHash(JSON.stringify(body));
          if (current?.bodySignature === currentBody && current.sentencesVi.length === units.length &&
            current.sentencesVi.every((line) => line.trim()) && current.translationVi === translationVi) continue;
          targets.push(target);
        }
      }
    }
  }
  return { datasets, targets };
}

function makePrompt(target: Target, units: string[], startIndex: number, correction?: string): string {
  return [
    "Bạn là dịch giả Nhật-Việt chuyên dịch bài đọc JLPT N3.",
    "Dịch mỗi đơn vị tiếng Nhật thành đúng một phần tử tiếng Việt tự nhiên, đủ nghĩa; giữ tên riêng, con số, ngày giờ, dấu 【19】, tiêu đề, dòng bảng/danh sách và thứ tự.",
    "Các đơn vị tiếng Nhật đã được tách theo đúng ranh giới ứng dụng sẽ hiển thị. Không gộp hoặc tách đơn vị. Dùng bản dịch toàn bài và bản dịch từng câu cũ chỉ làm tham khảo; tiếng Nhật là nguồn chuẩn.",
    "Chỉ trả JSON object với trường sentencesVi là mảng đúng số lượng và thứ tự; không thêm lời dẫn hay markdown.",
    correction ? `Kết quả trước không hợp lệ: ${correction}. Hãy sửa.` : "",
    JSON.stringify({ id: target.id, unitRange: [startIndex + 1, startIndex + units.length], unitCount: units.length, japaneseUnits: units, fullTranslationReference: target.translationVi, examSentenceTranslationReference: target.referenceSentencesVi }),
  ].filter(Boolean).join("\n");
}

async function requestTranslation(apiKeys: string[], target: Target, units: string[], startIndex: number, correction?: string): Promise<string[]> {
  const apiKey = apiKeys[requestCount % apiKeys.length];
  const waitMs = DELAY_MS - (Date.now() - (lastGeminiRequestAt.get(apiKey) ?? 0));
  if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs));
  lastGeminiRequestAt.set(apiKey, Date.now());
  requestCount++;
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
    method: "POST",
    headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: makePrompt(target, units, startIndex, correction) }] }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          properties: { sentencesVi: { type: "ARRAY", items: { type: "STRING" }, minItems: units.length, maxItems: units.length } },
          required: ["sentencesVi"],
        },
        temperature: 0.1,
      },
    }),
    signal: AbortSignal.timeout(90_000),
  });
  if (!response.ok) throw new Error(`Gemini HTTP ${response.status}: ${(await response.text()).slice(0, 400)}`);
  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Gemini returned no JSON translation");
  const parsed = JSON.parse(text) as { sentencesVi?: unknown };
  if (!Array.isArray(parsed.sentencesVi) || parsed.sentencesVi.length !== units.length || parsed.sentencesVi.some((line) => typeof line !== "string" || !line.trim())) {
    throw new Error(`Expected ${units.length} non-empty practice translations; received ${Array.isArray(parsed.sentencesVi) ? parsed.sentencesVi.length : "non-array"}`);
  }
  return parsed.sentencesVi;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const setIndex = args.indexOf("--set");
  const setNumber = setIndex >= 0 ? args[setIndex + 1] : undefined;
  if (setIndex >= 0 && (!setNumber || !/^\d{2}$/u.test(setNumber))) throw new Error("--set must be a two-digit collection number");
  const setNumbers = setNumber ? [setNumber] : Array.from({ length: 9 }, (_, index) => String(index + 2).padStart(2, "0"));
  const { datasets, targets } = collectTargets(setNumbers);
  const cache: Cache = existsSync(CACHE_PATH) ? JSON.parse(readFileSync(CACHE_PATH, "utf8")) as Cache : {};
  const pending = targets.filter((target) => cache[target.id]?.version !== CACHE_VERSION || cache[target.id]?.signature !== target.signature);
  console.log(`N3 Reading practice presentations selected: ${targets.length}; pending: ${pending.length}; Japanese units: ${targets.reduce((sum, target) => sum + target.units.length, 0)}`);
  if (dryRun) {
    for (const target of targets) console.log(`${target.id}: ${target.units.length} units${target.units.some((unit) => unit.includes("|")) ? " (table/list)" : ""}`);
    return;
  }
  const apiKeys = readApiKeys();
  for (const [index, target] of pending.entries()) {
    const sentencesVi: string[] = [];
    for (let start = 0; start < target.units.length; start += MAX_UNITS_PER_REQUEST) {
      const units = target.units.slice(start, start + MAX_UNITS_PER_REQUEST);
      let correction: string | undefined;
      let batch: string[] | undefined;
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          batch = await requestTranslation(apiKeys, target, units, start, correction);
          break;
        } catch (error) {
          correction = (error as Error).message;
          if (attempt === 3) throw new Error(`${target.id} units ${start + 1}-${start + units.length}: ${correction}`);
          console.warn(`${target.id} units ${start + 1}-${start + units.length}: translation attempt ${attempt} failed; retrying`);
        }
      }
      if (!batch) throw new Error(`${target.id}: translation batch missing`);
      sentencesVi.push(...batch);
    }
    const dataset = datasets.find(({ file }) => file === target.file)!.data;
    const bodySignature = stableHash(JSON.stringify(target.body));
    target.question.readingPresentation = { bodySignature, sentencesVi, translationVi: target.translationVi };
    cache[target.id] = { version: CACHE_VERSION, signature: target.signature, sentencesVi };
    atomicJson(CACHE_PATH, cache);
    atomicJson(join(ROOT, target.file), dataset);
    console.log(`Saved ${index + 1}/${pending.length} Reading practice passages (${requestCount} Gemini requests): ${target.id}`);
  }
  console.log("Reading practice sentence translations match splitBodyIntoSentences().");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
