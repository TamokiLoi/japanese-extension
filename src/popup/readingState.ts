import readingN3ShinkanzenRaw from "../data/reading-n3-shinkanzen.json";
import readingN3SpeedmasterRaw from "../data/reading-n3-speedmaster.json";
import readingN3TaisakuRaw from "../data/reading-n3-taisaku.json";
import mocktestN3ShinkanzenRaw from "../data/mocktest-n3-shinkanzen.json";
import readingN3Dokkai55Raw from "../data/reading-n3-dokkai55.json";
import readingN3Dokkai115Raw from "../data/reading-n3-dokkai115.json";
import type { ReadingDataset, ReadingPassage, ReadingLength, ReadingBook, ReadingQuestionType, ReadingBodySegment } from "../types/reading.ts";
import type { JlptLevel } from "../types/kanji.ts";
import { storageGet, storageSet } from "../platform/storage";

const shinkanzenDataset = readingN3ShinkanzenRaw as unknown as ReadingDataset;
const speedmasterDataset = readingN3SpeedmasterRaw as unknown as ReadingDataset;
const taisakuDataset = readingN3TaisakuRaw as unknown as ReadingDataset;
const mocktestShinkanzenDataset = mocktestN3ShinkanzenRaw as unknown as ReadingDataset;
const dokkai55Dataset = readingN3Dokkai55Raw as unknown as ReadingDataset;
const dokkai115Dataset = readingN3Dokkai115Raw as unknown as ReadingDataset;
export const ALL_READING: ReadingPassage[] = [
  ...shinkanzenDataset.passages,
  ...speedmasterDataset.passages,
  ...taisakuDataset.passages,
  ...mocktestShinkanzenDataset.passages,
  ...dokkai55Dataset.passages,
  ...dokkai115Dataset.passages,
];

const READING_BY_ID = new Map(ALL_READING.map((p) => [p.id, p]));
export function findReadingById(id: string): ReadingPassage | undefined {
  return READING_BY_ID.get(id);
}

// Breaks one segment's text into one piece per sentence (plus a piece
// boundary right before each "\n"). A segment's furigana is NOT necessarily
// for its whole text -- in this dataset a segment routinely spans multiple
// sentences with the furigana reading only the one kanji word right at its
// end (e.g. "に入れないこと。\n入れるときは管理人" carries furigana for just
// 管理人, the trailing word) -- so cutting is always safe as long as the
// reading travels with whichever piece it actually belongs to.
const CLOSING_PUNCT = /[」』）)]/;
function splitPlainText(text: string): string[] {
  const pieces: string[] = [];
  let buf = "";
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch === "\n" && buf.length > 0) {
      pieces.push(buf);
      buf = "";
    }
    buf += ch;
    if (ch === "。" || ch === "！" || ch === "？") {
      // Absorb an immediately-following closing quote/paren/bracket (「...」。
      // style dialogue) into this same piece instead of leaving it to
      // wrongly open the next one.
      while (i + 1 < text.length && CLOSING_PUNCT.test(text[i + 1])) {
        i++;
        buf += text[i];
      }
      pieces.push(buf);
      buf = "";
    }
    i++;
  }
  if (buf) pieces.push(buf);
  return pieces;
}

// Groups body segments into sentences (up to and including one ending in
// 。！？) -- the same grouping scripts/translate-reading-sentences.ts uses to
// derive what to send to the translator, so `sentencesVi[i]` always lines up
// with splitBodyIntoSentences(body)[i]. Any trailing text with no terminator
// (rare -- a passage not ending in punctuation) forms one last group.
//
// A "\n" only closes the current group when it sits at the very START of a
// body *segment's own* raw text (segment.text.startsWith("\n")) -- that's
// how a heading like "使用方法" is followed by the numbered "①..." text, or
// how a flyer's separate label lines ("あて先：...", "件名：...") are laid
// out in this dataset, and really is a deliberate line break. A "\n" that
// shows up *mid-segment* instead (splitPlainText cutting seg.text at an
// embedded "\n") is PDF line-wrap noise, not a real boundary -- sometimes
// falling mid-word (e.g. "でもい" + "\nいです" -- literally through the
// middle of "いい") -- so it must NOT force a break, or the two halves of
// one sentence end up as separate incomplete "sentences". Stripping the
// leading "\n" off a non-genuine break just re-joins the words cleanly.
const SENTENCE_END = /[。！？]$/;
export function splitBodyIntoSentences(body: ReadingBodySegment[]): ReadingBodySegment[][] {
  const groups: ReadingBodySegment[][] = [];
  let current: ReadingBodySegment[] = [];
  function addPiece(text: string, furigana: string | null, genuineBreak: boolean) {
    if (genuineBreak && current.length > 0) {
      groups.push(current);
      current = [];
    }
    const cleanText = genuineBreak ? text : text.replace(/^\n+/, "");
    current.push({ text: cleanText, furigana });
    if (SENTENCE_END.test(cleanText)) {
      groups.push(current);
      current = [];
    }
  }
  for (const seg of body) {
    const pieces = splitPlainText(seg.text);
    const segStartsWithNewline = seg.text.startsWith("\n");
    // The furigana reading applies to a kanji word within this segment,
    // which -- per how this dataset is structured -- always sits in the
    // trailing piece (a segment never starts mid-word right after a kanji
    // compound and then continues into an earlier sentence). Every earlier
    // piece carries no reading of its own.
    pieces.forEach((piece, i) => addPiece(piece, i === pieces.length - 1 ? seg.furigana : null, i === 0 && segStartsWithNewline));
  }
  if (current.length > 0) groups.push(current);
  return groups;
}

// Progress (correct/wrong counts, mastery bucket) is tracked per-question,
// not per-passage -- a passage's questions can be about equally hard or
// wildly uneven, and "which specific question keeps getting missed" is what
// the Stats screen needs to surface for review. Id is derived (not stored on
// the question itself) since passage/question data is static and re-derived
// on every load anyway.
export function readingQuestionId(passageId: string, questionIndex: number): string {
  return `${passageId}::q${questionIndex}`;
}

export interface ReadingQuestionItem {
  id: string;
  level: JlptLevel;
  book: ReadingBook;
  passageId: string;
  questionIndex: number;
  questionType?: ReadingQuestionType;
}

export const ALL_READING_QUESTIONS: ReadingQuestionItem[] = ALL_READING.flatMap((p) =>
  p.questions.map((q, questionIndex) => ({
    id: readingQuestionId(p.id, questionIndex),
    level: p.level,
    book: p.book,
    passageId: p.id,
    questionIndex,
    questionType: q.questionType,
  })),
);

export const LENGTH_LABELS: Record<ReadingLength, string> = {
  short: "Đoản văn",
  medium: "Trung văn",
  long: "Trường văn",
  "info-search": "Tìm kiếm thông tin",
};

// Shin Kanzen Master's passages/vocabulary run noticeably harder than Speed
// Master at the same JLPT level -- the book tag lets the UI label that (and
// filter by it) instead of only by level/length, which can't tell them apart.
export const BOOK_LABELS: Record<ReadingBook, string> = {
  shinkanzen: "Shin Kanzen Master",
  speedmaster: "Speed Master",
  taisaku: "N3 Taisaku Mondai",
  dokkai55: "N3 Dokkai 55+",
  dokkai115: "N3 Đọc Hiểu 115 Bài",
};

export const BOOK_DIFFICULTY_NOTE: Record<ReadingBook, string> = {
  shinkanzen: "khó hơn",
  speedmaster: "dễ hơn",
  taisaku: "có giải thích cách suy luận",
  dokkai55: "nhiều bài tìm kiếm thông tin thực tế",
  dokkai115: "sách Trung Quốc, đủ 4 dạng bài chuẩn đề thi",
};

// Ordering shown in the length filter -- short to long, mirrors LEVEL_ORDER
// in kanjiState.ts (easiest/shortest first). Info-search is a different
// task shape (flyer/table + question) rather than a "longer" passage, so it
// sits last regardless of how much text it contains.
export const AVAILABLE_LENGTHS: ReadingLength[] = (
  ["short", "medium", "long", "info-search"] as ReadingLength[]
).filter((len) => ALL_READING.some((p) => p.length === len));

const LEVEL_ORDER: JlptLevel[] = ["N5", "N4", "N3", "N2", "N1"];
export const AVAILABLE_LEVELS: JlptLevel[] = LEVEL_ORDER.filter((level) => ALL_READING.some((p) => p.level === level));

const BOOK_ORDER: ReadingBook[] = ["speedmaster", "shinkanzen", "taisaku", "dokkai55", "dokkai115"];
export const AVAILABLE_BOOKS: ReadingBook[] = BOOK_ORDER.filter((book) => ALL_READING.some((p) => p.book === book));

export function pickRandomPassage(
  levels: JlptLevel[],
  lengths: ReadingLength[],
  books: ReadingBook[],
  excludeId?: string | null,
): ReadingPassage | null {
  let pool = ALL_READING.filter(
    (p) => levels.includes(p.level) && lengths.includes(p.length) && books.includes(p.book),
  );
  if (excludeId && pool.length > 1) pool = pool.filter((p) => p.id !== excludeId);
  if (pool.length === 0) return null;
  return pool[Math.floor(Math.random() * pool.length)];
}

export type PassageStatus = "not-started" | "in-progress" | "done";

export interface PassageProgress {
  status: PassageStatus;
  correct: number;
  answeredCount: number;
  total: number;
}

// Reads straight off the persisted `answers` map -- no separate progress
// store, so a passage's status can never drift from what the questions
// screen actually shows.
export function getPassageProgress(
  passage: ReadingPassage,
  answers: Record<string, (number | null)[]>,
): PassageProgress {
  const total = passage.questions.length;
  const saved = answers[passage.id];
  if (!saved || saved.every((a) => a === null)) {
    return { status: "not-started", correct: 0, answeredCount: 0, total };
  }
  const answeredCount = saved.filter((a) => a !== null).length;
  const correct = passage.questions.filter((q, qi) => saved[qi] === q.correctIndex).length;
  const status: PassageStatus = answeredCount >= total ? "done" : "in-progress";
  return { status, correct, answeredCount, total };
}

// Persisted across popup closes and the "⤢ mở tab" escape hatch (same
// pattern as KanjiViewerState/VocabViewerState) so a long passage isn't
// lost -- reopening the screen picks up the same passage, toggle states,
// and answers already given, instead of re-rolling a random one.
export interface ReadingViewerState {
  selectedLevels: JlptLevel[];
  selectedLengths: ReadingLength[];
  selectedBooks: ReadingBook[];
  currentPassageId: string | null;
  showFurigana: boolean;
  showTranslation: boolean;
  showStudyNote: boolean;
  // Whether correctness + explanations are revealed for the current
  // passage's questions -- selecting an answer just records the choice;
  // nothing about right/wrong shows until this flips true (see the
  // "Kiểm tra kết quả" toggle), so a whole passage can be answered
  // exam-style before checking anything.
  resultsRevealed: boolean;
  answers: Record<string, (number | null)[]>;
  // "needs-review" is done passages with at least 1 wrong answer -- a
  // subset of "done", not mutually exclusive with it at the data level, but
  // treated as its own distinct filter value here (see ReadingScreen.tsx's
  // visiblePassages) so the list's status buttons can partition passages
  // into exactly 4 useful buckets: not-started / in-progress / done-clean /
  // done-with-mistakes.
  listStatusFilter: "all" | "not-started" | "done" | "in-progress" | "needs-review";
}

const STORAGE_KEY = "readingViewer";

export function defaultViewerState(): ReadingViewerState {
  return {
    selectedLevels: [...AVAILABLE_LEVELS],
    selectedLengths: [...AVAILABLE_LENGTHS],
    selectedBooks: [...AVAILABLE_BOOKS],
    currentPassageId: null,
    showFurigana: false,
    showTranslation: false,
    showStudyNote: false,
    resultsRevealed: false,
    answers: {},
    listStatusFilter: "all",
  };
}

export async function loadViewerState(): Promise<ReadingViewerState> {
  const saved = await storageGet<Partial<ReadingViewerState>>(STORAGE_KEY);
  const fallback = defaultViewerState();
  const selectedLevels = (saved?.selectedLevels ?? fallback.selectedLevels).filter((l) => AVAILABLE_LEVELS.includes(l));
  const selectedLengths = (saved?.selectedLengths ?? fallback.selectedLengths).filter((l) =>
    AVAILABLE_LENGTHS.includes(l),
  );
  const selectedBooks = (saved?.selectedBooks ?? fallback.selectedBooks).filter((b) => AVAILABLE_BOOKS.includes(b));
  return {
    selectedLevels: selectedLevels.length > 0 ? selectedLevels : fallback.selectedLevels,
    selectedLengths: selectedLengths.length > 0 ? selectedLengths : fallback.selectedLengths,
    selectedBooks: selectedBooks.length > 0 ? selectedBooks : fallback.selectedBooks,
    currentPassageId:
      saved?.currentPassageId && findReadingById(saved.currentPassageId) ? saved.currentPassageId : null,
    showFurigana: saved?.showFurigana ?? fallback.showFurigana,
    showTranslation: saved?.showTranslation ?? fallback.showTranslation,
    showStudyNote: saved?.showStudyNote ?? fallback.showStudyNote,
    resultsRevealed: saved?.resultsRevealed ?? fallback.resultsRevealed,
    answers: saved?.answers ?? fallback.answers,
    listStatusFilter: saved?.listStatusFilter ?? fallback.listStatusFilter,
  };
}

export async function saveViewerState(state: ReadingViewerState): Promise<void> {
  await storageSet(STORAGE_KEY, state);
}

// Clears one passage's saved answers so it shows as "chưa làm" again --
// leaves every other passage's progress and the current filters untouched.
export function resetPassageAnswers(state: ReadingViewerState, passageId: string): ReadingViewerState {
  const { [passageId]: _removed, ...rest } = state.answers;
  return { ...state, answers: rest };
}

export function matchesFilters(p: ReadingPassage, state: ReadingViewerState): boolean {
  return state.selectedLevels.includes(p.level) && state.selectedLengths.includes(p.length) && state.selectedBooks.includes(p.book);
}

// Same passage-level filter as matchesFilters, applied to the flattened
// per-question item list (HomeScreen's "Tổng số thẻ"/bucket counts track
// individual questions, not whole passages) -- ReadingQuestionItem doesn't
// carry `length`, so this filters passages first and keys off passageId.
export function getFilteredQuestions(state: ReadingViewerState): ReadingQuestionItem[] {
  const passageIds = new Set(ALL_READING.filter((p) => matchesFilters(p, state)).map((p) => p.id));
  return ALL_READING_QUESTIONS.filter((q) => passageIds.has(q.passageId));
}
