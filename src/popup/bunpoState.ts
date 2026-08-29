import bunpoJlptDaRaRaw from "../data/bunpo-n3-jlpt-da-ra.json";
import bunpoTheoChuongRaw from "../data/bunpo-n3-theo-chuong.json";
import type { BunpoDataset, BunpoGrammarPoint, BunpoSource } from "../types/bunpo.ts";
import type { JlptLevel } from "../types/kanji.ts";
import type { ProgressFilter } from "./progressState.ts";
import { storageGet, storageSet } from "../platform/storage";

const jlptDaRaDataset = bunpoJlptDaRaRaw as unknown as BunpoDataset;
const theoChuongDataset = bunpoTheoChuongRaw as unknown as BunpoDataset;
export const ALL_BUNPO: BunpoGrammarPoint[] = [
  ...jlptDaRaDataset.grammarPoints,
  ...theoChuongDataset.grammarPoints,
];

const BUNPO_BY_ID = new Map(ALL_BUNPO.map((g) => [g.id, g]));
export function findBunpoById(id: string): BunpoGrammarPoint | undefined {
  return BUNPO_BY_ID.get(id);
}

export const SOURCE_LABELS: Record<BunpoSource, string> = {
  "jlpt-da-ra": "Đã ra trong đề JLPT",
  "theo-chuong": "Học theo chương",
};

const SOURCE_ORDER: BunpoSource[] = ["theo-chuong", "jlpt-da-ra"];
export const AVAILABLE_SOURCES: BunpoSource[] = SOURCE_ORDER.filter((s) => ALL_BUNPO.some((g) => g.source === s));

const LEVEL_ORDER: JlptLevel[] = ["N5", "N4", "N3", "N2", "N1"];
export const AVAILABLE_LEVELS: JlptLevel[] = LEVEL_ORDER.filter((level) => ALL_BUNPO.some((g) => g.level === level));

export function countForLevel(level: JlptLevel): number {
  return ALL_BUNPO.filter((g) => g.level === level).length;
}

// Chapters only exist on the "theo-chuong" source -- sorted numerically so
// the filter UI lists Chương 1, 2, 3... instead of insertion order.
export const AVAILABLE_CHAPTERS: number[] = Array.from(
  new Set(ALL_BUNPO.filter((g) => g.chapter !== undefined).map((g) => g.chapter!)),
).sort((a, b) => a - b);

export function findChapterTitle(chapter: number): string | undefined {
  return ALL_BUNPO.find((g) => g.chapter === chapter)?.chapterTitle;
}

export interface BunpoViewerState {
  selectedLevels: JlptLevel[];
  selectedSources: BunpoSource[];
  selectedChapters: number[];
  currentGrammarId: string | null;
  listSearchQuery: string;
  progressFilter: ProgressFilter;
}

const STORAGE_KEY = "bunpoViewer";

export function defaultViewerState(): BunpoViewerState {
  return {
    selectedLevels: [...AVAILABLE_LEVELS],
    selectedSources: [...AVAILABLE_SOURCES],
    selectedChapters: [...AVAILABLE_CHAPTERS],
    currentGrammarId: null,
    listSearchQuery: "",
    progressFilter: "all",
  };
}

export async function loadViewerState(): Promise<BunpoViewerState> {
  const saved = await storageGet<Partial<BunpoViewerState>>(STORAGE_KEY);
  const fallback = defaultViewerState();
  const selectedLevels = (saved?.selectedLevels ?? fallback.selectedLevels).filter((l) => AVAILABLE_LEVELS.includes(l));
  const selectedSources = (saved?.selectedSources ?? fallback.selectedSources).filter((s) =>
    AVAILABLE_SOURCES.includes(s),
  );
  const selectedChapters = (saved?.selectedChapters ?? fallback.selectedChapters).filter((c) =>
    AVAILABLE_CHAPTERS.includes(c),
  );
  return {
    selectedLevels: selectedLevels.length > 0 ? selectedLevels : fallback.selectedLevels,
    selectedSources: selectedSources.length > 0 ? selectedSources : fallback.selectedSources,
    selectedChapters: selectedChapters.length > 0 ? selectedChapters : fallback.selectedChapters,
    currentGrammarId:
      saved?.currentGrammarId && findBunpoById(saved.currentGrammarId) ? saved.currentGrammarId : null,
    listSearchQuery: saved?.listSearchQuery ?? fallback.listSearchQuery,
    progressFilter: saved?.progressFilter ?? fallback.progressFilter,
  };
}

export async function saveViewerState(state: BunpoViewerState): Promise<void> {
  await storageSet(STORAGE_KEY, state);
}

// Shared by the Bunpo screen's list filter and the Quiz screen's "Ngữ
// pháp" pool -- so a quiz built from Quiz always respects whatever
// level/source/chapter filter is currently selected on the Bunpo screen,
// same as Kanji/Vocab already do.
export function getFilteredList(state: BunpoViewerState): BunpoGrammarPoint[] {
  return ALL_BUNPO.filter((g) => {
    if (!state.selectedLevels.includes(g.level)) return false;
    if (!state.selectedSources.includes(g.source)) return false;
    if (g.source === "theo-chuong" && g.chapter !== undefined && !state.selectedChapters.includes(g.chapter)) {
      return false;
    }
    return true;
  });
}
