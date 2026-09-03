import { storageGet, storageSet } from "../platform/storage";

// Per-card mastery/flag tracking, shared between Kanji cards and Vocab
// cards (both already have a globally-unique `id` string, so one flat map
// works for both without a namespace collision). Inspired by ai-cert-quiz's
// simpler "SAVED { why: manual | wrong }" approach, but adds an automatic
// streak-based "mastered" state on top of the manual flag -- no full
// SRS/interval scheduling, just enough signal to drive quiz weighting and
// a "chỉ ôn từ khó" filter.
export interface ItemProgress {
  correctStreak: number;
  correctCount: number;
  wrongCount: number;
  // Consecutive wrong answers since the last correct one (any direction) --
  // separate from the lifetime wrongCount so a card that's mostly right with
  // the odd slip doesn't get auto-flagged just for having failed 3 times
  // total months apart. Drives the auto-flag in recordAnswer below.
  wrongStreak: number;
  mastered: boolean;
  flagged: boolean;
  lastSeenAt: number;
  // Correct-in-a-row count per quiz direction/mode (e.g. "meaning",
  // "character" for Kanji) -- mastered only flips to true once every
  // direction the caller requires has independently reached the streak
  // threshold, so drilling only one direction 3x isn't enough on its own
  // for content types with more than one quiz direction.
  directionStreaks: Record<string, number>;
  // Epoch ms of the next scheduled review, set once a card first becomes
  // mastered (and refreshed each time a due review is answered correctly
  // again) -- a fixed-interval reminder, not a full Anki-style growing
  // interval scheduler.
  dueAt?: number;
}

export type ProgressMap = Record<string, ItemProgress>;

const STORAGE_KEY = "itemProgress";

// Consecutive correct answers (per direction) needed to mark a card "mastered".
export const MASTERY_STREAK_THRESHOLD = 3;

// Consecutive wrong answers before a card is auto-flagged "cần ôn lại" --
// same idea as MASTERY_STREAK_THRESHOLD but in the other direction, so a
// card the user keeps missing surfaces there without needing a manual flag.
// The cycle closes itself: recordAnswer clears the flag again once every
// required direction re-crosses MASTERY_STREAK_THRESHOLD, so a manual
// unflag is only needed to dismiss one early, not as the normal exit.
export const AUTO_FLAG_WRONG_STREAK = 3;

// Fixed interval before a mastered card is surfaced for review again.
export const REVIEW_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;

export function defaultProgress(): ItemProgress {
  return {
    correctStreak: 0,
    correctCount: 0,
    wrongCount: 0,
    wrongStreak: 0,
    mastered: false,
    flagged: false,
    lastSeenAt: 0,
    directionStreaks: {},
  };
}

export async function loadProgressMap(): Promise<ProgressMap> {
  return (await storageGet<ProgressMap>(STORAGE_KEY)) ?? {};
}

async function saveProgressMap(map: ProgressMap): Promise<void> {
  await storageSet(STORAGE_KEY, map);
}

export async function getProgress(id: string): Promise<ItemProgress> {
  const map = await loadProgressMap();
  return map[id] ?? defaultProgress();
}

// Bulk "Đặt lại tất cả" for a filtered set (e.g. Listening's current
// book/dạng câu filter) -- one storage write instead of one per id.
export async function clearProgress(ids: string[]): Promise<void> {
  const map = await loadProgressMap();
  for (const id of ids) delete map[id];
  await saveProgressMap(map);
}

// Count of a given id list that are currently mastered -- used for the
// menu screen's "X/Y đã thuộc" summary under Kanji/Từ vựng.
export async function countMastered(ids: string[]): Promise<number> {
  const map = await loadProgressMap();
  return ids.filter((id) => map[id]?.mastered).length;
}

// Called once per Quiz answer. `direction` is the quiz mode just drilled
// (e.g. "meaning"/"character" for Kanji); `requiredDirections` is the full
// set of directions that content kind must pass before the card counts as
// mastered (e.g. both Kanji directions, all 4 Vocab directions) -- callers
// with only one meaningful direction (Bunpo) just pass `[direction]` so the
// threshold is reached immediately, same as the old single-direction
// behavior. Correct: that direction's streak goes up, mastered flips once
// every required direction has independently crossed the threshold. Wrong:
// only the just-drilled direction's streak resets (progress in other
// directions is kept), and mastered is cleared (a card that regresses needs
// review again, even if it hit the streak once).
export async function recordAnswer(
  id: string,
  correct: boolean,
  direction: string,
  requiredDirections: string[],
): Promise<ItemProgress> {
  const map = await loadProgressMap();
  const cur = { ...(map[id] ?? defaultProgress()) };
  cur.directionStreaks = { ...cur.directionStreaks };
  const wasMastered = cur.mastered;
  const wasDue = isDueForReview(cur);
  if (correct) {
    cur.correctStreak += 1;
    cur.correctCount += 1;
    cur.wrongStreak = 0;
    cur.directionStreaks[direction] = (cur.directionStreaks[direction] ?? 0) + 1;
    const allDirectionsMastered = requiredDirections.every(
      (d) => (cur.directionStreaks[d] ?? 0) >= MASTERY_STREAK_THRESHOLD,
    );
    if (allDirectionsMastered) {
      cur.mastered = true;
      // Re-proving mastery (every required direction, e.g. both Kanji quiz
      // modes) clears "cần ôn lại" too, whether the flag was auto-set by the
      // wrong-streak below or set by hand -- otherwise a card the user just
      // demonstrated they know would stay stuck in that bucket forever,
      // undoable only by manually unflagging it.
      cur.flagged = false;
    }
    // Schedule (or reschedule, if this was a due review answered correctly
    // again) the next review -- but not on every correct answer of an
    // already-mastered-and-not-yet-due card, which would push it out
    // forever without ever coming due.
    if ((!wasMastered && cur.mastered) || wasDue) {
      cur.dueAt = Date.now() + REVIEW_INTERVAL_MS;
    }
  } else {
    cur.correctStreak = 0;
    cur.directionStreaks[direction] = 0;
    cur.wrongCount += 1;
    cur.wrongStreak = (cur.wrongStreak ?? 0) + 1;
    cur.mastered = false;
    cur.dueAt = undefined;
    if (cur.wrongStreak >= AUTO_FLAG_WRONG_STREAK) cur.flagged = true;
  }
  cur.lastSeenAt = Date.now();
  map[id] = cur;
  await saveProgressMap(map);
  await markStudiedToday();
  return cur;
}

export async function toggleFlag(id: string): Promise<ItemProgress> {
  const map = await loadProgressMap();
  const cur = { ...(map[id] ?? defaultProgress()) };
  cur.flagged = !cur.flagged;
  // Manually touching a card is itself a "seen" event -- without this, a
  // card only ever flagged/mastered by hand (never quizzed) keeps
  // lastSeenAt at 0 and bucketFor() falls through to "new" regardless of
  // the flag, since that check runs before flagged/mastered are read.
  cur.lastSeenAt = Date.now();
  map[id] = cur;
  await saveProgressMap(map);
  return cur;
}

// Manual override for "mastered", separate from the automatic streak-based
// mark in recordAnswer -- lets a card be ticked done without grinding it in
// Quiz. It doesn't touch correctStreak, so a later wrong Quiz answer still
// resets mastered back to false the normal way.
export async function toggleMastered(id: string): Promise<ItemProgress> {
  const map = await loadProgressMap();
  const cur = { ...(map[id] ?? defaultProgress()) };
  cur.mastered = !cur.mastered;
  cur.dueAt = cur.mastered ? Date.now() + REVIEW_INTERVAL_MS : undefined;
  cur.lastSeenAt = Date.now();
  map[id] = cur;
  await saveProgressMap(map);
  return cur;
}

// A mastered card whose scheduled review time has passed -- surfaced with
// higher quiz weight and a dedicated list filter so it doesn't just sit
// mastered forever without ever coming back up.
export function isDueForReview(progress: ItemProgress | undefined): boolean {
  return !!progress?.mastered && progress.dueAt !== undefined && Date.now() >= progress.dueAt;
}

// One-word classification of a card's study state, used by the Stats
// screen to group "đã thuộc / đang học / cần ôn lại / chưa học". Flagged
// wins over mastered while the flag still stands -- but recordAnswer clears
// the flag the moment every required direction re-crosses the mastery
// streak, so this only matters for a card that's flagged but hasn't been
// re-proven yet, not a permanent override.
export type ProgressBucket = "mastered" | "flagged" | "learning" | "new";

export function bucketFor(progress: ItemProgress | undefined): ProgressBucket {
  if (!progress) return "new";
  // Checked ahead of the lastSeenAt gate so a card already saved with
  // lastSeenAt still 0 (flagged/mastered by hand before that bug fix) reads
  // correctly without needing to be re-toggled.
  if (progress.flagged) return "flagged";
  if (progress.mastered) return "mastered";
  if (progress.lastSeenAt === 0) return "new";
  return "learning";
}

// Shared tile styling for any "overview grid" screen (Kanji, Vocab) --
// reuses the .reading-tile-* classes from the Luyện đề tile grid so the
// color language stays consistent app-wide: green = mastered, yellow/orange
// = still learning (getting there), red = flagged as difficult/wrong a lot,
// gray = untouched.
export const BUCKET_TILE_CLASS: Record<ProgressBucket, string> = {
  mastered: "reading-tile-perfect",
  flagged: "reading-tile-wrong",
  learning: "reading-tile-progress",
  new: "reading-tile-todo",
};

export const BUCKET_LABEL: Record<ProgressBucket, string> = {
  mastered: "đã thuộc",
  flagged: "cần ôn lại",
  learning: "đang học",
  new: "chưa học",
};

// Shared left-border accent for any "list row" screen (Bunpo, Stats' due
// list) -- same color language as BUCKET_TILE_CLASS and as the Luyện
// nghe/Luyện đề row style (border-l-4, emerald/rose/amber/neutral), just as
// a border color instead of a full tile fill since these rows already carry
// their own white background and other content.
export const BUCKET_ITEM_BORDER: Record<ProgressBucket, string> = {
  mastered: "border-l-emerald-400",
  learning: "border-l-amber-400",
  flagged: "border-l-rose-400",
  new: "border-l-neutral-200",
};

// How many of the given items were touched (quizzed, flagged, or marked
// mastered -- anything that bumps lastSeenAt) since local midnight. Purely
// derived from existing lastSeenAt timestamps, no new tracking added.
export function countStudiedToday<T extends { id: string }>(items: T[], map: ProgressMap): number {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const cutoff = startOfDay.getTime();
  return items.filter((item) => (map[item.id]?.lastSeenAt ?? 0) >= cutoff).length;
}

export function countDue<T extends { id: string }>(items: T[], map: ProgressMap): number {
  return items.filter((item) => isDueForReview(map[item.id])).length;
}

export function countBuckets<T extends { id: string }>(
  items: T[],
  map: ProgressMap,
): Record<ProgressBucket, number> {
  const counts: Record<ProgressBucket, number> = { mastered: 0, flagged: 0, learning: 0, new: 0 };
  for (const item of items) counts[bucketFor(map[item.id])]++;
  return counts;
}

// "all": no filtering. "unmastered": hide cards already mastered (keeps
// flagged-but-mastered cards out too -- mastered wins once set). "flagged":
// only cards the user manually marked as difficult. "due": only mastered
// cards whose fixed-interval review time has passed.
export type ProgressFilter = "all" | "unmastered" | "flagged" | "due";

export function filterByProgress<T extends { id: string }>(
  items: T[],
  map: ProgressMap,
  filter: ProgressFilter,
): T[] {
  if (filter === "all") return items;
  if (filter === "flagged") return items.filter((item) => map[item.id]?.flagged);
  if (filter === "due") return items.filter((item) => isDueForReview(map[item.id]));
  return items.filter((item) => !map[item.id]?.mastered);
}

// Quiz question targets are picked with a weight favoring cards that still
// need work, so struggling cards resurface more often without a full SRS
// scheduler: flagged cards weigh the most, then not-yet-mastered cards,
// mastered cards still appear occasionally (weight 1) to catch regressions.
export function weightFor(progress: ItemProgress | undefined): number {
  if (!progress) return 3; // never seen -- treat like an unmastered card
  if (progress.flagged) return 5;
  if (isDueForReview(progress)) return 4; // due for its scheduled review -- resurface it
  if (!progress.mastered) return 3;
  return 1;
}

export function pickWeighted<T extends { id: string }>(items: T[], map: ProgressMap): T {
  const weights = items.map((item) => weightFor(map[item.id]));
  const total = weights.reduce((sum, w) => sum + w, 0);
  let r = Math.random() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i];
    if (r <= 0) return items[i];
  }
  return items[items.length - 1];
}

// Daily study streak -- inspired by ai-cert-quiz's HISTORY-based streak
// calc, simplified to a flat array of "days studied" (local-time YYYY-MM-DD)
// rather than full session history, since only the streak count is shown.
const STUDY_LOG_KEY = "studyLog";
const STUDY_LOG_MAX_DAYS = 400;

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

async function markStudiedToday(): Promise<void> {
  const log: string[] = (await storageGet<string[]>(STUDY_LOG_KEY)) ?? [];
  const today = dayKey(new Date());
  if (log.includes(today)) return;
  const next = [...log, today].sort().slice(-STUDY_LOG_MAX_DAYS);
  await storageSet(STUDY_LOG_KEY, next);
}

// Consecutive days ending today. If today hasn't been studied yet, that
// doesn't break the streak (the day isn't over) -- counting instead starts
// from yesterday, same reasoning as ai-cert-quiz's streak calc.
export async function getStudyStreak(): Promise<number> {
  const log: string[] = (await storageGet<string[]>(STUDY_LOG_KEY)) ?? [];
  const studied = new Set(log);

  const cursor = new Date();
  cursor.setHours(0, 0, 0, 0);
  if (!studied.has(dayKey(cursor))) cursor.setDate(cursor.getDate() - 1);

  let streak = 0;
  while (studied.has(dayKey(cursor))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

// This calendar week (Monday..Sunday, matching the T2..CN labels) as 7
// studied/not-studied flags, for a weekly streak-calendar widget --
// separate from getStudyStreak's running count since a UI needs to know
// *which* days, not just how many in a row.
export async function getWeekStudyDays(): Promise<boolean[]> {
  const log: string[] = (await storageGet<string[]>(STUDY_LOG_KEY)) ?? [];
  const studied = new Set(log);

  const now = new Date();
  const mondayOffset = now.getDay() === 0 ? -6 : 1 - now.getDay();
  const monday = new Date(now);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(monday.getDate() + mondayOffset);

  const days: boolean[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    days.push(studied.has(dayKey(d)));
  }
  return days;
}
