export type ExamTipsSourceDeck = "reading-tips" | "fast-reading" | "listening-tips";

export interface ExamTipsSourceRef {
  deck: ExamTipsSourceDeck;
  slide: number;
}

export type ExamTipsBlock =
  | { type: "text"; title?: string; paragraphs: string[] }
  | { type: "callout"; title: string; text: string; tone?: "tip" | "warning" }
  | { type: "steps"; title: string; items: { title: string; text: string }[] }
  | { type: "comparison"; title: string; intro?: string; items: { label: string; text: string; detail?: string }[]; takeaway?: string }
  | { type: "examples"; title?: string; items: { title?: string; jp: string; vi?: string; analysis?: string }[] }
  | { type: "passage"; title: string; jp: string; vi?: string; evidence?: string }
  | { type: "table"; title: string; headers: string[]; rows: string[][] }
  | { type: "image"; src: string; alt: string; caption?: string }
  | { type: "exercise"; prompt: string; choices?: string[]; answerIndex?: number; explanation?: string; evidence?: string; selfCheck?: boolean }
  | { type: "media"; title: string; youtubeId: string };

export interface ExamTipsLesson {
  id: string;
  title: string;
  summary: string;
  minutes?: number;
  blocks: ExamTipsBlock[];
  sourceSlides: ExamTipsSourceRef[];
}

export interface ExamTipsSlideCoverage {
  deck: ExamTipsSourceDeck;
  slide: number;
  lessonId?: string;
  disposition: "converted" | "merged" | "cover" | "reference";
  note?: string;
}

export type ExamTipsSkill = "reading" | "listening";
export type ExamTipsLevel = "N5" | "N4" | "N3" | "N2" | "N1";

export interface ExamTipsProgress {
  version: 1;
  level: ExamTipsLevel;
  skill: ExamTipsSkill;
  lastLessonId?: string;
  lastBlockIndex?: number;
  completedLessonIds: string[];
  exerciseChoices: Record<string, number | string>;
}
