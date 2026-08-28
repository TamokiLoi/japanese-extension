import type { BunpoGrammarPoint } from "../types/bunpo.ts";
import type { ReadingPassage } from "../types/reading.ts";
import type { QuizBookQuestion } from "../types/quizBook.ts";
import { ALL_READING } from "./readingState.ts";
import { ALL_QUIZBOOK } from "./quizBookState.ts";

const MAX_MATCHES = 5;

// Turns a grammar pattern like "〜ば〜ほど" or "〜そうだ（伝聞）" into the plain-kana
// chunks worth searching for in real text -- strips parenthetical notes
// (they're Vietnamese/meta, not part of the literal pattern), splits on the
// "〜" placeholder tildes, and drops any chunk too short to be a meaningful
// substring match. Measured against the real reading/quizbook data: a
// 2-char minimum still let common particles like "から"/"でも" match 30-60%
// of all passages (pure noise, not a real "this grammar is used here"
// signal); requiring >=3 chars cuts nearly all of that while still
// resolving ~110/240 patterns to at least one real match.
export function extractMatchChunks(pattern: string): string[] {
  const withoutNotes = pattern.replace(/（[^）]*）/g, "");
  return withoutNotes
    .split("〜")
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.length >= 3);
}

function textContainsAllChunks(text: string, chunks: string[]): boolean {
  return chunks.every((chunk) => text.includes(chunk));
}

export function findMatchingReadingPassages(g: BunpoGrammarPoint, limit = MAX_MATCHES): ReadingPassage[] {
  const chunks = extractMatchChunks(g.pattern);
  if (chunks.length === 0) return [];
  const matches: ReadingPassage[] = [];
  for (const passage of ALL_READING) {
    const text = passage.body.map((seg) => seg.text).join("");
    if (textContainsAllChunks(text, chunks)) {
      matches.push(passage);
      if (matches.length >= limit) break;
    }
  }
  return matches;
}

export function findMatchingQuizBookQuestions(g: BunpoGrammarPoint, limit = MAX_MATCHES): QuizBookQuestion[] {
  const chunks = extractMatchChunks(g.pattern);
  if (chunks.length === 0) return [];
  const pool = ALL_QUIZBOOK.filter((q) => q.category === "bunpou");
  const matches: QuizBookQuestion[] = [];
  for (const q of pool) {
    const text = `${q.question} ${q.options.join(" ")}`;
    if (textContainsAllChunks(text, chunks)) {
      matches.push(q);
      if (matches.length >= limit) break;
    }
  }
  return matches;
}
