import type { Kanji, JlptLevel } from "../types/kanji.ts";
import type { VocabCard } from "./vocabState.ts";
import type { BunpoGrammarPoint } from "../types/bunpo.ts";
import { getOrderedList as getKanjiOrderedList, loadViewerState as loadKanjiViewerState } from "./kanjiState.ts";
import { getOrderedList as getVocabOrderedList, loadViewerState as loadVocabViewerState } from "./vocabState.ts";
import { getFilteredList as getBunpoFilteredList, loadViewerState as loadBunpoViewerState } from "./bunpoState.ts";
import { loadProgressMap, pickWeighted, bucketFor, type ProgressMap, type ProgressBucket } from "./progressState.ts";
import { formatHanViet } from "../hanVietFormat.ts";
import { storageGet, storageSet, storageRemove } from "../platform/storage";

export const DEFAULT_QUESTION_COUNT = 10;
export const QUESTION_COUNT_OPTIONS = [5, 10, 15, 20, 30, 50, 100];
// "Toàn bộ" sentinel for the question-count select -- a plain finite number
// (not Infinity) so it survives chrome.storage.local's JSON-based
// serialization untouched. pickQuestionTargets() already clamps via
// Math.min(count, pool.length), so passing this just means "use the whole
// filtered pool" with no separate all-questions flag needed.
export const ALL_QUESTIONS_SENTINEL = Number.MAX_SAFE_INTEGER;
const CHOICE_COUNT = 4;

export type QuizContentType = "kanji" | "vocab" | "bunpo";
// "meaning": show the kanji, pick its Hán Việt/nghĩa. "character": the
// reverse -- show Hán Việt/nghĩa as the prompt, pick the matching kanji.
export type KanjiQuizMode = "meaning" | "character";
// "meaning"/"reading": show the word, pick its meaning/reading. The
// "wordFrom*" pair reverses that -- show the meaning or reading as the
// prompt, pick the matching word.
export type VocabQuizMode = "meaning" | "reading" | "wordFromMeaning" | "wordFromReading";
// "meaning": show the grammar pattern, pick its Vietnamese meaning.
// "pattern": the reverse -- show the meaning, pick the matching pattern.
export type BunpoQuizMode = "meaning" | "pattern";

export interface QuizChoice {
  text: string;
  correct: boolean;
}

export interface QuizQuestion {
  id: string;
  kind: QuizContentType;
  // Which quiz direction/mode this specific question drilled (e.g.
  // "meaning"/"character" for Kanji) -- recorded per-question (not just
  // read from the current settings) since a whole session's questions are
  // built once from whatever mode was selected at start time, and mastery
  // tracking needs to know exactly which direction each answer came from.
  mode: string;
  level: JlptLevel;
  promptLabel: string;
  prompt: string;
  choices: QuizChoice[];
}

// Which directions must each independently reach the mastery streak before
// a card of that kind counts as "mastered" -- Kanji/Vocab require every
// direction to be proven, not just whichever one the user happened to
// drill; Bunpo keeps the old single-direction behavior (see
// requiredDirectionsFor below).
export const KANJI_MASTERY_DIRECTIONS: KanjiQuizMode[] = ["meaning", "character"];
export const VOCAB_MASTERY_DIRECTIONS: VocabQuizMode[] = ["meaning", "reading", "wordFromMeaning", "wordFromReading"];

// Shared with the Quiz setup screen's "Dạng câu hỏi" picker so a card's
// detail view (Kanji/Vocab) can show "which direction still needs proving"
// with the exact same wording the user would pick in Quiz to drill it.
export const KANJI_MODE_LABELS: Record<KanjiQuizMode, string> = {
  meaning: "Xem chữ, đoán nghĩa",
  character: "Xem nghĩa, đoán chữ",
};
export const VOCAB_MODE_LABELS: Record<VocabQuizMode, string> = {
  meaning: "Xem từ, đoán nghĩa",
  reading: "Xem từ, đoán cách đọc",
  wordFromMeaning: "Xem nghĩa, đoán từ",
  wordFromReading: "Xem cách đọc, đoán từ",
};

// Arrow-shorthand of the labels above, for the per-direction progress
// badges on a card's detail view (Kanji/Vocab) -- those need to fit 2-4
// side by side without wrapping, where the full "Xem X, đoán Y" phrasing
// doesn't. Full labels stay as-is anywhere else (e.g. Quiz's "Dạng câu hỏi"
// picker), only these badges use the short form; the full text is kept as
// each badge's `title` tooltip.
export const KANJI_MODE_SHORT_LABELS: Record<KanjiQuizMode, string> = {
  meaning: "Chữ→Nghĩa",
  character: "Nghĩa→Chữ",
};
export const VOCAB_MODE_SHORT_LABELS: Record<VocabQuizMode, string> = {
  meaning: "Từ→Nghĩa",
  reading: "Từ→Đọc",
  wordFromMeaning: "Nghĩa→Từ",
  wordFromReading: "Đọc→Từ",
};

// Generalized over just {kind, mode} (not the full QuizQuestion) so it's
// reusable by reviewState.ts's typed-recall/reveal questions too.
export function requiredDirectionsFor(question: { kind: QuizContentType; mode: string }): string[] {
  if (question.kind === "kanji") return KANJI_MASTERY_DIRECTIONS;
  if (question.kind === "vocab") return VOCAB_MASTERY_DIRECTIONS;
  return [question.mode];
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

// "all" or one specific progress bucket to restrict the quiz's question
// *targets* to (e.g. only "flagged" cards to drill exactly what's marked
// cần ôn lại) -- distractor choices still draw from the full level/source
// pool regardless, so a narrow bucket like "flagged" doesn't also starve
// the multiple-choice options down to just 1-2 candidates.
export type QuizBucketFilter = ProgressBucket | "all";

function filterByBucket<T extends { id: string }>(pool: T[], progressMap: ProgressMap, bucket: QuizBucketFilter): T[] {
  if (bucket === "all") return pool;
  return pool.filter((item) => bucketFor(progressMap[item.id]) === bucket);
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
  mode: string,
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
  return { id: target.id, kind, mode, level: target.level, promptLabel, prompt: promptOf(target), choices };
}

export async function buildKanjiQuiz(
  mode: KanjiQuizMode,
  questionCount: number,
  bucket: QuizBucketFilter = "all",
): Promise<QuizQuestion[]> {
  const state = await loadKanjiViewerState();
  const pool = getKanjiOrderedList({ ...state, randomOrder: false });
  if (pool.length === 0) return [];
  const progressMap = await loadProgressMap();
  const scoped = filterByBucket(pool, progressMap, bucket);
  if (scoped.length === 0) return [];
  const targets = pickQuestionTargets(scoped, progressMap, questionCount);
  return targets
    .map((k) =>
      mode === "character"
        ? buildQuestion(pool, k, "kanji", mode, (item) => item.character, "Đây là chữ Hán nào?", kanjiAnswerText)
        : buildQuestion(pool, k, "kanji", mode, kanjiAnswerText, "Chữ Hán này nghĩa là gì?", (item) => item.character),
    )
    .filter((q): q is QuizQuestion => q !== null);
}

export async function buildVocabQuiz(
  mode: VocabQuizMode,
  questionCount: number,
  bucket: QuizBucketFilter = "all",
): Promise<QuizQuestion[]> {
  const state = await loadVocabViewerState();
  let pool = getVocabOrderedList({ ...state, randomOrder: false });
  if (mode === "reading" || mode === "wordFromReading") pool = pool.filter((v) => v.reading && v.reading !== v.word);
  if (pool.length === 0) return [];
  const progressMap = await loadProgressMap();
  const scoped = filterByBucket(pool, progressMap, bucket);
  if (scoped.length === 0) return [];
  const targets = pickQuestionTargets(scoped, progressMap, questionCount);

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
    .map((v) => buildQuestion(pool, v, "vocab", mode, answerOf, promptLabel, promptOf))
    .filter((q): q is QuizQuestion => q !== null);
}

export async function buildBunpoQuiz(
  mode: BunpoQuizMode,
  questionCount: number,
  bucket: QuizBucketFilter = "all",
): Promise<QuizQuestion[]> {
  const state = await loadBunpoViewerState();
  const pool = getBunpoFilteredList(state);
  if (pool.length === 0) return [];
  const progressMap = await loadProgressMap();
  const scoped = filterByBucket(pool, progressMap, bucket);
  if (scoped.length === 0) return [];
  const targets = pickQuestionTargets(scoped, progressMap, questionCount);

  const patternOf = (g: BunpoGrammarPoint) => g.pattern;
  const meaningOf = (g: BunpoGrammarPoint) => g.meaningVi;

  return targets
    .map((g) =>
      mode === "pattern"
        ? buildQuestion(pool, g, "bunpo", mode, patternOf, "Nghĩa này ứng với mẫu ngữ pháp nào?", meaningOf)
        : buildQuestion(pool, g, "bunpo", mode, meaningOf, "Mẫu ngữ pháp này nghĩa là gì?", patternOf),
    )
    .filter((q): q is QuizQuestion => q !== null);
}

export interface QuizSettings {
  contentType: QuizContentType;
  kanjiMode: KanjiQuizMode;
  vocabMode: VocabQuizMode;
  bunpoMode: BunpoQuizMode;
  questionCount: number;
  progressBucket: QuizBucketFilter;
  // Opt-in: auto-advance to the next question a fixed delay after answering,
  // instead of requiring a tap every time -- mainly for long (e.g. 100-câu)
  // sessions where clicking through each one gets tedious. Off by default
  // since it also shortens how long a wrong answer's correct-answer callout
  // stays on screen.
  autoAdvance: boolean;
}

const QUIZ_SETTINGS_KEY = "quizSettings";

// How long to show the answered state (correct/wrong highlight + detail)
// before auto-advancing, when autoAdvance is on.
export const AUTO_ADVANCE_DELAY_MS = 1000;

export async function loadQuizSettings(): Promise<QuizSettings> {
  const saved = await storageGet<Partial<QuizSettings>>(QUIZ_SETTINGS_KEY);
  return {
    contentType: saved?.contentType ?? "kanji",
    kanjiMode: saved?.kanjiMode ?? "meaning",
    vocabMode: saved?.vocabMode ?? "meaning",
    bunpoMode: saved?.bunpoMode ?? "meaning",
    questionCount: saved?.questionCount ?? DEFAULT_QUESTION_COUNT,
    progressBucket: saved?.progressBucket ?? "all",
    autoAdvance: saved?.autoAdvance ?? false,
  };
}

export async function saveQuizSettings(settings: QuizSettings): Promise<void> {
  await storageSet(QUIZ_SETTINGS_KEY, settings);
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
  return (await storageGet<QuizSession>(QUIZ_SESSION_KEY)) ?? null;
}

export async function saveQuizSession(session: QuizSession): Promise<void> {
  await storageSet(QUIZ_SESSION_KEY, session);
}

export async function clearQuizSession(): Promise<void> {
  await storageRemove(QUIZ_SESSION_KEY);
}

export function isSessionUnfinished(session: QuizSession): boolean {
  return session.answers.some((a) => a === null);
}
