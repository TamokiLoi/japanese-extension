import { storageGet, storageSet } from "../platform/storage";
import { bucketFor, countStudiedToday, type ProgressMap } from "./progressState.ts";

// "Kế hoạch hôm nay" only covers Kanji/Từ vựng/Ngữ pháp, same scope as
// "Cần ôn ngay" (reviewState.ts) -- the other content types (Reading,
// Listening, QuizBook...) don't have a "N mục mới" pacing concept the way
// a flashcard deck does.
export interface DailyGoals {
  kanji: number;
  vocab: number;
  bunpo: number;
}

const DEFAULT_GOALS: DailyGoals = { kanji: 20, vocab: 30, bunpo: 10 };
const STORAGE_KEY = "dailyGoals";

export async function loadDailyGoals(): Promise<DailyGoals> {
  const saved = await storageGet<Partial<DailyGoals>>(STORAGE_KEY);
  return {
    kanji: saved?.kanji && saved.kanji > 0 ? saved.kanji : DEFAULT_GOALS.kanji,
    vocab: saved?.vocab && saved.vocab > 0 ? saved.vocab : DEFAULT_GOALS.vocab,
    bunpo: saved?.bunpo && saved.bunpo > 0 ? saved.bunpo : DEFAULT_GOALS.bunpo,
  };
}

export async function saveDailyGoals(goals: DailyGoals): Promise<void> {
  await storageSet(STORAGE_KEY, goals);
}

export interface DailyPlanItem<T> {
  goal: number;
  // Next un-started items to work through today, capped at `goal` --
  // what the checklist row is telling the user to go do.
  upNext: T[];
  // How many of this type were actually studied today (any progress
  // touch, not just brand-new ones), capped at `goal` -- what fills the
  // checkbox in.
  doneToday: number;
  remainingNew: number;
}

// Picks the plan for one content type: the next `goal` items still at the
// "new" bucket (nothing studied yet), in dataset order, plus how far
// today's actual studying has gotten toward that goal.
export function buildDailyPlanItem<T extends { id: string }>(items: T[], goal: number, map: ProgressMap): DailyPlanItem<T> {
  const newItems = items.filter((item) => bucketFor(map[item.id]) === "new");
  return {
    goal,
    upNext: newItems.slice(0, goal),
    doneToday: Math.min(countStudiedToday(items, map), goal),
    remainingNew: newItems.length,
  };
}
