// "Nghe chép chính tả" (listening dictation) -- reuses the exact same
// ListeningQuestion pool as listeningState.ts (one audioUrl per item, no
// per-sentence timestamps), so the dictation *unit* is still one whole
// item's audio, not an individually-playable sentence. kadai/point/gaiyou
// items are full multi-turn dialogues -- genuinely long to dictate -- while
// sokuji items are exactly one short utterance by design (see
// ListeningTaskType). defaultViewerState() below defaults the task-type
// filter to sokuji-only so a first-time user lands on short, dictation-
// sized content; the same filter UI as Luyện nghe lets them opt into the
// longer dialogue types.
import { ALL_LISTENING, AVAILABLE_BOOKS, AVAILABLE_TASK_TYPES } from "./listeningState.ts";
import type { ListeningQuestion, ListeningTaskType } from "../types/listening.ts";
import { storageGet, storageSet } from "../platform/storage";

export interface DictationViewerState {
  selectedBooks: string[];
  selectedTaskTypes: ListeningTaskType[];
  autoAdvance: boolean;
}

const VIEWER_STORAGE_KEY = "dictationViewer";

export function defaultViewerState(): DictationViewerState {
  const sokujiAvailable = AVAILABLE_TASK_TYPES.includes("sokuji");
  return {
    selectedBooks: [...AVAILABLE_BOOKS],
    selectedTaskTypes: sokujiAvailable ? ["sokuji"] : [...AVAILABLE_TASK_TYPES],
    autoAdvance: true,
  };
}

export async function loadViewerState(): Promise<DictationViewerState> {
  const saved = await storageGet<Partial<DictationViewerState>>(VIEWER_STORAGE_KEY);
  const fallback = defaultViewerState();
  const selectedBooks = (saved?.selectedBooks ?? fallback.selectedBooks).filter((b) => AVAILABLE_BOOKS.includes(b));
  const selectedTaskTypes = (saved?.selectedTaskTypes ?? fallback.selectedTaskTypes).filter((t) =>
    AVAILABLE_TASK_TYPES.includes(t),
  );
  return {
    selectedBooks: selectedBooks.length > 0 ? selectedBooks : fallback.selectedBooks,
    selectedTaskTypes: selectedTaskTypes.length > 0 ? selectedTaskTypes : fallback.selectedTaskTypes,
    autoAdvance: saved?.autoAdvance ?? fallback.autoAdvance,
  };
}

export async function saveViewerState(state: DictationViewerState): Promise<void> {
  await storageSet(VIEWER_STORAGE_KEY, state);
}

export function getFilteredList(state: DictationViewerState): ListeningQuestion[] {
  return ALL_LISTENING.filter((q) => state.selectedBooks.includes(q.book) && state.selectedTaskTypes.includes(q.taskType));
}

// The text a dictation item is graded against -- everything actually
// spoken in the audio before the question/options (which for kadai/point/
// gaiyou items are read out separately, after the dialogue).
export function referenceTextFor(q: ListeningQuestion): string {
  const lines = [q.scenario, ...q.turns.map((t) => t.text)].filter((s) => s.length > 0);
  return lines.join("\n");
}

export interface CharDiff {
  char: string;
  correct: boolean;
}

// Positional char-by-char compare (not a Levenshtein alignment) -- simple
// on purpose for v1: one missing/extra character shifts every character
// after it to "wrong", which is blunt but immediately legible, matching
// how the reference dictation tool this was modeled on grades.
export function diffChars(typed: string, reference: string): CharDiff[] {
  const t = Array.from(typed.trim());
  const r = Array.from(reference);
  return r.map((char, i) => ({ char, correct: t[i] === char }));
}

export function accuracyPercent(diff: CharDiff[]): number {
  if (diff.length === 0) return 0;
  const correct = diff.filter((d) => d.correct).length;
  return Math.round((correct / diff.length) * 100);
}

export interface DictationItemProgress {
  bestAccuracy: number;
  attempts: number;
}

export type DictationProgressMap = Record<string, DictationItemProgress>;

const PROGRESS_STORAGE_KEY = "dictationProgress";

export async function loadDictationProgress(): Promise<DictationProgressMap> {
  return (await storageGet<DictationProgressMap>(PROGRESS_STORAGE_KEY)) ?? {};
}

export async function recordDictationAttempt(id: string, accuracy: number): Promise<DictationItemProgress> {
  const map = await loadDictationProgress();
  const cur = map[id] ?? { bestAccuracy: 0, attempts: 0 };
  const next: DictationItemProgress = { bestAccuracy: Math.max(cur.bestAccuracy, accuracy), attempts: cur.attempts + 1 };
  map[id] = next;
  await storageSet(PROGRESS_STORAGE_KEY, map);
  return next;
}
