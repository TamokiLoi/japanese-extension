import type { VocabCard } from "./vocabState.ts";
import type { ReadingPassage } from "../types/reading.ts";
import type { QuizBookQuestion } from "../types/quizBook.ts";
import { ALL_READING } from "./readingState.ts";
import { ALL_QUIZBOOK } from "./quizBookState.ts";
import { getVocabReferenceTerms } from "./readingLinks.ts";

const MAX_MATCHES = 5;

// Use the same dictionary and conjugated forms as the references shown inside
// a reading passage, so a vocabulary card can link back even when the word is
// inflected in the passage (e.g. 届ける → 届けた).
export function findMatchingReadingPassages(v: VocabCard, limit = MAX_MATCHES): ReadingPassage[] {
  if (!v.word) return [];
  const matches: ReadingPassage[] = [];
  const terms = getVocabReferenceTerms(v);
  for (const passage of ALL_READING) {
    const text = passage.body.map((seg) => seg.text).join("");
    if (terms.some((term) => text.includes(term))) {
      matches.push(passage);
      if (matches.length >= limit) break;
    }
  }
  return matches;
}

// "bunpou" (grammar) questions are excluded -- "moji"/"goi" (文字・語彙) are
// the vocab-relevant categories across the 500-mon/tuvung-20de quizbooks.
export function findMatchingQuizBookQuestions(v: VocabCard, limit = MAX_MATCHES): QuizBookQuestion[] {
  if (!v.word) return [];
  const pool = ALL_QUIZBOOK.filter((q) => q.category === "moji" || q.category === "goi");
  const matches: QuizBookQuestion[] = [];
  for (const q of pool) {
    const text = `${q.question} ${q.options.join(" ")}`;
    if (text.includes(v.word)) {
      matches.push(q);
      if (matches.length >= limit) break;
    }
  }
  return matches;
}
