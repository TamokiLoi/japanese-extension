import type { ListeningQuestion, ListeningTaskType } from "../types/listening.ts";

const JLPT_LISTENING_BOOKS = new Set([
  "dethi-n3-2024-07",
  "dethi-n3-2024-12",
  "dethi-2025-12",
  "dethi-n3-2025-07",
  "dethi-n1-2026-07",
  "dethi-n3-2026-07",
]);

/** Returns the official JLPT listening Mondai for converted real-exam items. */
export function getListeningMondaiNumber(
  question: Pick<ListeningQuestion, "book" | "level" | "taskType">,
): number | undefined {
  if (!JLPT_LISTENING_BOOKS.has(question.book)) return undefined;

  const commonSections: Partial<Record<ListeningTaskType, number>> = {
    kadai: 1,
    point: 2,
    gaiyou: 3,
  };
  const common = commonSections[question.taskType];
  if (common !== undefined) return common;

  if (question.level === "N3") {
    if (question.taskType === "hatsugen") return 4;
    if (question.taskType === "sokuji") return 5;
  }
  if (question.level === "N1") {
    if (question.taskType === "sokuji") return 4;
    if (question.taskType === "sougou") return 5;
  }
  return undefined;
}

/**
 * Gets the spoken question shown before audio for official JLPT Mondai 2.
 * N3 exam datasets repeat the stem as their final turn; N1 keeps the curated
 * stem in `questionPrompt` because its transcript only contains the dialogue.
 */
export function getJlptPointQuestionPrompt(
  question: Pick<
    ListeningQuestion,
    | "book"
    | "level"
    | "taskType"
    | "question"
    | "questionPrompt"
    | "questionPromptFurigana"
    | "turns"
  >,
): { text: string; furigana?: { word: string; reading: string }[] } | undefined {
  if (getListeningMondaiNumber(question) !== 2) return undefined;

  const explicitPrompt = question.questionPrompt?.trim();
  if (explicitPrompt) {
    return { text: explicitPrompt, furigana: question.questionPromptFurigana };
  }

  // Textbooks already use `question` for the printed stem. The JLPT exam
  // datasets use only a number there, while the actual prompt is repeated
  // after the dialogue in their last transcript turn.
  if (!/^\d+番$/u.test(question.question.trim())) return undefined;
  const repeatedPrompt = question.turns.at(-1);
  const text = repeatedPrompt?.text.trim();
  if (!text) return undefined;
  return { text, furigana: repeatedPrompt?.furigana };
}

/** Adds the learner-friendly name beside a native exam's 問題 group. */
export function getJlptListeningMondaiLabel(problemGroup: string | undefined): string | undefined {
  const match = /^問題\s*([1-5])$/u.exec(problemGroup?.trim() ?? "");
  return match ? `Mondai ${match[1]}` : undefined;
}
