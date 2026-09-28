// Build the standalone Reading-practice collection from registered official
// past-exam datasets. Exam-taking JSON remains the source of truth and is not
// modified by this extractor.
//
// Usage:
//   node --experimental-strip-types scripts/extract-jlpt-reading.ts

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { DeThiDataset, DeThiQuestion, DeThiPaper } from "../src/types/dethi.ts";
import type { ReadingDataset, ReadingLength, ReadingPassage, ReadingQuestion } from "../src/types/reading.ts";

const ROOT = join(import.meta.dirname, "..");
const REGISTRY_PATH = join(ROOT, "src/popup/dethiState.ts");
const OUTPUT_PATH = join(ROOT, "src/data/reading-jlpt-exams.json");
const REGISTERED_DATASET_IMPORT = /import\s+\w+\s+from\s+["']\.\.\/data\/(dethi-n\d+-cac-nam\.json)["']/gu;
const SAME_PASSAGE_MARKERS = new Set(["（上記と同じ）", "（同上）"]);

interface PassageGroup {
  problemGroup: string;
  passage: string;
  questions: DeThiQuestion[];
}

function registeredDatasetPaths(): string[] {
  const source = readFileSync(REGISTRY_PATH, "utf8");
  const paths = [...source.matchAll(REGISTERED_DATASET_IMPORT)].map((match) => `src/data/${match[1]}`);
  if (paths.length === 0) throw new Error(`No official past-exam dataset imports found in ${REGISTRY_PATH}`);
  return [...new Set(paths)];
}

function resolvePassage(paper: DeThiPaper, questionIndex: number): string | null {
  const current = paper.questions[questionIndex];
  const rawPassage = current?.passage;
  if (!rawPassage) return null;
  if (!SAME_PASSAGE_MARKERS.has(rawPassage)) return rawPassage;

  for (let index = questionIndex - 1; index >= 0; index--) {
    const previous = paper.questions[index];
    if (previous.problemGroup !== current.problemGroup) break;
    if (previous.passage && !SAME_PASSAGE_MARKERS.has(previous.passage)) return previous.passage;
  }
  throw new Error(`Unresolved shared-passage marker at ${paper.id}/${current.problemGroup}/q${current.number}`);
}

function stableHash(text: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

function inferLength(passage: string): ReadingLength {
  const compactLength = passage.replace(/\s/gu, "").length;
  const lines = passage.split(/\r?\n/u).map((line) => line.trim()).filter(Boolean);
  const infoSignals = lines.filter((line) =>
    /(?:募集|案内|お知らせ|利用|料金|日時|場所|対象|締切|申し込み|申込|受付|営業|開館|開催|コース|教室|問い合わせ|電話|メール|料金表|スケジュール)/u.test(line),
  ).length;
  const hasInformationLayout =
    lines.length >= 4 &&
    infoSignals >= 2 &&
    /(?:募集|案内|お知らせ|利用|料金|申し込み|申込|開館|開催|教室|スケジュール)/u.test(lines.slice(0, 3).join(" "));
  if (hasInformationLayout) return "info-search";
  if (compactLength <= 350) return "short";
  if (compactLength <= 750) return "medium";
  return "long";
}

function toReadingQuestions(questions: DeThiQuestion[]): ReadingQuestion[] {
  return questions.map((question) => ({
    sourceNumber: question.number,
    question: question.question,
    questionVi: question.questionVi ?? "",
    options: [...question.options],
    optionsVi: question.options.map((_, index) => question.optionsVi?.[index] ?? ""),
    correctIndex: question.correctIndex,
    explanation: question.explanation ?? "",
  }));
}

function collectPassages(): ReadingPassage[] {
  const passages: ReadingPassage[] = [];
  const ids = new Set<string>();

  for (const relativePath of registeredDatasetPaths()) {
    const dataset = JSON.parse(readFileSync(join(ROOT, relativePath), "utf8")) as DeThiDataset;
    for (const exam of [...dataset.exams].sort((left, right) => right.id.localeCompare(left.id))) {
      if (exam.source !== "cac-nam") continue;
      for (const paper of exam.papers) {
        if (!paper.label.includes("読解")) continue;

        const groups = new Map<string, PassageGroup>();
        for (let index = 0; index < paper.questions.length; index++) {
          const question = paper.questions[index];
          const passage = resolvePassage(paper, index);
          if (!passage) continue;
          const key = `${question.problemGroup}\u0000${passage}`;
          let group = groups.get(key);
          if (!group) {
            group = { problemGroup: question.problemGroup, passage, questions: [] };
            groups.set(key, group);
          }
          group.questions.push(question);
        }

        let passageNumber = 0;
        for (const group of groups.values()) {
          passageNumber++;
          const id = `jlpt-${exam.id}-${paper.id}-${stableHash(`${group.problemGroup}\u0000${group.passage}`)}`;
          if (ids.has(id)) throw new Error(`Duplicate extracted reading passage id: ${id}`);
          ids.add(id);

          const representative = group.questions[0];
          const groupQuestions = group.questions;
          const passageVi = groupQuestions.find((question) => question.passageVi?.trim())?.passageVi ?? "";
          const passageSentencesVi = groupQuestions.find((question) => question.passageSentencesVi?.length)?.passageSentencesVi;
          const furigana = groupQuestions.find((question) => question.passageFurigana?.length)?.passageFurigana;
          const questionCount = groupQuestions.length;
          const topic = `${dataset.meta.level} · ${group.problemGroup}`;

          passages.push({
            id,
            level: dataset.meta.level,
            length: inferLength(group.passage),
            book: "jlpt-exam",
            topic,
            estimatedMinutes: Math.max(2, Math.ceil(group.passage.replace(/\s/gu, "").length / 400) + questionCount),
            title: `${exam.examLabel} · ${group.problemGroup} · Bài ${passageNumber}`,
            source: `${exam.examLabel} · ${paper.label} · ${group.problemGroup}`,
            body: furigana?.length ? furigana : [{ text: group.passage, furigana: null }],
            translationVi: passageVi,
            ...(passageSentencesVi?.length ? { sentencesVi: [...passageSentencesVi] } : {}),
            questions: toReadingQuestions(groupQuestions),
          });
        }
      }
    }
  }

  return passages;
}

const dataset: ReadingDataset = { passages: collectPassages() };
writeFileSync(OUTPUT_PATH, `${JSON.stringify(dataset, null, 2)}\n`, "utf8");
console.log(`Wrote ${dataset.passages.length} JLPT reading passages with ${dataset.passages.reduce((sum, passage) => sum + passage.questions.length, 0)} questions to ${OUTPUT_PATH}`);
