// Sequences each content type through its actual sách/nguồn (easy -> hard),
// so the roadmap can answer "học sách nào bây giờ" instead of just "N mục
// mới/ngày" pooled across whatever's currently selected elsewhere. A "stop"
// is done once none of its items are still in the "new" progress bucket --
// adaptive to real progress rather than a fixed calendar, so it self-
// corrects if the user studies faster/slower than planned. The "current"
// stop for a type is the first not-done one in curriculum order.
import { ALL_KANJI, loadViewerState as loadKanjiViewerState, saveViewerState as saveKanjiViewerState } from "../../popup/kanjiState.ts";
import {
  ALL_VOCAB,
  AVAILABLE_SOURCES as VOCAB_AVAILABLE_SOURCES,
  SOURCE_LABELS as VOCAB_SOURCE_LABELS,
  loadViewerState as loadVocabViewerState,
  saveViewerState as saveVocabViewerState,
  type VocabSource,
} from "../../popup/vocabState.ts";
import {
  ALL_BUNPO,
  AVAILABLE_SOURCES as BUNPO_AVAILABLE_SOURCES,
  AVAILABLE_LEVELS as BUNPO_AVAILABLE_LEVELS,
  AVAILABLE_CHAPTERS as BUNPO_AVAILABLE_CHAPTERS,
  SOURCE_LABELS as BUNPO_SOURCE_LABELS,
  loadViewerState as loadBunpoViewerState,
  saveViewerState as saveBunpoViewerState,
} from "../../popup/bunpoState.ts";
import type { BunpoSource } from "../../types/bunpo.ts";
import {
  ALL_READING_QUESTIONS,
  AVAILABLE_BOOKS as READING_AVAILABLE_BOOKS,
  AVAILABLE_LEVELS as READING_AVAILABLE_LEVELS,
  AVAILABLE_LENGTHS as READING_AVAILABLE_LENGTHS,
  BOOK_LABELS as READING_BOOK_LABELS,
  BOOK_DIFFICULTY_NOTE,
  loadViewerState as loadReadingViewerState,
  saveViewerState as saveReadingViewerState,
} from "../../popup/readingState.ts";
import type { ReadingBook } from "../../types/reading.ts";
import {
  ALL_LISTENING,
  AVAILABLE_BOOKS as LISTENING_AVAILABLE_BOOKS,
  AVAILABLE_TASK_TYPES as LISTENING_AVAILABLE_TASK_TYPES,
  BOOK_LABELS as LISTENING_BOOK_LABELS,
  loadViewerState as loadListeningViewerState,
  saveViewerState as saveListeningViewerState,
} from "../../popup/listeningState.ts";
import { loadProgressMap, bucketFor, type ProgressMap } from "../../popup/progressState.ts";
import { PLAN_TYPES, type PlanType } from "../../popup/dailyPlanState.ts";
import type { JlptLevel } from "../../types/kanji.ts";

interface Stop {
  key: string;
  label: string;
  items: { id: string }[];
  note?: string;
  // false marks a stop as bonus/optional -- still listed (e.g. in the "Toàn
  // bộ lộ trình" view) and still reachable, but skipped when deciding
  // whether the type as a whole counts as "done enough" to stop gating the
  // roadmap. Grammar in particular aggregates 7 separate real N3 grammar
  // books -- requiring every one of them in sequence before the roadmap
  // considers "Ngữ pháp" finished is far more than needed to pass N3 (one
  // book's worth, ~150-200 points, is the realistic bar); the rest stay
  // available as optional extra practice. Defaults to true (required).
  required?: boolean;
}

export interface StopStatus {
  key: string;
  label: string;
  total: number;
  remainingNew: number;
  masteredCount: number;
  done: boolean;
  note?: string;
  required: boolean;
}

// A stop counts as "done" (ready to move to the next one) once at least
// this fraction of its items are genuinely "đã thuộc" (mastered -- correct
// streak across every quiz direction, see progressState.ts), not merely
// "opened once". Deliberately NOT 100%: a handful of stubbornly hard/
// easily-forgotten words would otherwise block the whole roadmap from ever
// advancing past that one stop -- those stragglers still show up in "Cần
// ôn lại"/Ôn tập as normal, they just don't gate progress here.
const MASTERY_ADVANCE_THRESHOLD = 0.9;

export interface TypeCurriculum {
  stops: StopStatus[];
  // Index into `stops` of the first not-done one; null once every stop is done.
  currentIndex: number | null;
}

// The roadmap targets N3 -- Kanji/Vocab/Bunpo all also pull in N4 (per user
// request: N4 is worth reviewing alongside N3, but N5 is assumed already
// known by the time someone is aiming for N3, so it's dropped instead of
// re-taught). A source's items are filtered down to N4/N3 only even when
// that source itself mixes wider levels (e.g. "dongtu" spans N3-N5,
// "trangtu-91" spans N2-N5) -- a stop that ends up with 0 items after
// filtering (tango-n5) is dropped from the sequence entirely rather than
// shown as an empty stop.
const INCLUDE_LEVELS: JlptLevel[] = ["N4", "N3"];
const KANJI_LEVEL_ORDER: JlptLevel[] = INCLUDE_LEVELS;
const KANJI_STOPS: Stop[] = KANJI_LEVEL_ORDER.filter((lvl) => ALL_KANJI.some((k) => k.level === lvl)).map((lvl) => ({
  key: lvl,
  label: `Kanji ${lvl}`,
  items: ALL_KANJI.filter((k) => k.level === lvl),
}));

// Curated pedagogical order (easy -> hard) towards N3, not the vocab
// screen's own filter-list order -- deliberately excludes tango-n2/tango-n1
// (above N3, not needed to pass N3); tango-n5 is listed here too but drops
// out below once filtered to N4/N3-only (0 items left, it's pure N5).
const VOCAB_ORDER: VocabSource[] = [
  "tango-n5",
  "tango-n4",
  "mimikara-n3",
  "tango-n3",
  "dongtu",
  "tinhtu-n3",
  "trangtu-91",
  "tu-lay",
  "dongnghia-n3",
];
const VOCAB_STOPS: Stop[] = VOCAB_ORDER.filter((s) => VOCAB_AVAILABLE_SOURCES.includes(s))
  .map((s) => ({
    key: s,
    label: VOCAB_SOURCE_LABELS[s],
    items: ALL_VOCAB.filter((v) => v.sources.includes(s) && INCLUDE_LEVELS.includes(v.level)),
  }))
  .filter((stop) => stop.items.length > 0);

// bunpoState.ts's own AVAILABLE_SOURCES order is already curated
// (theo-chuong first) -- reuse it as-is rather than inventing a new one.
// Only these 2 count as "required" -- together they're already a full N3
// grammar pass (structured by chapter + everything confirmed to have shown
// up in real past exams); the other 5 sources are each their OWN separate
// full N3 grammar book, so going through all 7 in sequence would be well
// past what's needed to pass N3 (per user request, 2026-09-06).
const BUNPO_REQUIRED_SOURCES: BunpoSource[] = ["theo-chuong", "jlpt-da-ra"];
const BUNPO_STOPS: Stop[] = BUNPO_AVAILABLE_SOURCES.map((s) => ({
  key: s,
  label: BUNPO_SOURCE_LABELS[s],
  items: ALL_BUNPO.filter((g) => g.sources.includes(s) && INCLUDE_LEVELS.includes(g.level)),
  required: BUNPO_REQUIRED_SOURCES.includes(s),
})).filter((stop) => stop.items.length > 0);

// readingState.ts's BOOK_ORDER is already easy -> hard (speedmaster first,
// per BOOK_DIFFICULTY_NOTE) -- reuse it as-is.
const READING_STOPS: Stop[] = READING_AVAILABLE_BOOKS.map((b) => ({
  key: b,
  label: READING_BOOK_LABELS[b],
  items: ALL_READING_QUESTIONS.filter((q) => q.book === b),
  note: BOOK_DIFFICULTY_NOTE[b],
}));

// listeningState.ts's BOOK_ORDER puts the lower-confidence AI-inferred
// "dethi-2025-12" book last -- reuse it as-is.
const LISTENING_STOPS: Stop[] = LISTENING_AVAILABLE_BOOKS.map((b) => ({
  key: b,
  label: LISTENING_BOOK_LABELS[b],
  items: ALL_LISTENING.filter((q) => q.book === b),
}));

const STOPS_BY_TYPE: Record<PlanType, Stop[]> = {
  kanji: KANJI_STOPS,
  vocab: VOCAB_STOPS,
  bunpo: BUNPO_STOPS,
  reading: READING_STOPS,
  listening: LISTENING_STOPS,
};

export function stopItems(type: PlanType, key: string): { id: string }[] {
  return STOPS_BY_TYPE[type].find((s) => s.key === key)?.items ?? [];
}

function buildTypeCurriculum(stops: Stop[], map: ProgressMap): TypeCurriculum {
  const statuses: StopStatus[] = stops.map((s) => {
    let remainingNew = 0;
    let masteredCount = 0;
    for (const it of s.items) {
      const bucket = bucketFor(map[it.id]);
      if (bucket === "new") remainingNew++;
      if (bucket === "mastered") masteredCount++;
    }
    const total = s.items.length;
    const done = total > 0 && masteredCount / total >= MASTERY_ADVANCE_THRESHOLD;
    return { key: s.key, label: s.label, total, remainingNew, masteredCount, done, note: s.note, required: s.required !== false };
  });
  // Only required stops gate "is this type done enough" -- an optional/
  // bonus stop left untouched never blocks the roadmap from considering the
  // type finished, though it's still reachable (e.g. from "Toàn bộ lộ
  // trình") for anyone who wants the extra practice.
  const currentIndex = statuses.findIndex((s) => s.required && !s.done);
  return { stops: statuses, currentIndex: currentIndex === -1 ? null : currentIndex };
}

export type RoadmapCurricula = Record<PlanType, TypeCurriculum>;

export async function loadCurricula(): Promise<RoadmapCurricula> {
  const map = await loadProgressMap();
  const result = {} as RoadmapCurricula;
  for (const type of PLAN_TYPES) result[type] = buildTypeCurriculum(STOPS_BY_TYPE[type], map);
  return result;
}

// Narrows that content type's OWN filter down to exactly the given stop
// (per user's explicit choice: clicking a roadmap row should land already
// filtered to today's source, not require re-picking it). Resets every
// other filter dimension on that screen back to "all" so what the screen
// then shows matches exactly the stop's item pool this curriculum computed
// against -- never touches other screens' filters.
export async function jumpToKanjiStop(level: JlptLevel): Promise<void> {
  const state = await loadKanjiViewerState();
  await saveKanjiViewerState({ ...state, selectedLevels: [level], viewMode: "grid", index: 0 });
}

export async function jumpToVocabStop(source: VocabSource): Promise<void> {
  const state = await loadVocabViewerState();
  await saveVocabViewerState({ ...state, selectedSources: [source], viewMode: "grid", index: 0 });
}

export async function jumpToBunpoStop(source: BunpoSource): Promise<void> {
  const state = await loadBunpoViewerState();
  await saveBunpoViewerState({
    ...state,
    selectedSources: [source],
    selectedLevels: [...BUNPO_AVAILABLE_LEVELS],
    selectedChapters: [...BUNPO_AVAILABLE_CHAPTERS],
  });
}

export async function jumpToReadingStop(book: ReadingBook): Promise<void> {
  const state = await loadReadingViewerState();
  await saveReadingViewerState({
    ...state,
    selectedBooks: [book],
    selectedLevels: [...READING_AVAILABLE_LEVELS],
    selectedLengths: [...READING_AVAILABLE_LENGTHS],
  });
}

export async function jumpToListeningStop(book: string): Promise<void> {
  const state = await loadListeningViewerState();
  await saveListeningViewerState({ ...state, selectedBooks: [book], selectedTaskTypes: [...LISTENING_AVAILABLE_TASK_TYPES] });
}

export async function jumpToStop(type: PlanType, key: string): Promise<void> {
  if (type === "kanji") await jumpToKanjiStop(key as JlptLevel);
  else if (type === "vocab") await jumpToVocabStop(key as VocabSource);
  else if (type === "bunpo") await jumpToBunpoStop(key as BunpoSource);
  else if (type === "reading") await jumpToReadingStop(key as ReadingBook);
  else if (type === "listening") await jumpToListeningStop(key);
}
