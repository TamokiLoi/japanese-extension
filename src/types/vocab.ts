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
