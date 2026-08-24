import quizbookN3500monRaw from "../data/quizbook-n3-500mon.json";
import type { QuizBookDataset, QuizBookQuestion, QuizBookCategory } from "../types/quizBook.ts";
import type { JlptLevel } from "../types/kanji.ts";

const n3500monDataset = quizbookN3500monRaw as unknown as QuizBookDataset;

export const ALL_QUIZBOOK: QuizBookQuestion[] = [...n3500monDataset.questions];

const QUIZBOOK_BY_ID = new Map(ALL_QUIZBOOK.map((q) => [q.id, q]));
export function findQuizBookById(id: string): QuizBookQuestion | undefined {
  return QUIZBOOK_BY_ID.get(id);
}

export const CATEGORY_LABELS: Record<QuizBookCategory, string> = {
  moji: "Chữ Hán / Cách đọc",
  goi: "Từ vựng",
  bunpou: "Ngữ pháp",
};

export const BOOK_LABELS: Record<string, string> = {
  "500mon": n3500monDataset.meta.bookLabel,
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
  levels: JlptLevel[],
  categories: QuizBookCategory[],
  books: string[],
  excludeId?: string | null,
): QuizBookQuestion | null {
  let pool = ALL_QUIZBOOK.filter(
    (q) => levels.includes(q.level) && categories.includes(q.category) && books.includes(q.book),
  );
  if (excludeId && pool.length > 1) pool = pool.filter((q) => q.id !== excludeId);
  if (pool.length === 0) return null;
  return pool[Math.floor(Math.random() * pool.length)];
}

export type QuestionStatus = "not-started" | "done";

export interface QuestionProgress {
  status: QuestionStatus;
  correct: boolean;
}

export function getQuestionProgress(id: string, answers: Record<string, number | null>): QuestionProgress {
  const answer = answers[id];
  if (answer === undefined || answer === null) return { status: "not-started", correct: false };
  const q = findQuizBookById(id);
  return { status: "done", correct: q ? answer === q.correctIndex : false };
}

export interface QuizBookViewerState {
  selectedLevels: JlptLevel[];
  selectedCategories: QuizBookCategory[];
  selectedBooks: string[];
  currentQuestionId: string | null;
  answers: Record<string, number | null>;
  listStatusFilter: "all" | "not-started" | "done";
}

const STORAGE_KEY = "quizBookViewer";

export function defaultViewerState(): QuizBookViewerState {
  return {
    selectedLevels: [...AVAILABLE_LEVELS],
    selectedCategories: [...AVAILABLE_CATEGORIES],
    selectedBooks: [...AVAILABLE_BOOKS],
    currentQuestionId: null,
    answers: {},
    listStatusFilter: "all",
  };
}

export async function loadViewerState(): Promise<QuizBookViewerState> {
  const stored = await chrome.storage.local.get(STORAGE_KEY);
  const saved = stored[STORAGE_KEY] as Partial<QuizBookViewerState> | undefined;
  const fallback = defaultViewerState();
  const selectedLevels = (saved?.selectedLevels ?? fallback.selectedLevels).filter((l) => AVAILABLE_LEVELS.includes(l));
  const selectedCategories = (saved?.selectedCategories ?? fallback.selectedCategories).filter((c) =>
    AVAILABLE_CATEGORIES.includes(c),
  );
  const selectedBooks = (saved?.selectedBooks ?? fallback.selectedBooks).filter((b) => AVAILABLE_BOOKS.includes(b));
  return {
    selectedLevels: selectedLevels.length > 0 ? selectedLevels : fallback.selectedLevels,
    selectedCategories: selectedCategories.length > 0 ? selectedCategories : fallback.selectedCategories,
    selectedBooks: selectedBooks.length > 0 ? selectedBooks : fallback.selectedBooks,
    currentQuestionId:
      saved?.currentQuestionId && findQuizBookById(saved.currentQuestionId) ? saved.currentQuestionId : null,
    answers: saved?.answers ?? fallback.answers,
    listStatusFilter: saved?.listStatusFilter ?? fallback.listStatusFilter,
  };
}

export async function saveViewerState(state: QuizBookViewerState): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: state });
}

export function resetQuestionAnswer(state: QuizBookViewerState, id: string): QuizBookViewerState {
  const { [id]: _removed, ...rest } = state.answers;
  return { ...state, answers: rest };
}
