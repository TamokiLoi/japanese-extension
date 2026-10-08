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
  // Marks the first run of a paragraph in an editorial/news passage. Existing
  // datasets omit this and keep their historical inline/PDF formatting.
  paragraphStart?: boolean;
}

export interface ReadingQuestionOption {
  text: string;
}

// Which JLPT-style skill this question drills, independent of the passage's
// own length/book classification -- lets Stats show "which question type do
// I keep missing" (e.g. always wrong on suy luận/inference) instead of just
// a flat per-passage right/wrong count. "info-search" is set deterministically
// from the passage's own `length: "info-search"`; the other four are
// classified per-question since a single passage mixes them freely. See
// scripts/classify-reading-question-types.ts for how this gets populated.
export type ReadingQuestionType = "detail" | "main-idea" | "inference" | "reference-vocab" | "info-search";

export interface ReadingQuestion {
  // Original number printed in the source exam. Ordinary reading-book items
  // omit it and keep the local per-passage numbering in the UI.
  sourceNumber?: number;
  question: string;
  // Source-emphasized substring, copied from the exam prompt or conservatively
  // inferred from an exact quote in the associated passage.
  underline?: string;
  questionVi: string;
  options: string[];
  optionsVi: string[];
  correctIndex: number;
  explanation: string;
  questionType?: ReadingQuestionType;
}

// Which source book a passage came from -- lets the Reading screen filter/
// label by book (e.g. Speed Master is noticeably easier than Shin Kanzen
// Master even at the same JLPT level) instead of only by level/length.
export type ReadingBook = "shinkanzen" | "speedmaster" | "taisaku" | "dokkai55" | "dokkai115" | "jlpt-exam" | "de-n3" | "news" | "custom";

export interface ReadingPassage {
  id: string;
  level: JlptLevel;
  length: ReadingLength;
  book: ReadingBook;
  // Source problem-group topic, e.g. "N3 · 問題3", used to practice one
  // JLPT reading part at a time. Other books may omit it.
  topic?: string;
  // JLPT exam cycle metadata; lets reading filters separate individual
  // official papers while keeping `book: "jlpt-exam"` as their shared type.
  examId?: string;
  examLabel?: string;
  estimatedMinutes: number;
  title: string;
  // Which book/section this was adapted from; displayed as attribution for
  // the news/custom collections and retained for other books.
  source: string;
  // Optional public source details displayed for curated news and user-added
  // links. `source` remains the compact, human-readable attribution label.
  sourceUrl?: string;
  publishedAt?: string;
  sourceNotice?: string;
  // A title/source link may be published as a reading resource when its
  // article body cannot be redistributed; the app then opens the source URL.
  linkOnly?: boolean;
  body: ReadingBodySegment[];
  // Exact source phrases underlined by one or more questions for this passage.
  underlinedPhrases?: string[];
  // Exact UTF-16 character ranges in the concatenated passage body. Supports
  // a specific occurrence when an underlined phrase repeats in the passage.
  underlinedRanges?: { start: number; end: number }[];
  translationVi: string;
  // Per-sentence Vietnamese translation, aligned 1:1 with
  // splitBodyIntoSentences(body) (see readingState.ts) -- lets the reading
  // screen interleave JP/VI sentence-by-sentence like Listening's turns
  // instead of one dense translated block. Optional: older/not-yet-processed
  // passages fall back to translationVi as a single block.
  sentencesVi?: string[];
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
