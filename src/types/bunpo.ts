import type { JlptLevel } from "./kanji.ts";

// "jlpt-da-ra": ngữ pháp đã ra trong đề thi JLPT (bảng phẳng, không chương).
// "theo-chuong": ngữ pháp học theo chương (sơ đồ tư duy), có usage/examTip.
export type BunpoSource = "jlpt-da-ra" | "theo-chuong";

export interface BunpoGrammarPoint {
  id: string;
  level: JlptLevel;
  source: BunpoSource;
  chapter?: number; // chỉ có ở nguồn "theo-chuong"
  chapterTitle?: string; // vd "Biểu hiện mục đích / thay đổi"
  pattern: string; // vd "〜ようになる"
  meaningVi: string; // Nghĩa / Ý nghĩa
  usage?: string; // Cách dùng, vd "V辞書形" (chỉ "theo-chuong")
  examTip?: string; // Key JLPT (chỉ "theo-chuong")
  example: string; // Ví dụ (JP)
  exampleVi: string; // Nghĩa tiếng Việt của ví dụ
}

export interface BunpoDataset {
  grammarPoints: BunpoGrammarPoint[];
}
