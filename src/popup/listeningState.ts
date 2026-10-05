// listening-soumatome-n3.json: real questions from Nihongo Sou Matome N3
// Choukai's answer+script booklet -- real printed answers (not AI-inferred)
// and real audio (ripped from the book's own CDs, hosted as GitHub Release
// assets referenced by audioUrl -- not bundled into the repo/extension, see
// scripts/extract-soumatome-listening.ts for how this was built).
//
// listening-poc.json (Gemini-scripted + Gemini TTS demo item) is kept on
// disk as a sanity-check fixture for the audio-generation mechanism, but
// deliberately left out of ALL_LISTENING now that real book content exists
// -- mixing a synthetic voice in with real CD audio would be confusing.
import listeningSoumatomeRaw from "../data/listening-soumatome-n3.json";
import listeningSpeedmasterRaw from "../data/listening-speedmaster-n3.json";
import listeningShinkanzenRaw from "../data/listening-shinkanzen-n3.json";
// listening-dethi-2025-12.json: đủ 28 câu nghe N3 T12/2025. Mondai 1/2 có
// lựa chọn in trên đề giấy; Mondai 3/4/5 có transcript/đáp án do Gemini nghe
// audio suy luận và đã được kiểm tra thủ công (xem field `notes` từng câu).
import listeningDethi202512Raw from "../data/listening-dethi-2025-12.json";
import listeningDethiN3July2024Raw from "../data/listening-dethi-n3-2024-07.json";
import listeningDethiN3Dec2024Raw from "../data/listening-dethi-n3-2024-12.json";
// N3 T7/2025 practice questions use the source's separate script booklet;
// spoken choices stay audio-only for 問題3/4/5. Q20/Q21 follow the printed
// source answer keys; Q18 uses the audio-verified answer after a key typo.
import listeningDethiN3July2025Raw from "../data/listening-dethi-n3-2025-07.json";
import listeningDethiN1July2026Raw from "../data/listening-dethi-n1-2026-07.json";
import listeningDethiN3July2026Raw from "../data/listening-dethi-n3-2026-07.json";
// listening-cacnam-2020-12.json: Mondai 1 (6 cau) cua phan 聴解 de thi that
// N3 T12/2020, tu assets/data/de-thi-cac-nam/ -- KHAC listening-dethi-2025-12
// o cho nguon nay CO dap an in san that cho ca phan nghe (khong phai AI suy
// luan), va de PDF co in day du lua chon cho ca cau tranh (3ban/6ban dung
// optionsImage). Pilot 6/28 cau cua rieng de T12/2020; 11 ky con lai + Mondai
// 2/3/4/5 cua chinh de nay chua convert.
import listeningCacNam202012Raw from "../data/listening-cacnam-2020-12.json";
// listening-kaiwa-100cau.json: 100 câu hội thoại thường ngày ngắn (KHÔNG
// phải nội dung 聴解 JLPT thật -- nguồn là 1 infographic tổng hợp câu giao
// tiếp, TTS bằng Gemini) -- thêm chủ yếu để làm giàu "Nghe chép chính tả"
// hơn là 1 câu hỏi nghe hiểu thật. taskType cố tình để "gaiyou" như một
// bucket nghe tổng quát, nhưng UI và referenceTextFor() phải loại riêng book
// này khỏi quy tắc audio-only của 問題3/4/5: các lựa chọn nghĩa tiếng Việt là
// dữ liệu quiz tự sinh, không hề được đọc trong audio.
import listeningKaiwa100cauRaw from "../data/listening-kaiwa-100cau.json";
import type { ListeningDataset, ListeningQuestion, ListeningTaskType } from "../types/listening.ts";
import { storageGet, storageSet } from "../platform/storage";

const soumatomeDataset = listeningSoumatomeRaw as unknown as ListeningDataset;
const speedmasterDataset = listeningSpeedmasterRaw as unknown as ListeningDataset;
const shinkanzenDataset = listeningShinkanzenRaw as unknown as ListeningDataset;
const dethi202512Dataset = listeningDethi202512Raw as unknown as ListeningDataset;
const dethiN3July2024Dataset = listeningDethiN3July2024Raw as unknown as ListeningDataset;
const dethiN3Dec2024Dataset = listeningDethiN3Dec2024Raw as unknown as ListeningDataset;
const dethiN3July2025Dataset = listeningDethiN3July2025Raw as unknown as ListeningDataset;
const dethiN1July2026Dataset = listeningDethiN1July2026Raw as unknown as ListeningDataset;
const dethiN3July2026Dataset = listeningDethiN3July2026Raw as unknown as ListeningDataset;
const cacNam202012Dataset = listeningCacNam202012Raw as unknown as ListeningDataset;
const kaiwa100cauDataset = listeningKaiwa100cauRaw as unknown as ListeningDataset;

// Shinkanzen 039-053 are unfinished source-book placeholders: they have no
// real choices/audio-derived answers yet (only numbered labels/instructions),
// so keep them in the source JSON but out of practice and dictation pools.
const incompleteShinkanzenQuestionIds = new Set(
  Array.from({ length: 15 }, (_, index) => `listening-shinkanzen-n3-${String(index + 39).padStart(3, "0")}`),
);
const completeShinkanzenQuestions = shinkanzenDataset.questions.filter(
  (question) => !incompleteShinkanzenQuestionIds.has(question.id),
);

const completeDethi202512Questions = dethi202512Dataset.questions;

export const ALL_LISTENING: ListeningQuestion[] = [
  ...soumatomeDataset.questions,
  ...speedmasterDataset.questions,
  ...completeShinkanzenQuestions,
  ...dethiN3July2024Dataset.questions,
  ...dethiN3Dec2024Dataset.questions,
  ...completeDethi202512Questions,
  ...dethiN3July2025Dataset.questions,
  ...dethiN1July2026Dataset.questions,
  ...dethiN3July2026Dataset.questions,
  // N3 T12/2020 remains a 6/28 pilot and stays out of the book filter until
  // its complete listening section has been converted.
  ...kaiwa100cauDataset.questions,
];

const LISTENING_BY_ID = new Map(ALL_LISTENING.map((q) => [q.id, q]));
export function findListeningById(id: string): ListeningQuestion | undefined {
  return LISTENING_BY_ID.get(id);
}

export const TASK_TYPE_LABELS: Record<ListeningTaskType, string> = {
  kadai: "課題理解 -- việc cần làm",
  point: "ポイント理解 -- trọng điểm",
  gaiyou: "概要理解 -- khái quát",
  hatsugen: "発話表現 -- biểu hiện lời nói",
  sokuji: "即時応答 -- phản xạ nhanh",
  sougou: "統合理解 -- hiểu tổng hợp",
};

const TASK_TYPE_ORDER: ListeningTaskType[] = ["kadai", "point", "gaiyou", "hatsugen", "sokuji", "sougou"];
export const AVAILABLE_TASK_TYPES: ListeningTaskType[] = TASK_TYPE_ORDER.filter((t) =>
  ALL_LISTENING.some((q) => q.taskType === t),
);

export const BOOK_LABELS: Record<string, string> = {
  soumatome: "Nihongo Sou Matome N3 Choukai",
  speedmaster: "Speed Master N3 Choukai",
  shinkanzen: "Shin Kanzen Master N3 Choukai",
  "dethi-n3-2024-07": "Đề thi thật N3 T7/2024 (28 câu nghe)",
  "dethi-n3-2024-12": "Đề thi thật N3 T12/2024 (28 câu nghe)",
  "dethi-2025-12": "Đề thi thật N3 T12/2025 (28 câu nghe)",
  "dethi-n3-2025-07": "Đề thi thật N3 T7/2025 (28 câu nghe)",
  "dethi-n1-2026-07": "Đề thi thật N1 T7/2026 (30 câu nghe)",
  "dethi-n3-2026-07": "Đề thi thật N3 T7/2026 (28 câu nghe)",
  "cacnam-2020-12": "Đề thi thật N3 T12/2020 (聴解, 6/28 câu -- Mondai 1)",
  "kaiwa-100cau": "100 câu giao tiếp thường ngày (Kaiwa)",
};

const BOOK_ORDER: string[] = ["soumatome", "speedmaster", "shinkanzen", "dethi-n3-2024-07", "dethi-n3-2024-12", "dethi-2025-12", "dethi-n3-2025-07", "dethi-n1-2026-07", "dethi-n3-2026-07", "kaiwa-100cau"];
export const AVAILABLE_BOOKS: string[] = BOOK_ORDER.filter((b) => ALL_LISTENING.some((q) => q.book === b));

export interface ListeningViewerState {
  selectedBooks: string[];
  selectedTaskTypes: ListeningTaskType[];
}

const STORAGE_KEY = "listeningViewer";

export function defaultViewerState(): ListeningViewerState {
  return {
    selectedBooks: [...AVAILABLE_BOOKS],
    selectedTaskTypes: [...AVAILABLE_TASK_TYPES],
  };
}

export async function loadViewerState(): Promise<ListeningViewerState> {
  const saved = await storageGet<Partial<ListeningViewerState>>(STORAGE_KEY);
  const fallback = defaultViewerState();
  const selectedBooks = (saved?.selectedBooks ?? fallback.selectedBooks).filter((b) => AVAILABLE_BOOKS.includes(b));
  // Before the five-way split, "all types" was persisted as these four
  // values. Add the new bucket only for that legacy all-types selection;
  // preserve a deliberate single-type/custom filter such as sokuji-only.
  const savedTaskTypes = saved?.selectedTaskTypes;
  const legacyAllTaskTypes =
    savedTaskTypes?.length === 4 && ["kadai", "point", "gaiyou", "sokuji"].every((t) => savedTaskTypes.includes(t as ListeningTaskType));
  const legacyFiveTypeAll =
    savedTaskTypes?.length === 5 && ["kadai", "point", "gaiyou", "hatsugen", "sokuji"].every((t) => savedTaskTypes.includes(t as ListeningTaskType));
  const taskTypesToLoad = legacyAllTaskTypes
    ? [...savedTaskTypes, "hatsugen" as ListeningTaskType]
    : legacyFiveTypeAll
      ? [...savedTaskTypes, "sougou" as ListeningTaskType]
      : (savedTaskTypes ?? fallback.selectedTaskTypes);
  const selectedTaskTypes = taskTypesToLoad.filter((t) =>
    AVAILABLE_TASK_TYPES.includes(t),
  );
  return {
    selectedBooks: selectedBooks.length > 0 ? selectedBooks : fallback.selectedBooks,
    selectedTaskTypes: selectedTaskTypes.length > 0 ? selectedTaskTypes : fallback.selectedTaskTypes,
  };
}

export async function saveViewerState(state: ListeningViewerState): Promise<void> {
  await storageSet(STORAGE_KEY, state);
}

export function getFilteredList(state: ListeningViewerState): ListeningQuestion[] {
  return ALL_LISTENING.filter((q) => state.selectedBooks.includes(q.book) && state.selectedTaskTypes.includes(q.taskType));
}

// Whether the last attempt at a question was right or wrong -- kept
// separate from progressState.ts's ItemProgress/streak/mastery system,
// which is overkill here: Listening just needs "did I get this one, so I
// know what to review", reset back to untouched by "Làm lại". Keeps
// `selectedIndex` too (not just right/wrong) so reopening an already-
// answered question can restore the exact same answered view -- which
// option was picked, right/wrong highlighting, "Làm lại" -- instead of
// silently resetting to a fresh unanswered card.
export type ListeningStatus = "correct" | "wrong";
export interface ListeningAttempt {
  status: ListeningStatus;
  selectedIndex: number;
}
export type ListeningProgressMap = Record<string, ListeningAttempt>;

const PROGRESS_STORAGE_KEY = "listeningProgress";

export async function loadListeningProgress(): Promise<ListeningProgressMap> {
  return (await storageGet<ListeningProgressMap>(PROGRESS_STORAGE_KEY)) ?? {};
}

export async function recordListeningAnswer(id: string, selectedIndex: number, correct: boolean): Promise<void> {
  const map = await loadListeningProgress();
  map[id] = { status: correct ? "correct" : "wrong", selectedIndex };
  await storageSet(PROGRESS_STORAGE_KEY, map);
}

export async function clearListeningAnswer(id: string): Promise<void> {
  const map = await loadListeningProgress();
  delete map[id];
  await storageSet(PROGRESS_STORAGE_KEY, map);
}

// Bulk "Đặt lại tất cả" for the currently filtered list -- one storage
// write instead of one per question.
export async function clearListeningAnswers(ids: string[]): Promise<void> {
  const map = await loadListeningProgress();
  for (const id of ids) delete map[id];
  await storageSet(PROGRESS_STORAGE_KEY, map);
}
