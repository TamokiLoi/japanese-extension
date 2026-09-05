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
// listening-dethi-2025-12.json: Mondai 3/4/5 (16 câu) của phần 聴解 đề thi
// thật N3 tháng 12/2025 -- khác các bộ trên, sách nguồn (script + audio do
// người dùng bổ sung) KHÔNG có đáp án in sẵn cho phần nghe, nên correctIndex
// ở đây là Gemini nghe audio suy luận rồi được kiểm tra lại thủ công từng
// câu (xem field `notes` của từng câu) -- không đáng tin bằng đáp án in sẵn
// thật như soumatome/speedmaster/shinkanzen. Mondai 1/2 (12 câu đầu) bị bỏ
// qua vì 4 lựa chọn của 2 mondai đó chỉ in trên đề giấy (問題用紙), không đọc
// thành tiếng trong audio nên không có nguồn thật để trích xuất.
import listeningDethi202512Raw from "../data/listening-dethi-2025-12.json";
import type { ListeningDataset, ListeningQuestion, ListeningTaskType } from "../types/listening.ts";
import { storageGet, storageSet } from "../platform/storage";

const soumatomeDataset = listeningSoumatomeRaw as unknown as ListeningDataset;
const speedmasterDataset = listeningSpeedmasterRaw as unknown as ListeningDataset;
const shinkanzenDataset = listeningShinkanzenRaw as unknown as ListeningDataset;
const dethi202512Dataset = listeningDethi202512Raw as unknown as ListeningDataset;

export const ALL_LISTENING: ListeningQuestion[] = [
  ...soumatomeDataset.questions,
  ...speedmasterDataset.questions,
  ...shinkanzenDataset.questions,
  ...dethi202512Dataset.questions,
];

const LISTENING_BY_ID = new Map(ALL_LISTENING.map((q) => [q.id, q]));
export function findListeningById(id: string): ListeningQuestion | undefined {
  return LISTENING_BY_ID.get(id);
}

export const TASK_TYPE_LABELS: Record<ListeningTaskType, string> = {
  kadai: "課題理解 -- việc cần làm",
  point: "ポイント理解 -- trọng điểm",
  gaiyou: "概要理解 -- khái quát",
  sokuji: "発話表現・即時応答 -- phản xạ nhanh",
};

const TASK_TYPE_ORDER: ListeningTaskType[] = ["kadai", "point", "gaiyou", "sokuji"];
export const AVAILABLE_TASK_TYPES: ListeningTaskType[] = TASK_TYPE_ORDER.filter((t) =>
  ALL_LISTENING.some((q) => q.taskType === t),
);

export const BOOK_LABELS: Record<string, string> = {
  soumatome: "Nihongo Sou Matome N3 Choukai",
  speedmaster: "Speed Master N3 Choukai",
  shinkanzen: "Shin Kanzen Master N3 Choukai",
  "dethi-2025-12": "Đề thi thật N3 T12/2025 (聴解, 16/28 câu)",
};

const BOOK_ORDER: string[] = ["soumatome", "speedmaster", "shinkanzen", "dethi-2025-12"];
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
  const selectedTaskTypes = (saved?.selectedTaskTypes ?? fallback.selectedTaskTypes).filter((t) =>
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
