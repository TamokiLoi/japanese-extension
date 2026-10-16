// Verify the listening questions that DeThiScreen enriches from the separate
// listening corpus. This validates the runtime option matching and furigana
// conversion, not just the raw annual exam JSON.

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { DeThiDataset } from "../src/types/dethi.ts";
import type { ListeningDataset, ListeningQuestion } from "../src/types/listening.ts";

const ROOT = join(import.meta.dirname, "..");
const ANNUAL_FILES = ["src/data/dethi-n3-cac-nam.json", "src/data/dethi-n1-cac-nam.json"];
const BOOK_BY_EXAM: Record<string, string> = {
  "cacnam-n3-2024-07": "dethi-n3-2024-07",
  "cacnam-n3-2024-12": "dethi-n3-2024-12",
  "cacnam-n3-2023-07": "dethi-n3-2023-07",
  "cacnam-n3-2023-12": "dethi-n3-2023-12",
  "cacnam-n3-2025-07": "dethi-n3-2025-07",
  "cacnam-n3-2025-12": "dethi-2025-12",
  "cacnam-n1-2026-07": "dethi-n1-2026-07",
  "cacnam-n3-2026-07": "dethi-n3-2026-07",
};
const HAS_KANJI = /[\u3400-\u9fff々〆ヶ]/u;
const KANA_ONLY = /^[\u3041-\u3096\u30a1-\u30faー]+$/u;
const errors: string[] = [];
let matchedQuestions = 0;
let matchedKanjiOptions = 0;

function normalizeChoice(choice: string): string {
  return choice.trim()
    .replace(/^[\s　]*[①②③④⑤⑥⑦⑧⑨⑩]/u, "")
    .normalize("NFKC")
    .replace(/^\s*[1-4][.、]\s*/u, "")
    .replace(/[。！？!?….]+$/u, "")
    .replace(/\s+/gu, "");
}

function segmentsFor(text: string, annotations: ListeningQuestion["optionFurigana"] extends (infer T)[] | undefined ? T : never) {
  if (!text) return undefined;
  if (!annotations?.length) return HAS_KANJI.test(text) ? undefined : [{ text, furigana: null }];
  const segments: { text: string; furigana: string | null }[] = [];
  let cursor = 0;
  for (const annotation of annotations) {
    if (!annotation || typeof annotation.word !== "string" || !annotation.word ||
      typeof annotation.reading !== "string" || !KANA_ONLY.test(annotation.reading)) return undefined;
    const start = text.indexOf(annotation.word, cursor);
    if (start < 0) return undefined;
    if (start > cursor) segments.push({ text: text.slice(cursor, start), furigana: null });
    segments.push({ text: annotation.word, furigana: annotation.reading });
    cursor = start + annotation.word.length;
  }
  if (cursor < text.length) segments.push({ text: text.slice(cursor), furigana: null });
  if (segments.some((segment) => HAS_KANJI.test(segment.text) && !segment.furigana)) return undefined;
  return segments;
}

const listeningByBook = new Map<string, ListeningQuestion[]>();
for (const file of readdirSync(join(ROOT, "src/data")).filter((name) => name.startsWith("listening-") && name.endsWith(".json"))) {
  const dataset = JSON.parse(readFileSync(join(ROOT, "src/data", file), "utf8")) as ListeningDataset;
  for (const question of dataset.questions) {
    const items = listeningByBook.get(question.book) ?? [];
    items.push(question);
    listeningByBook.set(question.book, items);
  }
}

for (const file of ANNUAL_FILES) {
  const dataset = JSON.parse(readFileSync(join(ROOT, file), "utf8")) as DeThiDataset;
  for (const exam of dataset.exams) {
    const book = BOOK_BY_EXAM[exam.id];
    if (!book) continue;
    const paper = exam.papers.find((item) => item.id === "choukai");
    if (!paper) continue;
    const sources = listeningByBook.get(book) ?? [];
    for (const question of paper.questions) {
      const source = sources[question.number - 1];
      const expectedOptionCount = question.optionsImage ? question.optionCount ?? 0 : question.options.length;
      const matches = Boolean(source && source.correctIndex === question.correctIndex &&
        (!source.optionCount || source.optionCount === expectedOptionCount) &&
        source.options.length === question.options.length && source.options.every(
          (option, index) => normalizeChoice(option) === normalizeChoice(question.options[index] ?? ""),
        ));
      if (!matches || !source) {
        errors.push(`${exam.id}/q${question.number}: annual item does not match listening source`);
        continue;
      }
      matchedQuestions++;
      const hasOptionFurigana = source.optionFurigana?.some((annotations) => annotations.length) ?? false;
      if (!hasOptionFurigana) {
        if (source.options.some((option) => HAS_KANJI.test(option))) errors.push(`${exam.id}/q${question.number}: Kanji options have no source furigana`);
        continue;
      }
      const mapped = source.options.map((option, index) => segmentsFor(option, source.optionFurigana?.[index]));
      if (mapped.some((segments) => !segments)) errors.push(`${exam.id}/q${question.number}: runtime furigana conversion fails for at least one option`);
      source.options.forEach((option, index) => {
        if (HAS_KANJI.test(option)) {
          matchedKanjiOptions++;
          if (!mapped[index]) errors.push(`${exam.id}/q${question.number}/option${index + 1}: Kanji option has no complete ruby mapping`);
        }
      });
    }
  }
}

console.log(`Annual listening runtime mapping: ${matchedQuestions} questions matched; ${matchedKanjiOptions} Kanji-bearing options checked.`);
if (errors.length) {
  console.error(`${errors.length} issue(s):`);
  for (const error of errors.slice(0, 80)) console.error(`- ${error}`);
  if (errors.length > 80) console.error(`... ${errors.length - 80} more`);
  process.exitCode = 1;
} else {
  console.log("All mapped annual listening questions and Kanji-bearing options can receive furigana at runtime.");
}
