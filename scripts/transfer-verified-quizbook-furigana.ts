// Reuse only exact, structurally valid furigana already present in the app's
// dictionaries, reading/listening corpora, mock tests, and quizbooks.
// Defaults to a dry run. Pass --apply to write only unique reading matches.

import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ReadingBodySegment } from "../src/types/reading.ts";
import type { QuizBookDataset, QuizBookQuestion } from "../src/types/quizBook.ts";

const ROOT = join(import.meta.dirname, "..");
const HAS_KANJI = /[\u3400-\u9fff々〆ヶ]/u;
const ISOLATED_KANJI = /^[\u3400-\u9fff々〆ヶ]$/u;
const KANA_ONLY = /^[\u3041-\u3096\u30a1-\u30faー]+$/u;
const TARGET_FILES = readdirSync(join(ROOT, "src/data"))
  .filter((file) => /^quizbook-.+\.json$/u.test(file))
  .map((file) => `src/data/${file}`);

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
  // Store a snapshot so a caller extending a scanning span cannot mutate it.
  list.push({ segments: segments.map((segment) => ({ ...segment })), source: provenance });
  index.set(source, list);
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
            // Do not transfer one isolated kanji merely because it occurs in a phrase.
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
    if (typeof record.word === "string" && typeof record.reading === "string" && HAS_KANJI.test(record.word) && KANA_ONLY.test(record.reading)) {
      appendCandidate(index, record.word, [{ text: record.word, furigana: record.reading }], `${provenance}.reading`);
    }
    for (const [key, child] of Object.entries(record)) visit(child, `${provenance}.${key}`);
  };

  for (const file of files) visit(JSON.parse(readFileSync(join(ROOT, file), "utf8")) as unknown, file);
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
  return [...byRenderedReading.values()][0].sort((a, b) => b.segments.length - a.segments.length)[0];
}

function hasValidExisting(source: string, segments: unknown): boolean {
  return hasExactValidCoverage(source, segments);
}

function addTargetSources(question: QuizBookQuestion, sources: Set<string>, longest: { value: number }): void {
  const add = (source: string | undefined, segments: unknown) => {
    // A one-character kanji may have several readings; don't infer it from a
    // phrase elsewhere even when that happens to be the only indexed match.
    if (!source || ISOLATED_KANJI.test(source) || !HAS_KANJI.test(source) || hasValidExisting(source, segments)) return;
    sources.add(source);
    longest.value = Math.max(longest.value, source.length);
  };
  add(question.question, question.questionFurigana);
  add(question.passage, question.passageFurigana);
  question.options.forEach((option, index) => add(option, question.optionsFurigana?.[index]));
}

function main(): void {
  const apply = process.argv.includes("--apply");
  const sources = new Set<string>();
  const longest = { value: 0 };
  for (const file of TARGET_FILES) {
    const dataset = JSON.parse(readFileSync(join(ROOT, file), "utf8")) as QuizBookDataset;
    dataset.questions.forEach((question) => addTargetSources(question, sources, longest));
  }
  const index = makeReadingIndex(sources, longest.value);
  let found = 0;
  let applied = 0;
  let ambiguous = 0;
  let missing = 0;
  const samples: string[] = [];
  const updated: { file: string; dataset: QuizBookDataset }[] = [];

  for (const file of TARGET_FILES) {
    const dataset = JSON.parse(readFileSync(join(ROOT, file), "utf8")) as QuizBookDataset;
    let changed = false;
    for (const question of dataset.questions) {
      const targets: { source: string | undefined; current: unknown; set: (segments: Segment[]) => void; label: string }[] = [
        { source: question.question, current: question.questionFurigana, set: (segments) => { question.questionFurigana = segments; }, label: "question" },
        { source: question.passage, current: question.passageFurigana, set: (segments) => { question.passageFurigana = segments; }, label: "passage" },
        ...question.options.map((source, optionIndex) => ({
          source,
          current: question.optionsFurigana?.[optionIndex],
          set: (segments: Segment[]) => {
            if (!question.optionsFurigana) question.optionsFurigana = question.options.map((option) =>
              HAS_KANJI.test(option) ? null : [{ text: option, furigana: null }],
            );
            while (question.optionsFurigana.length < question.options.length) question.optionsFurigana.push(null);
            question.optionsFurigana[optionIndex] = segments;
          },
          label: `option ${optionIndex + 1}`,
        })),
      ];
      for (const target of targets) {
        if (!target.source || !HAS_KANJI.test(target.source) || hasValidExisting(target.source, target.current)) continue;
        const candidate = uniqueCandidate(index, target.source);
        if (candidate) {
          found++;
          if (apply) { target.set(candidate.segments); changed = true; applied++; }
          if (samples.length < 30) samples.push(`${file} ${question.id} ${target.label} <- ${candidate.source}`);
        } else if ((index.get(target.source)?.length ?? 0) > 0) ambiguous++;
        else missing++;
      }
      if (apply && question.optionsFurigana) {
        question.options.forEach((option, optionIndex) => {
          if (question.optionsFurigana?.[optionIndex]?.length !== 0) return;
          question.optionsFurigana[optionIndex] = HAS_KANJI.test(option)
            ? null
            : [{ text: option, furigana: null }];
          changed = true;
        });
      }
    }
    if (changed) updated.push({ file, dataset });
  }

  console.log(`Verified quizbook transfer ${apply ? "apply" : "dry-run"}: unique=${found}, applied=${applied}, ambiguous=${ambiguous}, no exact reference=${missing}.`);
  for (const sample of samples) console.log(`- ${sample}`);
  if (apply) {
    for (const { file, dataset } of updated) writeFileSync(join(ROOT, file), `${JSON.stringify(dataset, null, 2)}\n`, "utf8");
    console.log(`Wrote ${updated.length} quizbook file(s).`);
  }
}

main();
