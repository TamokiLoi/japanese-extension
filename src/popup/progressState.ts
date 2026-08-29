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
  mastered: boolean;
  flagged: boolean;
  lastSeenAt: number;
}

export type ProgressMap = Record<string, ItemProgress>;

const STORAGE_KEY = "itemProgress";

// Consecutive correct answers in Quiz needed to mark a card "mastered".
export const MASTERY_STREAK_THRESHOLD = 3;

export function defaultProgress(): ItemProgress {
  return { correctStreak: 0, correctCount: 0, wrongCount: 0, mastered: false, flagged: false, lastSeenAt: 0 };
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

// Count of a given id list that are currently mastered -- used for the
// menu screen's "X/Y đã thuộc" summary under Kanji/Từ vựng.
export async function countMastered(ids: string[]): Promise<number> {
  const map = await loadProgressMap();
  return ids.filter((id) => map[id]?.mastered).length;
}

// Called once per Quiz answer. Correct: streak up, mastered once the streak
// crosses the threshold. Wrong: streak resets and mastered is cleared (a
// card that regresses needs review again, even if it hit the streak once).
export async function recordAnswer(id: string, correct: boolean): Promise<ItemProgress> {
  const map = await loadProgressMap();
  const cur = { ...(map[id] ?? defaultProgress()) };
  if (correct) {
    cur.correctStreak += 1;
    cur.correctCount += 1;
    if (cur.correctStreak >= MASTERY_STREAK_THRESHOLD) cur.mastered = true;
  } else {
    cur.correctStreak = 0;
    cur.wrongCount += 1;
    cur.mastered = false;
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
  cur.lastSeenAt = Date.now();
  map[id] = cur;
  await saveProgressMap(map);
  return cur;
}

// One-word classification of a card's study state, used by the Stats
// screen to group "đã thuộc / đang học / cần ôn lại / chưa học". Flagged
// wins over mastered since it's an explicit manual "cần học lại" from the
// user, even for a card that happened to hit the mastery streak before.
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
// only cards the user manually marked as difficult.
export type ProgressFilter = "all" | "unmastered" | "flagged";

export function filterByProgress<T extends { id: string }>(
  items: T[],
  map: ProgressMap,
  filter: ProgressFilter,
): T[] {
  if (filter === "all") return items;
  if (filter === "flagged") return items.filter((item) => map[item.id]?.flagged);
  return items.filter((item) => !map[item.id]?.mastered);
}

// Quiz question targets are picked with a weight favoring cards that still
// need work, so struggling cards resurface more often without a full SRS
// scheduler: flagged cards weigh the most, then not-yet-mastered cards,
// mastered cards still appear occasionally (weight 1) to catch regressions.
export function weightFor(progress: ItemProgress | undefined): number {
  if (!progress) return 3; // never seen -- treat like an unmastered card
  if (progress.flagged) return 5;
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
