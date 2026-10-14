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
import { bunpoProgressId, canonicalizeBunpo, toBunpoStudyItem, type BunpoLegacyReference, type BunpoStudyItem } from "./bunpoCatalog.ts";
import type { ProgressFilter } from "./progressState.ts";
import { storageGet, storageSet } from "../platform/storage";

const jlptDaRaDataset = bunpoJlptDaRaRaw as unknown as BunpoDataset;
const theoChuongDataset = bunpoTheoChuongRaw as unknown as BunpoDataset;
const mau400Dataset = bunpo400MauRaw as unknown as BunpoDataset;
const shinkanzenDataset = bunpoShinkanzenRaw as unknown as BunpoDataset;
const tryN3Dataset = bunpoTryN3Raw as unknown as BunpoDataset;
type LegacyTryN3Chapter = Omit<TryN3Chapter, "grammarRefs"> & {
  grammarIds?: string[];
  grammarRefs?: TryN3Chapter["grammarRefs"];
};
const rawTryN3Chapters = (tryN3ChaptersRaw as { chapters: LegacyTryN3Chapter[] }).chapters;
const n4InfographicDataset = bunpoN4InfographicRaw as unknown as BunpoDataset;
const theDongTuDataset = bunpoTheDongTuRaw as unknown as BunpoDataset;
const kinhNguDataset = bunpoKinhNguRaw as unknown as BunpoDataset;
const kaiwaDataset = bunpoKaiwaRaw as unknown as BunpoDataset;
const rawBunpo: BunpoGrammarPoint[] = [
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

const canonical = canonicalizeBunpo(rawBunpo);
export const ALL_BUNPO: BunpoGrammarPoint[] = canonical.grammarPoints;
export const BUNPO_LEGACY_ID_MAP: Record<string, BunpoLegacyReference> = canonical.legacyIdMap;
export const ALL_BUNPO_SENSES: BunpoStudyItem[] = ALL_BUNPO.flatMap((grammar) =>
  (grammar.senses ?? []).map((sense) => toBunpoStudyItem(grammar.id, sense, grammar.pattern, grammar.patternVariants ?? [grammar.pattern])),
);
const BUNPO_BY_ID = new Map(ALL_BUNPO.map((g) => [g.id, g]));
export function resolveBunpoReference(grammarId: string, senseId?: string): BunpoLegacyReference | undefined {
  if (BUNPO_BY_ID.has(grammarId)) {
    const point = BUNPO_BY_ID.get(grammarId)!;
    const validSense = senseId && point.senses?.some((sense) => sense.id === senseId) ? senseId : point.senses?.[0]?.id;
    return validSense ? { grammarId, senseId: validSense } : undefined;
  }
  const resolved = BUNPO_LEGACY_ID_MAP[grammarId];
  if (!resolved) return undefined;
  const requested = senseId && BUNPO_BY_ID.get(resolved.grammarId)?.senses?.some((sense) => sense.id === senseId)
    ? senseId
    : resolved.senseId;
  return { grammarId: resolved.grammarId, senseId: requested };
}

export function findBunpoSense(grammarId: string, senseId?: string) {
  const reference = resolveBunpoReference(grammarId, senseId);
  const grammar = reference ? BUNPO_BY_ID.get(reference.grammarId) : undefined;
  const sense = grammar?.senses?.find((candidate) => candidate.id === reference?.senseId);
  return grammar && sense ? { grammar, sense } : undefined;
}

export function findBunpoById(id: string): BunpoGrammarPoint | undefined {
  const resolved = resolveBunpoReference(id);
  return resolved ? BUNPO_BY_ID.get(resolved.grammarId) : undefined;
}

export const TRY_N3_CHAPTERS: TryN3Chapter[] = rawTryN3Chapters.map((unit) => ({
  ...unit,
  grammarRefs: unit.grammarRefs ?? (unit.grammarIds ?? []).flatMap((oldId) => {
    const reference = resolveBunpoReference(oldId);
    return reference ? [reference] : [];
  }),
}));

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
export const AVAILABLE_SOURCES: BunpoSource[] = SOURCE_ORDER.filter((s) => ALL_BUNPO.some((g) => g.senses?.some((sense) => sense.sources.includes(s))));

const LEVEL_ORDER: JlptLevel[] = ["N5", "N4", "N3", "N2", "N1"];
export const AVAILABLE_LEVELS: JlptLevel[] = LEVEL_ORDER.filter((level) => ALL_BUNPO.some((g) => g.senses?.some((sense) => sense.levels.includes(level))));

export function countForLevel(level: JlptLevel): number {
  return ALL_BUNPO.filter((g) => g.senses?.some((sense) => sense.levels.includes(level))).length;
}

// Chapters only exist on the "theo-chuong" source -- sorted numerically so
// the filter UI lists Chương 1, 2, 3... instead of insertion order.
export const AVAILABLE_CHAPTERS: number[] = Array.from(
  new Set(ALL_BUNPO.flatMap((g) => g.senses?.flatMap((sense) => sense.chapters.map((chapter) => chapter.chapter)) ?? [])),
).sort((a, b) => a - b);

export function findChapterTitle(chapter: number): string | undefined {
  return ALL_BUNPO.flatMap((g) => g.senses ?? []).flatMap((sense) => sense.chapters).find((entry) => entry.chapter === chapter)?.chapterTitle;
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
  currentSenseId: string | null;
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
    currentSenseId: null,
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
  const resolvedCurrent = saved?.currentGrammarId ? resolveBunpoReference(saved.currentGrammarId, saved.currentSenseId ?? undefined) : undefined;
  return {
    selectedLevels: selectedLevels.length > 0 ? selectedLevels : fallback.selectedLevels,
    selectedSources: selectedSources.length > 0 ? selectedSources : fallback.selectedSources,
    selectedChapters: selectedChapters.length > 0 ? selectedChapters : fallback.selectedChapters,
    tryN3Chapter:
      typeof saved?.tryN3Chapter === "number" && TRY_N3_CHAPTERS.some((unit) => unit.chapter === saved.tryN3Chapter)
        ? saved.tryN3Chapter
        : null,
    currentGrammarId: resolvedCurrent?.grammarId ?? null,
    currentSenseId: resolvedCurrent?.senseId ?? null,
    listSearchQuery: saved?.listSearchQuery ?? fallback.listSearchQuery,
    progressFilter: saved?.progressFilter ?? fallback.progressFilter,
  };
}

export function tryN3GrammarIds(chapter: number): Set<string> {
  return new Set(TRY_N3_CHAPTERS.find((unit) => unit.chapter === chapter)?.grammarRefs?.map((reference) => reference.grammarId) ?? []);
}

export function tryN3GrammarRefs(chapter: number): BunpoLegacyReference[] {
  return TRY_N3_CHAPTERS.find((unit) => unit.chapter === chapter)?.grammarRefs ?? [];
}

export function bunpoSenseProgressId(grammarId: string, senseId: string): string {
  return bunpoProgressId(grammarId, senseId);
}

export function matchingBunpoSenses(state: BunpoViewerState, grammar: BunpoGrammarPoint) {
  const senses = grammar.senses ?? [];
  const tryRefs = state.tryN3Chapter !== null && state.selectedSources.includes("try-n3")
    ? new Set(tryN3GrammarRefs(state.tryN3Chapter).map((reference) => `${reference.grammarId}:${reference.senseId}`))
    : null;
  return senses.filter((sense) => {
    if (!sense.levels.some((level) => state.selectedLevels.includes(level))) return false;
    const selectedSourceMatches = sense.sources.filter((source) => state.selectedSources.includes(source));
    if (selectedSourceMatches.length === 0) return false;
    const chapterSources = selectedSourceMatches.filter((source) => source === "theo-chuong");
    const otherSources = selectedSourceMatches.filter((source) => source !== "theo-chuong");
    const matchesCurriculumChapter = chapterSources.length > 0 &&
      sense.chapters.some((chapter) => state.selectedChapters.includes(chapter.chapter));
    if (state.selectedSources.includes("theo-chuong") && chapterSources.length > 0 && otherSources.length === 0 && !matchesCurriculumChapter) return false;
    if (tryRefs && !tryRefs.has(`${grammar.id}:${sense.id}`)) return false;
    return true;
  });
}

export function getFilteredSenseList(state: BunpoViewerState): BunpoStudyItem[] {
  return ALL_BUNPO.flatMap((grammar) => matchingBunpoSenses(state, grammar).map((sense) =>
    toBunpoStudyItem(grammar.id, sense, grammar.pattern, grammar.patternVariants ?? [grammar.pattern]),
  ));
}

export async function saveViewerState(state: BunpoViewerState): Promise<void> {
  await storageSet(STORAGE_KEY, state);
}

// Shared by the Bunpo screen's list filter and the Quiz screen's "Ngữ
// pháp" pool -- so a quiz built from Quiz always respects whatever
// level/source/chapter filter is currently selected on the Bunpo screen,
// same as Kanji/Vocab already do.
export function getFilteredList(state: BunpoViewerState): BunpoGrammarPoint[] {
  return ALL_BUNPO.filter((grammar) => matchingBunpoSenses(state, grammar).length > 0);
}
