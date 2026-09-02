import type { JlptLevel } from "./kanji.ts";

// Matches the source book's own 文字 (kanji reading) / 語彙 (vocab) / 文法
// (grammar) split -- see quizBookState.ts for the display labels.
export type QuizBookCategory = "moji" | "goi" | "bunpou";

export interface QuizBookQuestion {
  id: string;
  level: JlptLevel;
  book: string;
  category: QuizBookCategory;
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  explanationEn: string;
  // Vocab/grammar notes from the book's answer-key margin -- free-form,
  // OCR'd rather than hand-authored, so shown as supplementary raw lines
  // rather than parsed into structured fields.
  notes: string[];
  // Shared reading passage for a 文章の文法 (Doriru-style 問題3) cluster --
  // several consecutive questions fill blanks in the same paragraph, so the
  // passage is duplicated onto each question rather than modeled as a
  // separate parent entity.
  passage?: string;
}

export interface QuizBookDataset {
  meta: {
    schemaVersion: string;
    bookLabel: string;
    level: JlptLevel;
    count: number;
    droppedUnresolved: number;
  };
  questions: QuizBookQuestion[];
}
