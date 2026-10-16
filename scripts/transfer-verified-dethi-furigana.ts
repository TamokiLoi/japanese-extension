// Reuse only exact, fully validated furigana already present in the app's
// dictionaries, reading/listening corpora, and N3 practice papers.
// Defaults to a dry run. Pass --apply to write only unambiguous exact matches
// into the annual N3/N1 JLPT question datasets; existing valid fields are kept.

import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ReadingBodySegment } from "../src/types/reading.ts";
import type { DeThiDataset } from "../src/types/dethi.ts";

const ROOT = join(import.meta.dirname, "..");
const TARGETS = ["src/data/dethi-n3-cac-nam.json", "src/data/dethi-n1-cac-nam.json"];
const HAS_KANJI = /[\u3400-\u9fff々〆ヶ]/u;
const KANA_ONLY = /^[\u3041-\u3096\u30a1-\u30faー]+$/u;

type Segment = ReadingBodySegment;
type Candidate = { segments: Segment[]; source: string };

function hasExactValidCoverage(source: string, segments: unknown): segments is Segment[] {
  if (!Array.isArray(segments) || !segments.length) return false;
  if (segments.some((segment) => !segment || typeof segment.text !== "string" || !segment.text.length)) return false;
  if (segments.map((segment) => segment.text).join("") !== source) return false;
  return segments.every((segment) => {
    const segmentHasKanji = HAS_KANJI.test(segment.text);
    if (segment.furigana === null) return !segmentHasKanji;
    return typeof segment.furigana === "string" && KANA_ONLY.test(segment.furigana) && segmentHasKanji;
  }) && segments.some((segment) => HAS_KANJI.test(segment.text) && !!segment.furigana);
}

function appendCandidate(index: Map<string, Candidate[]>, source: unknown, segments: unknown, provenance: string): void {
  if (typeof source !== "string" || !HAS_KANJI.test(source) || !hasExactValidCoverage(source, segments)) return;
  const list = index.get(source) ?? [];
  // Snapshot the span: callers may keep extending their working array while
  // scanning later segments, but an indexed candidate must remain exact.
  list.push({ segments: segments.map((segment) => ({ ...segment })), source: provenance });
  index.set(source, list);
}

function segmentsFromWordAnnotations(source: string, annotations: unknown): Segment[] | undefined {
  if (!Array.isArray(annotations) || !annotations.length) return undefined;
  const segments: Segment[] = [];
  let cursor = 0;
  for (const annotation of annotations) {
    if (!annotation || typeof annotation.word !== "string" || !annotation.word ||
      typeof annotation.reading !== "string" || !KANA_ONLY.test(annotation.reading) || !HAS_KANJI.test(annotation.word)) return undefined;
    const start = source.indexOf(annotation.word, cursor);
    if (start < 0) return undefined;
    if (start > cursor) segments.push({ text: source.slice(cursor, start), furigana: null });
    segments.push({ text: annotation.word, furigana: annotation.reading });
    cursor = start + annotation.word.length;
  }
  if (cursor < source.length) segments.push({ text: source.slice(cursor), furigana: null });
  return hasExactValidCoverage(source, segments) ? segments : undefined;
}

function makeReadingIndex(targetSources: Set<string>, maxTargetLength: number): Map<string, Candidate[]> {
  const index = new Map<string, Candidate[]>();
  const files = readdirSync(join(ROOT, "src/data"))
    .filter((file) => file.endsWith(".json"))
    .filter((file) => /^(de-n3-set-\d{2}|reading-.+|listening-.+|quizbook-.+|mocktest-.+|vocab-.+)\.json$/u.test(file))
    .map((file) => `src/data/${file}`);

  const visit = (value: unknown, provenance: string): void => {
    if (Array.isArray(value)) {
      if (value.length && value.every((item) => item && typeof item === "object" &&
        typeof (item as Segment).text === "string" &&
        ((item as Segment).furigana === null || typeof (item as Segment).furigana === "string"))) {
        const segments = value as Segment[];
        appendCandidate(index, segments.map((segment) => segment.text).join(""), segments, provenance);
        for (let start = 0; start < segments.length; start++) {
          let text = "";
          const span: Segment[] = [];
          for (let end = start; end < segments.length; end++) {
            const segment = segments[end];
            if (text.length + segment.text.length > maxTargetLength) break;
            text += segment.text;
            span.push(segment);
            // A lone character can have unrelated readings across contexts;
            // do not transfer it from a phrase that happens to contain it.
            if (text.length > 1 && targetSources.has(text)) appendCandidate(index, text, span, `${provenance}[${start}:${end + 1}]`);
          }
        }
      }
      value.forEach((item, itemIndex) => visit(item, `${provenance}[${itemIndex}]`));
      return;
    }
    if (!value || typeof value !== "object") return;
    const record = value as Record<string, unknown>;
    if (typeof record.question === "string") appendCandidate(index, record.question, record.questionFurigana, `${provenance}.questionFurigana`);
    if (Array.isArray(record.options) && Array.isArray(record.optionsFurigana)) {
      record.options.forEach((option, optionIndex) => appendCandidate(index, option, record.optionsFurigana?.[optionIndex], `${provenance}.optionsFurigana[${optionIndex}]`));
    }
    if (typeof record.text === "string" && Array.isArray(record.furigana)) {
      const annotations = record.furigana;
      if (annotations.every((item) => item && typeof item.word === "string" && typeof item.reading === "string")) {
        const segments = segmentsFromWordAnnotations(record.text, annotations);
        appendCandidate(index, record.text, segments, `${provenance}.furigana`);
        if (segments) visit(segments, `${provenance}.furigana-segments`);
      }
    }
    if (typeof record.word === "string" && typeof record.reading === "string" &&
      HAS_KANJI.test(record.word) && KANA_ONLY.test(record.reading)) {
      appendCandidate(index, record.word, [{ text: record.word, furigana: record.reading }], `${provenance}.reading`);
    }
    for (const [key, child] of Object.entries(record)) visit(child, `${provenance}.${key}`);
  };

  for (const file of files) {
    const data = JSON.parse(readFileSync(join(ROOT, file), "utf8")) as unknown;
    visit(data, file);
  }
  return index;
}

function uniqueCandidate(index: Map<string, Candidate[]>, source: string): Candidate | undefined {
  const candidates = (index.get(source) ?? []).filter((candidate) => hasExactValidCoverage(source, candidate.segments));
  const byRenderedReading = new Map<string, Candidate[]>();
  for (const candidate of candidates) {
    const renderedReading = candidate.segments.map((segment) => segment.furigana ?? segment.text).join("");
    const sameReading = byRenderedReading.get(renderedReading) ?? [];
    sameReading.push(candidate);
    byRenderedReading.set(renderedReading, sameReading);
  }
  if (byRenderedReading.size !== 1) return undefined;
  // When identical source text has the same complete pronunciation but
  // different segment boundaries, prefer the most fine-grained validated
  // segmentation so ruby stays close to the kanji it annotates.
  return [...byRenderedReading.values()][0].sort((a, b) => b.segments.length - a.segments.length)[0];
}

function hasValidExisting(source: string, segments: unknown): boolean {
  return hasExactValidCoverage(source, segments);
}

function main(): void {
  const apply = process.argv.includes("--apply");
  const targetSources = new Set<string>();
  let maxTargetLength = 0;
  for (const path of TARGETS) {
    const data = JSON.parse(readFileSync(join(ROOT, path), "utf8")) as DeThiDataset;
    for (const exam of data.exams) for (const paper of exam.papers) for (const question of paper.questions) {
      if (HAS_KANJI.test(question.question) && !hasValidExisting(question.question, question.questionFurigana)) {
        targetSources.add(question.question);
        maxTargetLength = Math.max(maxTargetLength, question.question.length);
      }
      question.options.forEach((source, optionIndex) => {
        if (HAS_KANJI.test(source) && !hasValidExisting(source, question.optionsFurigana?.[optionIndex])) {
          targetSources.add(source);
          maxTargetLength = Math.max(maxTargetLength, source.length);
        }
      });
    }
  }
  const index = makeReadingIndex(targetSources, maxTargetLength);
  let fieldsFound = 0;
  let fieldsApplied = 0;
  let ambiguous = 0;
  let missing = 0;
  const samples: string[] = [];
  const updatedFiles: { path: string; data: DeThiDataset }[] = [];

  for (const path of TARGETS) {
    const data = JSON.parse(readFileSync(join(ROOT, path), "utf8")) as DeThiDataset;
    let changed = false;
    for (const exam of data.exams) for (const paper of exam.papers) for (const question of paper.questions) {
      if (HAS_KANJI.test(question.question) && !hasValidExisting(question.question, question.questionFurigana)) {
        const candidate = uniqueCandidate(index, question.question);
        if (candidate) {
          fieldsFound++;
          if (apply) { question.questionFurigana = candidate.segments; changed = true; fieldsApplied++; }
          if (samples.length < 20) samples.push(`${path} ${exam.id}/${paper.id}/q${question.number} question <- ${candidate.source}`);
        } else if ((index.get(question.question)?.length ?? 0) > 0) ambiguous++;
        else missing++;
      }
      for (let optionIndex = 0; optionIndex < question.options.length; optionIndex++) {
        const option = question.options[optionIndex];
        if (!HAS_KANJI.test(option) || hasValidExisting(option, question.optionsFurigana?.[optionIndex])) continue;
        const candidate = uniqueCandidate(index, option);
        if (candidate) {
          fieldsFound++;
          if (apply) {
            if (!question.optionsFurigana) {
              question.optionsFurigana = question.options.map((value) => HAS_KANJI.test(value) ? [] : value ? [{ text: value, furigana: null }] : []);
            }
            while (question.optionsFurigana.length < question.options.length) question.optionsFurigana.push([]);
            question.optionsFurigana[optionIndex] = candidate.segments;
            changed = true;
            fieldsApplied++;
          }
          if (samples.length < 20) samples.push(`${path} ${exam.id}/${paper.id}/q${question.number} option ${optionIndex + 1} <- ${candidate.source}`);
        } else if ((index.get(option)?.length ?? 0) > 0) ambiguous++;
        else missing++;
      }
    }
    if (changed) updatedFiles.push({ path, data });
  }

  console.log(`Exact-reference transfer ${apply ? "apply" : "dry-run"}: unique candidates=${fieldsFound}, applied=${fieldsApplied}, ambiguous=${ambiguous}, no exact reference=${missing}.`);
  for (const sample of samples) console.log(`- ${sample}`);
  if (apply) {
    for (const { path, data } of updatedFiles) writeFileSync(join(ROOT, path), `${JSON.stringify(data, null, 2)}\n`, "utf8");
    console.log(`Wrote ${updatedFiles.length} file(s).`);
  }
}

main();
