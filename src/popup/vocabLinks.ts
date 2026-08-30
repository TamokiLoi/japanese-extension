import type { VocabCard } from "./vocabState.ts";
import type { ReadingPassage } from "../types/reading.ts";
import type { QuizBookQuestion } from "../types/quizBook.ts";
import { ALL_READING } from "./readingState.ts";
import { ALL_QUIZBOOK } from "./quizBookState.ts";

const MAX_MATCHES = 5;

// Unlike bunpo patterns (which are templates with a "〜" placeholder and
// conjugate in real text), a vocab word is a literal string -- so a plain
// substring match against the word itself is enough for words that don't
// conjugate (nouns, adverbs). Verbs/adjectives will under-match since the
// dictionary form often isn't what appears in running text (e.g. "選び直す"
// shows up as "選び直した"), but that's an acceptable false-negative for a
// "here's where it's used" hint rather than a completeness guarantee.
export function findMatchingReadingPassages(v: VocabCard, limit = MAX_MATCHES): ReadingPassage[] {
  if (!v.word) return [];
  const matches: ReadingPassage[] = [];
  for (const passage of ALL_READING) {
    const text = passage.body.map((seg) => seg.text).join("");
    if (text.includes(v.word)) {
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
