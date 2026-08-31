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
  taskType: ListeningTaskType;
  // Path resolved via assetUrl() -- see platform/assetUrl.ts.
  audioUrl: string;
  scenario: string;
  turns: ListeningTurn[];
  question: string;
  questionVi: string;
  options: string[];
  optionsVi: string[];
  correctIndex: number;
  explanation: string;
}

export interface ListeningDataset {
  questions: ListeningQuestion[];
}
