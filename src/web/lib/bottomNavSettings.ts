import { storageGet, storageSet } from "../../platform/storage.ts";
import type { Screen } from "../../popup/App.tsx";

const STORAGE_KEY = "bottomNavShortcuts";

export const BOTTOM_NAV_CHOICES: Screen[] = [
  "kanji",
  "vocab",
  "bunpo",
  "reading",
  "listening",
  "podcast",
  "quizBook",
  "exams",
  "roadmap",
  "quiz",
  "matchGame",
  "review",
  "itBookLessons",
  "itBookVocab",
  "stats",
];

export const DEFAULT_BOTTOM_NAV_SHORTCUTS: Screen[] = ["quiz", "exams", "listening"];

function isValidShortcuts(value: unknown): value is Screen[] {
  return (
    Array.isArray(value) &&
    value.length === 3 &&
    new Set(value).size === 3 &&
    value.every((screen) => BOTTOM_NAV_CHOICES.includes(screen as Screen))
  );
}

export async function loadBottomNavShortcuts(): Promise<Screen[]> {
  const stored = await storageGet<unknown>(STORAGE_KEY);
  return isValidShortcuts(stored) ? stored : [...DEFAULT_BOTTOM_NAV_SHORTCUTS];
}

export async function saveBottomNavShortcuts(shortcuts: Screen[]): Promise<void> {
  if (!isValidShortcuts(shortcuts)) throw new Error("Ba lối tắt phải khác nhau và thuộc danh sách hỗ trợ.");
  await storageSet(STORAGE_KEY, shortcuts);
}
