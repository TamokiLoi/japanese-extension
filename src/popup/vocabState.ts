import tinhtuRaw from "../data/vocab-tanoshii-tinhtu-n3.json";
import dongtuRaw from "../data/vocab-tanoshii-dongtu-n4.json";
import mimikaraRaw from "../data/vocab-tanoshii-mimikara-n3.json";
import dongnghiaRaw from "../data/vocab-tanoshii-dongnghia-n3.json";
import tangoN3Raw from "../data/vocab-tango-n3.json";
import tangoN4Raw from "../data/vocab-tango-n4.json";
import tangoN5Raw from "../data/vocab-tango-n5.json";
import tangoN2Raw from "../data/vocab-tango-n2.json";
import tangoN1Raw from "../data/vocab-tango-n1.json";
import tuLayRaw from "../data/vocab-tu-lay.json";
import trangtu91Raw from "../data/vocab-trangtu-91.json";
import dongtu200Raw from "../data/vocab-dongtu-200.json";
import dongtuHinxu280Raw from "../data/vocab-dongtu-280-hinxu.json";
import dongtuExtraRaw from "../data/vocab-dongtu-extra-n3n4.json";
import tuGhepDongtuRaw from "../data/vocab-tu-ghep-dongtu.json";
import tangoNewRaw from "../data/vocab-tango-new.json";
import type { TanoshiiVocabDataset, MimikaraDataset, TanoshiiSynonymDataset, VerbConjugations } from "../types/vocab.ts";
import type { JlptLevel } from "../types/kanji.ts";
import type { ProgressFilter } from "./progressState.ts";
import { storageGet, storageSet } from "../platform/storage";

export type VocabSource =
  | "tinhtu-n3"
  | "dongtu"
  | "mimikara-n3"
  | "dongnghia-n3"
  | "tango-n3"
  | "tango-n4"
  | "tango-n5"
  | "tango-n2"
  | "tango-n1"
  | "tu-lay"
  | "trangtu-91"
  | "tu-ghep-dongtu"
  | "tango-new";

export interface VocabCard {
  id: string;
  word: string;
  reading: string | null;
  level: JlptLevel;
  // Cùng 1 từ có thể xuất hiện ở nhiều bộ (vd vừa có trong Mimikara vừa có
  // trong Tango bổ sung) -- khi đó mergeDuplicateVocab() gộp lại thành 1
  // thẻ duy nhất, liệt kê đủ các nguồn ở đây thay vì tạo thẻ trùng lặp cho
  // mỗi nguồn (giống cách BunpoGrammarPoint.sources đã làm).
  sources: VocabSource[];
  hanViet: string[];
  meaningVi: string;
  mnemonic: string[];
  example: string | null;
  exampleVi: string | null;
  synonym: { word: string; reading: string | null } | null;
  // Chỉ áp dụng cho các nguồn động từ (tra cứu từ mazii.net / suy ra lúc convert).
  verbGroup?: string;
  transitivity?: string;
  conjugations?: VerbConjugations;
}

export const SOURCE_LABELS: Record<VocabSource, string> = {
  "tinhtu-n3": "Tính từ N3",
  dongtu: "Động từ N3-N4",
  "mimikara-n3": "Mimikara N3",
  "dongnghia-n3": "Từ đồng nghĩa N3",
  "tango-n3": "Tango N3",
  "tango-n4": "Tango N4",
  "tango-n5": "Tango N5",
  "tango-n2": "Tango N2",
  "tango-n1": "Tango N1",
  "tu-lay": "Từ láy",
  "trangtu-91": "91 trạng từ thường dùng",
  "tu-ghep-dongtu": "Động từ ghép",
  "tango-new": "Tango bổ sung",
};

// Order sources are listed/filtered in throughout the vocab screen.
export const AVAILABLE_SOURCES: VocabSource[] = [
  "mimikara-n3",
  "dongtu",
  "tinhtu-n3",
  "dongnghia-n3",
  "tango-n3",
  "tango-n4",
  "tango-n5",
  "tango-n2",
  "tango-n1",
  "tu-lay",
  "trangtu-91",
  "tu-ghep-dongtu",
  "tango-new",
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
const tangoN5Dataset = tangoN5Raw as unknown as TanoshiiVocabDataset;
const tangoN2Dataset = tangoN2Raw as unknown as TanoshiiVocabDataset;
const tangoN1Dataset = tangoN1Raw as unknown as TanoshiiVocabDataset;
const tuLayDataset = tuLayRaw as unknown as TanoshiiVocabDataset;
const trangtu91Dataset = trangtu91Raw as unknown as TanoshiiVocabDataset;
// "dongtu" gộp 3 nguồn động từ N3-N4 (tanoshii N4, 200 động từ Thu Hương,
// 280 động từ Hinxu Tanoshii) thành 1 nhóm chung -- đã dedup theo
// kanji+reading giữa 3 file lúc convert (xem meta.notes trong từng file),
// nên coi các entry này là rời rạc, không trùng lặp nhau khi gộp ở đây.
const dongtu200Dataset = dongtu200Raw as unknown as TanoshiiVocabDataset;
const dongtuHinxu280Dataset = dongtuHinxu280Raw as unknown as TanoshiiVocabDataset;
const dongtuExtraDataset = dongtuExtraRaw as unknown as TanoshiiVocabDataset;
const tuGhepDongtuDataset = tuGhepDongtuRaw as unknown as TanoshiiVocabDataset;
const tangoNewDataset = tangoNewRaw as unknown as TanoshiiVocabDataset;

function fromTanoshiiVocab(source: VocabSource, dataset: TanoshiiVocabDataset): VocabCard[] {
  return dataset.words.map((w) => ({
    id: w.id,
    word: w.word,
    reading: w.reading,
    level: w.level,
    sources: [source],
    hanViet: w.hanViet,
    meaningVi: w.meaningVi,
    mnemonic: w.mnemonic,
    example: w.example,
    exampleVi: w.exampleVi,
    synonym: null,
    verbGroup: w.verbGroup,
    transitivity: w.transitivity,
    conjugations: w.conjugations,
  }));
}

function fromMimikara(dataset: MimikaraDataset): VocabCard[] {
  return dataset.words.map((w) => ({
    id: w.id,
    word: w.word,
    reading: w.reading,
    level: w.level,
    sources: ["mimikara-n3"],
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
    sources: ["dongnghia-n3"],
    hanViet: [],
    meaningVi: p.meaningVi,
    mnemonic: [],
    example: null,
    exampleVi: null,
    synonym: { word: p.synonym, reading: p.synonymReading },
  }));
}

// Cùng 1 từ (word+reading trùng khớp) có thể tới từ nhiều bộ khác nhau --
// gộp thành 1 thẻ duy nhất thay vì để trùng lặp trong danh sách/luyện tập.
// Thẻ đầu tiên gặp trong mảng đầu vào (theo thứ tự khai báo ở ALL_VOCAB bên
// dưới, Mimikara luôn đứng trước) làm "chính": giữ nguyên id/level của nó
// để không phá tiến độ học (mastered/flagged) đã lưu theo id đó, chỉ bổ
// sung field nào đang rỗng bằng field tương ứng từ các bản trùng khác (vd
// Mimikara thiếu example/mnemonic thì lấy từ Tango bổ sung, còn hanViet của
// Mimikara vẫn được giữ nếu Tango bổ sung không có).
function mergeDuplicateVocab(cards: VocabCard[]): VocabCard[] {
  const groups = new Map<string, VocabCard[]>();
  for (const c of cards) {
    const key = `${c.word}|${c.reading ?? ""}`;
    const group = groups.get(key);
    if (group) group.push(c);
    else groups.set(key, [c]);
  }

  const merged: VocabCard[] = [];
  for (const group of groups.values()) {
    if (group.length === 1) {
      merged.push(group[0]);
      continue;
    }
    const [primary, ...rest] = group;
    const pick = <T,>(get: (c: VocabCard) => T | null | undefined, isEmpty: (v: T) => boolean): T | undefined => {
      const primaryVal = get(primary);
      if (primaryVal != null && !isEmpty(primaryVal)) return primaryVal;
      for (const c of rest) {
        const v = get(c);
        if (v != null && !isEmpty(v)) return v;
      }
      return primaryVal ?? undefined;
    };
    merged.push({
      ...primary,
      sources: group.flatMap((c) => c.sources),
      hanViet: pick((c) => c.hanViet, (v: string[]) => v.length === 0) ?? [],
      mnemonic: pick((c) => c.mnemonic, (v: string[]) => v.length === 0) ?? [],
      example: pick((c) => c.example, (v: string | null) => !v) ?? null,
      exampleVi: pick((c) => c.exampleVi, (v: string | null) => !v) ?? null,
      verbGroup: pick((c) => c.verbGroup, (v: string) => !v),
      transitivity: pick((c) => c.transitivity, (v: string) => !v),
      conjugations: pick((c) => c.conjugations, (v: VerbConjugations) => !v || Object.keys(v).length === 0),
    });
  }
  return merged;
}

export const ALL_VOCAB: VocabCard[] = mergeDuplicateVocab([
  ...fromMimikara(mimikaraDataset),
  ...fromTanoshiiVocab("dongtu", dongtuDataset),
  ...fromTanoshiiVocab("dongtu", dongtu200Dataset),
  ...fromTanoshiiVocab("dongtu", dongtuHinxu280Dataset),
  ...fromTanoshiiVocab("dongtu", dongtuExtraDataset),
  ...fromTanoshiiVocab("tinhtu-n3", tinhtuDataset),
  ...fromDongnghia(dongnghiaDataset),
  ...fromTanoshiiVocab("tango-n3", tangoN3Dataset),
  ...fromTanoshiiVocab("tango-n4", tangoN4Dataset),
  ...fromTanoshiiVocab("tango-n5", tangoN5Dataset),
  ...fromTanoshiiVocab("tango-n2", tangoN2Dataset),
  ...fromTanoshiiVocab("tango-n1", tangoN1Dataset),
  ...fromTanoshiiVocab("tu-lay", tuLayDataset),
  ...fromTanoshiiVocab("trangtu-91", trangtu91Dataset),
  ...fromTanoshiiVocab("tu-ghep-dongtu", tuGhepDongtuDataset),
  ...fromTanoshiiVocab("tango-new", tangoNewDataset),
]);

export function countForSource(source: VocabSource): number {
  return ALL_VOCAB.filter((v) => v.sources.includes(source)).length;
}

const LEVEL_ORDER: JlptLevel[] = ["N5", "N4", "N3", "N2", "N1"];
export const AVAILABLE_LEVELS: JlptLevel[] = LEVEL_ORDER.filter((level) => ALL_VOCAB.some((v) => v.level === level));

export function countForLevel(level: JlptLevel): number {
  return ALL_VOCAB.filter((v) => v.level === level).length;
}

const VOCAB_BY_ID = new Map(ALL_VOCAB.map((v) => [v.id, v]));
export function findVocabById(id: string): VocabCard | undefined {
  return VOCAB_BY_ID.get(id);
}

export interface VocabViewerState {
  selectedSources: VocabSource[];
  selectedLevels: JlptLevel[];
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
    selectedSources: ["mimikara-n3", "dongtu", "tinhtu-n3", "tango-n3", "tango-n4", "tango-n5"],
    selectedLevels: [...AVAILABLE_LEVELS],
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
  const selectedLevels = (saved?.selectedLevels ?? fallback.selectedLevels).filter((l) => AVAILABLE_LEVELS.includes(l));
  return {
    selectedSources: selectedSources.length > 0 ? selectedSources : fallback.selectedSources,
    selectedLevels: selectedLevels.length > 0 ? selectedLevels : fallback.selectedLevels,
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

function matchesFilters(v: VocabCard, state: VocabViewerState): boolean {
  return v.sources.some((s) => state.selectedSources.includes(s)) && state.selectedLevels.includes(v.level);
}

export function getOrderedList(state: VocabViewerState): VocabCard[] {
  const filtered = ALL_VOCAB.filter((v) => matchesFilters(v, state));
  return state.randomOrder ? seededShuffle(filtered, state.shuffleSeed) : filtered;
}

// Used when jumping to a specific vocab card from elsewhere (a "chữ Hán
// này xuất hiện trong" link on a Kanji card, a search result). Widens the
// current source/level filter to include the target's if excluded, and
// clears the progress filter so it can't hide the very card being jumped
// to. Returns null if the id doesn't exist in the dataset at all.
export function resolveJumpState(state: VocabViewerState, targetId: string): VocabViewerState | null {
  const target = findVocabById(targetId);
  if (!target) return null;
  const missingSources = target.sources.filter((s) => !state.selectedSources.includes(s));
  const missingLevel = state.selectedLevels.includes(target.level) ? [] : [target.level];
  const newState: VocabViewerState = {
    ...state,
    selectedSources: missingSources.length === 0 ? state.selectedSources : [...state.selectedSources, ...missingSources],
    selectedLevels: missingLevel.length === 0 ? state.selectedLevels : [...state.selectedLevels, ...missingLevel],
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
  const pool = ALL_VOCAB.filter((v) => matchesFilters(v, state));
  const list = pool.length > 0 ? pool : ALL_VOCAB;
  return list[Math.floor(Math.random() * list.length)];
}
