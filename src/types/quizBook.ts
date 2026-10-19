import type { JlptLevel } from "./kanji.ts";
import type { ReadingBodySegment } from "./reading.ts";

// Matches the source book's own 文字 (kanji reading) / 語彙 (vocab) / 文法
// (grammar) split -- see quizBookState.ts for the display labels.
export type QuizBookCategory = "moji" | "goi" | "bunpou";

export interface QuizBookQuestion {
  id: string;
  level: JlptLevel;
  book: string;
  category: QuizBookCategory;
  question: string;
  questionFurigana?: ReadingBodySegment[];
  options: string[];
  // Vietnamese glosses aligned with each Japanese answer choice. Shown after
  // the learner answers, just like `optionsVi` on JLPT exam questions.
  optionsVi?: string[];
  // `null` keeps the option index aligned when this quiz book has only been
  // partially annotated; non-null entries always reconstruct the option.
  optionsFurigana?: Array<ReadingBodySegment[] | null>;
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
  passageFurigana?: ReadingBodySegment[];
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
