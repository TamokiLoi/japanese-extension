// "Nghe chép chính tả" (listening dictation) -- reuses the exact same
// ListeningQuestion pool as listeningState.ts (one audioUrl per item, no
// per-sentence timestamps), so the dictation *unit* is still one whole
// item's audio, not an individually-playable sentence. kadai/point items are
// usually full multi-turn dialogues -- genuinely long to dictate -- while
// hatsugen/sokuji items are usually short response items (see
// ListeningTaskType). defaultViewerState() below defaults the task-type
// filter to sokuji-only so a first-time user lands on short, dictation-
// sized content; the same filter UI as Luyện nghe lets them opt into the
// longer dialogue types.
import { ALL_LISTENING, AVAILABLE_BOOKS, AVAILABLE_TASK_TYPES } from "./listeningState.ts";
import type { ListeningQuestion, ListeningTaskType } from "../types/listening.ts";
import { storageGet, storageSet } from "../platform/storage";

// Dictation is dual-written into progressState.ts's shared ProgressMap too
// (see DictationScreen.tsx's check()) so it shows up in Home/Stats like
// every other content type. That map is keyed purely by id -- since
// Dictation grades the exact same ListeningQuestion ids Listening's own
// "answer" direction already writes to, prefixing keeps the two tracks from
// colliding in one shared ItemProgress entry (which would let a bad
// dictation attempt reset an already-mastered multiple-choice streak, or
// vice versa).
export function dictationProgressId(questionId: string): string {
  return `dict:${questionId}`;
}

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

// The text a dictation item is graded against -- everything actually spoken
// in the audio. For kadai/point, options[] are printed on paper, so they are
// excluded. 概要理解/発話表現/即時応答 have no text choices printed in the
// booklet; their question/response choices are spoken in the audio and belong
// in the dictation target too.
export function referenceTextFor(q: ListeningQuestion): string {
  const spoken = [q.scenario, ...q.turns.map((t) => t.text)];
  // Kaiwa is a synthetic meaning quiz: its Vietnamese options are not read
  // in the audio, so keep them out of the dictation target even though the
  // item uses `gaiyou` for the generic listening bucket.
  if (q.book !== "kaiwa-100cau" && ["gaiyou", "hatsugen", "sokuji"].includes(q.taskType) && !q.optionsImage) {
    // In 問題5 the question field is often the same short utterance already
    // stored in turns[0]; do not count it twice in the dictation target.
    if (q.question && q.question !== q.scenario && !q.turns.some((t) => t.text === q.question)) spoken.push(q.question);
    spoken.push(...q.options);
  }
  return spoken.filter((s) => s.length > 0).join("\n");
}

export interface CharDiff {
  char: string;
  correct: boolean;
}

// Levenshtein alignment (edit distance + backtrace), not a naive positional
// compare -- a positional compare marks every character after one missing/
// extra character as wrong, even when the rest of a long line was typed
// correctly, which is both misleading and discouraging. This aligns typed
// against reference properly so only the actually inserted/deleted/
// substituted characters come back wrong.
//
// Returns one entry per character of `reference` (what's rendered), so an
// extra character the user typed that doesn't match anything in reference
// (a pure insertion) has no reference character to attach to and is simply
// not represented -- it still reduces the match count relative to
// `reference`'s length, so it still costs accuracy, just isn't highlighted
// inline.
export function diffChars(typed: string, reference: string): CharDiff[] {
  const t = Array.from(typed.trim());
  const r = Array.from(reference);
  const n = t.length;
  const m = r.length;

  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = 0; i <= n; i++) dp[i][0] = i;
  for (let j = 0; j <= m; j++) dp[0][j] = j;
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      dp[i][j] = t[i - 1] === r[j - 1] ? dp[i - 1][j - 1] : 1 + Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1]);
    }
  }

  const result: CharDiff[] = [];
  let i = n;
  let j = m;
  while (j > 0) {
    if (i > 0 && t[i - 1] === r[j - 1] && dp[i][j] === dp[i - 1][j - 1]) {
      result.push({ char: r[j - 1], correct: true }); // match
      i--;
      j--;
    } else if (i > 0 && dp[i][j] === dp[i - 1][j - 1] + 1) {
      result.push({ char: r[j - 1], correct: false }); // substitution
      i--;
      j--;
    } else if (dp[i][j] === dp[i][j - 1] + 1) {
      result.push({ char: r[j - 1], correct: false }); // deletion -- typed skipped this reference char
      j--;
    } else {
      i--; // insertion -- extra typed char, no reference char to attach to
    }
  }
  return result.reverse();
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

export async function clearDictationAttempt(id: string): Promise<void> {
  const map = await loadDictationProgress();
  delete map[id];
  await storageSet(PROGRESS_STORAGE_KEY, map);
}
