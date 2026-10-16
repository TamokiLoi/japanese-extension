import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..");
const DATA_FILES = [
  "listening-soumatome-n3.json",
  "listening-speedmaster-n3.json",
  "listening-shinkanzen-n3.json",
  "listening-dethi-2025-12.json",
  "listening-dethi-n3-2023-07.json",
  "listening-dethi-n3-2023-12.json",
  "listening-dethi-n3-2024-07.json",
  "listening-dethi-n3-2024-12.json",
  "listening-dethi-n3-2025-07.json",
  "listening-dethi-n1-2026-07.json",
  "listening-dethi-n3-2026-07.json",
  "listening-kaiwa-100cau.json",
];
const INCOMPLETE_SHINKANZEN_IDS = new Set(
  Array.from({ length: 15 }, (_, index) => `listening-shinkanzen-n3-${String(index + 39).padStart(3, "0")}`),
);
const HAS_KANJI = /[\u3400-\u9fff々〆ヶ]/u;
const KANA_ONLY = /^[\u3041-\u3096\u30a1-\u30faー]+$/u;

interface Annotation { word: string; reading: string }
interface Turn { text: string; furigana?: Annotation[] }
interface Question {
  id: string;
  scenario?: string;
  scenarioFurigana?: Annotation[];
  question?: string;
  questionFurigana?: Annotation[];
  questionPrompt?: string;
  questionPromptFurigana?: Annotation[];
  turns?: Turn[];
  options?: string[];
  optionFurigana?: Annotation[][];
}

function checkField(label: string, source: string | undefined, annotations: Annotation[] | undefined): string[] {
  if (!source) return [];
  const issues: string[] = [];
  if (!Array.isArray(annotations)) return HAS_KANJI.test(source) ? [`${label}: missing annotation array`] : [];
  const covered = new Array<boolean>(source.length).fill(false);
  let cursor = 0;
  for (const [index, annotation] of annotations.entries()) {
    if (!annotation || typeof annotation.word !== "string" || typeof annotation.reading !== "string") {
      issues.push(`${label}: annotation ${index + 1} has invalid shape`);
      continue;
    }
    if (!HAS_KANJI.test(annotation.word)) issues.push(`${label}: annotation ${index + 1} word contains no kanji`);
    if (!KANA_ONLY.test(annotation.reading)) issues.push(`${label}: annotation ${index + 1} has invalid kana reading ${JSON.stringify(annotation.reading)}`);
    const position = source.indexOf(annotation.word, cursor);
    if (position < 0) {
      issues.push(`${label}: annotation ${index + 1} is missing/out of order: ${JSON.stringify(annotation.word)}`);
      continue;
    }
    for (let offset = position; offset < position + annotation.word.length; offset++) covered[offset] = true;
    cursor = position + annotation.word.length;
  }
  for (let index = 0; index < source.length; index++) {
    if (HAS_KANJI.test(source[index]) && !covered[index]) {
      issues.push(`${label}: missing furigana near ${JSON.stringify(source.slice(Math.max(0, index - 2), index + 8))}`);
      break;
    }
  }
  return issues;
}

let questionCount = 0;
let fieldCount = 0;
let annotatedFields = 0;
let kanjiFields = 0;
const issues: string[] = [];
for (const file of DATA_FILES) {
  const data = JSON.parse(readFileSync(join(ROOT, "src/data", file), "utf8")) as { questions: Question[] };
  const questions = data.questions.filter((question) => !INCOMPLETE_SHINKANZEN_IDS.has(question.id));
  questionCount += questions.length;
  for (const question of questions) {
    const fields: [string, string | undefined, Annotation[] | undefined][] = [
      ["scenario", question.scenario, question.scenarioFurigana],
      ["question", question.question, question.questionFurigana],
      ["questionPrompt", question.questionPrompt, question.questionPromptFurigana],
      ...(question.turns ?? []).map((turn, index) => [`turns[${index}].text`, turn.text, turn.furigana] as [string, string, Annotation[] | undefined]),
      ...(question.options ?? []).map((option, index) => [`options[${index}]`, option, question.optionFurigana?.[index]] as [string, string, Annotation[] | undefined]),
    ];
    for (const [name, source, annotations] of fields) {
      if (!source) continue;
      fieldCount++;
      if (HAS_KANJI.test(source)) {
        kanjiFields++;
        if (annotations?.length) annotatedFields++;
      }
      issues.push(...checkField(`${file}/${question.id}/${name}`, source, annotations));
    }
  }
}

console.log(`Listening furigana: ${questionCount} active questions, ${fieldCount} Japanese fields; ${annotatedFields}/${kanjiFields} kanji fields annotated.`);
if (issues.length) {
  console.error(`${issues.length} issue(s):`);
  for (const issue of issues.slice(0, 100)) console.error(`- ${issue}`);
  if (issues.length > 100) console.error(`... ${issues.length - 100} more`);
  process.exitCode = 1;
} else {
  console.log("All active Japanese listening fields have ordered, kana-only, complete furigana.");
}
