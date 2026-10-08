import type { DeThiPaper, DeThiQuestion } from "../src/types/dethi.ts";

/** Keep printed question numbers in the UI but disambiguate duplicate numbers in resumable enrichment IDs. */
export function enrichmentQuestionNumber(paper: DeThiPaper, question: DeThiQuestion): string {
  const sameNumber = paper.questions.filter((candidate) => candidate.number === question.number);
  if (sameNumber.length < 2) return String(question.number);
  const occurrence = sameNumber.indexOf(question) + 1;
  return `${question.number}-${occurrence}`;
}

export function enrichmentQuestionId(examId: string, paper: DeThiPaper, question: DeThiQuestion, problemGroup?: string): string {
  const groupPrefix = problemGroup ? `${problemGroup}/` : "";
  return `${examId}/${paper.id}/${groupPrefix}q${enrichmentQuestionNumber(paper, question)}`;
}
