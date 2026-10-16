// Audit optional furigana on JLPT exam prompts and text options.
// Checks exact-source reconstruction, kana readings, and full kanji coverage.
// Usage: node --experimental-strip-types scripts/validate-dethi-question-furigana.ts

import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { DeThiDataset } from "../src/types/dethi.ts";

const ROOT = join(import.meta.dirname, "..");
const DATA_FILES = [
  "src/data/dethi-n1-cac-nam.json",
  "src/data/dethi-n3-cac-nam.json",
  ...Array.from({ length: 10 }, (_, index) => `src/data/de-n3-set-${String(index + 1).padStart(2, "0")}.json`),
];
const RUNTIME_LISTENING_EXAMS = new Set([
  "cacnam-n3-2024-07", "cacnam-n3-2024-12", "cacnam-n3-2023-07", "cacnam-n3-2023-12",
  "cacnam-n3-2025-07", "cacnam-n3-2025-12", "cacnam-n1-2026-07", "cacnam-n3-2026-07",
]);
const SAME_PASSAGE_MARKERS = new Set(["（上記と同じ）", "（同上）"]);
const HAS_KANJI = /[\u3400-\u9fff々〆ヶ]/u;
const KANA_ONLY = /^[\u3041-\u3096\u30a1-\u30faー]+$/u;

let fields = 0;
let complete = 0;
let coveredKanji = 0;
const errors: string[] = [];

function validateField(file: string, questionId: string, label: string, source: string, segments: { text: string; furigana: string | null }[] | undefined): void {
  if (!HAS_KANJI.test(source)) return;
  fields++;
  if (!Array.isArray(segments) || !segments.length) {
    errors.push(`${file} ${questionId}.${label}: missing furigana segments`);
    return;
  }

  let cursor = 0;
  let hasFurigana = false;
  for (const [index, segment] of segments.entries()) {
    if (!segment || typeof segment.text !== "string" || !segment.text.length) {
      errors.push(`${file} ${questionId}.${label}[${index}]: empty/malformed segment`);
      continue;
    }
    if (source.slice(cursor, cursor + segment.text.length) !== segment.text) {
      errors.push(`${file} ${questionId}.${label}[${index}]: text differs from source at offset ${cursor}`);
      cursor += segment.text.length;
      continue;
    }
    const hasKanji = HAS_KANJI.test(segment.text);
    if (segment.furigana !== null && (typeof segment.furigana !== "string" || !KANA_ONLY.test(segment.furigana))) {
      errors.push(`${file} ${questionId}.${label}[${index}]: reading must contain kana only`);
    } else if (segment.furigana !== null) {
      hasFurigana = true;
      if (!hasKanji) errors.push(`${file} ${questionId}.${label}[${index}]: furigana attached to text without kanji`);
    }
    if (hasKanji) {
      const count = Array.from(segment.text).filter((character) => HAS_KANJI.test(character)).length;
      coveredKanji += count;
      if (!segment.furigana) errors.push(`${file} ${questionId}.${label}[${index}]: kanji has no reading`);
    }
    cursor += segment.text.length;
  }
  if (cursor !== source.length || segments.map(({ text }) => text).join("") !== source) {
    errors.push(`${file} ${questionId}.${label}: segments do not reconstruct exact source (${cursor}/${source.length})`);
  }
  if (hasFurigana && !errors.some((error) => error.startsWith(`${file} ${questionId}.${label}`))) complete++;
}

function normalizeLegacyOptionFurigana(
  source: string,
  annotations: { word: string; reading: string }[] | undefined,
): { text: string; furigana: string | null }[] | undefined {
  if (!annotations?.length) return HAS_KANJI.test(source) ? undefined : source ? [{ text: source, furigana: null }] : [];
  const segments: { text: string; furigana: string | null }[] = [];
  let cursor = 0;
  for (const annotation of annotations) {
    const index = source.indexOf(annotation.word, cursor);
    if (index < cursor || index < 0) return undefined;
    if (index > cursor) segments.push({ text: source.slice(cursor, index), furigana: null });
    segments.push({ text: annotation.word, furigana: annotation.reading });
    cursor = index + annotation.word.length;
  }
  if (cursor < source.length) segments.push({ text: source.slice(cursor), furigana: null });
  return segments;
}

function passageForQuestion(paper: DeThiDataset["exams"][number]["papers"][number], index: number): string | null {
  const current = paper.questions[index];
  if (!current?.passage) return null;
  if (!SAME_PASSAGE_MARKERS.has(current.passage)) return current.passage;
  for (let previousIndex = index - 1; previousIndex >= 0; previousIndex--) {
    const previous = paper.questions[previousIndex];
    if (previous.problemGroup !== current.problemGroup) break;
    if (previous.passage && !SAME_PASSAGE_MARKERS.has(previous.passage)) return previous.passage;
  }
  return current.passage;
}

for (const file of DATA_FILES) {
  const dataset = JSON.parse(readFileSync(join(ROOT, file), "utf8")) as DeThiDataset;
  for (const exam of dataset.exams) {
    for (const paper of exam.papers) {
      const runtimeHydratedListening = paper.id === "choukai" && RUNTIME_LISTENING_EXAMS.has(exam.id);
      const passageGroups = new Map<string, { source: string; questions: DeThiDataset["exams"][number]["papers"][number]["questions"] }>();
      for (const [index, question] of paper.questions.entries()) {
        const questionId = `${exam.id}/${paper.label}/q${question.number ?? index + 1}`;
        if (!runtimeHydratedListening) {
          validateField(file, questionId, "questionFurigana", question.question, question.questionFurigana);
          if (question.optionsFurigana && question.optionsFurigana.length !== question.options.length) {
            errors.push(`${file} ${questionId}.optionsFurigana: expected ${question.options.length} entries, got ${question.optionsFurigana.length}`);
          }
          question.options.forEach((option, optionIndex) => {
            const current = question.optionsFurigana?.[optionIndex];
            const legacy = normalizeLegacyOptionFurigana(option, question.optionFurigana?.[optionIndex]);
            validateField(file, questionId, `optionsFurigana[${optionIndex}]`, option, current ?? legacy);
          });
        }

        const passage = passageForQuestion(paper, index);
        if (passage && !SAME_PASSAGE_MARKERS.has(passage) && HAS_KANJI.test(passage)) {
          const key = `${question.problemGroup}\u0000${passage}`;
          const group = passageGroups.get(key) ?? { source: passage, questions: [] };
          group.questions.push(question);
          passageGroups.set(key, group);
        }
      }
      for (const { source, questions } of passageGroups.values()) {
        const question = questions.find((candidate) => Array.isArray(candidate.passageFurigana) && candidate.passageFurigana.length);
        validateField(file, `${exam.id}/${paper.label}/passage`, "passageFurigana", source, question?.passageFurigana);
      }
    }
  }
}

console.log(`JLPT question furigana audit: ${complete}/${fields} prompt/option fields complete; ${coveredKanji} kanji-bearing characters covered.`);
if (errors.length) {
  console.error(`${errors.length} issue(s):`);
  for (const error of errors.slice(0, 100)) console.error(`- ${error}`);
  if (errors.length > 100) console.error(`... ${errors.length - 100} more`);
  process.exitCode = 1;
} else {
  console.log("All covered fields reconstruct their exact source and have kana readings for every kanji.");
}
