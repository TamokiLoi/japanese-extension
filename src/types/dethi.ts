import type { JlptLevel } from "./kanji.ts";

export interface DeThiProblemGroup {
  label: string;
  questionCount: number;
  pointsPerQuestion: number;
  totalPoints: number;
}

export interface DeThiQuestion {
  number: number;
  problemGroup: string;
  question: string;
  options: string[];
  correctIndex: number;
  points: number;
  passage: string | null;
}

export interface DeThiPaper {
  id: string;
  label: string;
  timeMinutes: number;
  totalPoints: number;
  problemGroups: DeThiProblemGroup[];
  questions: DeThiQuestion[];
}

export interface DeThiExam {
  id: string;
  examLabel: string;
  papers: DeThiPaper[];
}

export interface DeThiDataset {
  meta: {
    schemaVersion: string;
    source: string;
    level: JlptLevel;
    examCount: number;
    notes: string;
  };
  exams: DeThiExam[];
}
