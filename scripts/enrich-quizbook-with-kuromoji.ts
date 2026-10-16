// Generate furigana for QuizBook fields with a local Kuromoji tokenizer.
// This does not call external AI services and never edits source text.
// Run dry first, then pass --apply to write only complete tokenizer matches.
// Usage:
//   node --experimental-strip-types scripts/enrich-quizbook-with-kuromoji.ts --kuromoji-root <temp-install>
//   node --experimental-strip-types scripts/enrich-quizbook-with-kuromoji.ts --kuromoji-root <temp-install> --apply

import { createRequire } from "node:module";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { ReadingBodySegment } from "../src/types/reading.ts";
import type { QuizBookDataset, QuizBookQuestion } from "../src/types/quizBook.ts";

const ROOT = join(import.meta.dirname, "..");
const DATA_DIR = join(ROOT, "src/data");
const HAS_KANJI = /[\u3400-\u9fff々〆ヶ]/u;
const ISOLATED_KANJI = /^[\u3400-\u9fff々〆ヶ]$/u;
const KANA_ONLY = /^[\u3041-\u3096\u30a1-\u30faー]+$/u;
const EXCLUDED_FILES = new Set([
  "quizbook-n3-dongnghia-60.json",
  "quizbook-n3-shinkanzen-bunpou.json",
]);

interface KuromojiToken { surface_form: string; reading?: string | null }
interface Tokenizer { tokenize(source: string): KuromojiToken[] }
interface KuromojiModule { builder(options: { dicPath: string }): { build(callback: (error: Error | null, tokenizer: Tokenizer) => void): void } }
type TargetField = {
  source: string | undefined;
  current: unknown;
  assign: (segments: ReadingBodySegment[]) => void;
  label: string;
};

function optionValue(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index < 0 ? undefined : process.argv[index + 1];
}

function toHiragana(reading: string): string {
  return reading.replace(/[\u30a1-\u30f6]/gu, (character) =>
    String.fromCharCode(character.charCodeAt(0) - 0x60),
  );
}

function hasCompleteFurigana(source: string | undefined, input: unknown): input is ReadingBodySegment[] {
  if (!source || !Array.isArray(input) || !input.length) return false;
  if (input.map((segment) => segment?.text ?? "").join("") !== source) return false;
  return input.every((segment) => {
    if (!segment || typeof segment.text !== "string" || !segment.text.length) return false;
    if (segment.furigana === null) return !HAS_KANJI.test(segment.text);
    return typeof segment.furigana === "string" && KANA_ONLY.test(segment.furigana) && HAS_KANJI.test(segment.text);
  }) && input.some((segment) => HAS_KANJI.test(segment.text) && !!segment.furigana);
}

function generateSegments(tokenizer: Tokenizer, source: string): ReadingBodySegment[] | undefined {
  if (ISOLATED_KANJI.test(source.trim())) return undefined;
  const tokens = tokenizer.tokenize(source);
  if (!tokens.length || tokens.map((token) => token.surface_form).join("") !== source) return undefined;
  const segments: ReadingBodySegment[] = [];
  for (const token of tokens) {
    if (!token.surface_form) return undefined;
    if (!HAS_KANJI.test(token.surface_form)) {
      segments.push({ text: token.surface_form, furigana: null });
      continue;
    }
    if (!token.reading) return undefined;
    const reading = toHiragana(token.reading);
    if (!KANA_ONLY.test(reading)) return undefined;
    segments.push({ text: token.surface_form, furigana: reading });
  }
  return hasCompleteFurigana(source, segments) ? segments : undefined;
}

function completeExistingSegments(
  tokenizer: Tokenizer,
  source: string,
  input: unknown,
): ReadingBodySegment[] | undefined {
  if (!Array.isArray(input) || !input.length) return undefined;
  if (input.map((segment) => segment?.text ?? "").join("") !== source) return undefined;
  const completed: ReadingBodySegment[] = [];
  for (const segment of input as ReadingBodySegment[]) {
    if (!segment || typeof segment.text !== "string" || !segment.text.length) return undefined;
    if (segment.furigana !== null) {
      if (typeof segment.furigana !== "string" || !KANA_ONLY.test(segment.furigana) || !HAS_KANJI.test(segment.text)) return undefined;
      completed.push({ ...segment });
      continue;
    }
    if (!HAS_KANJI.test(segment.text)) {
      completed.push({ ...segment });
      continue;
    }
    const generated = generateSegments(tokenizer, segment.text);
    if (!generated) return undefined;
    completed.push(...generated);
  }
  return hasCompleteFurigana(source, completed) ? completed : undefined;
}

function collectTargets(question: QuizBookQuestion): TargetField[] {
  return [
    { source: question.question, current: question.questionFurigana, assign: (segments) => { question.questionFurigana = segments; }, label: "question" },
    { source: question.passage, current: question.passageFurigana, assign: (segments) => { question.passageFurigana = segments; }, label: "passage" },
    ...question.options.map((source, index) => ({
      source,
      current: question.optionsFurigana?.[index],
      assign: (segments: ReadingBodySegment[]) => {
        if (!question.optionsFurigana) question.optionsFurigana = question.options.map(() => null);
        while (question.optionsFurigana.length < question.options.length) question.optionsFurigana.push(null);
        question.optionsFurigana[index] = segments;
      },
      label: `option ${index + 1}`,
    })),
  ];
}

function buildTokenizer(): Promise<Tokenizer> {
  const runtimeRoot = optionValue("--kuromoji-root") ?? process.env.KUROMOJI_ROOT;
  if (!runtimeRoot) throw new Error("Pass --kuromoji-root or set KUROMOJI_ROOT to the temporary Kuromoji install directory.");
  const packagePath = join(resolve(runtimeRoot), "node_modules/kuromoji");
  const require = createRequire(import.meta.url);
  const kuromoji = require(packagePath) as KuromojiModule;
  return new Promise((resolveTokenizer, reject) => {
    kuromoji.builder({ dicPath: join(packagePath, "dict") }).build((error, tokenizer) => {
      if (error) reject(error);
      else resolveTokenizer(tokenizer);
    });
  });
}

async function main(): Promise<void> {
  const apply = process.argv.includes("--apply");
  const tokenizer = await buildTokenizer();
  const files = readdirSync(DATA_DIR)
    .filter((name) => /^quizbook-.*\.json$/u.test(name) && !EXCLUDED_FILES.has(name))
    .sort();
  const summary: Record<string, { generated: number; unresolved: number; preserved: number }> = {};
  const samples: string[] = [];
  const unresolvedSamples: string[] = [];

  for (const name of files) {
    const path = join(DATA_DIR, name);
    const dataset = JSON.parse(readFileSync(path, "utf8")) as QuizBookDataset;
    let changed = false;
    const counts = summary[name] = { generated: 0, unresolved: 0, preserved: 0 };
    for (const question of dataset.questions) {
      for (const target of collectTargets(question)) {
        if (!target.source || !HAS_KANJI.test(target.source) || hasCompleteFurigana(target.source, target.current)) {
          if (target.source && HAS_KANJI.test(target.source) && hasCompleteFurigana(target.source, target.current)) counts.preserved++;
          continue;
        }
        // Preserve known annotations; only generate furigana for existing null
        // segments after verifying they reconstruct the source exactly.
        // Do not replace a non-empty authored/partial annotation wholesale if
        // we cannot safely complete it. Keep it for manual review instead.
        const hasExistingSegments = Array.isArray(target.current) && target.current.length > 0;
        const segments = hasExistingSegments
          ? completeExistingSegments(tokenizer, target.source, target.current)
          : generateSegments(tokenizer, target.source);
        if (!segments) {
          counts.unresolved++;
          if (unresolvedSamples.length < 40) {
            unresolvedSamples.push(`${name} ${question.id} ${target.label}: ${target.source}`);
          }
          continue;
        }
        counts.generated++;
        if (samples.length < 24) {
          samples.push(`${name} ${question.id} ${target.label}: ${target.source} => ${segments.map((segment) => segment.furigana ?? segment.text).join("")}`);
        }
        if (apply) { target.assign(segments); changed = true; }
      }
    }
    if (apply && changed) writeFileSync(path, `${JSON.stringify(dataset, null, 2)}\n`, "utf8");
  }

  console.log(`Kuromoji QuizBook ${apply ? "apply" : "dry-run"}; excluded two human-review files: ${EXCLUDED_FILES.size}.`);
  console.log(`Total generated=${Object.values(summary).reduce((sum, entry) => sum + entry.generated, 0)}, unresolved=${Object.values(summary).reduce((sum, entry) => sum + entry.unresolved, 0)}, already complete=${Object.values(summary).reduce((sum, entry) => sum + entry.preserved, 0)}.`);
  for (const [file, counts] of Object.entries(summary)) console.log(`${file}: generated=${counts.generated}, unresolved=${counts.unresolved}, complete=${counts.preserved}`);
  for (const sample of samples) console.log(`- ${sample}`);
  for (const sample of unresolvedSamples) console.log(`? ${sample}`);
}

await main();
