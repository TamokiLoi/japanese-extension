// Read-only audit of every bundled Reading dataset. Exit nonzero while any
// Japanese source field with kanji lacks exact, complete ruby coverage.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ReadingBodySegment, ReadingDataset } from "../src/types/reading.ts";
import { splitBodyIntoSentences } from "../src/lib/readingSentences.ts";

const ROOT = join(import.meta.dirname, "..");
const DATA_FILES = [
  "src/data/reading-n3-shinkanzen.json",
  "src/data/reading-n3-speedmaster.json",
  "src/data/reading-n3-taisaku.json",
  "src/data/mocktest-n3-shinkanzen.json",
  "src/data/reading-n3-dokkai55.json",
  "src/data/reading-n3-dokkai115.json",
  "src/data/reading-news.json",
  "src/data/reading-ai-stories.json",
];
const HAS_KANJI = /[\u3400-\u9fff々〆ヶ]/u;
const KANA_ONLY = /^[\u3041-\u3096\u30a1-\u30faー]+$/u;
const INVALID_RUBY_TEXT = /[\s、。！？!?・,，.（）()「」『』【】\n\r]/u;

interface Audit { file: string; field: string; status: "complete" | "missing" | "invalid" | "no-kanji" }

function isComplete(source: string, segments: ReadingBodySegment[] | undefined): boolean {
  if (!segments?.length || segments.map(({ text }) => text).join("") !== source) return false;
  let offset = 0;
  for (const segment of segments) {
    if (segment.text !== source.slice(offset, offset + segment.text.length)) return false;
    if (segment.furigana !== null) {
      if (!segment.furigana || !KANA_ONLY.test(segment.furigana) || !HAS_KANJI.test(segment.text)) return false;
      if (segment.text.length > 20 || INVALID_RUBY_TEXT.test(segment.text)) return false;
    }
    offset += segment.text.length;
  }
  if (offset !== source.length) return false;
  const covered = new Array<boolean>(source.length).fill(false);
  offset = 0;
  for (const segment of segments) {
    if (segment.furigana) for (let index = offset; index < offset + segment.text.length; index++) covered[index] = true;
    offset += segment.text.length;
  }
  return Array.from(source).every((character, index) => !HAS_KANJI.test(character) || covered[index]);
}

function inspect(file: string, field: string, source: string, segments: ReadingBodySegment[] | undefined): Audit {
  if (!HAS_KANJI.test(source)) return { file, field, status: "no-kanji" };
  if (!segments?.length || !segments.some(({ furigana }) => !!furigana)) return { file, field, status: "missing" };
  if (!isComplete(source, segments)) return { file, field, status: "invalid" };
  return { file, field, status: "complete" };
}

const audits: Audit[] = [];
for (const path of DATA_FILES) {
  const dataset = JSON.parse(readFileSync(join(ROOT, path), "utf8")) as ReadingDataset;
  for (const passage of dataset.passages) {
    if (passage.linkOnly) continue;
    const body = passage.body.map(({ text }) => text).join("");
    audits.push(inspect(path, `${passage.id}/body`, body, passage.body));
    const sentenceCount = splitBodyIntoSentences(passage.body).length;
    if (passage.sentencesVi?.length && passage.sentencesVi.length !== sentenceCount) {
      audits.push({ file: path, field: `${passage.id}/sentencesVi(${passage.sentencesVi.length}!=${sentenceCount})`, status: "invalid" });
    }
    passage.questions.forEach((question, questionIndex) => {
      audits.push(inspect(path, `${passage.id}/q${questionIndex}/question`, question.question, question.questionFurigana));
      question.options.forEach((option, optionIndex) => audits.push(inspect(path, `${passage.id}/q${questionIndex}/option${optionIndex}`, option, question.optionsFurigana?.[optionIndex])));
    });
  }
}

for (const file of DATA_FILES) {
  const entries = audits.filter((audit) => audit.file === file);
  const complete = entries.filter((audit) => audit.status === "complete").length;
  const missing = entries.filter((audit) => audit.status === "missing").length;
  const invalid = entries.filter((audit) => audit.status === "invalid").length;
  const noKanji = entries.filter((audit) => audit.status === "no-kanji").length;
  console.log(`${file}: ${complete} complete, ${missing} missing, ${invalid} invalid, ${noKanji} no-kanji`);
}
const failures = audits.filter((audit) => audit.status === "missing" || audit.status === "invalid");
console.log(`Reading furigana audit: ${audits.length} fields; ${failures.length} missing/invalid.`);
for (const failure of failures.slice(0, 80)) console.log(`  ${failure.status}: ${failure.field} (${failure.file})`);
if (failures.length > 80) console.log(`  ... ${failures.length - 80} more`);
if (failures.length) process.exitCode = 1;
