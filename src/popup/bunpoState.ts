import bunpoJlptDaRaRaw from "../data/bunpo-n3-jlpt-da-ra.json";
import bunpoTheoChuongRaw from "../data/bunpo-n3-theo-chuong.json";
import bunpo400MauRaw from "../data/bunpo-400-mau-thong-dung.json";
import bunpoShinkanzenRaw from "../data/bunpo-shinkanzen.json";
import bunpoTryN3Raw from "../data/bunpo-try-n3.json";
import tryN3ChaptersRaw from "../data/try-n3-chapters.json";
import bunpoN4InfographicRaw from "../data/bunpo-n4-infographic.json";
import bunpoTheDongTuRaw from "../data/bunpo-the-dong-tu.json";
import bunpoKinhNguRaw from "../data/bunpo-kinh-ngu.json";
import bunpoKaiwaRaw from "../data/bunpo-kaiwa.json";
import type { BunpoDataset, BunpoGrammarPoint, BunpoSource, TryN3Chapter } from "../types/bunpo.ts";
import type { JlptLevel } from "../types/kanji.ts";
import type { ProgressFilter } from "./progressState.ts";
import { storageGet, storageSet } from "../platform/storage";

const jlptDaRaDataset = bunpoJlptDaRaRaw as unknown as BunpoDataset;
const theoChuongDataset = bunpoTheoChuongRaw as unknown as BunpoDataset;
const mau400Dataset = bunpo400MauRaw as unknown as BunpoDataset;
const shinkanzenDataset = bunpoShinkanzenRaw as unknown as BunpoDataset;
const tryN3Dataset = bunpoTryN3Raw as unknown as BunpoDataset;
export const TRY_N3_CHAPTERS = (tryN3ChaptersRaw as { chapters: TryN3Chapter[] }).chapters;
const n4InfographicDataset = bunpoN4InfographicRaw as unknown as BunpoDataset;
const theDongTuDataset = bunpoTheDongTuRaw as unknown as BunpoDataset;
const kinhNguDataset = bunpoKinhNguRaw as unknown as BunpoDataset;
const kaiwaDataset = bunpoKaiwaRaw as unknown as BunpoDataset;
export const ALL_BUNPO: BunpoGrammarPoint[] = [
  ...jlptDaRaDataset.grammarPoints,
  ...theoChuongDataset.grammarPoints,
  ...mau400Dataset.grammarPoints,
  ...shinkanzenDataset.grammarPoints,
  ...tryN3Dataset.grammarPoints,
  ...n4InfographicDataset.grammarPoints,
  ...theDongTuDataset.grammarPoints,
  ...kinhNguDataset.grammarPoints,
  ...kaiwaDataset.grammarPoints,
];

const BUNPO_BY_ID = new Map(ALL_BUNPO.map((g) => [g.id, g]));
export function findBunpoById(id: string): BunpoGrammarPoint | undefined {
  return BUNPO_BY_ID.get(id);
}

export const SOURCE_LABELS: Record<BunpoSource, string> = {
  "jlpt-da-ra": "Đã ra trong đề JLPT",
  // This is the app's own 15-chapter N3 learning path, not a book TOC.
  "theo-chuong": "Lộ trình N3",
  shinkanzen: "Shinkanzen",
  "try-n3": "TRY! N3",
  "400-mau-thong-dung": "400 mẫu thông dụng",
  "n4-infographic": "Tổng hợp ngữ pháp N4",
  "the-dong-tu": "13 thể động từ",
  "kinh-ngu": "Kính ngữ (敬語)",
  kaiwa: "60 mẫu ngữ pháp Kaiwa",
};

const SOURCE_ORDER: BunpoSource[] = [
  "theo-chuong",
  "jlpt-da-ra",
  "shinkanzen",
  "try-n3",
  "400-mau-thong-dung",
  "n4-infographic",
  "the-dong-tu",
  "kinh-ngu",
  "kaiwa",
];
export const AVAILABLE_SOURCES: BunpoSource[] = SOURCE_ORDER.filter((s) => ALL_BUNPO.some((g) => g.sources.includes(s)));

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
  // Web-only preview filter for a TRY! N3 book unit. It is intentionally
  // separate from selectedChapters, which belongs to the app's 15-chapter
  // thematic curriculum.
  tryN3Chapter: number | null;
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
    tryN3Chapter: null,
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
    tryN3Chapter:
      typeof saved?.tryN3Chapter === "number" && TRY_N3_CHAPTERS.some((unit) => unit.chapter === saved.tryN3Chapter)
        ? saved.tryN3Chapter
        : null,
    currentGrammarId:
      saved?.currentGrammarId && findBunpoById(saved.currentGrammarId) ? saved.currentGrammarId : null,
    listSearchQuery: saved?.listSearchQuery ?? fallback.listSearchQuery,
    progressFilter: saved?.progressFilter ?? fallback.progressFilter,
  };
}

export function tryN3GrammarIds(chapter: number): Set<string> {
  return new Set(TRY_N3_CHAPTERS.find((unit) => unit.chapter === chapter)?.grammarIds ?? []);
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
    if (!g.sources.some((s) => state.selectedSources.includes(s))) return false;
    // Only gate on chapter when the user still has "theo-chuong" selected --
    // otherwise a merged item that also belongs to another currently-
    // selected source (e.g. shinkanzen) would get wrongly dropped by a
    // stale selectedChapters left over from when theo-chuong was checked
    // (the chapter picker UI is hidden once theo-chuong is unchecked, so
    // there'd be no way to reset it).
    if (
      g.sources.includes("theo-chuong") &&
      state.selectedSources.includes("theo-chuong") &&
      g.chapter !== undefined &&
      !state.selectedChapters.includes(g.chapter)
    ) {
      return false;
    }
    return true;
  });
}
