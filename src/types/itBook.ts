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
  // Chỉ có ở các nguồn bổ sung ngoài sách FPT Software gốc (vd bộ từ vựng
  // BrSE "báo & xử lý lỗi", lesson 16) -- sách gốc không có câu ví dụ.
  example?: string;
  exampleVi?: string;
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

// One 語彙/ポイント-style term callout -- appears both under a lesson's 読解
// (reading passage) and under its モデル会話 (model dialogue). `definitionVi`
// is Gemini's own paraphrase of the book's Vietnamese explanation, not a
// verbatim copy (see ItBookLessonDataset.meta.notes) -- term/termEn/termVi
// are transcribed as printed.
export interface ItBookTerm {
  term: string;
  termEn?: string;
  termVi?: string;
  definitionVi: string;
}

export interface ItBookDialogueTurn {
  speaker: string;
  text: string;
  // Gemini's own Vietnamese translation of `text` (not the book's, which
  // doesn't print one for モデル会話) -- text-to-text from the already
  //-verified Japanese, so unlike readingPoints/dialoguePoints' definitionVi
  // this one IS a direct, complete translation, not a paraphrase.
  textVi?: string;
}

// One IT用語を覚えましょう fill-in-the-blank question -- `text` keeps the
// book's blank marker (＿＿＿＿) inline. Options are shared across all of a
// lesson's questions (a lettered word bank, not per-question choices).
export interface ItBookQuizQuestion {
  number: number;
  text: string;
}

export interface ItBookQuizOption {
  letter: string;
  text: string;
}

export interface ItBookLesson {
  id: string;
  lessonNumber: number;
  title: string; // Japanese lesson title, e.g. "レッスン1 プロジェクト概要"
  titleVi: string; // e.g. "Tổng quan dự án"
  // Number of scanned page images available at
  // public/images/it-book/lesson-{lessonNumber}/{1..pageImageCount}.jpg --
  // the diagrams/org-charts/screenshots in a lesson's 読解 don't survive
  // text extraction (readingParagraphs describes tables as prose), so the
  // original page images are kept as a visual fallback/backup, shown
  // collapsed by default (ItBookLessonsScreen.tsx's "Ảnh trang sách gốc").
  pageImageCount: number;
  goals: string[]; // 目標
  readingParagraphs: string[]; // 読解, split by the book's own numbered sections
  // Vietnamese translation of readingParagraphs, same length/order -- a
  // direct Gemini translation of the (already Japanese-verified) text, not
  // a paraphrase. Optional: only lessons that went through translate_lesson.py have it.
  readingParagraphsVi?: string[];
  readingPoints: ItBookTerm[]; // ポイント boxes tied to 読解
  practiceQuestions: string[]; // 質問
  practiceQuestionsVi?: string[];
  groupDiscussion: string[]; // グループ討論
  groupDiscussionVi?: string[];
  dialogueBackground: string; // 背景 of モデル会話
  dialogueBackgroundVi?: string;
  dialogueTurns: ItBookDialogueTurn[];
  dialoguePoints: ItBookTerm[]; // ポイント boxes tied to モデル会話
  usefulPhrases: { phrase: string; meaningVi: string }[]; // 覚えましょう
  roleplayBackground: string; // 背景 of 会話の練習をしましょう
  roleplayBackgroundVi?: string;
  roleplayParticipants: string[]; // 参加者
  roleplayContent: string[]; // 練習内容
  roleplayContentVi?: string[];
  quizInstructions: string; // IT用語を覚えましょう's lead-in sentence
  quizQuestions: ItBookQuizQuestion[];
  quizOptions: ItBookQuizOption[];
  // Index into quizOptions (0-based) for each quizQuestions entry, same
  // length/order as quizQuestions -- filled from Phụ lục 4's answer key.
  // Undefined until that pass is done; the quiz then shows without
  // right/wrong marking (still useful as a vocab-recall exercise).
  quizAnswerKey?: number[];
}

interface ItBookLessonMeta {
  schemaVersion: string;
  generatedAt: string;
  counts: Record<string, number>;
  source: { name: string; note: string };
}

export interface ItBookLessonDataset {
  meta: ItBookLessonMeta;
  lessons: ItBookLesson[];
}
