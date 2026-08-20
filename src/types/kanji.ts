// Mirrors the Kanji type from the japanese-data repo (src/types/kanji.ts).
// Keep in sync manually — duplicated here so this repo builds standalone.
export type JlptLevel = "N5" | "N4" | "N3" | "N2" | "N1";

export interface Kanji {
  id: string;
  character: string;
  level: JlptLevel;
  hanViet: string[];
  meanings: {
    vi: string[];
    en: string[];
    viDraft?: string[];
  };
  readings: {
    on: string[];
    kun: string[];
  };
  strokeCount: number | null;
  frequency: number | null;
  radical: {
    raw: string | null;
    character?: string | null;
    meaningVi?: string | null;
  } | null;
  words: string[];
  examples: string[];
  mnemonic: string | null;
  relatedKanji: string[];
  tags: string[];
}

export interface KanjiDataset {
  meta: {
    schemaVersion: string;
    generatedAt: string;
    counts: Record<string, number>;
    sources: Record<string, unknown>;
    notes: string[];
  };
  kanji: Kanji[];
}
