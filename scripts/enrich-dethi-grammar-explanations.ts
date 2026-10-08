// Use Gemini to refresh JLPT grammar explanations and explain each distractor.
// The key and resumable response cache stay in the ignored local _scratch dir.
//
// Usage:
//   node --experimental-strip-types scripts/enrich-dethi-grammar-explanations.ts --dry-run
//   node --experimental-strip-types scripts/enrich-dethi-grammar-explanations.ts --preview --limit 2
//   node --experimental-strip-types scripts/enrich-dethi-grammar-explanations.ts

import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { DeThiDataset } from "../src/types/dethi.ts";

const ROOT = join(import.meta.dirname, "..");
const MODEL = "gemini-3.1-flash-lite";
const CACHE_VERSION = 1;
const DATASETS: { path: string; paperId: string; grammarGroups: string[] }[] = [
  // These are the two datasets registered in popup/dethiState.ts. Problem 2
  // (N3) and Problem 6 (N1) are sentence-ordering items, not four competing
  // grammar choices, so explanations target only the grammar selection groups.
  { path: "src/data/dethi-n3-cac-nam.json", paperId: "bunpou-dokkai", grammarGroups: ["問題1", "問題3"] },
  { path: "src/data/dethi-n1-cac-nam.json", paperId: "language-reading", grammarGroups: ["問題5", "問題7"] },
];
const CACHE_PATH = join(ROOT, `_scratch/dethi-grammar-explanations-cache-${MODEL}.json`);
const DELAY_MS = 4_300;
const BATCH_SIZE = 8;

interface GrammarQuestion {
  id?: string;
  number?: number;
  category?: string;
  problemGroup?: string;
  question: string;
  passage?: string | null;
  questionVi?: string;
  options: string[];
  correctIndex: number;
  explanation?: string;
  optionExplanations?: string[];
}

interface Target {
  id: string;
  file: string;
  level: string;
  examLabel: string;
  section: string;
  problemGroup: string;
  question: GrammarQuestion;
}

interface Enrichment {
  id: string;
  explanation: string;
  optionExplanations: string[];
}

interface CachedEnrichment {
  version: number;
  result: Enrichment;
}

type Cache = Record<string, CachedEnrichment>;

let lastGeminiRequestAt = 0;
let apiCallCount = 0;

function readApiKeys(): string[] {
  const path = join(ROOT, "_scratch/.env.gemini");
  const text = readFileSync(path, "utf8");
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

function parseArgs() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const preview = args.includes("--preview");
  const limitIndex = args.indexOf("--limit");
  const idIndex = args.indexOf("--id");
  const limit = limitIndex >= 0 ? Number(args[limitIndex + 1]) : undefined;
  const id = idIndex >= 0 ? args[idIndex + 1] : undefined;
  if (limitIndex >= 0 && (!Number.isInteger(limit) || (limit ?? 0) < 1)) {
    throw new Error("--limit must be a positive integer");
  }
  if (idIndex >= 0 && (!id || id.startsWith("--"))) throw new Error("--id must be followed by a stable question id");
  if (dryRun && preview) throw new Error("Use either --dry-run or --preview, not both");
  return { dryRun, preview, limit, id };
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

function collectTargets(): Target[] {
  const targets: Target[] = [];
  const addTarget = (target: Target) => {
    const question = target.question;
    if (question.options.length !== 4 || question.question.includes("★")) return;
    const hasCompleteExplanations =
      question.optionExplanations?.length === question.options.length &&
      question.optionExplanations.every((text) => text.trim().length > 0);
    if (hasCompleteExplanations && question.explanation?.trim()) return;
    targets.push(target);
  };

  for (const datasetSpec of DATASETS) {
    const file = join(ROOT, datasetSpec.path);
    const dataset = JSON.parse(readFileSync(file, "utf8")) as DeThiDataset;
    for (const exam of dataset.exams) {
      for (const paper of exam.papers) {
        if (paper.id !== datasetSpec.paperId) continue;
        for (const question of paper.questions as GrammarQuestion[]) {
          if (!datasetSpec.grammarGroups.includes(question.problemGroup)) continue;
          addTarget({
            id: `${exam.id}/${paper.id}/q${question.number}`,
            file: datasetSpec.path,
            level: dataset.meta.level,
            examLabel: exam.examLabel,
            section: paper.label,
            problemGroup: question.problemGroup,
            question,
          });
        }
      }
    }
  }

  return targets;
}

function makePrompt(targets: Target[], correction?: string): string {
  const input = targets.map(({ id, level, examLabel, section, problemGroup, question }) => ({
    id,
    level,
    exam: examLabel,
    section,
    problemGroup,
    question: question.question,
    passage: question.passage ?? "",
    questionVi: question.questionVi ?? "",
    options: question.options,
    correctIndex: question.correctIndex,
    currentExplanation: question.explanation ?? "",
  }));

  return [
    "Bạn là giáo viên ngữ pháp tiếng Nhật JLPT, đang hiệu đính lời giải cho ứng dụng học tiếng Nhật bằng tiếng Việt.",
    "Xử lý riêng từng câu theo id. Trả về DUY NHẤT một JSON array đúng thứ tự, đúng số lượng, không thêm markdown.",
    "",
    "YÊU CẦU CHO explanation:",
    "- Viết lại lý do đáp án đúng bằng tiếng Việt, dựa trên ngữ cảnh câu hỏi (và passage nếu có), nêu rõ dấu hiệu ngữ pháp quyết định chứ không chỉ dịch đáp án.",
    "- Gọi tên mẫu gốc/cấu trúc từ điển khi đáp án là dạng đã biến đổi. Ví dụ: 「したくて」 là dạng nối て của 「したい」, tức mẫu 「Vたい」; nêu rõ biến đổi する → したい → したくて và quan hệ nguyên nhân với vế sau.",
    "- Phân biệt mẫu gốc với hình thái đang xuất hiện; không gọi một dạng chia là mẫu độc lập nếu thực chất nó thuộc mẫu khác.",
    "",
    "YÊU CẦU CHO optionExplanations:",
    "- Trả đúng 4 phần tử cùng thứ tự với options. Giải thích RIÊNG từng lựa chọn, kể cả lựa chọn đúng: tại sao hợp/không hợp chính câu này.",
    "- Với mỗi phương án là một mẫu ngữ pháp hoặc dạng đã chia, ghi tên/dạng gốc của nó khi xác định được. Với phương án sai, nêu ngắn gọn nghĩa/cách nối đúng của mẫu đó và vì sao không khớp chỗ trống/ngữ cảnh; không khẳng định mẫu đó sai trong mọi ngữ cảnh.",
    "- Đưa bằng chứng cụ thể từ câu (danh từ/động từ, thể chia, trợ từ, quan hệ hai vế, sắc thái như đối lập/nhượng bộ/nguyên nhân). Nếu khác biệt là hình thái, hãy chỉ ra dạng đúng cần dùng.",
    "- Không lặp lại cùng một câu chung cho các lựa chọn. Mỗi mục tối đa 2 câu, tiếng Việt tự nhiên, đủ rõ cho người học N3/N1.",
    "- correctIndex là chỉ số từ 0. Không được thay đổi đáp án, options hay nội dung tiếng Nhật. Nếu không đủ dữ liệu để kết luận về một lựa chọn, nói rõ giới hạn thay vì bịa.",
    "- Đây chỉ là câu hỏi chọn ngữ pháp có 4 phương án; các câu sắp xếp mảnh câu (★) đã được loại khỏi batch.",
    "",
    "Mỗi phần tử JSON phải có đúng các trường: id, explanation, optionExplanations.",
    correction ? `\nSỬA KẾT QUẢ TRƯỚC: ${correction}. Soát lại đủ 4 lời giải theo đúng thứ tự options, bảo đảm lời giải cho correctIndex nêu được mẫu gốc và thể biến đổi khi có.` : "",
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
        explanation: { type: "STRING" },
        optionExplanations: { type: "ARRAY", items: { type: "STRING" } },
      },
      required: ["id", "explanation", "optionExplanations"],
    },
  };
}

async function sendGeminiJson(apiKeys: string[], prompt: string): Promise<unknown> {
  const waitMs = DELAY_MS - (Date.now() - lastGeminiRequestAt);
  if (waitMs > 0) await sleep(waitMs);
  lastGeminiRequestAt = Date.now();
  const apiKey = apiKeys[apiCallCount % apiKeys.length];
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
    throw new Error(`Expected ${targets.length} explanations, got ${Array.isArray(result) ? result.length : "non-array"}`);
  }
  const expectedIds = new Set(targets.map((target) => target.id));
  const seen = new Set<string>();
  return result.map((item, index) => {
    if (!item || typeof item !== "object") throw new Error(`Result ${index + 1} is not an object`);
    const candidate = item as Enrichment;
    const target = targets[index];
    if (candidate.id !== target.id || !expectedIds.has(candidate.id) || seen.has(candidate.id)) {
      throw new Error(`Unexpected or duplicate id at result ${index + 1}: ${candidate.id}`);
    }
    seen.add(candidate.id);
    if (typeof candidate.explanation !== "string" || !candidate.explanation.trim()) {
      throw new Error(`${candidate.id}: missing explanation`);
    }
    if (!Array.isArray(candidate.optionExplanations) || candidate.optionExplanations.length !== target.question.options.length) {
      throw new Error(`${candidate.id}: optionExplanations count mismatch`);
    }
    if (candidate.optionExplanations.some((text) => typeof text !== "string" || !text.trim())) {
      throw new Error(`${candidate.id}: empty option explanation`);
    }
    if (new Set(candidate.optionExplanations.map((text) => text.trim())).size !== candidate.optionExplanations.length) {
      throw new Error(`${candidate.id}: repeated option explanations`);
    }
    return candidate;
  });
}

async function generateBatch(apiKeys: string[], targets: Target[]): Promise<Enrichment[]> {
  let correction: string | undefined;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      return validateBatch(await sendGeminiJson(apiKeys, makePrompt(targets, correction)), targets);
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
  const { dryRun, preview, limit, id } = parseArgs();
  const allTargets = collectTargets();
  const targets = id ? allTargets.filter((target) => target.id === id) : allTargets;
  if (id && targets.length === 0) throw new Error(`No eligible grammar question found for id: ${id}`);
  const cache = loadCache();
  console.log(`Model: ${MODEL}`);
  console.log(`Grammar-choice questions selected: ${targets.length}`);
  console.log(`Cached responses ready: ${targets.filter((target) => cache[target.id]?.version === CACHE_VERSION).length}`);
  console.log(`Excluded from option-level explanations: sentence-ordering items (★) and non-grammar sections.`);
  if (dryRun) return;

  const runTargets = limit ? targets.slice(0, limit) : targets;
  if (preview && !limit && !id) throw new Error("--preview requires --limit N or --id so it only generates a small sample");
  const apiKeys = readApiKeys();
  const pending = runTargets.filter((target) => cache[target.id]?.version !== CACHE_VERSION);
  console.log(`To generate in this run: ${pending.length}${preview ? " (preview; source files will not be changed)" : ""}`);

  for (let start = 0; start < pending.length; start += BATCH_SIZE) {
    const batch = pending.slice(start, start + BATCH_SIZE);
    const results = await generateBatch(apiKeys, batch);
    for (let i = 0; i < batch.length; i++) {
      cache[batch[i].id] = { version: CACHE_VERSION, result: results[i] };
    }
    writeJsonAtomic(CACHE_PATH, cache);
    console.log(`Cached ${Math.min(start + batch.length, pending.length)}/${pending.length} new explanations (${apiCallCount} Gemini requests)`);
  }

  const cacheResults = new Map<string, Enrichment>();
  for (const target of runTargets) {
    const entry = cache[target.id];
    if (entry?.version === CACHE_VERSION) cacheResults.set(target.id, entry.result);
  }
  if (cacheResults.size !== runTargets.length) throw new Error(`Missing cached results: ${runTargets.length - cacheResults.size}`);

  if (preview) {
    for (const target of runTargets) {
      console.log(JSON.stringify({ id: target.id, question: target.question.question, correctIndex: target.question.correctIndex, options: target.question.options, ...cacheResults.get(target.id) }, null, 2));
    }
    return;
  }

  const sourceFiles = [...new Set(runTargets.map((target) => target.file))];
  for (const relativePath of sourceFiles) {
    const filePath = join(ROOT, relativePath);
    let updated = 0;
    if (DATASETS.some((datasetSpec) => datasetSpec.path === relativePath)) {
      const dataset = JSON.parse(readFileSync(filePath, "utf8")) as DeThiDataset;
      for (const exam of dataset.exams) {
        for (const paper of exam.papers) {
          for (const question of paper.questions as GrammarQuestion[]) {
            const id = `${exam.id}/${paper.id}/q${question.number}`;
            const result = cacheResults.get(id);
            if (!result) continue;
            question.explanation = result.explanation;
            question.optionExplanations = result.optionExplanations;
            updated++;
          }
        }
      }
      if (updated) writeJsonAtomic(filePath, dataset);
    }
    console.log(`${relativePath}: updated ${updated} grammar questions`);
  }
}

main().catch((error) => {
  console.error((error as Error).stack ?? error);
  process.exitCode = 1;
});
