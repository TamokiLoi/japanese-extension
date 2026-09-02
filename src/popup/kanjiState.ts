import kanjiAllRaw from "../data/kanji-all.json";
import type { Kanji, KanjiDataset, JlptLevel } from "../types/kanji.ts";
import type { ProgressFilter } from "./progressState.ts";
import { storageGet, storageSet } from "../platform/storage";

const dataset = kanjiAllRaw as unknown as KanjiDataset;
export const ALL_KANJI: Kanji[] = dataset.kanji;

const KANJI_BY_ID = new Map(ALL_KANJI.map((k) => [k.id, k]));
export function findKanjiById(id: string): Kanji | undefined {
  return KANJI_BY_ID.get(id);
}

// Canonical JLPT ordering (easiest to hardest). Only levels actually present
// in the bundled dataset are ever shown -- adding a new level to the data
// (e.g. N1 later) surfaces here automatically, no UI code changes needed.
const LEVEL_ORDER: JlptLevel[] = ["N5", "N4", "N3", "N2", "N1"];

export const AVAILABLE_LEVELS: JlptLevel[] = LEVEL_ORDER.filter((level) =>
  ALL_KANJI.some((k) => k.level === level),
);

export function countForLevel(level: JlptLevel): number {
  return ALL_KANJI.filter((k) => k.level === level).length;
}

export interface KanjiViewerState {
  selectedLevels: JlptLevel[];
  randomOrder: boolean;
  shuffleSeed: number;
  index: number;
  progressFilter: ProgressFilter;
  // "card": one kanji at a time (the study flow). "grid": an overview tile
  // per kanji in the current filter, colored by mastery bucket, so "which
  // ones do I already know" is answerable at a glance instead of paging
  // through the whole filtered list one card at a time.
  viewMode: "card" | "grid";
}

const STORAGE_KEY = "kanjiViewer";

export function defaultViewerState(): KanjiViewerState {
  return {
    selectedLevels: [...AVAILABLE_LEVELS],
    randomOrder: false,
    shuffleSeed: Date.now(),
    index: 0,
    progressFilter: "all",
    // Land on the overview grid first -- "which kanji do I already know"
    // should be answerable at a glance before committing to the one-at-a-
    // time study flow. Jumping to a specific kanji (resolveJumpState) still
    // switches to "card" so a search/link click opens straight on the card.
    viewMode: "grid",
  };
}

export async function loadViewerState(): Promise<KanjiViewerState> {
  const saved = await storageGet<Partial<KanjiViewerState>>(STORAGE_KEY);
  const fallback = defaultViewerState();
  const selectedLevels = (saved?.selectedLevels ?? fallback.selectedLevels).filter((l) =>
    AVAILABLE_LEVELS.includes(l),
  );
  return {
    selectedLevels: selectedLevels.length > 0 ? selectedLevels : fallback.selectedLevels,
    randomOrder: saved?.randomOrder ?? fallback.randomOrder,
    shuffleSeed: saved?.shuffleSeed ?? fallback.shuffleSeed,
    index: saved?.index ?? fallback.index,
    progressFilter: saved?.progressFilter ?? fallback.progressFilter,
    viewMode: saved?.viewMode ?? fallback.viewMode,
  };
}

export async function saveViewerState(state: KanjiViewerState): Promise<void> {
  await storageSet(STORAGE_KEY, state);
}

// Deterministic PRNG (mulberry32) so a shuffle order is reproducible from a
// small persisted seed instead of persisting the whole shuffled id list.
function mulberry32(seed: number): () => number {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seededShuffle<T>(items: T[], seed: number): T[] {
  const rand = mulberry32(seed);
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function getOrderedList(state: KanjiViewerState): Kanji[] {
  const filtered = ALL_KANJI.filter((k) => state.selectedLevels.includes(k.level));
  return state.randomOrder ? seededShuffle(filtered, state.shuffleSeed) : filtered;
}

// Used when jumping to a specific kanji from elsewhere (a "từ vựng liên
// quan" link, a search result). Widens the current level filter to include
// the target's level if it's excluded, and clears the progress filter --
// otherwise "chỉ hiện chưa thuộc" could hide the very card being jumped to.
// Returns null if the id doesn't exist in the dataset at all.
export function resolveJumpState(state: KanjiViewerState, targetId: string): KanjiViewerState | null {
  const target = findKanjiById(targetId);
  if (!target) return null;
  const newState: KanjiViewerState = {
    ...state,
    selectedLevels: state.selectedLevels.includes(target.level)
      ? state.selectedLevels
      : [...state.selectedLevels, target.level],
    progressFilter: "all",
    viewMode: "card",
  };
  const list = getOrderedList(newState);
  const index = list.findIndex((k) => k.id === targetId);
  if (index === -1) return null;
  return { ...newState, index };
}

// Used by reminder notifications (both the real periodic alarm and the
// "Thu ngay" test button) so they only ever show a kanji from the levels
// the user currently has selected in the viewer, instead of all levels.
export async function pickReminderKanji(): Promise<Kanji> {
  const state = await loadViewerState();
  const pool = ALL_KANJI.filter((k) => state.selectedLevels.includes(k.level));
  const list = pool.length > 0 ? pool : ALL_KANJI;
  return list[Math.floor(Math.random() * list.length)];
}
