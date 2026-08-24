import type { JlptLevel } from "./kanji.ts";

// Matches the book's own 短文/中文/長文/情報検索 split (short/medium/long
// passage, or an information-search task built from a flyer/table/notice
// instead of prose) -- see readingState.ts for the display labels and
// estimated-minutes ranges.
export type ReadingLength = "short" | "medium" | "long" | "info-search";

// One run of text with an optional furigana reading above it. A run with no
// kanji (particles, punctuation, kana-only words) has furigana: null.
export interface ReadingBodySegment {
  text: string;
  furigana: string | null;
}

export interface ReadingQuestionOption {
  text: string;
}

export interface ReadingQuestion {
  question: string;
  questionVi: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}

// Which source book a passage came from -- lets the Reading screen filter/
// label by book (e.g. Speed Master is noticeably easier than Shin Kanzen
// Master even at the same JLPT level) instead of only by level/length.
export type ReadingBook = "shinkanzen" | "speedmaster" | "taisaku";

export interface ReadingPassage {
  id: string;
  level: JlptLevel;
  length: ReadingLength;
  book: ReadingBook;
  estimatedMinutes: number;
  title: string;
  // Which book/section this was adapted from -- kept for personal reference,
  // not shown as a citation in the UI.
  source: string;
  body: ReadingBodySegment[];
  translationVi: string;
  questions: ReadingQuestion[];
  // Optional worked-analysis note (Vietnamese) adapted from the source
  // book's own "how to think through this" walkthrough -- e.g. Taisaku
  // Mondai's かんがえよう section, which reasons through each choice rather
  // than just stating the answer. Shown as an extra toggle in the UI when
  // present; most passages/books won't have one.
  studyNote?: string;
}

export interface ReadingDataset {
  passages: ReadingPassage[];
}
