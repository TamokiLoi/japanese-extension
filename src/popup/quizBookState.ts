import quizbookN3500monRaw from "../data/quizbook-n3-500mon.json";
import quizbookN4500monRaw from "../data/quizbook-n4-500mon.json";
import quizbookN2500monRaw from "../data/quizbook-n2-500mon.json";
import quizbookN3Tuvung20deRaw from "../data/quizbook-n3-tuvung-20de.json";
import quizbookN3ShinkanzenBunpouRaw from "../data/quizbook-n3-shinkanzen-bunpou.json";
import quizbookN3TryBunpouRaw from "../data/quizbook-n3-try-bunpou.json";
import quizbookN3Dongnghia60Raw from "../data/quizbook-n3-dongnghia-60.json";
import quizbookDethiN3202312Raw from "../data/quizbook-dethi-n3-2023-12.json";
import quizbookDethiN3202512Raw from "../data/quizbook-dethi-n3-2025-12.json";
import type { QuizBookDataset, QuizBookQuestion, QuizBookCategory } from "../types/quizBook.ts";
import type { JlptLevel } from "../types/kanji.ts";
import { storageGet, storageSet } from "../platform/storage";

const n3500monDataset = quizbookN3500monRaw as unknown as QuizBookDataset;
const n4500monDataset = quizbookN4500monRaw as unknown as QuizBookDataset;
const n2500monDataset = quizbookN2500monRaw as unknown as QuizBookDataset;
const n3Tuvung20deDataset = quizbookN3Tuvung20deRaw as unknown as QuizBookDataset;
const n3ShinkanzenBunpouDataset = quizbookN3ShinkanzenBunpouRaw as unknown as QuizBookDataset;
const n3TryBunpouDataset = quizbookN3TryBunpouRaw as unknown as QuizBookDataset;
const n3Dongnghia60Dataset = quizbookN3Dongnghia60Raw as unknown as QuizBookDataset;
const dethiN3202312Dataset = quizbookDethiN3202312Raw as unknown as QuizBookDataset;
const dethiN3202512Dataset = quizbookDethiN3202512Raw as unknown as QuizBookDataset;

export const ALL_QUIZBOOK: QuizBookQuestion[] = [
  ...n3500monDataset.questions,
  ...n4500monDataset.questions,
  ...n2500monDataset.questions,
  ...n3Tuvung20deDataset.questions,
  ...n3ShinkanzenBunpouDataset.questions,
  ...n3TryBunpouDataset.questions,
  ...n3Dongnghia60Dataset.questions,
  ...dethiN3202312Dataset.questions,
  ...dethiN3202512Dataset.questions,
];

const QUIZBOOK_BY_ID = new Map(ALL_QUIZBOOK.map((q) => [q.id, q]));
export function findQuizBookById(id: string): QuizBookQuestion | undefined {
  return QUIZBOOK_BY_ID.get(id);
}

export const CATEGORY_LABELS: Record<QuizBookCategory, string> = {
  moji: "Chữ Hán / Cách đọc",
  goi: "Từ vựng",
  bunpou: "Ngữ pháp",
};

// Insertion order here drives the book list order within each group in the
// quiz setup screen (AVAILABLE_BOOKS below reads Object.keys() of this
// record) -- kept easiest-to-hardest (N4-5 -> N3 -> N2) to match the level
// ordering used elsewhere.
export const BOOK_LABELS: Record<string, string> = {
  "500mon-n4": n4500monDataset.meta.bookLabel,
  "500mon": n3500monDataset.meta.bookLabel,
  "500mon-n2": n2500monDataset.meta.bookLabel,
  "shinkanzen-n3-bunpou": n3ShinkanzenBunpouDataset.meta.bookLabel,
  "try-n3-bunpou": n3TryBunpouDataset.meta.bookLabel,
  "n3-tuvung-20de": n3Tuvung20deDataset.meta.bookLabel,
  "dongnghia-60-n3": n3Dongnghia60Dataset.meta.bookLabel,
  "dethi-n3-2023-12": dethiN3202312Dataset.meta.bookLabel,
  "dethi-n3-2025-12": dethiN3202512Dataset.meta.bookLabel,
};

// Each book currently belongs to exactly one level, so the book picker
// doubles as the level picker -- this drives the level dot shown next to a
// book's title instead of a separate, easily-desynced level filter.
export const BOOK_LEVELS: Record<string, JlptLevel> = {
  "500mon-n4": n4500monDataset.meta.level,
  "500mon": n3500monDataset.meta.level,
  "500mon-n2": n2500monDataset.meta.level,
  "shinkanzen-n3-bunpou": n3ShinkanzenBunpouDataset.meta.level,
  "try-n3-bunpou": n3TryBunpouDataset.meta.level,
  "n3-tuvung-20de": n3Tuvung20deDataset.meta.level,
  "dongnghia-60-n3": n3Dongnghia60Dataset.meta.level,
  "dethi-n3-2023-12": dethiN3202312Dataset.meta.level,
  "dethi-n3-2025-12": dethiN3202512Dataset.meta.level,
};

// Top-level grouping shown as a tab/radio switch above the book picker, so
// "Sách" (500-mon style textbooks, continuous question numbering) and "Đề"
// (self-contained practice sets/mock exams, e.g. the 20-round vocab drill --
// and future real JLPT past papers) read as clearly separate pools instead
// of one long flat book list.
export type QuizBookGroup = "sach" | "de";

export const GROUP_LABELS: Record<QuizBookGroup, string> = {
  sach: "Sách",
  de: "Đề",
};

export const BOOK_GROUP: Record<string, QuizBookGroup> = {
  "500mon-n4": "sach",
  "500mon": "sach",
  "500mon-n2": "sach",
  "shinkanzen-n3-bunpou": "sach",
  "try-n3-bunpou": "sach",
  "n3-tuvung-20de": "de",
  "dongnghia-60-n3": "de",
  "dethi-n3-2023-12": "de",
  "dethi-n3-2025-12": "de",
};

const CATEGORY_ORDER: QuizBookCategory[] = ["moji", "goi", "bunpou"];
export const AVAILABLE_CATEGORIES: QuizBookCategory[] = CATEGORY_ORDER.filter((c) =>
  ALL_QUIZBOOK.some((q) => q.category === c),
);

const LEVEL_ORDER: JlptLevel[] = ["N5", "N4", "N3", "N2", "N1"];
export const AVAILABLE_LEVELS: JlptLevel[] = LEVEL_ORDER.filter((level) => ALL_QUIZBOOK.some((q) => q.level === level));

export const AVAILABLE_BOOKS: string[] = Object.keys(BOOK_LABELS).filter((book) =>
  ALL_QUIZBOOK.some((q) => q.book === book),
);

const GROUP_ORDER: QuizBookGroup[] = ["sach", "de"];
export const AVAILABLE_GROUPS: QuizBookGroup[] = GROUP_ORDER.filter((g) =>
  AVAILABLE_BOOKS.some((b) => BOOK_GROUP[b] === g),
);

export function booksInGroup(group: QuizBookGroup): string[] {
  return AVAILABLE_BOOKS.filter((b) => BOOK_GROUP[b] === group);
}

export function pickRandomQuestion(
  categories: QuizBookCategory[],
  books: string[],
  excludeId?: string | null,
): QuizBookQuestion | null {
  let pool = ALL_QUIZBOOK.filter((q) => categories.includes(q.category) && books.includes(q.book));
  if (excludeId && pool.length > 1) pool = pool.filter((q) => q.id !== excludeId);
  if (pool.length === 0) return null;
  return pool[Math.floor(Math.random() * pool.length)];
}

export type QuestionStatus = "not-started" | "done" | "known";

export interface QuestionProgress {
  status: QuestionStatus;
  correct: boolean;
}

// A question that's been answered correctly this many times in a row (since
// its last reset) counts as "known" and drops out of the default quiz pool.
export const KNOWN_STREAK_THRESHOLD = 3;

export function getQuestionProgress(
  id: string,
  answers: Record<string, number | null>,
  correctStreaks: Record<string, number> = {},
): QuestionProgress {
  const answer = answers[id];
  if (answer === undefined || answer === null) return { status: "not-started", correct: false };
  const q = findQuizBookById(id);
  const correct = q ? answer === q.correctIndex : false;
  if ((correctStreaks[id] ?? 0) >= KNOWN_STREAK_THRESHOLD) return { status: "known", correct: true };
  return { status: "done", correct };
}

export interface QuizBookViewerState {
  selectedGroup: QuizBookGroup;
  selectedCategories: QuizBookCategory[];
  selectedBooks: string[];
  currentQuestionId: string | null;
  answers: Record<string, number | null>;
  correctStreaks: Record<string, number>;
  listStatusFilter: "all" | "not-started" | "done" | "known";
  questionCount: number;
  sessionIds: string[] | null;
  sessionIndex: number;
}

const STORAGE_KEY = "quizBookViewer";
export const DEFAULT_QUESTION_COUNT = 20;
// Fixed presets for the "Số câu" select.
export const QUESTION_COUNT_OPTIONS = [5, 10, 20, 30, 50, 100];
// "Tất cả" sentinel -- a plain finite number (not Infinity) so it survives
// chrome.storage.local's JSON-based serialization untouched. buildSession()
// already returns the whole pool once count >= pool.length, so this needs
// no separate "use all" flag.
export const ALL_QUESTIONS_SENTINEL = Number.MAX_SAFE_INTEGER;

export function defaultViewerState(): QuizBookViewerState {
  const defaultGroup = AVAILABLE_GROUPS[0] ?? "sach";
  return {
    selectedGroup: defaultGroup,
    selectedCategories: [...AVAILABLE_CATEGORIES],
    selectedBooks: booksInGroup(defaultGroup),
    currentQuestionId: null,
    answers: {},
    correctStreaks: {},
    listStatusFilter: "all",
    questionCount: DEFAULT_QUESTION_COUNT,
    sessionIds: null,
    sessionIndex: 0,
  };
}

export async function loadViewerState(): Promise<QuizBookViewerState> {
  const saved = await storageGet<Partial<QuizBookViewerState>>(STORAGE_KEY);
  const fallback = defaultViewerState();
  const selectedGroup = saved?.selectedGroup && AVAILABLE_GROUPS.includes(saved.selectedGroup) ? saved.selectedGroup : fallback.selectedGroup;
  const selectedCategories = (saved?.selectedCategories ?? fallback.selectedCategories).filter((c) =>
    AVAILABLE_CATEGORIES.includes(c),
  );
  // Books are scoped to the selected group -- a book from a different group
  // (e.g. saved before this group ever existed, or before switching tabs)
  // never leaks into the current pool.
  const selectedBooksRaw = (saved?.selectedBooks ?? booksInGroup(selectedGroup)).filter(
    (b) => AVAILABLE_BOOKS.includes(b) && BOOK_GROUP[b] === selectedGroup,
  );
  const selectedBooks = selectedBooksRaw.length > 0 ? selectedBooksRaw : booksInGroup(selectedGroup);
  const sessionIds = saved?.sessionIds?.filter((id) => findQuizBookById(id)) ?? null;
  return {
    selectedGroup,
    selectedCategories: selectedCategories.length > 0 ? selectedCategories : fallback.selectedCategories,
    selectedBooks,
    currentQuestionId:
      saved?.currentQuestionId && findQuizBookById(saved.currentQuestionId) ? saved.currentQuestionId : null,
    answers: saved?.answers ?? fallback.answers,
    correctStreaks: saved?.correctStreaks ?? fallback.correctStreaks,
    listStatusFilter: saved?.listStatusFilter ?? fallback.listStatusFilter,
    questionCount: saved?.questionCount && saved.questionCount > 0 ? saved.questionCount : fallback.questionCount,
    sessionIds: sessionIds && sessionIds.length > 0 ? sessionIds : null,
    sessionIndex: saved?.sessionIndex ?? fallback.sessionIndex,
  };
}

export async function saveViewerState(state: QuizBookViewerState): Promise<void> {
  await storageSet(STORAGE_KEY, state);
}

export function resetQuestionAnswer(state: QuizBookViewerState, id: string): QuizBookViewerState {
  const { [id]: _removed, ...rest } = state.answers;
  const { [id]: _removedStreak, ...restStreaks } = state.correctStreaks;
  return { ...state, answers: rest, correctStreaks: restStreaks };
}

export function recordAnswer(state: QuizBookViewerState, id: string, optionIndex: number): QuizBookViewerState {
  const q = findQuizBookById(id);
  const correct = q ? optionIndex === q.correctIndex : false;
  const prevStreak = state.correctStreaks[id] ?? 0;
  return {
    ...state,
    answers: { ...state.answers, [id]: optionIndex },
    correctStreaks: { ...state.correctStreaks, [id]: correct ? prevStreak + 1 : 0 },
  };
}

function shuffled<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function buildSession(pool: QuizBookQuestion[], count: number): string[] {
  const ids = shuffled(pool).map((q) => q.id);
  if (count >= ids.length) return ids;
  return ids.slice(0, Math.max(1, count));
}
