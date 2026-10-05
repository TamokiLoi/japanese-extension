// Pure display adapter: content always comes from the registered exam datasets.
// Keep the legacy passage ID recipe to preserve bookmarks and question progress.
import type { DeThiDataset, DeThiQuestion, DeThiPaper } from "../types/dethi.ts";
import type { ReadingLength, ReadingPassage, ReadingQuestion } from "../types/reading.ts";
import { readingPassageUnderlineRanges, readingQuestionUnderline } from "./jlptReadingAnnotations.ts";

const SAME_PASSAGE_MARKERS = new Set(["（上記と同じ）", "（同上）"]);

interface PassageGroup {
  problemGroup: string;
  passage: string;
  questions: DeThiQuestion[];
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

export function stableHash(text: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

function inferLength(passage: string, level: string, problemGroup: string): ReadingLength {
  // In official N3 reading, 問題6 is the long-text task and 問題7 is information search.
  // Apply the exam's task type before length/keyword heuristics, which misclassify some of these passages.
  if (level === "N3" && problemGroup === "問題6") return "long";
  if (level === "N3" && problemGroup === "問題7") return "info-search";

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

function toReadingQuestions(questions: DeThiQuestion[], passage: string): ReadingQuestion[] {
  return questions.map((question) => ({
    sourceNumber: question.number,
    question: question.question,
    underline: readingQuestionUnderline(question.question, question.underline, passage),
    questionVi: question.questionVi ?? "",
    options: [...question.options],
    optionsVi: question.options.map((_, index) => question.optionsVi?.[index] ?? ""),
    correctIndex: question.correctIndex,
    explanation: question.explanation ?? "",
  }));
}

export function collectJlptReading(datasets: readonly DeThiDataset[]): ReadingPassage[] {
  const passages: ReadingPassage[] = [];
  const ids = new Set<string>();

  for (const dataset of datasets) {
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

          const groupQuestions = group.questions;
          const passageVi = groupQuestions.find((question) => question.passageVi?.trim())?.passageVi ?? "";
          const passageSentencesVi = groupQuestions.find((question) => question.passageSentencesVi?.length)?.passageSentencesVi;
          const furigana = groupQuestions.find((question) => question.passageFurigana?.length)?.passageFurigana;
          const body = furigana?.length ? furigana : [{ text: group.passage, furigana: null }];
          const visiblePassageText = body.map((segment) => segment.text).join("");
          const presentation = groupQuestions.find((question) => question.readingPresentation)?.readingPresentation;
          const presentationCurrent = presentation?.bodySignature === stableHash(JSON.stringify(body));
          // Never pair old sentence translations with changed source text/boundaries.
          const sentencesVi = presentation
            ? (presentationCurrent ? presentation.sentencesVi : undefined)
            : passageSentencesVi;
          const questionCount = groupQuestions.length;
          const topic = `${dataset.meta.level} · ${group.problemGroup}`;

          passages.push({
            id,
            level: dataset.meta.level,
            length: inferLength(group.passage, dataset.meta.level, group.problemGroup),
            book: "jlpt-exam",
            topic,
            examId: exam.id,
            examLabel: exam.examLabel,
            estimatedMinutes: Math.max(2, Math.ceil(group.passage.replace(/\s/gu, "").length / 400) + questionCount),
            title: `${exam.examLabel} · ${group.problemGroup} · Bài ${passageNumber}`,
            source: `${exam.examLabel} · ${paper.label} · ${group.problemGroup}`,
            body,
            underlinedRanges: readingPassageUnderlineRanges(groupQuestions, visiblePassageText),
            translationVi: presentationCurrent ? (presentation?.translationVi ?? passageVi) : passageVi,
            ...(sentencesVi?.length ? { sentencesVi: [...sentencesVi] } : {}),
            questions: toReadingQuestions(groupQuestions, group.passage),
          });
        }
      }
    }
  }

  return passages;
}
