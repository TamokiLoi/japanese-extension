import tinhtuRaw from "../data/vocab-tanoshii-tinhtu-n3.json";
import dongtuRaw from "../data/vocab-tanoshii-dongtu-n4.json";
import mimikaraRaw from "../data/vocab-tanoshii-mimikara-n3.json";
import dongnghiaRaw from "../data/vocab-tanoshii-dongnghia-n3.json";
import tangoN3Raw from "../data/vocab-tango-n3.json";
import tangoN4Raw from "../data/vocab-tango-n4.json";
import tuLayRaw from "../data/vocab-tu-lay.json";
import type { TanoshiiVocabDataset, MimikaraDataset, TanoshiiSynonymDataset } from "../types/vocab.ts";
import type { JlptLevel } from "../types/kanji.ts";
import type { ProgressFilter } from "./progressState.ts";
import { storageGet, storageSet } from "../platform/storage";

export type VocabSource = "tinhtu-n3" | "dongtu-n4" | "mimikara-n3" | "dongnghia-n3" | "tango-n3" | "tango-n4" | "tu-lay";

export interface VocabCard {
  id: string;
  word: string;
  reading: string | null;
  level: JlptLevel;
  source: VocabSource;
  hanViet: string[];
  meaningVi: string;
  mnemonic: string[];
  example: string | null;
  exampleVi: string | null;
  synonym: { word: string; reading: string | null } | null;
}

export const SOURCE_LABELS: Record<VocabSource, string> = {
  "tinhtu-n3": "Tính từ N3",
  "dongtu-n4": "Động từ N4",
  "mimikara-n3": "Mimikara N3",
  "dongnghia-n3": "Từ đồng nghĩa N3",
  "tango-n3": "Tango N3",
  "tango-n4": "Tango N4",
  "tu-lay": "Từ láy",
};

// Order sources are listed/filtered in throughout the vocab screen.
export const AVAILABLE_SOURCES: VocabSource[] = [
  "mimikara-n3",
  "dongtu-n4",
  "tinhtu-n3",
  "dongnghia-n3",
  "tango-n3",
  "tango-n4",
  "tu-lay",
];

const tinhtuDataset = tinhtuRaw as unknown as TanoshiiVocabDataset;
const dongtuDataset = dongtuRaw as unknown as TanoshiiVocabDataset;
const mimikaraDataset = mimikaraRaw as unknown as MimikaraDataset;
const dongnghiaDataset = dongnghiaRaw as unknown as TanoshiiSynonymDataset;
// OCR-derived from personal JLPT vocab-book PDFs (see
// assets/data/tango/_ocr_workspace/) rather than hand-authored like the
// tanoshii sets above -- kept as its own source/label so a user who spots
// an OCR slip knows which set it came from, instead of it being silently
// blended into the tanoshii sources.
const tangoN3Dataset = tangoN3Raw as unknown as TanoshiiVocabDataset;
const tangoN4Dataset = tangoN4Raw as unknown as TanoshiiVocabDataset;
const tuLayDataset = tuLayRaw as unknown as TanoshiiVocabDataset;

function fromTanoshiiVocab(source: VocabSource, dataset: TanoshiiVocabDataset): VocabCard[] {
  return dataset.words.map((w) => ({
    id: w.id,
    word: w.word,
    reading: w.reading,
    level: w.level,
    source,
    hanViet: w.hanViet,
    meaningVi: w.meaningVi,
    mnemonic: w.mnemonic,
    example: w.example,
    exampleVi: w.exampleVi,
    synonym: null,
  }));
}

function fromMimikara(dataset: MimikaraDataset): VocabCard[] {
  return dataset.words.map((w) => ({
    id: w.id,
    word: w.word,
    reading: w.reading,
    level: w.level,
    source: "mimikara-n3",
    hanViet: w.hanViet,
    meaningVi: w.meaningVi,
    mnemonic: w.mnemonic,
    example: w.example,
    exampleVi: w.exampleVi,
    synonym: null,
  }));
}

function fromDongnghia(dataset: TanoshiiSynonymDataset): VocabCard[] {
  return dataset.pairs.map((p) => ({
    id: p.id,
    word: p.word,
    reading: p.wordReading,
    level: p.level,
    source: "dongnghia-n3",
    hanViet: [],
    meaningVi: p.meaningVi,
    mnemonic: [],
    example: null,
    exampleVi: null,
    synonym: { word: p.synonym, reading: p.synonymReading },
  }));
}

export const ALL_VOCAB: VocabCard[] = [
  ...fromMimikara(mimikaraDataset),
  ...fromTanoshiiVocab("dongtu-n4", dongtuDataset),
  ...fromTanoshiiVocab("tinhtu-n3", tinhtuDataset),
  ...fromDongnghia(dongnghiaDataset),
  ...fromTanoshiiVocab("tango-n3", tangoN3Dataset),
  ...fromTanoshiiVocab("tango-n4", tangoN4Dataset),
  ...fromTanoshiiVocab("tu-lay", tuLayDataset),
];

export function countForSource(source: VocabSource): number {
  return ALL_VOCAB.filter((v) => v.source === source).length;
}

const VOCAB_BY_ID = new Map(ALL_VOCAB.map((v) => [v.id, v]));
export function findVocabById(id: string): VocabCard | undefined {
  return VOCAB_BY_ID.get(id);
}

export interface VocabViewerState {
  selectedSources: VocabSource[];
  randomOrder: boolean;
  shuffleSeed: number;
  index: number;
  progressFilter: ProgressFilter;
  // "card": one word at a time (the study flow). "grid": an overview tile
  // per word in the current filter, colored by mastery bucket -- mirrors
  // kanjiState.ts's viewMode.
  viewMode: "card" | "grid";
}

const STORAGE_KEY = "vocabViewer";

export function defaultViewerState(): VocabViewerState {
  return {
    selectedSources: ["mimikara-n3", "dongtu-n4", "tinhtu-n3", "tango-n3", "tango-n4"],
    randomOrder: false,
    shuffleSeed: Date.now(),
    index: 0,
    progressFilter: "all",
    viewMode: "card",
  };
}

export async function loadViewerState(): Promise<VocabViewerState> {
  const saved = await storageGet<Partial<VocabViewerState>>(STORAGE_KEY);
  const fallback = defaultViewerState();
  const selectedSources = (saved?.selectedSources ?? fallback.selectedSources).filter((s) =>
    AVAILABLE_SOURCES.includes(s),
  );
  return {
    selectedSources: selectedSources.length > 0 ? selectedSources : fallback.selectedSources,
    randomOrder: saved?.randomOrder ?? fallback.randomOrder,
    shuffleSeed: saved?.shuffleSeed ?? fallback.shuffleSeed,
    index: saved?.index ?? fallback.index,
    progressFilter: saved?.progressFilter ?? fallback.progressFilter,
    viewMode: saved?.viewMode ?? fallback.viewMode,
  };
}

export async function saveViewerState(state: VocabViewerState): Promise<void> {
  await storageSet(STORAGE_KEY, state);
}

// Same deterministic PRNG approach as kanjiState.ts -- kept as a separate
// copy rather than a shared import so each screen's state module stays
// self-contained.
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

export function getOrderedList(state: VocabViewerState): VocabCard[] {
  const filtered = ALL_VOCAB.filter((v) => state.selectedSources.includes(v.source));
  return state.randomOrder ? seededShuffle(filtered, state.shuffleSeed) : filtered;
}

// Used when jumping to a specific vocab card from elsewhere (a "chữ Hán
// này xuất hiện trong" link on a Kanji card, a search result). Widens the
// current source filter to include the target's source if excluded, and
// clears the progress filter so it can't hide the very card being jumped
// to. Returns null if the id doesn't exist in the dataset at all.
export function resolveJumpState(state: VocabViewerState, targetId: string): VocabViewerState | null {
  const target = findVocabById(targetId);
  if (!target) return null;
  const newState: VocabViewerState = {
    ...state,
    selectedSources: state.selectedSources.includes(target.source)
      ? state.selectedSources
      : [...state.selectedSources, target.source],
    progressFilter: "all",
    viewMode: "card",
  };
  const list = getOrderedList(newState);
  const index = list.findIndex((v) => v.id === targetId);
  if (index === -1) return null;
  return { ...newState, index };
}

// Used by reminder notifications (both the real periodic alarm and the
// "Thu ngay" test button) so they only ever show a word from the sources
// the user currently has selected in the vocab viewer, instead of all
// sources -- mirrors kanjiState.ts's pickReminderKanji.
export async function pickReminderVocab(): Promise<VocabCard> {
  const state = await loadViewerState();
  const pool = ALL_VOCAB.filter((v) => state.selectedSources.includes(v.source));
  const list = pool.length > 0 ? pool : ALL_VOCAB;
  return list[Math.floor(Math.random() * list.length)];
}
