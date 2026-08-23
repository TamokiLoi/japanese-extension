import type { Kanji, JlptLevel } from "../types/kanji.ts";
import type { VocabCard } from "./vocabState.ts";
import { getOrderedList as getKanjiOrderedList, loadViewerState as loadKanjiViewerState } from "./kanjiState.ts";
import { getOrderedList as getVocabOrderedList, loadViewerState as loadVocabViewerState } from "./vocabState.ts";
import { loadProgressMap, pickWeighted, type ProgressMap } from "./progressState.ts";
import { formatHanViet } from "../hanVietFormat.ts";

export const DEFAULT_QUESTION_COUNT = 10;
export const QUESTION_COUNT_OPTIONS = [5, 10, 15, 20, 30];
const CHOICE_COUNT = 4;

export type QuizContentType = "kanji" | "vocab";
// "meaning": show the kanji, pick its Hán Việt/nghĩa. "character": the
// reverse -- show Hán Việt/nghĩa as the prompt, pick the matching kanji.
export type KanjiQuizMode = "meaning" | "character";
// "meaning"/"reading": show the word, pick its meaning/reading. The
// "wordFrom*" pair reverses that -- show the meaning or reading as the
// prompt, pick the matching word.
export type VocabQuizMode = "meaning" | "reading" | "wordFromMeaning" | "wordFromReading";

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

// Kanji quiz answers show both readings, e.g. "ĐIỀN - ruộng", so a correct
// pick can be recognized by Hán Việt reading alone even without the meaning.
function kanjiAnswerText(k: Kanji): string {
  return `${formatHanViet(k.hanViet, "?")} - ${kanjiMeaning(k)}`;
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

export async function buildKanjiQuiz(mode: KanjiQuizMode, questionCount: number): Promise<QuizQuestion[]> {
  const state = await loadKanjiViewerState();
  const pool = getKanjiOrderedList({ ...state, randomOrder: false });
  if (pool.length === 0) return [];
  const progressMap = await loadProgressMap();
  const targets = pickQuestionTargets(pool, progressMap, questionCount);
  return targets
    .map((k) =>
      mode === "character"
        ? buildQuestion(pool, k, "kanji", (item) => item.character, "Đây là chữ Hán nào?", kanjiAnswerText)
        : buildQuestion(pool, k, "kanji", kanjiAnswerText, "Chữ Hán này nghĩa là gì?", (item) => item.character),
    )
    .filter((q): q is QuizQuestion => q !== null);
}

export async function buildVocabQuiz(mode: VocabQuizMode, questionCount: number): Promise<QuizQuestion[]> {
  const state = await loadVocabViewerState();
  let pool = getVocabOrderedList({ ...state, randomOrder: false });
  if (mode === "reading" || mode === "wordFromReading") pool = pool.filter((v) => v.reading && v.reading !== v.word);
  if (pool.length === 0) return [];
  const progressMap = await loadProgressMap();
  const targets = pickQuestionTargets(pool, progressMap, questionCount);

  const meaningOf = (v: VocabCard) => v.meaningVi || "?";
  const readingOf = (v: VocabCard) => v.reading as string;
  const wordOf = (v: VocabCard) => v.word;

  const config: Record<VocabQuizMode, { answerOf: (v: VocabCard) => string; promptLabel: string; promptOf: (v: VocabCard) => string }> = {
    meaning: { answerOf: meaningOf, promptLabel: "Từ này nghĩa là gì?", promptOf: wordOf },
    reading: { answerOf: readingOf, promptLabel: "Từ này đọc là gì?", promptOf: wordOf },
    wordFromMeaning: { answerOf: wordOf, promptLabel: "Từ nào có nghĩa này?", promptOf: meaningOf },
    wordFromReading: { answerOf: wordOf, promptLabel: "Từ nào đọc như thế này?", promptOf: readingOf },
  };
  const { answerOf, promptLabel, promptOf } = config[mode];

  return targets
    .map((v) => buildQuestion(pool, v, "vocab", answerOf, promptLabel, promptOf))
    .filter((q): q is QuizQuestion => q !== null);
}

export interface QuizSettings {
  contentType: QuizContentType;
  kanjiMode: KanjiQuizMode;
  vocabMode: VocabQuizMode;
  questionCount: number;
}

const QUIZ_SETTINGS_KEY = "quizSettings";

export async function loadQuizSettings(): Promise<QuizSettings> {
  const stored = await chrome.storage.local.get(QUIZ_SETTINGS_KEY);
  const saved = stored[QUIZ_SETTINGS_KEY] as Partial<QuizSettings> | undefined;
  return {
    contentType: saved?.contentType ?? "kanji",
    kanjiMode: saved?.kanjiMode ?? "meaning",
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
