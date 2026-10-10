// Translate JLPT listening transcripts/questions/options and explain every
// answer choice. API keys are read only from ignored _scratch/.env.gemini.
// Usage: node --experimental-strip-types scripts/enrich-jlpt-listening-practice.ts <dataset.json> [...]

import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = join(import.meta.dirname, "..");
const MODEL = "gemini-3.5-flash-lite";
const CACHE_PATH = join(ROOT, `_scratch/jlpt-listening-enrichment-${MODEL}.json`);
const BATCH_SIZE = 2;
const DELAY_MS = 2_500;

interface Turn {
  speaker: string;
  text: string;
  textVi?: string;
}

interface Question {
  id: string;
  turns: Turn[];
  scenario: string;
  scenarioVi: string;
  question: string;
  questionVi: string;
  options: string[];
  optionsVi: string[];
  optionCount?: number;
  correctIndex: number;
  explanation: string;
  optionExplanations: string[];
  notes?: string;
}

interface Dataset {
  questions: Question[];
}

interface Enrichment {
  id: string;
  sourceSignature?: string;
  scenarioVi: string;
  turnsVi: string[];
  questionVi: string;
  optionsVi: string[];
  explanation: string;
  optionExplanations: string[];
}

type Cache = Record<string, Enrichment>;

const readyAliases = new Set([
  "GEMINI_API_KEY_LOINGUYENLAMTHANH",
  "GEMINI_API_KEY_TAMOKI1110",
  "GEMINI_API_KEY_TAMOKILOIJP",
  "GEMINI_API_KEY_LOINLT1991",
]);

const responseSchema = {
  type: "ARRAY",
  items: {
    type: "OBJECT",
    properties: {
      id: { type: "STRING" },
      scenarioVi: { type: "STRING" },
      turnsVi: { type: "ARRAY", items: { type: "STRING" } },
      questionVi: { type: "STRING" },
      optionsVi: { type: "ARRAY", items: { type: "STRING" } },
      explanation: { type: "STRING" },
      optionExplanations: { type: "ARRAY", items: { type: "STRING" } },
    },
    required: ["id", "scenarioVi", "turnsVi", "questionVi", "optionsVi", "explanation", "optionExplanations"],
  },
};

function readKeys(): Array<{ label: string; value: string }> {
  const text = readFileSync(join(ROOT, "_scratch/.env.gemini"), "utf8");
  return text.split(/\r?\n/u).flatMap((line) => {
    const match = line.trim().match(/^(GEMINI_API_KEY(?:_[A-Z0-9_]+)?)=(.*)$/u);
    if (!match || !readyAliases.has(match[1])) return [];
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    return value ? [{ label: match[1], value }] : [];
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

function writeJsonAtomic(path: string, value: unknown): void {
  const temporary = `${path}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  renameSync(temporary, path);
}

function loadCache(): Cache {
  if (!existsSync(CACHE_PATH)) return {};
  return JSON.parse(readFileSync(CACHE_PATH, "utf8")) as Cache;
}

function sourceSignature(question: Question): string {
  return JSON.stringify({
    scenario: question.scenario,
    turns: question.turns.map(({ speaker, text }) => ({ speaker, text })),
    question: question.question,
    options: question.options,
    correctIndex: question.correctIndex,
  });
}

function makePrompt(questions: Question[], correction = ""): string {
  return [
    "Bạn là biên tập viên nội dung luyện nghe JLPT. Hãy xử lý riêng từng câu theo id và trả về DUY NHẤT một JSON array, đúng thứ tự và đủ số phần tử.",
    "Dịch từng lượt thoại Nhật sang tiếng Việt tự nhiên, sát nghĩa; turnsVi phải có đúng số phần tử và khớp đúng thứ tự turns. Không dịch tên speaker.",
    "Nếu scenario rỗng, scenarioVi phải rỗng. questionVi phải dịch đầy đủ nội dung câu hỏi tiếng Nhật sang tiếng Việt tự nhiên; chỉ dùng nhãn như 'Câu 1' khi question nguồn chỉ là số thứ tự (ví dụ 1番). Không được thay câu hỏi đầy đủ bằng 'Câu hỏi' hoặc 'Câu N'.",
    "optionsVi phải giữ đúng số lượng/thứ tự với options. Giữ nguyên ký hiệu lựa chọn như ア, イ, A, B; dịch phần chữ Nhật nếu có. Không tự tạo lựa chọn mới.",
    "BẮT BUỘC dịch mọi lựa chọn có từ tiếng Nhật sang tiếng Việt; tuyệt đối không chép nguyên văn lựa chọn Nhật sang optionsVi. Chỉ giữ nguyên khi toàn bộ lựa chọn là ký hiệu thuần túy như ア / イ / ウ / エ hoặc A / B / C / D.",
    "Dịch riêng từng turns[i] theo đúng câu Nhật turns[i]; không tráo bản dịch giữa các lượt nói ngay cả khi các câu gần nghĩa hoặc trùng với lựa chọn.",
    "correctIndex là chỉ số 0-based và là đáp án đã được xác minh theo đề/đáp án gốc; không được đổi đáp án. Dựa vào transcript và lời giải gốc để giải thích manh mối cụ thể.",
    "explanation viết ngắn gọn bằng tiếng Việt, nêu vì sao đáp án đúng dựa trên chi tiết nghe được, không suy diễn thêm.",
    "optionExplanations có đúng một mục cho mỗi options: giải thích riêng vì sao phương án đúng khớp và từng phương án sai không khớp. Không lặp một câu chung; mọi khẳng định phải có căn cứ trong transcript. Nếu lựa chọn chỉ là tổ hợp ký hiệu (ア/イ/ウ), giải thích nội dung từng ký hiệu từ hội thoại nếu dữ liệu nêu rõ; nếu không đủ dữ liệu, nói rõ giới hạn thay vì bịa.",
    "Gọi các đáp án theo thứ tự hiển thị bằng 'Lựa chọn 1', 'Lựa chọn 2'...; không gọi A/B/C/D trừ khi đó là nhãn thực sự được in cho người học.",
    "Chỉ trả đúng các trường: id, scenarioVi, turnsVi, questionVi, optionsVi, explanation, optionExplanations.",
    correction ? `\nYÊU CẦU SỬA: ${correction}` : "",
    JSON.stringify(questions.map((q) => ({
      id: q.id,
      scenario: q.scenario,
      turns: q.turns.map(({ speaker, text }) => ({ speaker, text })),
      question: q.question,
      options: q.options,
      correctIndex: q.correctIndex,
      sourceExplanation: q.explanation,
      sourceNotes: q.notes ?? "",
    }))),
  ].join("\n\n");
}

let lastCallAt = 0;
async function callGemini(
  keys: Array<{ label: string; value: string }>,
  questions: Question[],
  correction = "",
): Promise<Enrichment[]> {
  const waitMs = DELAY_MS - (Date.now() - lastCallAt);
  if (waitMs > 0) await sleep(waitMs);
  const prompt = makePrompt(questions, correction);
  let lastStatus = "unknown";
  for (const key of keys) {
    lastCallAt = Date.now();
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
      method: "POST",
      headers: { "x-goog-api-key": key.value, "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json", responseSchema, temperature: 0.2 },
      }),
      signal: AbortSignal.timeout(90_000),
    });
    if (!response.ok) {
      lastStatus = String(response.status);
      console.log(`Gemini alias ${key.label} returned HTTP ${lastStatus}; secret and response body omitted.`);
      if (response.status === 503 || response.status === 500) throw new Error(`Gemini service unavailable (HTTP ${response.status}); stopping safely.`);
      if (response.status === 429) continue;
      if (response.status === 401 || response.status === 403) continue;
      throw new Error(`Gemini request failed (HTTP ${response.status}).`);
    }
    const data = await response.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error("Gemini returned no JSON text.");
    const parsed: unknown = JSON.parse(text);
    if (!Array.isArray(parsed)) throw new Error("Gemini response is not a JSON array.");
    return parsed as Enrichment[];
  }
  throw new Error(`No configured ready Gemini key completed the request (last HTTP ${lastStatus}).`);
}

async function translateTurnsIndividually(
  keys: Array<{ label: string; value: string }>,
  question: Question,
): Promise<string[]> {
  const waitMs = DELAY_MS - (Date.now() - lastCallAt);
  if (waitMs > 0) await sleep(waitMs);
  lastCallAt = Date.now();
  const prompt = [
    `Dịch sang tiếng Việt từng lượt thoại của câu ${question.id}. Trả về đúng ${question.turns.length} mục trong một JSON array.`,
    "Giữ nguyên thứ tự và index, không gộp, bỏ, đảo hay tự thêm lượt. Dịch sát nghĩa từng text độc lập; speaker chỉ để hiểu ngữ cảnh, không đưa vào câu dịch.",
    JSON.stringify(question.turns.map((turn, index) => ({ index, speaker: turn.speaker, text: turn.text }))),
    "Schema mỗi mục: {\"index\": số thứ tự bắt đầu từ 0, \"textVi\": bản dịch tiếng Việt}.",
  ].join("\n\n");
  const schema = {
    type: "ARRAY",
    items: {
      type: "OBJECT",
      properties: { index: { type: "INTEGER" }, textVi: { type: "STRING" } },
      required: ["index", "textVi"],
    },
  };
  for (const key of keys) {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
      method: "POST",
      headers: { "x-goog-api-key": key.value, "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json", responseSchema: schema, temperature: 0.2 },
      }),
      signal: AbortSignal.timeout(90_000),
    });
    if (!response.ok) {
      console.log(`Gemini alias ${key.label} returned HTTP ${response.status}; secret and response body omitted.`);
      if (response.status === 503 || response.status === 500) throw new Error(`Gemini service unavailable (HTTP ${response.status}); stopping safely.`);
      if (response.status === 429 || response.status === 401 || response.status === 403) continue;
      throw new Error(`Gemini turn-translation request failed (HTTP ${response.status}).`);
    }
    const data = await response.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error(`${question.id}: Gemini returned no turn-translation JSON.`);
    const parsed: unknown = JSON.parse(text);
    if (!Array.isArray(parsed) || parsed.length !== question.turns.length) {
      throw new Error(`${question.id}: turn-only translation returned ${Array.isArray(parsed) ? parsed.length : "non-array"} rows; expected ${question.turns.length}.`);
    }
    const rows = parsed as Array<{ index: number; textVi: string }>;
    rows.sort((a, b) => a.index - b.index);
    if (rows.some((row, index) => row.index !== index || !row.textVi?.trim())) {
      throw new Error(`${question.id}: invalid/missing turn indexes in turn-only translation.`);
    }
    return rows.map((row) => row.textVi);
  }
  throw new Error(`${question.id}: no configured ready key could translate the turns.`);
}

async function getValidEnrichment(
  keys: Array<{ label: string; value: string }>,
  questions: Question[],
): Promise<Enrichment[]> {
  try {
    const result = await callGemini(keys, questions);
    if (result.length !== questions.length) throw new Error(`response count ${result.length}, expected ${questions.length}`);
    for (let index = 0; index < questions.length; index++) validate(questions[index], result[index]);
    return result;
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Gemini service unavailable")) throw error;
    if (questions.length > 1) {
      console.log(`Batch shape failed; retrying ${questions.length} items individually.`);
      const singles: Enrichment[] = [];
      for (const question of questions) singles.push(...await getValidEnrichment(keys, [question]));
      return singles;
    }
    const question = questions[0];
    const correction = `Lần trước ${question.id} sai cấu trúc. Cần turnsVi có đúng ${question.turns.length} chuỗi, optionsVi và optionExplanations mỗi mảng đúng ${question.options.length} chuỗi; giữ nguyên id.`;
    const retried = await callGemini(keys, questions, correction);
    if (retried.length !== 1) throw new Error(`${question.id}: retry returned ${retried.length} items`);
    try {
      validate(question, retried[0]);
    } catch (retryError) {
      if (retryError instanceof Error && retryError.message.includes("translated turns")) {
        retried[0].turnsVi = await translateTurnsIndividually(keys, question);
        try {
          validate(question, retried[0]);
          return retried;
        } catch {
          // Continue to a final one-question correction below.
        }
      }
      const finalRetry = await callGemini(keys, questions,
        `Kết quả trước cho ${question.id} còn thiếu trường bắt buộc hoặc sai độ dài. Hãy tạo lại đầy đủ scenarioVi, turnsVi (${question.turns.length} bản dịch khác rỗng), questionVi, optionsVi (${question.options.length}), explanation, optionExplanations (${question.options.length}). Không bỏ trống bất kỳ lời dịch nào cho câu nguồn có tiếng Nhật.`);
      if (finalRetry.length !== 1) throw new Error(`${question.id}: final retry returned ${finalRetry.length} items`);
      validate(question, finalRetry[0]);
      return finalRetry;
    }
    return retried;
  }
}

function validate(question: Question, item: Enrichment): void {
  if (item.id !== question.id) throw new Error(`${question.id}: response id mismatch`);
  if (!Array.isArray(item.turnsVi) || item.turnsVi.length !== question.turns.length) {
    throw new Error(`${question.id}: expected ${question.turns.length} translated turns`);
  }
  if (!Array.isArray(item.optionsVi) || item.optionsVi.length !== question.options.length) {
    throw new Error(`${question.id}: option translations must match source options`);
  }
  if (!Array.isArray(item.optionExplanations) || item.optionExplanations.length !== question.options.length) {
    throw new Error(`${question.id}: per-option explanations must match source options`);
  }
  const fields = [item.questionVi, item.explanation, ...item.turnsVi, ...item.optionsVi, ...item.optionExplanations];
  if (fields.some((value) => typeof value !== "string" || value.trim() === "")) {
    throw new Error(`${question.id}: empty required translation/explanation`);
  }
  const questionIsOnlyLabel = /^(?:[0-9]+番(?:（質問\s*[0-9]+）)?|質問\s*[0-9]+)$/u.test(question.question.trim());
  if (!questionIsOnlyLabel && /^Câu(?: hỏi|\s+[0-9]+)(?:\s*[—–-].*)?$/iu.test(item.questionVi.trim())) {
    throw new Error(`${question.id}: questionVi is only a label, not a translation of the question`);
  }
  if (question.scenario.trim() === "" && item.scenarioVi.trim() !== "") {
    throw new Error(`${question.id}: invented scenario translation for empty source`);
  }
  const symbolicOption = (text: string) => /^(?:[ア-エ](?:\s+[ア-エ])*|[A-D](?:\s+[A-D])*)$/u.test(text.trim());
  question.options.forEach((source, index) => {
    if (/[\u3040-\u30ff\u3400-\u9fff]/u.test(source) && !symbolicOption(source) && item.optionsVi[index].trim() === source.trim()) {
      throw new Error(`${question.id}: optionsVi[${index}] was copied in Japanese instead of translated`);
    }
  });
}

async function main(): Promise<void> {
  const fileArgs = process.argv.slice(2);
  if (!fileArgs.length) throw new Error("Pass one or more dataset JSON paths.");
  const keys = readKeys();
  if (!keys.length) throw new Error("No configured READY Gemini key aliases are present in _scratch/.env.gemini.");
  let cache = loadCache();
  for (const arg of fileArgs) {
    const path = resolve(ROOT, arg);
    if (!path.startsWith(`${ROOT}/`) && !path.startsWith(`${ROOT}\\`)) throw new Error("Dataset path must stay inside the workspace.");
    const dataset = JSON.parse(readFileSync(path, "utf8")) as Dataset;
    const pending = dataset.questions.filter((question) => {
      const cached = cache[question.id];
      if (!cached) return true;
      try {
        validate(question, cached);
        const signature = sourceSignature(question);
        if (!cached.sourceSignature) {
          cached.sourceSignature = signature;
          return false;
        }
        return cached.sourceSignature !== signature;
      } catch { return true; }
    });
    console.log(`${arg}: ${pending.length}/${dataset.questions.length} questions need enrichment.`);
    for (let start = 0; start < pending.length; start += BATCH_SIZE) {
      const batch = pending.slice(start, start + BATCH_SIZE);
      const output = await getValidEnrichment(keys, batch);
      for (let index = 0; index < batch.length; index++) {
        validate(batch[index], output[index]);
        cache[batch[index].id] = { ...output[index], sourceSignature: sourceSignature(batch[index]) };
      }
      writeJsonAtomic(CACHE_PATH, cache);
      console.log(`${arg}: cached ${Math.min(start + batch.length, pending.length)}/${pending.length}.`);
    }
    for (const question of dataset.questions) {
      const item = cache[question.id];
      validate(question, item);
      question.scenarioVi = item.scenarioVi;
      question.turns = question.turns.map((turn, index) => {
        const matchingOptionIndex = question.options.findIndex((option) => option.trim() === turn.text.trim());
        return {
          ...turn,
          textVi: matchingOptionIndex >= 0 ? item.optionsVi[matchingOptionIndex] : item.turnsVi[index],
        };
      });
      question.questionVi = item.questionVi;
      question.optionsVi = item.optionsVi;
      question.explanation = item.explanation;
      if (question.options.length) {
        question.optionExplanations = item.optionExplanations.map((explanation) =>
          explanation.replace(/(?:phương án|option)\s+([A-D])\b/giu, (_match, letter: string) =>
            `Lựa chọn ${letter.toUpperCase().charCodeAt(0) - "A".charCodeAt(0) + 1}`,
          ),
        );
      }
    }
    writeJsonAtomic(path, dataset);
    console.log(`${arg}: saved ${dataset.questions.length} enriched questions.`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Unknown enrichment error");
  process.exitCode = 1;
});
