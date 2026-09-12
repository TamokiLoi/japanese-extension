import itBookVocabRaw from "../data/it-book-vocab.json";
import itBookVocabBrseLoiRaw from "../data/it-book-vocab-brse-loi.json";
import itBookLessonsRaw from "../data/it-book-lessons.json";
import type { ItBookVocabDataset, ItBookVocabWord, ItBookLessonDataset, ItBookLesson } from "../types/itBook.ts";
import type { ProgressFilter } from "./progressState.ts";
import { storageGet, storageSet } from "../platform/storage";

const dataset = itBookVocabRaw as unknown as ItBookVocabDataset;
const brseLoiDataset = itBookVocabBrseLoiRaw as unknown as ItBookVocabDataset;

export const ALL_IT_BOOK_VOCAB: ItBookVocabWord[] = [...dataset.words, ...brseLoiDataset.words];

const lessonDataset = itBookLessonsRaw as unknown as ItBookLessonDataset;

// The book's 15 reading/dialogue lessons -- OCR'd separately from the vocab
// above (see _scratch/it-book-lessons/ for the extraction pipeline). Kept
// sorted by lessonNumber so ItBookLessonsScreen can index straight into it.
export const ALL_IT_BOOK_LESSONS: ItBookLesson[] = [...lessonDataset.lessons].sort((a, b) => a.lessonNumber - b.lessonNumber);

export function findItBookLessonByNumber(n: number): ItBookLesson | undefined {
  return ALL_IT_BOOK_LESSONS.find((l) => l.lessonNumber === n);
}

// 0 = "Từ thông dụng" (general terms, not tied to one lesson), 1-15 = the
// book's 15 lessons in order -- see `assets/data/it-book/Tango IT.txt`'s
// deck-per-page structure and the book's own mục lục for how these map.
export const LESSON_LABELS: Record<number, string> = {
  0: "Từ thông dụng",
  1: "Bài 1: Tổng quan dự án",
  2: "Bài 2: Báo giá",
  3: "Bài 3: Môi trường phát triển",
  4: "Bài 4: Biên bản họp",
  5: "Bài 5: Xác định yêu cầu",
  6: "Bài 6: Thiết kế cơ bản",
  7: "Bài 7: Thay đổi yêu cầu",
  8: "Bài 8: Thiết kế chi tiết",
  9: "Bài 9: Báo cáo tuần",
  10: "Bài 10: Bảo mật thông tin",
  11: "Bài 11: Quy ước coding",
  12: "Bài 12: Kiểm thử phần mềm",
  13: "Bài 13: Báo cáo chất lượng",
  14: "Bài 14: Release note",
  15: "Bài 15: Khảo sát khách hàng",
  16: "BrSE: Báo & xử lý lỗi",
};

export const AVAILABLE_LESSONS: number[] = Object.keys(LESSON_LABELS).map(Number);

export function countForLesson(lesson: number): number {
  return ALL_IT_BOOK_VOCAB.filter((w) => w.lesson === lesson).length;
}

const IT_BOOK_VOCAB_BY_ID = new Map(ALL_IT_BOOK_VOCAB.map((w) => [w.id, w]));
export function findItBookVocabById(id: string): ItBookVocabWord | undefined {
  return IT_BOOK_VOCAB_BY_ID.get(id);
}

export interface ItBookViewerState {
  selectedLessons: number[];
  randomOrder: boolean;
  shuffleSeed: number;
  index: number;
  progressFilter: ProgressFilter;
  viewMode: "card" | "grid";
}

const STORAGE_KEY = "itBookViewer";

export function defaultViewerState(): ItBookViewerState {
  return {
    selectedLessons: [...AVAILABLE_LESSONS],
    randomOrder: false,
    shuffleSeed: Date.now(),
    index: 0,
    progressFilter: "all",
    viewMode: "grid",
  };
}

export async function loadViewerState(): Promise<ItBookViewerState> {
  const saved = await storageGet<Partial<ItBookViewerState>>(STORAGE_KEY);
  const fallback = defaultViewerState();
  const selectedLessons = (saved?.selectedLessons ?? fallback.selectedLessons).filter((l) => AVAILABLE_LESSONS.includes(l));
  return {
    selectedLessons: selectedLessons.length > 0 ? selectedLessons : fallback.selectedLessons,
    randomOrder: saved?.randomOrder ?? fallback.randomOrder,
    shuffleSeed: saved?.shuffleSeed ?? fallback.shuffleSeed,
    index: saved?.index ?? fallback.index,
    progressFilter: saved?.progressFilter ?? fallback.progressFilter,
    viewMode: saved?.viewMode ?? fallback.viewMode,
  };
}

export async function saveViewerState(state: ItBookViewerState): Promise<void> {
  await storageSet(STORAGE_KEY, state);
}

// Same deterministic PRNG approach as vocabState.ts/kanjiState.ts -- kept as
// its own copy rather than a shared import so each screen's state module
// stays self-contained.
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

export function getOrderedList(state: ItBookViewerState): ItBookVocabWord[] {
  const filtered = ALL_IT_BOOK_VOCAB.filter((w) => state.selectedLessons.includes(w.lesson));
  return state.randomOrder ? seededShuffle(filtered, state.shuffleSeed) : filtered;
}
