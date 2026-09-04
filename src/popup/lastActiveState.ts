import { storageGet, storageSet } from "../platform/storage";
import type { Screen } from "./App.tsx";

// Screens that represent actual study content -- the Home "Tiếp tục học"
// banner only ever offers to resume one of these, never menu/search/stats/
// guide/review (that last one is its own generated session, not a place to
// "continue" back into).
export type ResumableScreen = "kanji" | "vocab" | "bunpo" | "reading" | "listening" | "quiz" | "quizBook" | "exams" | "dictation";

export const RESUMABLE_SCREENS: ResumableScreen[] = [
  "kanji",
  "vocab",
  "bunpo",
  "reading",
  "listening",
  "quiz",
  "quizBook",
  "exams",
  "dictation",
];

export function isResumableScreen(screen: Screen): screen is ResumableScreen {
  return (RESUMABLE_SCREENS as Screen[]).includes(screen);
}

export interface LastActive {
  screen: ResumableScreen;
  targetId?: string;
  visitedAt: number;
}

const STORAGE_KEY = "lastActiveScreen";

// Called from WebApp.tsx's go() on every navigation -- silently ignores
// non-resumable screens instead of erroring, so callers don't need to check
// isResumableScreen themselves before calling this.
export async function saveLastActive(screen: Screen, targetId?: string): Promise<void> {
  if (!isResumableScreen(screen)) return;
  const entry: LastActive = { screen, targetId, visitedAt: Date.now() };
  await storageSet(STORAGE_KEY, entry);
}

export async function loadLastActive(): Promise<LastActive | null> {
  return (await storageGet<LastActive>(STORAGE_KEY)) ?? null;
}
