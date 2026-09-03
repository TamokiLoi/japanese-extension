import { storageGet, storageSet } from "../platform/storage";
import { bucketFor, countStudiedToday, type ProgressMap } from "./progressState.ts";

// "Kế hoạch học" covers the 5 content types with a real "N mục mới" pacing
// concept (a deck/list you work through) -- Luyện đề/Đề thi JLPT/Quiz don't
// fit this shape (no fixed "chưa học" pool to pace against).
export type PlanType = "kanji" | "vocab" | "bunpo" | "reading" | "listening";

export const PLAN_TYPES: PlanType[] = ["kanji", "vocab", "bunpo", "reading", "listening"];

export interface DailyGoalSetting {
  // Whether this type's row shows on the "Kế hoạch hôm nay" dashboard card
  // -- set up once in the plan's settings sheet, not every type needs to be
  // paced at once.
  enabled: boolean;
  goal: number;
}

export type DailyGoals = Record<PlanType, DailyGoalSetting>;

const DEFAULT_GOALS: DailyGoals = {
  kanji: { enabled: true, goal: 20 },
  vocab: { enabled: true, goal: 30 },
  bunpo: { enabled: true, goal: 10 },
  reading: { enabled: false, goal: 5 },
  listening: { enabled: false, goal: 5 },
};

const STORAGE_KEY = "dailyGoals";

export async function loadDailyGoals(): Promise<DailyGoals> {
  const saved = await storageGet<Partial<Record<PlanType, Partial<DailyGoalSetting>>>>(STORAGE_KEY);
  const result = {} as DailyGoals;
  for (const type of PLAN_TYPES) {
    const savedType = saved?.[type];
    const fallback = DEFAULT_GOALS[type];
    result[type] = {
      enabled: savedType?.enabled ?? fallback.enabled,
      goal: savedType?.goal && savedType.goal > 0 ? savedType.goal : fallback.goal,
    };
  }
  return result;
}

export async function saveDailyGoals(goals: DailyGoals): Promise<void> {
  await storageSet(STORAGE_KEY, goals);
}

export interface DailyPlanItem {
  goal: number;
  // How many of this type were actually studied today (any progress
  // touch, not just brand-new ones), capped at `goal` -- what fills the
  // checkbox in.
  doneToday: number;
  // "Chưa học" count within whatever that section's own filter (level/
  // source/...) currently selects -- not the whole dataset, so this
  // reflects exactly what the user would actually be working through.
  remainingNew: number;
  // Ceil(remainingNew / goal); null when goal is 0 (paced against nothing).
  daysLeft: number | null;
}

// Picks the plan for one content type against `items` -- pass the
// section's own currently-FILTERED list (not the full dataset), so
// "days left" answers against the exact scope the user is studying right
// now, and changing that filter elsewhere naturally reflects here next
// time this is computed (on Home's next load, not live-tracked).
export function buildDailyPlanItem<T extends { id: string }>(items: T[], goal: number, map: ProgressMap): DailyPlanItem {
  const remainingNew = items.reduce((n, item) => n + (bucketFor(map[item.id]) === "new" ? 1 : 0), 0);
  return {
    goal,
    doneToday: Math.min(countStudiedToday(items, map), goal),
    remainingNew,
    daysLeft: goal > 0 ? Math.ceil(remainingNew / goal) : null,
  };
}
