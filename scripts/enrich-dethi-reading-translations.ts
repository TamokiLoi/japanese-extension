// Use Gemini to add Vietnamese translations to actual JLPT reading passages,
// question prompts, and answer choices. API key and resumable cache stay in
// the ignored local _scratch directory.
//
// Usage:
//   node --experimental-strip-types scripts/enrich-dethi-reading-translations.ts --dry-run
//   node --experimental-strip-types scripts/enrich-dethi-reading-translations.ts --dry-run --force
//   node --experimental-strip-types scripts/enrich-dethi-reading-translations.ts --preview --id cacnam-n3-2025-07/bunpou-dokkai/問題7/q38
//   node --experimental-strip-types scripts/enrich-dethi-reading-translations.ts --force --ids id1,id2
//   node --experimental-strip-types scripts/enrich-dethi-reading-translations.ts --force
//   node --experimental-strip-types scripts/enrich-dethi-reading-translations.ts

import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { DeThiDataset, DeThiPaper, DeThiQuestion } from "../src/types/dethi.ts";

const ROOT = join(import.meta.dirname, "..");
const MODEL = "gemini-3.1-flash-lite";
const CACHE_VERSION = 3;
const DATASETS: { path: string; paperId: string; readingGroups: string[] }[] = [
  { path: "src/data/dethi-n3-cac-nam.json", paperId: "bunpou-dokkai", readingGroups: ["問題3", "問題4", "問題5", "問題6", "問題7"] },
  { path: "src/data/dethi-n1-cac-nam.json", paperId: "language-reading", readingGroups: ["問題7", "問題8", "問題9", "問題10", "問題11", "問題12", "問題13"] },
];
const CACHE_PATH = join(ROOT, `_scratch/dethi-reading-translations-cache-${MODEL}.json`);
const DELAY_MS = 4_300;
const BATCH_SIZE = 3;

interface SourceFile {
  path: string;
  data: DeThiDataset;
}

interface TargetQuestion {
  id: string;
  question: DeThiQuestion;
}

interface Target {
  id: string;
  file: string;
  level: string;
  examLabel: string;
  section: string;
  problemGroup: string;
  passage: string;
  questions: TargetQuestion[];
}

interface QuestionTranslation {
  id: string;
  questionVi: string;
  optionsVi: string[];
}

interface Enrichment {
  id: string;
  passageVi: string;
  questions: QuestionTranslation[];
}

interface CachedEnrichment {
  version: number;
  result: Enrichment;
}

type Cache = Record<string, CachedEnrichment>;

let lastGeminiRequestAt = 0;
let apiCallCount = 0;

function readApiKey(): string {
  const path = join(ROOT, "_scratch/.env.gemini");
  const text = readFileSync(path, "utf8");
  const match = text.match(/^GEMINI_API_KEY=(\S+)/m);
  if (!match) throw new Error("No GEMINI_API_KEY found in _scratch/.env.gemini");
  return match[1];
}

function parseArgs() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const preview = args.includes("--preview");
  const force = args.includes("--force");
  const limitIndex = args.indexOf("--limit");
  const idIndex = args.indexOf("--id");
  const idsIndex = args.indexOf("--ids");
  const limit = limitIndex >= 0 ? Number(args[limitIndex + 1]) : undefined;
  const idsValue = idsIndex >= 0 ? args[idsIndex + 1] : idIndex >= 0 ? args[idIndex + 1] : undefined;
  const ids = idsValue?.split(",").filter(Boolean);
  if (limitIndex >= 0 && (!Number.isInteger(limit) || (limit ?? 0) < 1)) {
    throw new Error("--limit must be a positive number of passage groups");
  }
  if ((idIndex >= 0 || idsIndex >= 0) && (!ids?.length || ids.some((id) => id.startsWith("--")))) throw new Error("--id/--ids must be followed by stable passage-group id(s)");
  if (dryRun && preview) throw new Error("Use either --dry-run or --preview, not both");
  if (preview && !limit && !ids) throw new Error("--preview requires --limit N or --id so it only translates a small sample");
  return { dryRun, preview, force, limit, ids };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

function resolvePassage(paper: DeThiPaper, index: number): string | null {
  const current = paper.questions[index];
  if (!current?.passage) return null;
  if (current.passage !== "（上記と同じ）" && current.passage !== "（同上）") return current.passage;
  for (let i = index - 1; i >= 0; i--) {
    const earlier = paper.questions[i];
    if (earlier.problemGroup !== current.problemGroup) break;
    if (earlier.passage && earlier.passage !== "（上記と同じ）" && earlier.passage !== "（同上）") return earlier.passage;
  }
  return current.passage;
}

function collectTargets(force: boolean): { sources: SourceFile[]; targets: Target[] } {
  const sources: SourceFile[] = [];
  const targets: Target[] = [];

  for (const datasetSpec of DATASETS) {
    const data = JSON.parse(readFileSync(join(ROOT, datasetSpec.path), "utf8")) as DeThiDataset;
    sources.push({ path: datasetSpec.path, data });
    for (const exam of data.exams) {
      for (const paper of exam.papers) {
        if (paper.id !== datasetSpec.paperId) continue;
        for (const problemGroup of datasetSpec.readingGroups) {
          let currentPassage: string | null = null;
          let currentTarget: Target | null = null;

          const flush = () => {
            if (!currentTarget) return;
            const passageHasTranslation = currentTarget.questions.some(({ question }) => question.passageVi?.trim());
            const questionsHaveTranslations = currentTarget.questions.every(({ question }) =>
              question.questionVi?.trim() &&
              question.optionsVi?.length === question.options.length &&
              question.optionsVi.every((text) => text.trim()),
            );
            if (!force && passageHasTranslation && questionsHaveTranslations) return;
            targets.push(currentTarget);
            currentTarget = null;
          };

          for (let i = 0; i < paper.questions.length; i++) {
            const question = paper.questions[i];
            if (question.problemGroup !== problemGroup) continue;
            const passage = resolvePassage(paper, i);
            if (!passage || passage === "（上記と同じ）" || question.options.length === 0) continue;
            if (currentPassage !== passage) {
              flush();
              currentPassage = passage;
              currentTarget = {
                id: `${exam.id}/${paper.id}/${problemGroup}/q${question.number}`,
                file: datasetSpec.path,
                level: data.meta.level,
                examLabel: exam.examLabel,
                section: paper.label,
                problemGroup,
                passage,
                questions: [],
              };
            }
            currentTarget?.questions.push({ id: `${exam.id}/${paper.id}/q${question.number}`, question });
          }
          flush();
        }
      }
    }
  }
  return { sources, targets };
}

function makePrompt(targets: Target[], correction?: string): string {
  const input = targets.map(({ id, level, examLabel, section, problemGroup, passage, questions }) => ({
    id,
    level,
    exam: examLabel,
    section,
    problemGroup,
    passage,
    questions: questions.map(({ id: questionId, question }) => ({
      id: questionId,
      question: question.question,
      options: question.options,
    })),
  }));

  return [
    "Bạn là dịch giả Nhật-Việt chuyên dịch đề đọc hiểu JLPT cho người học tiếng Nhật.",
    "Trả về DUY NHẤT một JSON array đúng thứ tự và đủ số lượng nhóm; giữ nguyên mọi id. Không thêm markdown.",
    "",
    "Với mỗi nhóm, dịch passage sang tiếng Việt tự nhiên, đầy đủ, chính xác và dễ đọc; giữ nguyên tiêu đề, gạch đầu dòng, xuống dòng, tên riêng, giá trị số, ngày giờ và đơn vị tiền (có thể đổi cách ghi giờ nếu vẫn giữ đúng nghĩa). Giữ nguyên mọi số đánh dấu câu/chỗ trống (ví dụ 41, 42, 43) tại đúng vị trí tương ứng trong bản dịch; không bỏ hoặc tự điền đáp án vào chỗ trống. Không lược bỏ chi tiết, không suy diễn phần bảng/biểu bị ghi là lược bỏ.",
    "Với từng câu hỏi, dịch riêng question và từng option sang tiếng Việt. Giữ nguyên các ký hiệu và vị trí chỗ trống như （　）, ★ nếu có. Mảng optionsVi phải có đúng số phần tử, song song 1:1 với options; giữ nguyên thứ tự và phân biệt chính xác các phương án đúng/sai, không làm phương án nhiễu thành đúng.",
    "Không dịch ngược hoặc sửa câu tiếng Nhật; không thêm đáp án/giải thích. Mỗi bản dịch phải tự đứng được khi hiển thị dưới nguyên văn tiếng Nhật.",
    "",
    "Mỗi phần tử JSON phải có đúng các trường: id, passageVi, questions. Mỗi questions item phải có đúng các trường: id, questionVi, optionsVi.",
    correction ? `\nSỬA KẾT QUẢ TRƯỚC: ${correction}. Soát đủ trường, giữ đúng thứ tự và số lượng.` : "",
    "",
    JSON.stringify(input),
  ].join("\n");
}

function responseSchema() {
  return {
    type: "ARRAY",
    items: {
      type: "OBJECT",
      properties: {
        id: { type: "STRING" },
        passageVi: { type: "STRING" },
        questions: {
          type: "ARRAY",
          items: {
            type: "OBJECT",
            properties: {
              id: { type: "STRING" },
              questionVi: { type: "STRING" },
              optionsVi: { type: "ARRAY", items: { type: "STRING" } },
            },
            required: ["id", "questionVi", "optionsVi"],
          },
        },
      },
      required: ["id", "passageVi", "questions"],
    },
  };
}

async function sendGeminiJson(apiKey: string, prompt: string): Promise<unknown> {
  const waitMs = DELAY_MS - (Date.now() - lastGeminiRequestAt);
  if (waitMs > 0) await sleep(waitMs);
  lastGeminiRequestAt = Date.now();
  apiCallCount++;

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
    method: "POST",
    headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: "application/json", responseSchema: responseSchema(), temperature: 0.15 },
    }),
    signal: AbortSignal.timeout(90_000),
  });
  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Gemini HTTP ${response.status}: ${message.slice(0, 500)}`);
  }
  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error(`Gemini returned no JSON text: ${JSON.stringify(data).slice(0, 500)}`);
  return JSON.parse(text);
}

function validateBatch(result: unknown, targets: Target[]): Enrichment[] {
  if (!Array.isArray(result) || result.length !== targets.length) {
    throw new Error(`Expected ${targets.length} translations, got ${Array.isArray(result) ? result.length : "non-array"}`);
  }
  return result.map((item, index) => {
    const target = targets[index];
    if (!item || typeof item !== "object") throw new Error(`Result ${index + 1} is not an object`);
    const candidate = item as Enrichment;
    if (candidate.id !== target.id) throw new Error(`Result ${index + 1}: expected id ${target.id}, got ${candidate.id}`);
    if (typeof candidate.passageVi !== "string" || !candidate.passageVi.trim()) throw new Error(`${target.id}: missing passage translation`);
    const countNumberToken = (text: string, number: number): number => {
      const matches = text.match(new RegExp(`(?<!\\d)${number}(?!\\d)`, "g"));
      return matches?.length ?? 0;
    };
    for (const { question } of target.questions) {
      const number = question.number;
      const sourceMarkerCount = countNumberToken(target.passage, number);
      if (!sourceMarkerCount) continue;
      const translatedMarkerCount = countNumberToken(candidate.passageVi, number);
      if (translatedMarkerCount < sourceMarkerCount) {
        throw new Error(`${target.id}: passage translation omitted question marker ${number}`);
      }
    }
    if (!Array.isArray(candidate.questions) || candidate.questions.length !== target.questions.length) {
      throw new Error(`${target.id}: question translation count mismatch`);
    }
    candidate.questions.forEach((translated, qIndex) => {
      const source = target.questions[qIndex];
      if (translated.id !== source.id) throw new Error(`${target.id}: expected question id ${source.id}, got ${translated.id}`);
      if (typeof translated.questionVi !== "string" || !translated.questionVi.trim()) throw new Error(`${translated.id}: missing question translation`);
      if (!Array.isArray(translated.optionsVi) || translated.optionsVi.length !== source.question.options.length) {
        throw new Error(`${translated.id}: answer translation count mismatch`);
      }
      if (translated.optionsVi.some((text) => typeof text !== "string" || !text.trim())) throw new Error(`${translated.id}: empty answer translation`);
    });
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
      console.warn(`  validation/request attempt ${attempt} failed; retrying this batch`);
      await sleep(1000 * attempt);
    }
  }
  throw new Error("Unreachable batch retry state");
}

async function main() {
  const { dryRun, preview, force, limit, ids } = parseArgs();
  const { sources, targets: allTargets } = collectTargets(force);
  const targets = ids ? allTargets.filter((target) => ids.includes(target.id)) : allTargets;
  const missingIds = ids?.filter((id) => !targets.some((target) => target.id === id));
  if (missingIds?.length) throw new Error(`No eligible passage group found for id(s): ${missingIds.join(", ")}`);
  const questionCount = targets.reduce((sum, target) => sum + target.questions.length, 0);
  const cache = loadCache();
  console.log(`Model: ${MODEL}`);
  console.log(`Reading-passage groups selected: ${targets.length}; questions: ${questionCount}`);
  console.log(`Cached responses ready: ${targets.filter((target) => cache[target.id]?.version === CACHE_VERSION).length}`);
  if (dryRun) return;

  const runTargets = limit ? targets.slice(0, limit) : targets;
  const apiKey = readApiKey();
  const pending = runTargets.filter((target) => force || cache[target.id]?.version !== CACHE_VERSION);
  console.log(`To generate in this run: ${pending.length}${preview ? " (preview; source files will not be changed)" : ""}`);

  for (let start = 0; start < pending.length; start += BATCH_SIZE) {
    const batch = pending.slice(start, start + BATCH_SIZE);
    const results = await generateBatch(apiKey, batch);
    for (let i = 0; i < batch.length; i++) cache[batch[i].id] = { version: CACHE_VERSION, result: results[i] };
    writeJsonAtomic(CACHE_PATH, cache);
    console.log(`Cached ${Math.min(start + batch.length, pending.length)}/${pending.length} new passage groups (${apiCallCount} Gemini requests)`);
  }

  const cacheResults = new Map<string, Enrichment>();
  for (const target of runTargets) {
    const entry = cache[target.id];
    if (entry?.version === CACHE_VERSION) cacheResults.set(target.id, entry.result);
  }
  if (cacheResults.size !== runTargets.length) throw new Error(`Missing cached results: ${runTargets.length - cacheResults.size}`);

  if (preview) {
    for (const target of runTargets) console.log(JSON.stringify({ id: target.id, passage: target.passage, ...cacheResults.get(target.id) }, null, 2));
    return;
  }

  const updatedPaths = new Set(runTargets.map((target) => target.file));
  for (const target of runTargets) {
    const result = cacheResults.get(target.id)!;
    target.questions[0].question.passageVi = result.passageVi;
    for (let i = 0; i < target.questions.length; i++) {
      const source = target.questions[i].question;
      const translated = result.questions[i];
      source.questionVi = translated.questionVi;
      source.optionsVi = translated.optionsVi;
    }
  }

  for (const source of sources) {
    if (!updatedPaths.has(source.path)) continue;
    writeJsonAtomic(join(ROOT, source.path), source.data);
    const updated = runTargets.filter((target) => target.file === source.path);
    console.log(`${source.path}: translated ${updated.length} passage groups / ${updated.reduce((sum, target) => sum + target.questions.length, 0)} questions`);
  }
}

main().catch((error) => {
  console.error((error as Error).stack ?? error);
  process.exitCode = 1;
});
