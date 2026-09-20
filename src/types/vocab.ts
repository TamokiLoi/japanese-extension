// Mirrors src/types/vocab-tanoshii.ts from the japanese-data repo. Keep in
// sync manually -- duplicated here so this repo builds standalone.
import type { JlptLevel } from "./kanji.ts";

export type VocabPos = "Danh từ" | "Động từ" | "Tính từ" | "Trạng từ" | "Trợ từ" | "Khác";

interface DatasetMeta {
  schemaVersion: string;
  generatedAt: string;
  counts: Record<string, number>;
  sources: Record<string, unknown>;
  notes: string[];
}

// Chỉ có giá trị với partOfSpeech "Động từ" -- lấy từ mazii.net (nhóm
// động từ, tự/tha động từ, bảng chia thể). Optional vì phần lớn dataset
// (danh từ/tính từ/...) không áp dụng.
export interface VerbConjugations {
  masu?: string;
  te?: string;
  ta?: string;
  nai?: string;
  potential?: string;
  passive?: string;
  causative?: string;
  causativePassive?: string;
  conditionalBa?: string;
  conditionalTara?: string;
  volitional?: string;
  imperative?: string;
  prohibitive?: string;
}

export interface TanoshiiVocabWord {
  id: string;
  word: string;
  reading: string | null;
  level: JlptLevel;
  partOfSpeech: VocabPos;
  hanViet: string[];
  meaningVi: string;
  mnemonic: string[];
  example: string | null;
  exampleVi: string | null;
  verbGroup?: string;
  transitivity?: string;
  conjugations?: VerbConjugations;
  // Nghĩa tiếng Anh gốc -- chủ yếu có ích với từ katakana (mượn từ tiếng
  // Anh) để người học thấy rõ từ gốc. Optional vì hầu hết nguồn dữ liệu
  // (OCR sách giấy) không có sẵn field này.
  english?: string;
}

export interface TanoshiiVocabDataset {
  meta: DatasetMeta;
  words: TanoshiiVocabWord[];
}

export interface TanoshiiSynonymPair {
  id: string;
  word: string;
  wordReading: string | null;
  synonym: string;
  synonymReading: string | null;
  level: JlptLevel;
  meaningVi: string;
}

export interface TanoshiiSynonymDataset {
  meta: DatasetMeta;
  pairs: TanoshiiSynonymPair[];
}

export interface MimikaraWord {
  id: string;
  stt: number;
  bai: number;
  word: string;
  reading: string | null;
  level: JlptLevel;
  hanViet: string[];
  meaningVi: string;
  mnemonic: string[];
  example: string | null;
  exampleVi: string | null;
  // Nghĩa tiếng Anh từ jisho.org -- fetch + merge cho 874/880 từ trong đợt
  // kiểm tra chất lượng nghĩa 2026-09-19/20 (xem
  // _scratch/mimikara_mazii_jisho_diffs.json; 6 từ không có do jisho không
  // trả kết quả hoặc trả rỗng). Nhiều nghĩa cách nhau bởi ", " trong 1 string
  // (giống english trên TanoshiiVocabWord), đã dedupe các biến thể chỉ khác
  // hoa/thường từ jisho.
  english?: string;
}

export interface MimikaraDataset {
  meta: DatasetMeta;
  words: MimikaraWord[];
}

export interface JlptHistoryEntry {
  id: string;
  year: string;
  stt: number;
  word: string;
  readingOrSynonym: string;
  level: JlptLevel;
  meaningVi: string | null;
  occurrences: string[];
}

export interface JlptHistoryDataset {
  meta: DatasetMeta;
  entries: JlptHistoryEntry[];
}

// Cặp tự động từ - tha động từ (vd 開く/開ける) -- mỗi entry sinh ra 2
// VocabCard (1 cho mỗi vế), liên kết chéo nhau qua VocabCard.pairVerb.
export interface TransitivityPair {
  id: string;
  level: JlptLevel;
  jidoushi: string;
  jidoushiReading: string | null;
  tadoushi: string;
  tadoushiReading: string | null;
  meaningVi: string;
  exampleJidoushi: string | null;
  exampleJidoushiVi: string | null;
  exampleTadoushi: string | null;
  exampleTadoushiVi: string | null;
}

export interface TransitivityPairDataset {
  meta: DatasetMeta;
  pairs: TransitivityPair[];
}
