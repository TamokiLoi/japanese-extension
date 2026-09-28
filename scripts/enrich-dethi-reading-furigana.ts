// Use Gemini to add furigana to every registered past JLPT reading passage.
// API key and resumable cache stay in the ignored local _scratch directory.
//
// Usage:
//   node --experimental-strip-types scripts/enrich-dethi-reading-furigana.ts --dry-run
//   node --experimental-strip-types scripts/enrich-dethi-reading-furigana.ts --preview --limit 1
//   node --experimental-strip-types scripts/enrich-dethi-reading-furigana.ts

import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { DeThiDataset, DeThiPaper, DeThiQuestion } from "../src/types/dethi.ts";

const ROOT = join(import.meta.dirname, "..");
const MODEL = "gemini-3.5-flash-lite";
const CACHE_VERSION = 3;
const DATASETS: { path: string; paperId: string; readingGroups: string[] }[] = [
  { path: "src/data/dethi-n3-cac-nam.json", paperId: "bunpou-dokkai", readingGroups: ["問題3", "問題4", "問題5", "問題6", "問題7"] },
  { path: "src/data/dethi-n1-cac-nam.json", paperId: "language-reading", readingGroups: ["問題7", "問題8", "問題9", "問題10", "問題11", "問題12", "問題13"] },
];
const CACHE_PATH = join(ROOT, `_scratch/dethi-reading-furigana-cache-${MODEL}.json`);
const DELAY_MS = 4_300;
const MAX_CHUNKS_PER_REQUEST = 16;
const HAS_KANJI = /[\u3400-\u9fff々〆ヶ]/u;
const KANA_ONLY = /^[\u3041-\u3096\u30a1-\u30faー]+$/u;

interface SourceFile { path: string; data: DeThiDataset }
interface TargetQuestion { id: string; question: DeThiQuestion }
interface Target {
  id: string;
  file: string;
  examLabel: string;
  section: string;
  problemGroup: string;
  passage: string;
  chunks: string[];
  questions: TargetQuestion[];
}
interface ChunkTarget extends Omit<Target, "questions" | "chunks"> { chunkIndex: number }
interface Annotation { word: string; reading: string }
interface Enrichment { id: string; annotations: Annotation[] }
interface PassageEnrichment { id: string; segments: { text: string; furigana: string | null }[] }
interface CachedEnrichment { version: number; result: PassageEnrichment }
type Cache = Record<string, CachedEnrichment>;

let lastGeminiRequestAt = 0;
let apiCallCount = 0;

function parseArgs() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const preview = args.includes("--preview");
  const force = args.includes("--force");
  const limitIndex = args.indexOf("--limit");
  const idIndex = args.indexOf("--id");
  const limit = limitIndex >= 0 ? Number(args[limitIndex + 1]) : undefined;
  const id = idIndex >= 0 ? args[idIndex + 1] : undefined;
  if (limitIndex >= 0 && (!Number.isInteger(limit) || (limit ?? 0) < 1)) throw new Error("--limit must be a positive number of passage groups");
  if (idIndex >= 0 && (!id || id.startsWith("--"))) throw new Error("--id must be followed by a stable passage-group id");
  if (dryRun && preview) throw new Error("Use either --dry-run or --preview, not both");
  if (preview && !limit && !id) throw new Error("--preview requires --limit N or --id so it only translates a small sample");
  return { dryRun, preview, force, limit, id };
}

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

function sleep(ms: number): Promise<void> { return new Promise((resolve) => setTimeout(resolve, ms)); }

function writeJsonAtomic(path: string, data: unknown): void {
  const tempPath = `${path}.tmp`;
  writeFileSync(tempPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  renameSync(tempPath, path);
}

function loadCache(): Cache {
  if (!existsSync(CACHE_PATH)) return {};
  return JSON.parse(readFileSync(CACHE_PATH, "utf8")) as Cache;
}

function isSamePassageMarker(text: string | null | undefined): boolean {
  return text === "（上記と同じ）" || text === "（同上）";
}

function splitPassage(passage: string, maxChars = 60): string[] {
  const chunks: string[] = [];
  const isBoundary = (char: string) => /[。！？!?、，,\n]/u.test(char);
  let start = 0;
  while (start < passage.length) {
    const hardEnd = Math.min(start + maxChars, passage.length);
    if (hardEnd === passage.length) {
      chunks.push(passage.slice(start));
      break;
    }
    let end = -1;
    for (let i = hardEnd - 1; i >= start; i--) {
      if (isBoundary(passage[i])) { end = i + 1; break; }
    }
    if (end < 0) {
      const softEnd = Math.min(hardEnd + 60, passage.length);
      for (let i = hardEnd; i < softEnd; i++) {
        if (isBoundary(passage[i])) { end = i + 1; break; }
      }
    }
    if (end <= start) end = hardEnd;
    chunks.push(passage.slice(start, end));
    start = end;
  }
  return chunks;
}

function resolvePassage(paper: DeThiPaper, index: number): string | null {
  const current = paper.questions[index];
  if (!current?.passage) return null;
  if (!isSamePassageMarker(current.passage)) return current.passage;
  for (let i = index - 1; i >= 0; i--) {
    const earlier = paper.questions[i];
    if (earlier.problemGroup !== current.problemGroup) break;
    if (earlier.passage && !isSamePassageMarker(earlier.passage)) return earlier.passage;
  }
  return current.passage;
}

function validExistingFurigana(passage: string, segments: DeThiQuestion["passageFurigana"]): boolean {
  if (!segments?.length || segments.map(({ text }) => text).join("") !== passage) return false;
  const covered = new Array<boolean>(passage.length).fill(false);
  let offset = 0;
  for (const segment of segments) {
    if (passage.slice(offset, offset + segment.text.length) !== segment.text) return false;
    if (segment.furigana) {
      if (!KANA_ONLY.test(segment.furigana)) return false;
      for (let i = offset; i < offset + segment.text.length; i++) covered[i] = true;
    }
    offset += segment.text.length;
  }
  if (offset !== passage.length) return false;
  return Array.from(passage).every((char, index) => !HAS_KANJI.test(char) || covered[index]);
}

function cachedResultMatchesTarget(target: Target, entry: CachedEnrichment | undefined): boolean {
  return entry?.version === CACHE_VERSION && validExistingFurigana(target.passage, entry.result?.segments);
}

function collectTargets(force: boolean): { sources: SourceFile[]; targets: Target[] } {
  const sources: SourceFile[] = [];
  const targets: Target[] = [];
  for (const spec of DATASETS) {
    const data = JSON.parse(readFileSync(join(ROOT, spec.path), "utf8")) as DeThiDataset;
    sources.push({ path: spec.path, data });
    for (const exam of data.exams) {
      for (const paper of exam.papers) {
        if (paper.id !== spec.paperId) continue;
        for (const problemGroup of spec.readingGroups) {
          let currentPassage: string | null = null;
          let currentTarget: Target | null = null;
          const flush = () => {
            if (!currentTarget) return;
            const hasFurigana = currentTarget.questions.some(({ question }) =>
              validExistingFurigana(currentTarget!.passage, question.passageFurigana),
            );
            if (force || !hasFurigana) targets.push(currentTarget);
            currentTarget = null;
          };
          for (let i = 0; i < paper.questions.length; i++) {
            const question = paper.questions[i];
            if (question.problemGroup !== problemGroup) continue;
            const passage = resolvePassage(paper, i);
            if (!passage || isSamePassageMarker(passage) || question.options.length === 0) continue;
            if (currentPassage !== passage) {
              flush();
              currentPassage = passage;
              currentTarget = {
                id: `${exam.id}/${paper.id}/${problemGroup}/q${question.number}`,
                file: spec.path,
                examLabel: exam.examLabel,
                section: paper.label,
                problemGroup,
                passage,
                chunks: splitPassage(passage),
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

function makePrompt(targets: ChunkTarget[], correction?: string): string {
  return [
    "Bạn là biên tập viên tiếng Nhật chuyên tạo furigana cho bài đọc JLPT. Trả về DUY NHẤT JSON array đúng thứ tự, đủ số phần tử và giữ nguyên id.",
    "Với mỗi passage, tạo annotations gồm mọi từ/cụm từ có kanji theo đúng thứ tự xuất hiện. word phải là chuỗi con nguyên văn liên tục của passage; reading là cách đọc chính xác bằng hiragana/katakana, không có kanji, khoảng trắng hay dấu câu.",
    "Gồm okurigana khi tự nhiên (ví dụ 食べました → たべました), và đọc cả tên riêng theo ngữ cảnh. Không bịa hay sửa passage. Có thể gộp một từ ghép thành một annotation nếu cách đọc đầy đủ rõ ràng; không annotation ký hiệu số câu/chỗ trống như (22).",
    "Tất cả ký tự kanji, kể cả 々/ヶ nếu thuộc từ, phải được bao phủ đúng một lần bởi annotation. Không tạo mục cho kana-only, Latin, chữ số hay dấu câu. Mỗi word phải tìm thấy trong passage sau annotation trước đó.",
    "Mỗi item có đúng hai trường id, annotations; mỗi annotation có đúng hai trường word, reading.",
    correction ? `Kết quả trước bị lỗi: ${correction}. Hãy sửa và kiểm tra lại toàn bộ danh sách.` : "",
    JSON.stringify(targets.map(({ id, examLabel, section, problemGroup, passage }) => ({ id, examLabel, section, problemGroup, passage }))),
  ].filter(Boolean).join("\n\n");
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

async function sendGeminiJson(apiKeys: string[], prompt: string, schema = responseSchema()): Promise<unknown> {
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
      generationConfig: { responseMimeType: "application/json", responseSchema: schema, temperature: 0.1 },
    }),
    signal: AbortSignal.timeout(90_000),
  });
  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Gemini HTTP ${response.status}: ${message.slice(0, 500)}`);
  }
  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Gemini returned no JSON text");
  return JSON.parse(text);
}

function buildSegments(passage: string, annotations: Annotation[], label: string, requireFullCoverage = true) {
  if (!Array.isArray(annotations)) throw new Error(`${label}: annotations missing`);
  const segments: { text: string; furigana: string | null }[] = [];
  let cursor = 0;
  for (const annotation of annotations) {
    if (!annotation || typeof annotation.word !== "string" || typeof annotation.reading !== "string") throw new Error(`${label}: malformed annotation`);
    // Ignore stray kana-only or malformed-reading entries; missing-kanji
    // repair below will fill any source kanji they failed to annotate.
    if (!annotation.word || !HAS_KANJI.test(annotation.word) || !KANA_ONLY.test(annotation.reading)) continue;
    const start = passage.indexOf(annotation.word, cursor);
    // Ignore hallucinated or duplicate annotations. Full kanji coverage below
    // still ensures that each actual source character receives a reading.
    if (start < 0) continue;
    if (start > cursor) segments.push({ text: passage.slice(cursor, start), furigana: null });
    segments.push({ text: annotation.word, furigana: annotation.reading });
    cursor = start + annotation.word.length;
  }
  if (cursor < passage.length) segments.push({ text: passage.slice(cursor), furigana: null });

  const covered = new Array<boolean>(passage.length).fill(false);
  let offset = 0;
  for (const segment of segments) {
    if (segment.furigana) for (let i = offset; i < offset + segment.text.length; i++) covered[i] = true;
    offset += segment.text.length;
  }
  for (let i = 0; requireFullCoverage && i < passage.length; i++) {
    if (HAS_KANJI.test(passage[i]) && !covered[i]) throw new Error(`${label}: missing furigana around ${JSON.stringify(passage.slice(Math.max(0, i - 3), i + 8))}`);
  }
  if (segments.map(({ text }) => text).join("") !== passage) throw new Error(`${label}: segment reconstruction mismatch`);
  return segments;
}

function validateBatch(result: unknown, targets: ChunkTarget[], requireFullCoverage = true): Enrichment[] {
  if (!Array.isArray(result) || result.length !== targets.length) throw new Error(`Expected ${targets.length} results`);
  return result.map((item, index) => {
    const target = targets[index];
    if (!item || typeof item !== "object" || (item as Enrichment).id !== target.id) throw new Error(`Result ${index + 1}: id mismatch`);
    const enrichment = item as Enrichment;
    buildSegments(target.passage, enrichment.annotations, target.id, requireFullCoverage);
    return enrichment;
  });
}

function missingKanjiPositions(passage: string, annotations: Annotation[], label: string) {
  const covered = new Array<boolean>(passage.length).fill(false);
  let cursor = 0;
  for (const annotation of annotations) {
    if (!annotation || typeof annotation.word !== "string" || typeof annotation.reading !== "string" || !annotation.word || !HAS_KANJI.test(annotation.word) || !KANA_ONLY.test(annotation.reading)) continue;
    const start = passage.indexOf(annotation.word, cursor);
    if (start < 0) continue;
    for (let i = start; i < start + annotation.word.length; i++) covered[i] = true;
    cursor = start + annotation.word.length;
  }
  return Array.from(passage).flatMap((char, position) => {
    if (!HAS_KANJI.test(char) || covered[position]) return [];
    return [{ position, character: char, context: passage.slice(Math.max(0, position - 12), Math.min(passage.length, position + 14)) }];
  });
}

function repairResponseSchema() {
  return {
    type: "ARRAY",
    items: {
      type: "OBJECT",
      properties: {
        id: { type: "STRING" },
        annotations: {
          type: "ARRAY",
          items: { type: "OBJECT", properties: { position: { type: "INTEGER" }, word: { type: "STRING" }, reading: { type: "STRING" } }, required: ["position", "word", "reading"] },
        },
      },
      required: ["id", "annotations"],
    },
  };
}

async function repairMissingReadings(apiKeys: string[], targets: ChunkTarget[], results: Enrichment[]): Promise<Enrichment[]> {
  const missing = targets.flatMap((target, index) => {
    const positions = missingKanjiPositions(target.passage, results[index].annotations, target.id);
    return positions.length ? [{ id: target.id, source: target.passage, positions }] : [];
  });
  if (missing.length === 0) return results;

  const prompt = [
    "Hoàn thiện furigana cho các chữ Hán còn thiếu trong passage JLPT. Trả về JSON theo schema.",
    "Mỗi phần tử gồm id và annotations. Trả về đúng một annotation cho từng position được yêu cầu; mỗi annotation có position, word và reading. word phải đúng một ký tự chữ Hán tại position, reading là cách đọc của ký tự đó trong ngữ cảnh source bằng hiragana/katakana, không chứa kanji, khoảng trắng hay dấu câu.",
    "Không được bỏ sót vị trí nào, không thêm vị trí ngoài danh sách. Dùng context quanh chữ Hán và câu nguồn để chọn cách đọc, kể cả âm biến đổi trong từ ghép; ví dụ 買い物 có 買=か、物=もの; 気に入った có 入=い.",
    JSON.stringify(missing),
  ].join("\n\n");
  const response = await sendGeminiJson(apiKeys, prompt, repairResponseSchema());
  if (!Array.isArray(response) || response.length !== missing.length) throw new Error(`Furigana repair expected ${missing.length} items`);
  const responseById = new Map<string, { id?: string; annotations?: { position?: number; word?: string; reading?: string }[] }>();
  for (const item of response as { id?: string; annotations?: { position?: number; word?: string; reading?: string }[] }[]) {
    if (typeof item?.id !== "string" || responseById.has(item.id)) throw new Error("Furigana repair returned a missing or duplicate id");
    responseById.set(item.id, item);
  }
  const repairs = new Map<string, Map<number, string>>();
  for (const requested of missing) {
    const item = responseById.get(requested.id);
    if (!item || !Array.isArray(item.annotations)) throw new Error(`${requested.id}: furigana repair id/annotations mismatch; returned ids=${JSON.stringify([...responseById.keys()])}`);
    const expected = new Set(requested.positions.map(({ position }) => position));
    const readingMap = new Map<number, string>();
    for (const entry of item.annotations) {
      if (!Number.isInteger(entry.position) || !expected.has(entry.position) || entry.word !== requested.source[entry.position] || !KANA_ONLY.test(entry.reading ?? "")) throw new Error(`${requested.id}: invalid repair annotation ${JSON.stringify(entry)}`);
      if (readingMap.has(entry.position)) throw new Error(`${requested.id}: duplicate repair position ${entry.position}`);
      readingMap.set(entry.position, entry.reading);
    }
    if (readingMap.size !== expected.size) throw new Error(`${requested.id}: repair omitted ${expected.size - readingMap.size} positions`);
    repairs.set(requested.id, readingMap);
  }

  return targets.map((target, index) => {
    const readingMap = repairs.get(target.id);
    if (!readingMap) return results[index];
    const existing: { start: number; end: number; annotation: Annotation }[] = [];
    let cursor = 0;
    for (const annotation of results[index].annotations) {
      if (!annotation || typeof annotation.word !== "string" || typeof annotation.reading !== "string" || !annotation.word || !HAS_KANJI.test(annotation.word) || !KANA_ONLY.test(annotation.reading)) continue;
      const start = target.passage.indexOf(annotation.word, cursor);
      if (start < 0) continue;
      existing.push({ start, end: start + annotation.word.length, annotation });
      cursor = start + annotation.word.length;
    }
    const additions = [...readingMap.entries()].map(([position, reading]) => ({
      start: position,
      end: position + 1,
      annotation: { word: target.passage[position], reading },
    }));
    for (const addition of additions) {
      if (existing.some((entry) => addition.start < entry.end && addition.end > entry.start)) throw new Error(`${target.id}: repaired position overlaps existing furigana`);
    }
    const annotations = [...existing, ...additions].sort((left, right) => left.start - right.start).map(({ annotation }) => annotation);
    buildSegments(target.passage, annotations, target.id);
    return { id: target.id, annotations };
  });
}

function flattenChunks(targets: Target[]): ChunkTarget[] {
  return targets.flatMap(({ chunks, ...target }) => chunks.map((passage, chunkIndex) => ({ ...target, passage, chunkIndex, id: `${target.id}::${chunkIndex + 1}` })));
}

async function generateBatch(apiKeys: string[], targets: Target[]): Promise<PassageEnrichment[]> {
  const chunkTargets = flattenChunks(targets);
  let correction: string | undefined;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const initialResults = validateBatch(await sendGeminiJson(apiKeys, makePrompt(chunkTargets, correction)), chunkTargets, false);
      const chunkResults = await repairMissingReadings(apiKeys, chunkTargets, initialResults);
      const chunkResultsById = new Map(chunkResults.map((result) => [result.id, result]));
      return targets.map((target) => {
        const segments = target.chunks.flatMap((chunk, chunkIndex) => {
          const chunkId = `${target.id}::${chunkIndex + 1}`;
          const result = chunkResultsById.get(chunkId);
          if (!result) throw new Error(`${target.id}: Gemini omitted chunk ${chunkIndex + 1}`);
          return buildSegments(chunk, result.annotations, chunkId);
        });
        const reconstructed = segments.map(({ text }) => text).join("");
        if (reconstructed !== target.passage) throw new Error(`${target.id}: chunk segments do not reconstruct the exact passage`);
        let offset = 0;
        for (const segment of segments) {
          if (!segment.furigana) {
            for (let i = offset; i < offset + segment.text.length; i++) {
              if (HAS_KANJI.test(target.passage[i])) throw new Error(`${target.id}: missing furigana after chunk merge`);
            }
          }
          offset += segment.text.length;
        }
        return { id: target.id, segments };
      });
    }
    catch (error) {
      correction = (error as Error).message;
      if (attempt === 3) throw error;
      console.warn(`  attempt ${attempt} failed (${correction}); retrying batch`);
      await sleep(1000 * attempt);
    }
  }
  throw new Error("Unreachable Gemini retry state");
}

async function main() {
  const { dryRun, preview, force, limit, id } = parseArgs();
  const { sources, targets: allTargets } = collectTargets(force);
  const targets = id ? allTargets.filter((target) => target.id === id) : allTargets;
  if (id && targets.length === 0) throw new Error(`No missing passage furigana target found: ${id}`);
  const cache = loadCache();
  console.log(`Model: ${MODEL}`);
  console.log(`Reading passages selected: ${targets.length}`);
  console.log(`Cached results ready: ${targets.filter((target) => cachedResultMatchesTarget(target, cache[target.id])).length}`);
  if (dryRun) return;

  const runTargets = limit ? targets.slice(0, limit) : targets;
  const apiKeys = readApiKeys();
  const pending = runTargets.filter((target) => !cachedResultMatchesTarget(target, cache[target.id]));
  console.log(`To generate in this run: ${pending.length}${preview ? " (preview; source files unchanged)" : ""}`);
  for (let start = 0; start < pending.length;) {
    const batch: Target[] = [];
    let chunkCount = 0;
    while (start + batch.length < pending.length) {
      const next = pending[start + batch.length];
      if (batch.length > 0 && chunkCount + next.chunks.length > MAX_CHUNKS_PER_REQUEST) break;
      batch.push(next);
      chunkCount += next.chunks.length;
      if (chunkCount >= MAX_CHUNKS_PER_REQUEST) break;
    }
    const results = await generateBatch(apiKeys, batch);
    for (let i = 0; i < batch.length; i++) cache[batch[i].id] = { version: CACHE_VERSION, result: results[i] };
    writeJsonAtomic(CACHE_PATH, cache);
    start += batch.length;
    console.log(`Cached ${start}/${pending.length} passages (${apiCallCount} Gemini requests)`);
  }
  const results = new Map<string, PassageEnrichment>();
  for (const target of runTargets) {
    const cached = cache[target.id];
    if (cachedResultMatchesTarget(target, cached)) results.set(target.id, cached.result);
  }
  if (results.size !== runTargets.length) throw new Error(`Missing cached results: ${runTargets.length - results.size}`);
  if (preview) {
    for (const target of runTargets) console.log(JSON.stringify({ id: target.id, segments: results.get(target.id)!.segments }, null, 2));
    return;
  }

  const updatedPaths = new Set(runTargets.map((target) => target.file));
  for (const target of runTargets) {
    target.questions[0].question.passageFurigana = results.get(target.id)!.segments;
  }
  for (const source of sources) {
    if (!updatedPaths.has(source.path)) continue;
    writeJsonAtomic(join(ROOT, source.path), source.data);
    console.log(`${source.path}: annotated ${runTargets.filter((target) => target.file === source.path).length} reading passages`);
  }
}

main().catch((error) => {
  console.error((error as Error).stack ?? error);
  process.exitCode = 1;
});
