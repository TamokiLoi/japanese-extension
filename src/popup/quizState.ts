import type { Kanji, JlptLevel } from "../types/kanji.ts";
import type { VocabCard } from "./vocabState.ts";
import { getOrderedList as getKanjiOrderedList, loadViewerState as loadKanjiViewerState } from "./kanjiState.ts";
import { getOrderedList as getVocabOrderedList, loadViewerState as loadVocabViewerState } from "./vocabState.ts";
import { loadProgressMap, pickWeighted, type ProgressMap } from "./progressState.ts";

export const DEFAULT_QUESTION_COUNT = 10;
export const QUESTION_COUNT_OPTIONS = [5, 10, 15, 20, 30];
const CHOICE_COUNT = 4;

export type QuizContentType = "kanji" | "vocab";
export type VocabQuizMode = "meaning" | "reading";

export interface QuizChoice {
  text: string;
  correct: boolean;
}

export interface QuizQuestion {
  id: string;
  kind: QuizContentType;
  level: JlptLevel;
  promptLabel: string;
  prompt: string;
  choices: QuizChoice[];
}

function kanjiMeaning(k: Kanji): string {
  return k.meanings.vi.join(", ") || k.meanings.viDraft?.join(", ") || k.meanings.en.join(", ") || "?";
}

function shuffle<T>(items: T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// Random wrong-answer text from the same pool, excluding the target itself
// and any candidate whose answer text happens to match the correct one
// (two different kanji can share an English gloss, for instance).
function sampleDistractorTexts<T>(pool: T[], target: T, answerOf: (item: T) => string, count: number): string[] {
  const correctText = answerOf(target);
  const seen = new Set<string>([correctText]);
  const result: string[] = [];
  for (const item of shuffle(pool)) {
    if (item === target) continue;
    const text = answerOf(item);
    if (seen.has(text)) continue;
    seen.add(text);
    result.push(text);
    if (result.length >= count) break;
  }
  return result;
}

// Picks `count` distinct question targets from `pool`, weighted so cards
// that aren't mastered yet (or are manually flagged as difficult) come up
// more often -- see progressState.ts's weightFor.
function pickQuestionTargets<T extends { id: string }>(pool: T[], progressMap: ProgressMap, count: number): T[] {
  const targets: T[] = [];
  const used = new Set<string>();
  const n = Math.min(count, pool.length);
  for (let i = 0; i < n; i++) {
    const candidates = pool.filter((item) => !used.has(item.id));
    if (candidates.length === 0) break;
    const picked = pickWeighted(candidates, progressMap);
    used.add(picked.id);
    targets.push(picked);
  }
  return targets;
}

function buildQuestion<T extends { id: string; level: JlptLevel }>(
  pool: T[],
  target: T,
  kind: QuizContentType,
  answerOf: (item: T) => string,
  promptLabel: string,
  promptOf: (item: T) => string,
): QuizQuestion | null {
  const correctText = answerOf(target);
  const distractorTexts = sampleDistractorTexts(pool, target, answerOf, CHOICE_COUNT - 1);
  if (distractorTexts.length === 0) return null; // pool too small/uniform to quiz meaningfully
  const choices = shuffle([
    { text: correctText, correct: true },
    ...distractorTexts.map((text) => ({ text, correct: false })),
  ]);
  return { id: target.id, kind, level: target.level, promptLabel, prompt: promptOf(target), choices };
}

export async function buildKanjiQuiz(questionCount: number): Promise<QuizQuestion[]> {
  const state = await loadKanjiViewerState();
  const pool = getKanjiOrderedList({ ...state, randomOrder: false });
  if (pool.length === 0) return [];
  const progressMap = await loadProgressMap();
  const targets = pickQuestionTargets(pool, progressMap, questionCount);
  return targets
    .map((k) => buildQuestion(pool, k, "kanji", kanjiMeaning, "Chữ Hán này nghĩa là gì?", (item) => item.character))
    .filter((q): q is QuizQuestion => q !== null);
}

export async function buildVocabQuiz(mode: VocabQuizMode, questionCount: number): Promise<QuizQuestion[]> {
  const state = await loadVocabViewerState();
  let pool = getVocabOrderedList({ ...state, randomOrder: false });
  if (mode === "reading") pool = pool.filter((v) => v.reading && v.reading !== v.word);
  if (pool.length === 0) return [];
  const progressMap = await loadProgressMap();
  const targets = pickQuestionTargets(pool, progressMap, questionCount);
  const answerOf = (v: VocabCard) => (mode === "meaning" ? v.meaningVi || "?" : (v.reading as string));
  const promptLabel = mode === "meaning" ? "Từ này nghĩa là gì?" : "Từ này đọc là gì?";
  return targets
    .map((v) => buildQuestion(pool, v, "vocab", answerOf, promptLabel, (item) => item.word))
    .filter((q): q is QuizQuestion => q !== null);
}

export interface QuizSettings {
  contentType: QuizContentType;
  vocabMode: VocabQuizMode;
  questionCount: number;
}

const QUIZ_SETTINGS_KEY = "quizSettings";

export async function loadQuizSettings(): Promise<QuizSettings> {
  const stored = await chrome.storage.local.get(QUIZ_SETTINGS_KEY);
  const saved = stored[QUIZ_SETTINGS_KEY] as Partial<QuizSettings> | undefined;
  return {
    contentType: saved?.contentType ?? "kanji",
    vocabMode: saved?.vocabMode ?? "meaning",
    questionCount: saved?.questionCount ?? DEFAULT_QUESTION_COUNT,
  };
}

export async function saveQuizSettings(settings: QuizSettings): Promise<void> {
  await chrome.storage.local.set({ [QUIZ_SETTINGS_KEY]: settings });
}

// A quiz in progress, persisted so it survives a popup/tab reload instead
// of silently vanishing -- see screens/quiz.ts's resume prompt. Cleared
// once the user reaches the result screen or explicitly starts over.
export interface QuizSession {
  questions: QuizQuestion[];
  // Index of the choice the user picked for that question, or null if not
  // answered yet. Answering again on revisit is not allowed -- this array
  // both drives the "already answered" UI state and prevents double
  // counting toward mastery in progressState.
  answers: (number | null)[];
  currentIndex: number;
}

const QUIZ_SESSION_KEY = "quizSession";

export async function loadQuizSession(): Promise<QuizSession | null> {
  const stored = await chrome.storage.local.get(QUIZ_SESSION_KEY);
  return (stored[QUIZ_SESSION_KEY] as QuizSession | undefined) ?? null;
}

export async function saveQuizSession(session: QuizSession): Promise<void> {
  await chrome.storage.local.set({ [QUIZ_SESSION_KEY]: session });
}

export async function clearQuizSession(): Promise<void> {
  await chrome.storage.local.remove(QUIZ_SESSION_KEY);
}

export function isSessionUnfinished(session: QuizSession): boolean {
  return session.answers.some((a) => a === null);
}
