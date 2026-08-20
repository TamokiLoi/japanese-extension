import kanjiAllRaw from "../data/kanji-all.json";
import type { Kanji, KanjiDataset, JlptLevel } from "../types/kanji.ts";

const dataset = kanjiAllRaw as unknown as KanjiDataset;
export const ALL_KANJI: Kanji[] = dataset.kanji;

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
}

const STORAGE_KEY = "kanjiViewer";

export function defaultViewerState(): KanjiViewerState {
  return {
    selectedLevels: [...AVAILABLE_LEVELS],
    randomOrder: false,
    shuffleSeed: Date.now(),
    index: 0,
  };
}

export async function loadViewerState(): Promise<KanjiViewerState> {
  const stored = await chrome.storage.local.get(STORAGE_KEY);
  const saved = stored[STORAGE_KEY] as Partial<KanjiViewerState> | undefined;
  const fallback = defaultViewerState();
  const selectedLevels = (saved?.selectedLevels ?? fallback.selectedLevels).filter((l) =>
    AVAILABLE_LEVELS.includes(l),
  );
  return {
    selectedLevels: selectedLevels.length > 0 ? selectedLevels : fallback.selectedLevels,
    randomOrder: saved?.randomOrder ?? fallback.randomOrder,
    shuffleSeed: saved?.shuffleSeed ?? fallback.shuffleSeed,
    index: saved?.index ?? fallback.index,
  };
}

export async function saveViewerState(state: KanjiViewerState): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: state });
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
