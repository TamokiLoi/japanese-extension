import readingN3ShinkanzenRaw from "../data/reading-n3-shinkanzen.json";
import readingN3SpeedmasterRaw from "../data/reading-n3-speedmaster.json";
import readingN3TaisakuRaw from "../data/reading-n3-taisaku.json";
import mocktestN3ShinkanzenRaw from "../data/mocktest-n3-shinkanzen.json";
import type { ReadingDataset, ReadingPassage, ReadingLength, ReadingBook } from "../types/reading.ts";
import type { JlptLevel } from "../types/kanji.ts";
import { storageGet, storageSet } from "../platform/storage";

const shinkanzenDataset = readingN3ShinkanzenRaw as unknown as ReadingDataset;
const speedmasterDataset = readingN3SpeedmasterRaw as unknown as ReadingDataset;
const taisakuDataset = readingN3TaisakuRaw as unknown as ReadingDataset;
const mocktestShinkanzenDataset = mocktestN3ShinkanzenRaw as unknown as ReadingDataset;
export const ALL_READING: ReadingPassage[] = [
  ...shinkanzenDataset.passages,
  ...speedmasterDataset.passages,
  ...taisakuDataset.passages,
  ...mocktestShinkanzenDataset.passages,
];

const READING_BY_ID = new Map(ALL_READING.map((p) => [p.id, p]));
export function findReadingById(id: string): ReadingPassage | undefined {
  return READING_BY_ID.get(id);
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
}

export const ALL_READING_QUESTIONS: ReadingQuestionItem[] = ALL_READING.flatMap((p) =>
  p.questions.map((_, questionIndex) => ({
    id: readingQuestionId(p.id, questionIndex),
    level: p.level,
    book: p.book,
    passageId: p.id,
    questionIndex,
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
};

export const BOOK_DIFFICULTY_NOTE: Record<ReadingBook, string> = {
  shinkanzen: "khó hơn",
  speedmaster: "dễ hơn",
  taisaku: "có giải thích cách suy luận",
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

const BOOK_ORDER: ReadingBook[] = ["speedmaster", "shinkanzen", "taisaku"];
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
  listStatusFilter: "all" | "not-started" | "done";
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
