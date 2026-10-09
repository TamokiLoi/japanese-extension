import type { JlptLevel } from "./kanji.ts";

// Matches official 聴解 task shapes across levels. `sougou` is N1's integrated
// comprehension section; `hatsugen` and `sokuji` used to
// be merged into one bucket; they are kept separate so the app mirrors the
// actual 問題4/問題5 structure.
export type ListeningTaskType = "kadai" | "point" | "gaiyou" | "hatsugen" | "sokuji" | "sougou";

export interface ListeningTurn {
  speaker: string;
  text: string;
  furigana?: { word: string; reading: string }[];
  // Vietnamese translation of `text`, shown under the Japanese line in the
  // transcript panel. Optional since older data may not have it yet --
  // see scripts/translate-listening-turns.ts.
  textVi?: string;
}

export interface ListeningQuestion {
  id: string;
  level: JlptLevel;
  // Which source book this came from -- drives the "Sách" filter, same as
  // QuizBook's `book` field.
  book: string;
  taskType: ListeningTaskType;
  // Path resolved via assetUrl() -- see platform/assetUrl.ts.
  audioUrl: string;
  // Optional segment within a shared full-paper recording. In an exam attempt
  // the paper still plays continuously; these offsets are only consumed by
  // per-question practice and post-submit review players.
  audioStartSec?: number;
  audioEndSec?: number;
  scenario: string;
  scenarioFurigana?: { word: string; reading: string }[];
  scenarioVi: string;
  turns: ListeningTurn[];
  question: string;
  questionFurigana?: { word: string; reading: string }[];
  questionVi: string;
  // Explicit spoken question stem when the source transcript does not store
  // the prompt as a separate final turn (e.g. N1 JLPT Mondai 2).
  questionPrompt?: string;
  questionPromptFurigana?: { word: string; reading: string }[];
  questionPromptVi?: string;
  // Some 課題理解-style items use illustrated (picture) answer choices --
  // the book never prints those as text anywhere, so there's nothing to OCR.
  // Rather than crop individual pictures out (extra Gemini calls to guess
  // bounding boxes, more room for error), the whole source page image is
  // kept as-is and shown alongside plain numbered buttons -- optionsImage
  // set means "ignore options/optionsVi, render optionCount numbered
  // buttons under this image instead."
  options: string[];
  optionFurigana?: { word: string; reading: string }[][];
  optionsVi: string[];
  // Optional explanation for each answer choice, shown after the learner
  // answers. This is useful for listening questions where several choices
  // look similar but only one is a natural response to the audio.
  optionExplanations?: string[];
  optionsImage?: string;
  // Supporting picture/context printed on the listening question page (not
  // necessarily the answer choices themselves).
  questionImage?: string;
  optionCount?: number;
  // True when the choices are spoken in the audio and must remain hidden
  // until the learner answers, even if the question type normally shows them.
  optionsInAudio?: boolean;
  // True when the spoken choices are already included in `turns`. Dictation
  // must not append `options` a second time to its reference transcript.
  optionsInTurns?: boolean;
  correctIndex: number;
  explanation: string;
  // Set when options[] was transcribed by Gemini listening to the audio
  // (the book never printed this item's options as text at all) rather than
  // read off a printed page -- wording may not match the spoken audio
  // word-for-word, unlike printed-source items. correctIndex is still the
  // real printed answer either way, only the option wording is at risk here.
  notes?: string;
}

export interface ListeningDataset {
  questions: ListeningQuestion[];
}
