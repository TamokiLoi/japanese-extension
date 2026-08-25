import quizbookN3500monRaw from "../data/quizbook-n3-500mon.json";
import quizbookN4500monRaw from "../data/quizbook-n4-500mon.json";
import quizbookN2500monRaw from "../data/quizbook-n2-500mon.json";
import type { QuizBookDataset, QuizBookQuestion, QuizBookCategory } from "../types/quizBook.ts";
import type { JlptLevel } from "../types/kanji.ts";

const n3500monDataset = quizbookN3500monRaw as unknown as QuizBookDataset;
const n4500monDataset = quizbookN4500monRaw as unknown as QuizBookDataset;
const n2500monDataset = quizbookN2500monRaw as unknown as QuizBookDataset;

export const ALL_QUIZBOOK: QuizBookQuestion[] = [
  ...n3500monDataset.questions,
  ...n4500monDataset.questions,
  ...n2500monDataset.questions,
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

// Insertion order here drives the "Sách" list order in the quiz setup
// screen (AVAILABLE_BOOKS below reads Object.keys() of this record) --
// kept easiest-to-hardest (N4-5 -> N3 -> N2) to match the level ordering
// used elsewhere.
export const BOOK_LABELS: Record<string, string> = {
  "500mon-n4": n4500monDataset.meta.bookLabel,
  "500mon": n3500monDataset.meta.bookLabel,
  "500mon-n2": n2500monDataset.meta.bookLabel,
};

// Each book currently belongs to exactly one level, so the book picker
// doubles as the level picker -- this drives the level dot shown next to a
// book's title instead of a separate, easily-desynced level filter.
export const BOOK_LEVELS: Record<string, JlptLevel> = {
  "500mon-n4": n4500monDataset.meta.level,
  "500mon": n3500monDataset.meta.level,
  "500mon-n2": n2500monDataset.meta.level,
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
  return {
    selectedCategories: [...AVAILABLE_CATEGORIES],
    selectedBooks: [...AVAILABLE_BOOKS],
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
  const stored = await chrome.storage.local.get(STORAGE_KEY);
  const saved = stored[STORAGE_KEY] as Partial<QuizBookViewerState> | undefined;
  const fallback = defaultViewerState();
  const selectedCategories = (saved?.selectedCategories ?? fallback.selectedCategories).filter((c) =>
    AVAILABLE_CATEGORIES.includes(c),
  );
  const selectedBooksRaw = (saved?.selectedBooks ?? fallback.selectedBooks).filter((b) => AVAILABLE_BOOKS.includes(b));
  const selectedBooks = selectedBooksRaw.length > 0 ? selectedBooksRaw : fallback.selectedBooks;
  const sessionIds = saved?.sessionIds?.filter((id) => findQuizBookById(id)) ?? null;
  return {
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
  await chrome.storage.local.set({ [STORAGE_KEY]: state });
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
