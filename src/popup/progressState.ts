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
  const stored = await chrome.storage.local.get(STORAGE_KEY);
  return (stored[STORAGE_KEY] as ProgressMap | undefined) ?? {};
}

async function saveProgressMap(map: ProgressMap): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: map });
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
  map[id] = cur;
  await saveProgressMap(map);
  return cur;
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
  const stored = await chrome.storage.local.get(STUDY_LOG_KEY);
  const log: string[] = stored[STUDY_LOG_KEY] ?? [];
  const today = dayKey(new Date());
  if (log.includes(today)) return;
  const next = [...log, today].sort().slice(-STUDY_LOG_MAX_DAYS);
  await chrome.storage.local.set({ [STUDY_LOG_KEY]: next });
}

// Consecutive days ending today. If today hasn't been studied yet, that
// doesn't break the streak (the day isn't over) -- counting instead starts
// from yesterday, same reasoning as ai-cert-quiz's streak calc.
export async function getStudyStreak(): Promise<number> {
  const stored = await chrome.storage.local.get(STUDY_LOG_KEY);
  const log: string[] = stored[STUDY_LOG_KEY] ?? [];
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
