// Validate optional quiz-book furigana without changing any source question.
// Checks exact text reconstruction, reading script, segment order, and kanji coverage.
// Usage: node --experimental-strip-types scripts/validate-quizbook-furigana.ts

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..");
const DATA_DIR = join(ROOT, "src/data");
const HAS_KANJI = /[\u3400-\u9fff々〆ヶ]/u;
const KANA_ONLY = /^[\u3041-\u3096\u30a1-\u30faー]+$/u;

interface Segment { text: string; furigana: string | null }
interface Question {
  id: string;
  question: string;
  questionFurigana?: Segment[];
  options: string[];
  optionsFurigana?: Array<Segment[] | null>;
  passage?: string;
  passageFurigana?: Segment[];
}

let checkedFields = 0;
let annotatedFields = 0;
let coveredKanji = 0;
const errors: string[] = [];

function validateField(file: string, id: string, name: string, source: string | undefined, segments: Segment[] | undefined): void {
  if (!segments) {
    if (source && HAS_KANJI.test(source)) errors.push(`${file} ${id}.${name}: missing furigana for kanji text`);
    return;
  }
  checkedFields++;
  if (typeof source !== "string") {
    errors.push(`${file} ${id}.${name}: furigana has no corresponding source text`);
    return;
  }
  let cursor = 0;
  let hasAnnotation = false;
  for (const [index, segment] of segments.entries()) {
    if (!segment || typeof segment.text !== "string" || segment.text.length === 0) {
      errors.push(`${file} ${id}.${name}[${index}]: segment text must be a non-empty string`);
      continue;
    }
    if (source.slice(cursor, cursor + segment.text.length) !== segment.text) {
      errors.push(`${file} ${id}.${name}[${index}]: text is out of source order or does not match exactly at offset ${cursor}`);
      cursor += segment.text.length;
      continue;
    }
    const hasKanji = HAS_KANJI.test(segment.text);
    if (segment.furigana !== null && typeof segment.furigana !== "string") {
      errors.push(`${file} ${id}.${name}[${index}]: furigana must be kana text or null`);
    } else if (segment.furigana !== null) {
      if (!KANA_ONLY.test(segment.furigana)) errors.push(`${file} ${id}.${name}[${index}]: reading ${JSON.stringify(segment.furigana)} is not kana-only`);
      if (!hasKanji) errors.push(`${file} ${id}.${name}[${index}]: reading is attached to text without kanji`);
      hasAnnotation = true;
    }
    if (hasKanji) {
      coveredKanji += Array.from(segment.text).filter((character) => HAS_KANJI.test(character)).length;
      if (!segment.furigana) errors.push(`${file} ${id}.${name}[${index}]: kanji are missing a reading`);
    }
    cursor += segment.text.length;
  }
  if (cursor !== source.length) errors.push(`${file} ${id}.${name}: segments reconstruct ${cursor}/${source.length} source characters`);
  if (segments.map((segment) => segment.text).join("") !== source) errors.push(`${file} ${id}.${name}: concatenated segment text differs from source text`);
  if (hasAnnotation) annotatedFields++;
}

for (const file of readdirSync(DATA_DIR).filter((name) => /^quizbook-.*\.json$/u.test(name)).sort()) {
  const dataset = JSON.parse(readFileSync(join(DATA_DIR, file), "utf8")) as { questions: Question[] };
  for (const question of dataset.questions) {
    validateField(file, question.id, "questionFurigana", question.question, question.questionFurigana);
    validateField(file, question.id, "passageFurigana", question.passage, question.passageFurigana);
    if (question.optionsFurigana && question.optionsFurigana.length !== question.options.length) {
      errors.push(`${file} ${question.id}.optionsFurigana: expected ${question.options.length} option entries, got ${question.optionsFurigana.length}`);
    }
    question.options.forEach((option, index) => validateField(file, question.id, `optionsFurigana[${index}]`, option, question.optionsFurigana?.[index] ?? undefined));
  }
}

console.log(`Validated ${checkedFields} furigana fields; ${annotatedFields} contain readings covering ${coveredKanji} kanji characters.`);
if (errors.length) {
  console.error(errors.join("\n"));
  process.exitCode = 1;
} else {
  console.log("All quiz-book furigana matches exact source text, uses kana readings, preserves order, and covers every annotated kanji.");
}
