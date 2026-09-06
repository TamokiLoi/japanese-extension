// "IT の日本語 - ソフトウェア開発プロジェクト" (FPT Software) -- a business/IT
// Japanese textbook, separate domain from the JLPT-leveled content
// elsewhere in the app (no JlptLevel, no partOfSpeech breakdown -- the
// source Anki export doesn't carry either). `lesson` groups words the same
// way the book itself does: 0 = "Từ thông dụng" (general terms, not tied to
// a specific lesson), 1-15 = the book's 15 lessons.
export interface ItBookVocabWord {
  id: string;
  word: string;
  reading: string;
  hanViet: string[];
  meaningVi: string;
  lesson: number;
}

interface ItBookVocabMeta {
  schemaVersion: string;
  generatedAt: string;
  counts: Record<string, number>;
  source: { name: string; note: string };
}

export interface ItBookVocabDataset {
  meta: ItBookVocabMeta;
  words: ItBookVocabWord[];
}
