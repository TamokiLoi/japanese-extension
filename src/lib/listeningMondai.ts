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

/** Adds the learner-friendly name beside a native exam's 問題 group. */
export function getJlptListeningMondaiLabel(problemGroup: string | undefined): string | undefined {
  const match = /^問題\s*([1-5])$/u.exec(problemGroup?.trim() ?? "");
  return match ? `Mondai ${match[1]}` : undefined;
}
