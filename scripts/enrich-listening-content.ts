// Generate listening furigana and answer-choice explanations with Gemini.
// The API key is read only from the ignored local _scratch/.env.gemini file.
//
// Usage:
//   node --experimental-strip-types scripts/enrich-listening-content.ts --dry-run --id listening-soumatome-n3-013
//   node --experimental-strip-types scripts/enrich-listening-content.ts

import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..");
const MODEL = "gemini-3.1-flash-lite";
const DATA_FILES = [
  "listening-soumatome-n3.json",
  "listening-speedmaster-n3.json",
  "listening-shinkanzen-n3.json",
  "listening-kaiwa-100cau.json",
];
const BATCH_SIZE = 8;
const CACHE_PATH = join(ROOT, `_scratch/listening-enrichment-cache-${MODEL}.json`);
const DELAY_MS = 4_300;

interface Annotation {
  word: string;
  reading: string;
}

interface Turn {
  speaker: string;
  text: string;
  textVi?: string;
  furigana?: Annotation[];
}

interface Question {
  id: string;
  book: string;
  taskType: string;
  scenario: string;
  scenarioVi?: string;
  turns: Turn[];
  question: string;
  questionVi?: string;
  options: string[];
  optionsVi?: string[];
  correctIndex: number;
  explanation?: string;
  notes?: string | string[];
  scenarioFurigana?: Annotation[];
  questionFurigana?: Annotation[];
  optionFurigana?: Annotation[][];
  optionExplanations?: string[];
}

interface Dataset {
  questions: Question[];
}

interface Enrichment {
  id: string;
  scenarioFurigana: Annotation[];
  turnsFurigana: Annotation[][];
  questionFurigana: Annotation[];
  optionsFurigana: Annotation[][];
  explanation: string;
  optionExplanations: string[];
}

interface AnnotationSlot {
  field: string;
  source: string;
  annotations: Annotation[];
  set: (annotations: Annotation[]) => void;
}

type Cache = Record<string, Enrichment>;

const annotationsSchema = {
  type: "ARRAY",
  items: {
    type: "OBJECT",
    properties: {
      word: { type: "STRING" },
      reading: { type: "STRING" },
    },
    required: ["word", "reading"],
  },
};

let lastGeminiRequestAt = 0;
let apiCallCount = 0;

function readApiKey(): string {
  const text = readFileSync(join(ROOT, "_scratch/.env.gemini"), "utf8");
  const match = text.match(/^GEMINI_API_KEY=(\S+)/m);
  if (!match) throw new Error("No GEMINI_API_KEY found in _scratch/.env.gemini");
  return match[1];
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

function japaneseInput(question: Question) {
  return {
    id: question.id,
    book: question.book,
    taskType: question.taskType,
    scenario: question.scenario,
    scenarioVi: question.scenarioVi ?? "",
    turns: question.turns.map(({ speaker, text, textVi }) => ({ speaker, text, textVi: textVi ?? "" })),
    question: question.question,
    questionVi: question.questionVi ?? "",
    options: question.options,
    optionsVi: question.optionsVi ?? [],
    correctIndex: question.correctIndex,
    notes: question.notes ?? "",
  };
}

function makePrompt(questions: Question[], correction?: string): string {
  return [
    "Bạn đang bổ sung dữ liệu cho ứng dụng luyện nghe tiếng Nhật. Xử lý riêng từng câu theo id và trả về DUY NHẤT một JSON array đúng thứ tự, đủ số phần tử.",
    "",
    "PHẦN FURIGANA:",
    "- Tạo các mảng scenarioFurigana, turnsFurigana, questionFurigana, optionsFurigana theo từng chuỗi đầu vào. Speaker label không cần xử lý.",
    "- Mỗi mảng chỉ liệt kê các mục {word, reading} cho những từ có kanji, theo đúng thứ tự xuất hiện. Không chép lại cả câu và không đưa dấu câu/kana đứng riêng vào danh sách.",
    "- word phải là nguyên văn một từ/cụm từ trong câu; ưu tiên gồm cả okurigana gắn liền (ví dụ 使って) nhưng không gồm trợ từ đứng riêng. reading phải tương ứng chính xác với word: nếu word chỉ là kanji 使 thì reading là つか, còn nếu word là 使って thì reading là つかって. Chỉ dùng hiragana/katakana, không chứa kanji, dấu câu hay khoảng trắng.",
    "- Ví dụ 鈴木君、ちょっと残って手伝って -> [{word:鈴木君, reading:すずきくん}, {word:残って, reading:のこって}, {word:手伝って, reading:てつだって}]. Với cụm 約束があって, word là 約束 và reading là やくそく.",
    "- Mọi từ chứa kanji trong chuỗi phải có mục tương ứng; chuỗi chỉ có kana, Latin, tiếng Việt hoặc dấu câu trả về mảng rỗng.",
    "- Không sửa chuỗi nguồn. turnsFurigana phải cùng số phần tử và thứ tự với turns; optionsFurigana phải cùng số phần tử và thứ tự với options.",
    "",
    "PHẦN GIẢI THÍCH:",
    "- correctIndex là chỉ số bắt đầu từ 0; đáp án đúng là options[correctIndex]. Không nhầm chỉ số mảng với số thứ tự người học nhìn thấy. Trong explanation hãy tránh ghi số đáp án, chỉ nói 'lựa chọn đúng' và mô tả nội dung cụ thể.",
    "- Viết explanation bằng tiếng Việt, ngắn gọn, nêu manh mối cụ thể trong hội thoại/câu hỏi khiến lựa chọn đúng có correctIndex.",
    "- Viết optionExplanations cùng số lượng và thứ tự với options. Giải thích riêng từng lựa chọn: vì sao lựa chọn đúng khớp ngữ cảnh, và từng lựa chọn sai khác ý/cấu trúc nào. Không lặp lại cùng một câu chung cho mọi lựa chọn.",
    "- Ưu tiên chỉ ra khác biệt cụ thể trong câu tiếng Nhật (ví dụ: không ở lại / không giúp / đã có hẹn). Tránh chỉ nhận xét chung như 'nghe tự nhiên', 'bất lịch sự' hoặc 'thô lỗ' nếu không có căn cứ rõ từ câu thoại. Kiểm tra lại rằng mọi khẳng định khớp chính xác với options và optionsVi, không thêm hành động không có trong lựa chọn.",
    "- Dùng bản dịch tiếng Việt nếu có để hiểu nghĩa, nhưng bám vào tiếng Nhật và ngữ cảnh. Với bộ kaiwa-100cau, options thường là bản dịch tiếng Việt; so sánh từng nghĩa với câu thoại.",
    "- Nếu dữ liệu nguồn không đủ để kết luận về một lựa chọn, hãy nói rõ chưa đủ dữ liệu thay vì tự bịa tình tiết.",
    "- Với câu không có lựa chọn bằng chữ (ví dụ đáp án là hình), trả về optionExplanations là [] và giải thích giới hạn đó trong explanation nếu không thể suy luận đáng tin cậy.",
    "",
    "Mỗi phần tử kết quả phải có đúng các trường: id, scenarioFurigana, turnsFurigana, questionFurigana, optionsFurigana, explanation, optionExplanations.",
    correction ? `\nSỬA KẾT QUẢ TRƯỚC: ${correction}. Hãy kiểm tra word phải là chuỗi con nguyên văn theo đúng thứ tự trong chuỗi nguồn; reading chỉ được ghi bằng kana.` : "",
    "",
    JSON.stringify(questions.map(japaneseInput)),
  ].join("\n");
}

function makeResponseSchema() {
  return {
    type: "ARRAY",
    items: {
      type: "OBJECT",
      properties: {
        id: { type: "STRING" },
        scenarioFurigana: annotationsSchema,
        turnsFurigana: { type: "ARRAY", items: annotationsSchema },
        questionFurigana: annotationsSchema,
        optionsFurigana: { type: "ARRAY", items: annotationsSchema },
        explanation: { type: "STRING" },
        optionExplanations: { type: "ARRAY", items: { type: "STRING" } },
      },
      required: [
        "id",
        "scenarioFurigana",
        "turnsFurigana",
        "questionFurigana",
        "optionsFurigana",
        "explanation",
        "optionExplanations",
      ],
    },
  };
}

async function sendGeminiJson(apiKey: string, prompt: string, responseSchema: unknown): Promise<unknown> {
  const waitMs = DELAY_MS - (Date.now() - lastGeminiRequestAt);
  if (waitMs > 0) await sleep(waitMs);
  lastGeminiRequestAt = Date.now();
  apiCallCount++;

  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
    method: "POST",
    headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema,
        temperature: 0.2,
      },
    }),
    signal: AbortSignal.timeout(90_000),
  });

  if (!res.ok) {
    const message = await res.text();
    const error = new Error(`Gemini HTTP ${res.status}: ${message.slice(0, 500)}`);
    const retryAfter = Number(res.headers.get("retry-after"));
    Object.assign(error, {
      status: res.status,
      retryAfterMs: Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : undefined,
    });
    throw error;
  }

  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error(`Gemini returned no JSON text: ${JSON.stringify(data).slice(0, 500)}`);
  return JSON.parse(text);
}

async function callGemini(apiKey: string, questions: Question[], correction?: string): Promise<Enrichment[]> {
  const parsed = await sendGeminiJson(apiKey, makePrompt(questions, correction), makeResponseSchema());
  if (!Array.isArray(parsed)) throw new Error("Gemini response was not a JSON array");
  return parsed as Enrichment[];
}

function hasKanji(text: string): boolean {
  return /[\u3400-\u9fff々〆ヶ]/u.test(text);
}

function validateAnnotations(source: string, annotations: Annotation[], label: string, requireCoverage = true): Annotation[] {
  if (!Array.isArray(annotations)) throw new Error(`${label}: furigana annotations are missing`);
  let cursor = 0;
  const covered = new Array<boolean>(source.length).fill(false);
  for (const annotation of annotations) {
    if (typeof annotation.word !== "string" || typeof annotation.reading !== "string") {
      throw new Error(`${label}: each annotation needs word and reading strings`);
    }
    if (!hasKanji(annotation.word) || !annotation.reading) {
      throw new Error(`${label}: annotation must include a kanji word and its reading`);
    }
    if (!/^[\u3041-\u3096\u30a1-\u30faー]+$/u.test(annotation.reading)) {
      throw new Error(`${label}: reading must contain kana only (${annotation.reading})`);
    }
    const start = source.indexOf(annotation.word, cursor);
    if (start < cursor) throw new Error(`${label}: word is not an exact in-order source substring (${annotation.word}); source=${JSON.stringify(source)}`);
    const end = start + annotation.word.length;
    for (let index = start; index < end; index++) covered[index] = true;
    cursor = end;
  }
  if (requireCoverage) {
    for (let index = 0; index < source.length; index++) {
      if (hasKanji(source[index]) && !covered[index]) {
        throw new Error(
          `${label}: missing reading for kanji near "${source.slice(Math.max(0, index - 2), index + 8)}"; annotations=${JSON.stringify(annotations)}`,
        );
      }
    }
  }
  return annotations;
}

function validateResult(question: Question, result: Enrichment, requireCoverage = true): void {
  if (!result || result.id !== question.id) throw new Error(`Expected id ${question.id}`);
  result.scenarioFurigana = validateAnnotations(question.scenario, result.scenarioFurigana, `${question.id} scenario`, requireCoverage);
  result.questionFurigana = validateAnnotations(question.question, result.questionFurigana, `${question.id} question`, requireCoverage);
  if (result.turnsFurigana?.length !== question.turns.length) throw new Error(`${question.id}: turnsFurigana count mismatch`);
  question.turns.forEach((turn, index) => {
    result.turnsFurigana[index] = validateAnnotations(turn.text, result.turnsFurigana[index], `${question.id} turn ${index + 1}`, requireCoverage);
  });
  if (result.optionsFurigana?.length !== question.options.length) throw new Error(`${question.id}: optionsFurigana count mismatch`);
  question.options.forEach((option, index) => {
    result.optionsFurigana[index] = validateAnnotations(option, result.optionsFurigana[index], `${question.id} option ${index + 1}`, requireCoverage);
  });
  if (!result.explanation?.trim()) throw new Error(`${question.id}: explanation is empty`);
  if (result.optionExplanations?.length !== question.options.length) throw new Error(`${question.id}: optionExplanations count mismatch`);
  if (question.options.length > 0 && result.optionExplanations.some((text) => !text?.trim())) {
    throw new Error(`${question.id}: one or more answer choices have no explanation`);
  }
}

function getAnnotationSlots(question: Question, result: Enrichment): AnnotationSlot[] {
  const slots: AnnotationSlot[] = [
    {
      field: "scenarioFurigana",
      source: question.scenario,
      annotations: result.scenarioFurigana,
      set: (annotations) => { result.scenarioFurigana = annotations; },
    },
    {
      field: "questionFurigana",
      source: question.question,
      annotations: result.questionFurigana,
      set: (annotations) => { result.questionFurigana = annotations; },
    },
  ];
  question.turns.forEach((turn, index) => slots.push({
    field: `turnsFurigana:${index}`,
    source: turn.text,
    annotations: result.turnsFurigana[index],
    set: (annotations) => { result.turnsFurigana[index] = annotations; },
  }));
  question.options.forEach((option, index) => slots.push({
    field: `optionsFurigana:${index}`,
    source: option,
    annotations: result.optionsFurigana[index],
    set: (annotations) => { result.optionsFurigana[index] = annotations; },
  }));
  return slots;
}

function sanitizeAnnotations(source: string, annotations: Annotation[], label: string): Annotation[] {
  if (!Array.isArray(annotations)) {
    console.log(`  ${label}: missing annotation array; Gemini will fill the gaps.`);
    return [];
  }
  const valid: Annotation[] = [];
  let cursor = 0;
  let dropped = 0;
  for (const annotation of annotations) {
    if (typeof annotation?.word !== "string" || typeof annotation?.reading !== "string") {
      dropped++;
      continue;
    }
    const start = source.indexOf(annotation.word, cursor);
    const validReading = /^[\u3041-\u3096\u30a1-\u30faー]+$/u.test(annotation.reading);
    if (start < cursor || !hasKanji(annotation.word) || !validReading) {
      dropped++;
      continue;
    }
    valid.push(normalizeOkuriganaReading(source, start, annotation));
    cursor = start + annotation.word.length;
  }
  if (dropped > 0) console.log(`  ${label}: discarded ${dropped} annotation(s) that did not match the source; Gemini will fill the gaps.`);
  return valid;
}

function normalizeOkuriganaReading(source: string, start: number, annotation: Annotation): Annotation {
  if (!hasKanji(annotation.word) || !hasKanji(annotation.word[annotation.word.length - 1] ?? "")) return annotation;
  const end = start + annotation.word.length;
  const followingKana = source.slice(end).match(/^[\u3041-\u3096]+/u)?.[0] ?? "";
  const maxLength = Math.min(followingKana.length, annotation.reading.length - 1);
  for (let length = maxLength; length > 0; length--) {
    const suffix = followingKana.slice(0, length);
    if (annotation.reading.endsWith(suffix)) {
      return { ...annotation, reading: annotation.reading.slice(0, -length) };
    }
  }
  return annotation;
}

function sanitizeResult(question: Question, result: Enrichment): void {
  for (const slot of getAnnotationSlots(question, result)) {
    slot.set(sanitizeAnnotations(slot.source, slot.annotations, `${question.id} ${slot.field}`));
  }
}

function missingKanjiContexts(source: string, annotations: Annotation[]): { position: number; character: string; context: string }[] {
  const covered = new Array<boolean>(source.length).fill(false);
  let cursor = 0;
  for (const annotation of annotations) {
    const start = source.indexOf(annotation.word, cursor);
    if (start < 0) continue;
    for (let index = start; index < start + annotation.word.length; index++) covered[index] = true;
    cursor = start + annotation.word.length;
  }

  const missing: { position: number; character: string; context: string }[] = [];
  for (let index = 0; index < source.length; index++) {
    if (hasKanji(source[index]) && !covered[index]) {
      missing.push({
        position: index,
        character: source[index],
        context: source.slice(Math.max(0, index - 9), Math.min(source.length, index + 12)),
      });
    }
  }
  return missing;
}

function makeRepairSchema() {
  return {
    type: "ARRAY",
    items: {
      type: "OBJECT",
      properties: {
        id: { type: "STRING" },
        repairs: {
          type: "ARRAY",
          items: {
            type: "OBJECT",
            properties: {
              field: { type: "STRING" },
              additions: {
                type: "ARRAY",
                items: {
                  type: "OBJECT",
                  properties: {
                    position: { type: "INTEGER" },
                    word: { type: "STRING" },
                    reading: { type: "STRING" },
                  },
                  required: ["position", "word", "reading"],
                },
              },
            },
            required: ["field", "additions"],
          },
        },
      },
      required: ["id", "repairs"],
    },
  };
}

function makeCharacterRepairSchema() {
  return {
    type: "ARRAY",
    items: {
      type: "OBJECT",
      properties: {
        id: { type: "STRING" },
        repairs: {
          type: "ARRAY",
          items: {
            type: "OBJECT",
            properties: {
              field: { type: "STRING" },
              readings: {
                type: "ARRAY",
                items: {
                  type: "OBJECT",
                  properties: {
                    position: { type: "INTEGER" },
                    reading: { type: "STRING" },
                  },
                  required: ["position", "reading"],
                },
              },
            },
            required: ["field", "readings"],
          },
        },
      },
      required: ["id", "repairs"],
    },
  };
}

async function repairMissingFurigana(apiKey: string, questions: Question[], results: Enrichment[]): Promise<void> {
  const requested = questions.flatMap((question, index) => {
    const result = results[index];
    return getAnnotationSlots(question, result)
      .map((slot) => ({ ...slot, missing: missingKanjiContexts(slot.source, slot.annotations) }))
      .filter((slot) => slot.missing.length > 0)
      .map(({ field, source, annotations, missing }) => ({ field, source, annotations, missing, id: question.id }));
  });
  if (requested.length === 0) return;

  console.log(`  Completing missing kanji readings in ${requested.length} text field(s)...`);
  let correction: string | undefined;
  for (let attempt = 0; attempt < 3; attempt++) {
    const prompt = [
      "Hãy bổ sung furigana còn thiếu trong dữ liệu luyện nghe tiếng Nhật. Chỉ trả về JSON array theo schema.",
      "Mỗi phần tử gồm id và repairs. Với mỗi field, trả về additions CHỈ cho các vị trí kanji còn thiếu; không lặp lại annotation hiện tại. Mỗi addition gồm position (vị trí chữ Hán cần được bao phủ, đếm từ 0), word và reading.",
      "Mỗi vị trí trong missing phải được một word bao phủ. word phải là chuỗi con nguyên văn của source và bao gồm ký tự tại position; word có thể bắt đầu trước position để giữ tiền tố như お, và có thể gồm okurigana/kanji liền kề. Reading là cách đọc đầy đủ của word bằng kana, không có kanji/dấu câu/khoảng trắng.",
      "Ví dụ: 気に入った phải có reading きにいった (không được để kanji 入 trong reading); 買い物 là かいもの.",
      "Chọn cách đọc theo toàn bộ source, không đoán âm máy móc. Không thêm từ ngoài source. Nếu nhiều kanji thuộc cùng một từ, có thể trả một word bao phủ chúng; tránh các word chồng lấn nhau.",
      correction ? `Lần trước chưa đạt kiểm tra: ${correction}. Hãy sửa chính xác các trường được yêu cầu.` : "",
      JSON.stringify(requested),
    ].filter(Boolean).join("\n");

    try {
      const parsed = await sendGeminiJson(apiKey, prompt, makeRepairSchema());
      if (!Array.isArray(parsed)) throw new Error("Furigana repair response was not an array");
      const byId = new Map((parsed as { id: string; repairs: { field: string; additions: (Annotation & { position: number })[] }[] }[]).map((item) => [item.id, item]));
      const repairedResults: Enrichment[] = results.map((result) => ({
        ...result,
        scenarioFurigana: [...result.scenarioFurigana],
        turnsFurigana: result.turnsFurigana.map((items) => [...items]),
        questionFurigana: [...result.questionFurigana],
        optionsFurigana: result.optionsFurigana.map((items) => [...items]),
      }));
      for (let questionIndex = 0; questionIndex < questions.length; questionIndex++) {
        const question = questions[questionIndex];
        const questionRepairs = byId.get(question.id)?.repairs ?? [];
        const repairMap = new Map(questionRepairs.map((repair) => [repair.field, repair.additions]));
        const result = repairedResults[questionIndex];
        for (const slot of getAnnotationSlots(question, result)) {
          if (!requested.some((item) => item.id === question.id && item.field === slot.field)) continue;
          const additions = repairMap.get(slot.field);
          if (!additions) throw new Error(`${question.id} ${slot.field}: Gemini omitted repair`);
          const existing: { position: number; end: number; annotation: Annotation }[] = [];
          let cursor = 0;
          for (const current of slot.annotations) {
            const start = slot.source.indexOf(current.word, cursor);
            if (start < 0) throw new Error(`${question.id} ${slot.field}: existing annotation no longer matches source`);
            existing.push({ position: start, end: start + current.word.length, annotation: current });
            cursor = start + current.word.length;
          }
          const seenAdditions = new Set<string>();
          const additionRanges: { position: number; end: number; annotation: Annotation }[] = [];
          for (const addition of additions) {
            if (!Number.isInteger(addition.position) || addition.position < 0 || addition.position >= slot.source.length || !addition.word) {
              throw new Error(`${question.id} ${slot.field}: repair has an invalid position or word`);
            }
            if (!hasKanji(addition.word) || !addition.reading || !/^[\u3041-\u3096\u30a1-\u30faー]+$/u.test(addition.reading)) {
              throw new Error(`${question.id} ${slot.field}: repair must contain a kanji word and kana-only reading (${JSON.stringify(addition)})`);
            }
            let actualPosition = -1;
            const firstPossibleStart = Math.max(0, addition.position - addition.word.length + 1);
            for (let start = firstPossibleStart; start <= addition.position; start++) {
              if (slot.source.slice(start, start + addition.word.length) === addition.word && addition.position < start + addition.word.length) {
                actualPosition = start;
                break;
              }
            }
            if (actualPosition < 0) throw new Error(`${question.id} ${slot.field}: repair word does not contain its requested source position (${addition.word})`);
            const additionKey = `${actualPosition}\u0000${addition.word}\u0000${addition.reading}`;
            if (seenAdditions.has(additionKey)) continue;
            seenAdditions.add(additionKey);
            const end = actualPosition + addition.word.length;
            if (additionRanges.some((range) => actualPosition < range.end && end > range.position)) {
              throw new Error(`${question.id} ${slot.field}: generated repairs overlap each other (${addition.word})`);
            }
            additionRanges.push({
              position: actualPosition,
              end,
              annotation: normalizeOkuriganaReading(slot.source, actualPosition, { word: addition.word, reading: addition.reading }),
            });
          }
          const positioned = [
            ...existing.filter((current) => !additionRanges.some((addition) => current.position < addition.end && current.end > addition.position)),
            ...additionRanges,
          ];
          const merged = positioned.sort((left, right) => left.position - right.position).map(({ annotation }) => annotation);
          slot.set(validateAnnotations(slot.source, merged, `${question.id} ${slot.field}`, true));
        }
      }
      for (let index = 0; index < questions.length; index++) validateResult(questions[index], repairedResults[index], true);
      results.splice(0, results.length, ...repairedResults);
      return;
    } catch (error) {
      correction = String(error).slice(0, 500);
      if (attempt === 2) throw new Error(`Gemini could not complete furigana coverage: ${correction}`);
      console.log(`  Furigana repair needs another pass: ${correction.slice(0, 180)}.`);
    }
  }
}

async function repairMissingFuriganaByCharacter(apiKey: string, question: Question, result: Enrichment): Promise<void> {
  const slots = getAnnotationSlots(question, result).map((slot) => ({
    ...slot,
    missing: missingKanjiContexts(slot.source, slot.annotations),
  })).filter((slot) => slot.missing.length > 0);
  if (slots.length === 0) return;

  console.log(`  Falling back to individual kanji readings for ${question.id} (${slots.length} field(s)).`);
  let correction: string | undefined;
  for (let attempt = 0; attempt < 3; attempt++) {
    const prompt = [
      "Bổ sung cách đọc cho các chữ Hán còn thiếu. Chỉ trả về JSON array theo schema.",
      "Mỗi phần tử gồm id và repairs; mỗi repair có field và readings. Trả về đúng một reading cho từng position yêu cầu, không bỏ sót vị trí nào.",
      "reading chỉ là cách đọc bằng hiragana/katakana của đúng chữ Hán ở position trong ngữ cảnh source; tuyệt đối không chép kanji vào reading và không thêm okurigana/phần kana đứng sau chữ đó.",
      "Ví dụ: 気に入った tại 入 -> い; 使って tại 使 -> つか; 何と言いますか tại 何 -> なん. Dùng ngữ cảnh đầy đủ để chọn cách đọc, không chọn âm từ điển máy móc.",
      correction ? `Lần trước bị lỗi kiểm tra: ${correction}. Sửa đúng các readings và vị trí.` : "",
      JSON.stringify(slots.map(({ field, source, annotations, missing }) => ({ field, source, annotations, missing, id: question.id }))),
    ].filter(Boolean).join("\n");

    try {
      const parsed = await sendGeminiJson(apiKey, prompt, makeCharacterRepairSchema());
      if (!Array.isArray(parsed)) throw new Error("Character-level furigana repair response was not an array");
      const item = (parsed as { id: string; repairs: { field: string; readings: { position: number; reading: string }[] }[] }[])
        .find((entry) => entry.id === question.id);
      if (!item) throw new Error(`${question.id}: Gemini omitted character-level repairs`);
      const repairs = new Map(item.repairs.map((repair) => [repair.field, repair.readings]));
      const repairedResult: Enrichment = {
        ...result,
        scenarioFurigana: [...result.scenarioFurigana],
        turnsFurigana: result.turnsFurigana.map((items) => [...items]),
        questionFurigana: [...result.questionFurigana],
        optionsFurigana: result.optionsFurigana.map((items) => [...items]),
      };
      for (const slot of slots) {
        const readings = repairs.get(slot.field);
        if (!readings) throw new Error(`${question.id} ${slot.field}: Gemini omitted character readings`);
        const readingByPosition = new Map(readings.map((entry) => [entry.position, entry.reading]));
        const additions: { position: number; annotation: Annotation }[] = [];
        for (const missing of slot.missing) {
          const reading = readingByPosition.get(missing.position);
          if (typeof reading !== "string" || !/^[\u3041-\u3096\u30a1-\u30faー]+$/u.test(reading)) {
            throw new Error(`${question.id} ${slot.field}: invalid reading at ${missing.position}: ${JSON.stringify(reading)}`);
          }
          additions.push({
            position: missing.position,
            annotation: normalizeOkuriganaReading(slot.source, missing.position, { word: missing.character, reading }),
          });
        }

        const existing: { position: number; annotation: Annotation }[] = [];
        let cursor = 0;
        for (const annotation of slot.annotations) {
          const position = slot.source.indexOf(annotation.word, cursor);
          if (position < 0) throw new Error(`${question.id} ${slot.field}: existing word no longer matches source`);
          existing.push({ position, annotation });
          cursor = position + annotation.word.length;
        }
        const all = [...existing, ...additions].sort((left, right) => left.position - right.position);
        const targetSlot = getAnnotationSlots(question, repairedResult).find((candidate) => candidate.field === slot.field);
        if (!targetSlot) throw new Error(`${question.id}: unknown furigana field ${slot.field}`);
        targetSlot.set(validateAnnotations(slot.source, all.map(({ annotation }) => annotation), `${question.id} ${slot.field}`, true));
      }
      validateResult(question, repairedResult, true);
      Object.assign(result, repairedResult);
      return;
    } catch (error) {
      correction = String(error).slice(0, 500);
      if (attempt === 2) throw new Error(`Character-level Gemini furigana repair failed: ${correction}`);
      console.log(`  Character-level repair needs another pass: ${correction.slice(0, 180)}.`);
    }
  }
}

async function repairBatchWithFallback(apiKey: string, questions: Question[], results: Enrichment[]): Promise<void> {
  try {
    await repairMissingFurigana(apiKey, questions, results);
  } catch (error) {
    if (questions.length === 1) {
      await repairMissingFuriganaByCharacter(apiKey, questions[0], results[0]);
      return;
    }
    const midpoint = Math.ceil(questions.length / 2);
    console.log(`  Retrying furigana repair in smaller groups (${String(error).slice(0, 140)}).`);
    const leftResults = results.slice(0, midpoint);
    const rightResults = results.slice(midpoint);
    await repairBatchWithFallback(apiKey, questions.slice(0, midpoint), leftResults);
    await repairBatchWithFallback(apiKey, questions.slice(midpoint), rightResults);
    results.splice(0, results.length, ...leftResults, ...rightResults);
  }
}

async function generateBatch(
  apiKey: string,
  questions: Question[],
  correction?: string,
  correctionAttempt = 0,
): Promise<Enrichment[]> {
  try {
    let response: Enrichment[] | undefined;
    for (let attempt = 0; attempt < 5 && !response; attempt++) {
      try {
        response = await callGemini(apiKey, questions, correction);
      } catch (error) {
        const status = (error as { status?: number }).status;
        const retryable = status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
        if (!retryable || attempt === 4) throw error;
        const waitMs = Math.min(60_000, (error as { retryAfterMs?: number }).retryAfterMs ?? 5_000 * 2 ** attempt);
        console.log(`  Gemini temporary error; retrying in ${Math.ceil(waitMs / 1000)}s.`);
        await sleep(waitMs);
      }
    }
    if (!response) throw new Error("Gemini did not return a response");
    if (response.length !== questions.length) throw new Error("Gemini response count mismatch");
    const byId = new Map(response.map((item) => [item.id, item]));
    if (byId.size !== questions.length) throw new Error("Gemini returned duplicate/missing ids");
    const ordered = questions.map((question) => {
      const result = byId.get(question.id);
      if (!result) throw new Error(`Gemini omitted ${question.id}`);
      sanitizeResult(question, result);
      validateResult(question, result, false);
      return result;
    });
    return ordered;
  } catch (error) {
    if (questions.length === 1 && correctionAttempt < 2) {
      console.log(`  Asking Gemini to repair ${questions[0].id}: ${String(error).slice(0, 150)}.`);
      return generateBatch(apiKey, questions, String(error).slice(0, 400), correctionAttempt + 1);
    }
    if (questions.length === 1) throw error;
    const midpoint = Math.ceil(questions.length / 2);
    console.log(`  Retrying batch of ${questions.length} as smaller batches (${String(error).slice(0, 180)}).`);
    const left = await generateBatch(apiKey, questions.slice(0, midpoint));
    const right = await generateBatch(apiKey, questions.slice(midpoint));
    return [...left, ...right];
  }
}

function applyResult(question: Question, result: Enrichment): void {
  question.scenarioFurigana = result.scenarioFurigana;
  question.questionFurigana = result.questionFurigana;
  question.optionFurigana = result.optionsFurigana;
  question.explanation = result.explanation;
  question.optionExplanations = result.optionExplanations;
  question.turns.forEach((turn, index) => {
    turn.furigana = result.turnsFurigana[index];
  });
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const requestedId = args.find((arg) => arg.startsWith("--id="))?.slice("--id=".length);
  const limitValue = args.find((arg) => arg.startsWith("--limit="))?.slice("--limit=".length);
  const limit = limitValue ? Number(limitValue) : undefined;
  if (limit !== undefined && (!Number.isInteger(limit) || limit < 1)) throw new Error("--limit must be a positive integer");
  if (dryRun && !requestedId && !limit) throw new Error("Use --id or --limit with --dry-run to keep the pilot small");

  const apiKey = readApiKey();
  const cache = loadCache();
  let processed = 0;

  for (const file of DATA_FILES) {
    const dataPath = join(ROOT, "src/data", file);
    const dataset = JSON.parse(readFileSync(dataPath, "utf8")) as Dataset;
    const questions = requestedId
      ? dataset.questions.filter((question) => question.id === requestedId)
      : limit
        ? dataset.questions.slice(0, limit)
        : dataset.questions;
    if (requestedId && questions.length === 0) continue;

    const remaining = questions.filter((question) => !cache[`${file}|${question.id}`]);
    console.log(`${file}: ${questions.length} question(s), ${remaining.length} need Gemini.`);

    for (let index = 0; index < remaining.length; index += BATCH_SIZE) {
      const batch = remaining.slice(index, index + BATCH_SIZE);
      console.log(`  Generating ${Math.min(index + batch.length, remaining.length)}/${remaining.length}...`);
      const generated = await generateBatch(apiKey, batch);
      await repairBatchWithFallback(apiKey, batch, generated);
      generated.forEach((result, resultIndex) => validateResult(batch[resultIndex], result, true));
      generated.forEach((result) => {
        cache[`${file}|${result.id}`] = result;
      });
      if (!dryRun) writeJsonAtomic(CACHE_PATH, cache);
      processed += generated.length;
    }

    if (dryRun) {
      const sample = questions[0];
      const result = cache[`${file}|${sample.id}`];
      if (result) console.log(JSON.stringify(result, null, 2));
      continue;
    }

    for (const question of questions) {
      const result = cache[`${file}|${question.id}`];
      if (!result) throw new Error(`No generated result for ${file} ${question.id}`);
      validateResult(question, result);
      applyResult(question, result);
      delete cache[`${file}|${question.id}`];
    }
    writeJsonAtomic(dataPath, dataset);
    writeJsonAtomic(CACHE_PATH, cache);
    console.log(`  Wrote ${questions.length} question(s) to ${dataPath}.`);
  }

  if (requestedId && processed === 0) throw new Error(`Question id not found: ${requestedId}`);
  console.log(dryRun ? `Dry run complete; made ${apiCallCount} Gemini call(s).` : `Complete; generated ${processed} question(s) with ${apiCallCount} Gemini call(s).`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
