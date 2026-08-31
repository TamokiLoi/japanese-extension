import type { JlptLevel } from "./kanji.ts";

// Matches the 4 real N3 聴解 task shapes -- see the Gemini research notes
// from planning this feature. POC only exercises "kadai" so far.
export type ListeningTaskType = "kadai" | "point" | "gaiyou" | "sokuji";

export interface ListeningTurn {
  speaker: string;
  text: string;
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
  scenario: string;
  scenarioVi: string;
  turns: ListeningTurn[];
  question: string;
  questionVi: string;
  // Some 課題理解-style items use illustrated (picture) answer choices --
  // the book never prints those as text anywhere, so there's nothing to OCR.
  // Rather than crop individual pictures out (extra Gemini calls to guess
  // bounding boxes, more room for error), the whole source page image is
  // kept as-is and shown alongside plain numbered buttons -- optionsImage
  // set means "ignore options/optionsVi, render optionCount numbered
  // buttons under this image instead."
  options: string[];
  optionsVi: string[];
  optionsImage?: string;
  optionCount?: number;
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
