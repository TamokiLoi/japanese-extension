import { useEffect, useState } from "react";
import { Headphones, ChevronLeft, ChevronRight, Info, BookOpenText, RotateCcw, Undo2, X } from "lucide-react";
import {
  ALL_LISTENING,
  AVAILABLE_BOOKS,
  AVAILABLE_DE_N3_PRACTICE_BOOKS,
  AVAILABLE_TASK_TYPES,
  BOOK_LABELS,
  TASK_TYPE_LABELS,
  findListeningById,
  getFilteredList,
  defaultViewerState,
  loadViewerState,
  saveViewerState,
  loadListeningProgress,
  recordListeningAnswer,
  clearListeningAnswer,
  clearListeningAnswers,
  type ListeningViewerState,
  type ListeningProgressMap,
} from "../../popup/listeningState.ts";
import { QuestionPalette, type PaletteStatus } from "../components/QuestionPalette.tsx";
import { pruneToggle } from "../../popup/filterUtils.ts";
import type { ListeningQuestion, ListeningTaskType } from "../../types/listening.ts";
import {
  recordAnswer as recordSharedAnswer,
  clearProgress as clearSharedProgress,
  loadProgressMap,
  MASTERY_STREAK_THRESHOLD,
  type ProgressMap,
} from "../../popup/progressState.ts";
import { assetUrl } from "../../platform/assetUrl";
import { AudioPlayer } from "../components/AudioPlayer.tsx";
import { Card } from "../components/ui/card.tsx";
import { Button } from "../components/ui/button.tsx";
import { PageHeader } from "../components/PageHeader.tsx";
import { StatCard } from "../components/StatCard.tsx";
import { useConfirm } from "../components/ConfirmDialog.tsx";
import { useFloatingNav } from "../WebAppShell.tsx";
import { levelBadgeStyle } from "../lib/levelColors.tsx";
import { FilterBar, FilterTrigger } from "../components/FilterBar.tsx";
import { ActiveFilters } from "../components/ActiveFilters.tsx";
import { FilterSheet, FilterGroup, FilterChipOption } from "../components/FilterSheet.tsx";
import { LoadingScreen } from "../components/LoadingScreen.tsx";
import { FuriganaText } from "../components/FuriganaText.tsx";
import { ListeningTranscriptCard } from "../components/ListeningTranscriptCard.tsx";
import { StudyFeedbackButton } from "../components/StudyFeedbackButton.tsx";
import { getJlptPointQuestionPrompt, getListeningMondaiNumber } from "../../lib/listeningMondai.ts";

const LISTENING_TYPE_NOTES: Record<ListeningTaskType, { title: string; description: string }> = {
  kadai: {
    title: "課題理解 · Việc cần làm",
    description: "Đọc câu hỏi và đáp án (hoặc tranh) trước, nghe hội thoại rồi chọn việc cần làm hoặc sẽ làm tiếp theo.",
  },
  point: {
    title: "ポイント理解 · Trọng điểm",
    description: "Xem câu hỏi và các lựa chọn trước khi nghe để biết cần chú ý thông tin nào trong đoạn hội thoại.",
  },
  gaiyou: {
    title: "概要理解 · Khái quát",
    description: "Đề không in câu hỏi và đáp án. Nghe toàn bộ bài, sau đó nghe phần câu hỏi/đáp án trong audio rồi chọn số phù hợp.",
  },
  hatsugen: {
    title: "発話表現 · Biểu hiện lời nói",
    description: "Xem tình huống hoặc tranh, nghe yêu cầu “nói thế nào?” rồi chọn câu nói phù hợp nhất.",
  },
  sokuji: {
    title: "即時応答 · Phản xạ nhanh",
    description: "Nghe một câu ngắn và chọn ngay phản hồi phù hợp; câu hỏi và đáp án không in sẵn trên đề.",
  },
  sougou: {
    title: "統合理解 · Nghe hiểu tổng hợp",
    description: "Nghe hội thoại/bài nói dài, kết hợp nhiều thông tin để trả lời câu hỏi.",
  },
};

const LISTENING_PRACTICE_EXAM_BOOKS = AVAILABLE_DE_N3_PRACTICE_BOOKS;
const LISTENING_OFFICIAL_EXAM_BOOKS = AVAILABLE_BOOKS.filter((book) => /^(?:dethi-|cacnam-)/u.test(book));

function ListeningTypeInfo({ taskType }: { taskType: ListeningTaskType }) {
  const [open, setOpen] = useState(false);
  const note = LISTENING_TYPE_NOTES[taskType];

  return (
    <div className="relative">
      <button
        type="button"
        aria-label={`Cách làm dạng ${note.title}`}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="inline-flex h-6 w-6 items-center justify-center rounded-full text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-700"
      >
        <Info size={15} strokeWidth={2.2} />
      </button>
      {open ? (
        <>
          <button
            type="button"
            aria-label="Đóng ghi chú dạng nghe"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-30 cursor-default bg-black/10 md:bg-transparent"
          />
          <div
            role="dialog"
            aria-label={note.title}
            className="fixed inset-x-3 bottom-4 z-40 rounded-2xl border border-neutral-200 bg-white p-4 text-left shadow-xl md:absolute md:top-9 md:right-0 md:bottom-auto md:left-auto md:w-80"
          >
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-bold text-neutral-800">{note.title}</div>
                <p className="mt-1.5 text-[13px] leading-relaxed text-neutral-600">{note.description}</p>
              </div>
              <button
                type="button"
                aria-label="Đóng"
                onClick={() => setOpen(false)}
                className="-mr-1 -mt-1 rounded-full p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
              >
                <X size={15} />
              </button>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

function FuriganaToggle({ active, onToggle }: { active: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={active}
      className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${
        active ? "border-rose-300 bg-rose-50 text-rose-600" : "border-neutral-200 text-neutral-600 hover:bg-neutral-50"
      }`}
    >
      <BookOpenText size={13} /> {active ? "Ẩn furigana" : "Hiện furigana"}
    </button>
  );
}

// A flat list (filterable by book/dạng câu, same layout as Reading/
// QuizBook) + play/answer/reveal flow. Progress is dual-written: its own
// lightweight correct/wrong map (see recordListeningAnswer) drives this
// screen's own coloring, and the shared progressState.ts map (see
// selectAnswer below) plugs it into Home/Stats like every other content type.
export function ListeningScreen({
  tabs,
  headerAction,
  jumpToId,
  onCurrentItemChange,
}: {
  tabs?: React.ReactNode;
  headerAction?: React.ReactNode;
  // Opens straight into a specific question (e.g. from Stats' "Cần ôn lại"
  // list) instead of the filtered list -- initial value only, doesn't
  // fight the user's own in-screen navigation afterward.
  jumpToId?: string;
  onCurrentItemChange?: (id: string | undefined) => void;
} = {}) {
  const [currentId, setCurrentId] = useState<string | null>(jumpToId ?? null);
  const [state, setState] = useState<ListeningViewerState | null>(null);

  useEffect(() => {
    loadViewerState().then(setState);
  }, []);

  useEffect(() => {
    onCurrentItemChange?.(currentId ?? undefined);
  }, [currentId, onCurrentItemChange]);

  const current = currentId ? findListeningById(currentId) : undefined;
  // Sequencing Trước/Tiếp through the same filtered set the user was
  // browsing in the list, same reasoning as ReadingScreen.tsx/BunpoScreen.tsx.
  const filtered = state ? getFilteredList(state) : [];

  if (current) {
    return (
      <QuestionView
        key={current.id}
        question={current}
        filtered={filtered}
        onBack={() => setCurrentId(null)}
        onOpen={setCurrentId}
      />
    );
  }
  return <ListView tabs={tabs} headerAction={headerAction} state={state} setState={setState} filtered={filtered} onOpen={setCurrentId} />;
}

function ListView({
  tabs,
  headerAction,
  state,
  setState,
  filtered,
  onOpen,
}: {
  tabs?: React.ReactNode;
  headerAction?: React.ReactNode;
  state: ListeningViewerState | null;
  setState: (s: ListeningViewerState) => void;
  filtered: ListeningQuestion[];
  onOpen: (id: string) => void;
}) {
  const confirm = useConfirm();
  const [filterOpen, setFilterOpen] = useState(false);
  const [progress, setProgress] = useState<ListeningProgressMap>({});
  const [sharedProgress, setSharedProgress] = useState<ProgressMap>({});
  // Which stat card is narrowing the rendered rows, if any -- local/
  // display-only (not persisted, not threaded into `filtered`) so it never
  // affects Trước/Tiếp paging order inside a question, only which rows show
  // in this list. Same reasoning as Kanji/Vocab/Bunpo's bucketFilter.
  const [statusFilter, setStatusFilter] = useState<"correct" | "wrong" | "not-started" | null>(null);

  useEffect(() => {
    // Reloaded every time this list mounts (including navigating back from a
    // question) since QuestionView is a different component at the same
    // JSX position -- React fully unmounts/remounts across that switch, so
    // this effect reliably reruns and picks up whatever just changed.
    loadListeningProgress().then(setProgress);
    loadProgressMap().then(setSharedProgress);
  }, []);

  async function mutate(partial: Partial<ListeningViewerState>) {
    if (!state) return;
    const next = { ...state, ...partial };
    await saveViewerState(next);
    setState(next);
  }

  if (!state) return <LoadingScreen variant="listening" title="Luyện nghe" />;

  const currentState = state;
  const groupedExamBooks = [...LISTENING_PRACTICE_EXAM_BOOKS, ...LISTENING_OFFICIAL_EXAM_BOOKS];
  const regularBooks = AVAILABLE_BOOKS.filter((book) => !groupedExamBooks.includes(book));
  const selectedRegularBooks = state.selectedBooks.filter((book) => !groupedExamBooks.includes(book));
  const allRegularBooksChecked = selectedRegularBooks.length === regularBooks.length;
  const allTaskTypesChecked = state.selectedTaskTypes.length === AVAILABLE_TASK_TYPES.length;
  const correctCount = filtered.filter((q) => progress[q.id]?.status === "correct").length;
  const wrongCount = filtered.filter((q) => progress[q.id]?.status === "wrong").length;
  const notStartedCount = filtered.length - correctCount - wrongCount;
  const attemptedCount = correctCount + wrongCount;
  const selectedPracticeExamBooks = LISTENING_PRACTICE_EXAM_BOOKS.filter((book) => currentState.selectedBooks.includes(book));
  const allPracticeExamBooksSelected = LISTENING_PRACTICE_EXAM_BOOKS.length > 0 && selectedPracticeExamBooks.length === LISTENING_PRACTICE_EXAM_BOOKS.length;
  const selectedOfficialExamBooks = LISTENING_OFFICIAL_EXAM_BOOKS.filter((book) => currentState.selectedBooks.includes(book));
  const allOfficialExamBooksSelected = LISTENING_OFFICIAL_EXAM_BOOKS.length > 0 && selectedOfficialExamBooks.length === LISTENING_OFFICIAL_EXAM_BOOKS.length;
  const filterCount = (allRegularBooksChecked ? 0 : 1) + (allPracticeExamBooksSelected ? 0 : 1) + (allOfficialExamBooksSelected ? 0 : 1) + (allTaskTypesChecked ? 0 : state.selectedTaskTypes.length);
  const practiceExamQuestionCount = ALL_LISTENING.filter((q) =>
    LISTENING_PRACTICE_EXAM_BOOKS.includes(q.book) && currentState.selectedTaskTypes.includes(q.taskType),
  ).length;
  const officialExamQuestionCount = ALL_LISTENING.filter((q) =>
    LISTENING_OFFICIAL_EXAM_BOOKS.includes(q.book) && currentState.selectedTaskTypes.includes(q.taskType),
  ).length;

  function applyBookSelection(nextBooks: string[]) {
    if (nextBooks.length === 0) return;
    const nextTaskTypes = pruneToggle(currentState.selectedTaskTypes, AVAILABLE_TASK_TYPES, (t) =>
      ALL_LISTENING.some((q) => q.taskType === t && nextBooks.includes(q.book)),
    );
    mutate({ selectedBooks: nextBooks, selectedTaskTypes: nextTaskTypes });
  }

  function togglePracticeExamCollection() {
    if (LISTENING_PRACTICE_EXAM_BOOKS.length === 0) return;
    const nextBooks = selectedPracticeExamBooks.length > 0
      ? currentState.selectedBooks.filter((book) => !LISTENING_PRACTICE_EXAM_BOOKS.includes(book))
      : [...new Set([...currentState.selectedBooks, LISTENING_PRACTICE_EXAM_BOOKS[0]])];
    applyBookSelection(nextBooks);
  }

  function toggleAllPracticeExamBooks() {
    const nextBooks = allPracticeExamBooksSelected
      ? currentState.selectedBooks.filter((book) => !LISTENING_PRACTICE_EXAM_BOOKS.includes(book))
      : [...new Set([...currentState.selectedBooks, ...LISTENING_PRACTICE_EXAM_BOOKS])];
    applyBookSelection(nextBooks);
  }

  function toggleOfficialExamCollection() {
    if (LISTENING_OFFICIAL_EXAM_BOOKS.length === 0) return;
    const nextBooks = selectedOfficialExamBooks.length > 0
      ? currentState.selectedBooks.filter((book) => !LISTENING_OFFICIAL_EXAM_BOOKS.includes(book))
      : [...new Set([...currentState.selectedBooks, ...LISTENING_OFFICIAL_EXAM_BOOKS])];
    applyBookSelection(nextBooks);
  }

  function toggleAllOfficialExamBooks() {
    const nextBooks = allOfficialExamBooksSelected
      ? currentState.selectedBooks.filter((book) => !LISTENING_OFFICIAL_EXAM_BOOKS.includes(book))
      : [...new Set([...currentState.selectedBooks, ...LISTENING_OFFICIAL_EXAM_BOOKS])];
    applyBookSelection(nextBooks);
  }

  function renderBookOption(book: string) {
    const checked = currentState.selectedBooks.includes(book);
    const count = ALL_LISTENING.filter((q) => q.book === book && currentState.selectedTaskTypes.includes(q.taskType)).length;
    return (
      <FilterChipOption
        key={book}
        label={`${BOOK_LABELS[book]} (${count})`}
        active={checked}
        onClick={() => {
          const next = checked ? currentState.selectedBooks.filter((b) => b !== book) : [...new Set([...currentState.selectedBooks, book])];
          applyBookSelection(next);
        }}
      />
    );
  }

  async function resetAllFiltered() {
    if (!(await confirm(`Đặt lại toàn bộ ${attemptedCount} câu đã làm trong bộ lọc hiện tại về "chưa làm"? Không thể hoàn tác.`))) return;
    const ids = filtered.map((q) => q.id);
    await clearListeningAnswers(ids);
    await clearSharedProgress(ids);
    setProgress(await loadListeningProgress());
    // clearSharedProgress only wipes storage -- without this, the in-memory
    // sharedProgress map (mastered flag/streaks used above) keeps its stale
    // pre-reset values until something else happens to reload it.
    setSharedProgress(await loadProgressMap());
  }

  return (
    <div className="mx-auto max-w-6xl px-2.5 py-2 md:px-8 md:py-6">
      <PageHeader title="Luyện nghe" subtitle={`${filtered.length} câu`} icon={{ img: "icon-listening.png", bg: "#fce7f3" }} action={headerAction} />
      <div className="mt-4">{tabs}</div>

      <div className="mt-4 grid grid-cols-3 gap-3">
        <StatCard
          label="Đã làm đúng"
          value={correctCount}
          tone="emerald"
          active={statusFilter === "correct"}
          onClick={() => setStatusFilter(statusFilter === "correct" ? null : "correct")}
        />
        <StatCard
          label="Cần ôn lại"
          value={wrongCount}
          tone="rose"
          active={statusFilter === "wrong"}
          onClick={() => setStatusFilter(statusFilter === "wrong" ? null : "wrong")}
        />
        <StatCard
          label="Chưa làm"
          value={notStartedCount}
          active={statusFilter === "not-started"}
          onClick={() => setStatusFilter(statusFilter === "not-started" ? null : "not-started")}
        />
      </div>

      <FilterBar>
        <FilterTrigger count={filterCount} onClick={() => setFilterOpen(true)} />
        {attemptedCount > 0 ? (
          <button onClick={resetAllFiltered} className="flex items-center gap-1.5 text-xs font-semibold text-neutral-400 hover:text-rose-600">
            <RotateCcw size={12} /> Đặt lại tất cả ({attemptedCount})
          </button>
        ) : null}
      </FilterBar>

      <ActiveFilters
        chips={[
          ...(allRegularBooksChecked && allPracticeExamBooksSelected && allOfficialExamBooksSelected
            ? []
            : [
              ...(!allRegularBooksChecked ? selectedRegularBooks.map((book) => ({
                key: `book-${book}`,
                label: BOOK_LABELS[book],
                onRemove: () => {
                  const next = state.selectedBooks.filter((b) => b !== book);
                  if (next.length === 0) return;
                  mutate({ selectedBooks: next });
                },
              })) : []),
              ...(!allOfficialExamBooksSelected && selectedOfficialExamBooks.length > 0 ? [{
                key: "book-jlpt-official",
                label: `Đề JLPT · ${selectedOfficialExamBooks.length}/${LISTENING_OFFICIAL_EXAM_BOOKS.length} kỳ`,
                onRemove: () => applyBookSelection(state.selectedBooks.filter((book) => !LISTENING_OFFICIAL_EXAM_BOOKS.includes(book))),
              }] : []),
              ...(!allPracticeExamBooksSelected && selectedPracticeExamBooks.length > 0 ? [{
                key: "book-jlpt-n3-practice",
                label: `10 đề N3 · ${selectedPracticeExamBooks.length}/${LISTENING_PRACTICE_EXAM_BOOKS.length} đề`,
                onRemove: () => applyBookSelection(state.selectedBooks.filter((book) => !LISTENING_PRACTICE_EXAM_BOOKS.includes(book))),
              }] : []),
            ]),
          ...(allTaskTypesChecked
            ? []
            : state.selectedTaskTypes.map((t) => ({
                key: `type-${t}`,
                label: TASK_TYPE_LABELS[t],
                onRemove: () => {
                  const next = state.selectedTaskTypes.filter((x) => x !== t);
                  if (next.length === 0) return;
                  mutate({ selectedTaskTypes: next });
                },
              }))),
        ]}
      />

      <FilterSheet
        open={filterOpen}
        onClose={() => setFilterOpen(false)}
        title="Bộ lọc luyện nghe"
        onReset={() => {
          const defaults = defaultViewerState();
          mutate({ selectedBooks: defaults.selectedBooks, selectedTaskTypes: defaults.selectedTaskTypes });
        }}
      >
        <FilterGroup title="Sách">
          {regularBooks.map(renderBookOption)}
          {LISTENING_OFFICIAL_EXAM_BOOKS.length > 0 ? (
            <FilterChipOption
              label={`Đề JLPT (${officialExamQuestionCount})`}
              active={selectedOfficialExamBooks.length > 0}
              onClick={toggleOfficialExamCollection}
            />
          ) : null}
          {LISTENING_PRACTICE_EXAM_BOOKS.length > 0 ? (
            <FilterChipOption
              label={`10 đề N3 (${practiceExamQuestionCount})`}
              active={selectedPracticeExamBooks.length > 0}
              onClick={togglePracticeExamCollection}
            />
          ) : null}
        </FilterGroup>

        {selectedOfficialExamBooks.length > 0 ? (
          <details className="rounded-xl border border-neutral-200 px-3 py-2">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 py-1 text-sm font-semibold text-neutral-700">
              <span>Đề JLPT theo kỳ</span>
              <span className="shrink-0 text-xs font-normal text-neutral-400">{selectedOfficialExamBooks.length}/{LISTENING_OFFICIAL_EXAM_BOOKS.length} · {officialExamQuestionCount} câu</span>
            </summary>
            <div className="mt-2 flex justify-end">
              <button
                type="button"
                disabled={allOfficialExamBooksSelected}
                onClick={toggleAllOfficialExamBooks}
                className="text-xs font-semibold text-rose-600 hover:underline disabled:cursor-default disabled:text-neutral-400 disabled:no-underline"
              >
                {allOfficialExamBooksSelected ? "Đã chọn tất cả" : "Chọn tất cả"}
              </button>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {LISTENING_OFFICIAL_EXAM_BOOKS.map(renderBookOption)}
            </div>
          </details>
        ) : null}

        {selectedPracticeExamBooks.length > 0 ? (
          <details className="rounded-xl border border-neutral-200 px-3 py-2">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 py-1 text-sm font-semibold text-neutral-700">
              <span>10 đề N3 theo đề</span>
              <span className="shrink-0 text-xs font-normal text-neutral-400">{selectedPracticeExamBooks.length}/{LISTENING_PRACTICE_EXAM_BOOKS.length} · {practiceExamQuestionCount} câu</span>
            </summary>
            <div className="mt-2 flex justify-end">
              <button
                type="button"
                disabled={allPracticeExamBooksSelected}
                onClick={toggleAllPracticeExamBooks}
                className="text-xs font-semibold text-rose-600 hover:underline disabled:cursor-default disabled:text-neutral-400 disabled:no-underline"
              >
                {allPracticeExamBooksSelected ? "Đã chọn tất cả" : "Chọn tất cả"}
              </button>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {LISTENING_PRACTICE_EXAM_BOOKS.map(renderBookOption)}
            </div>
          </details>
        ) : null}

        <FilterGroup title="Dạng câu hỏi">
          {AVAILABLE_TASK_TYPES.map((t) => {
            const checked = state.selectedTaskTypes.includes(t);
            const count = ALL_LISTENING.filter((q) => q.taskType === t && state.selectedBooks.includes(q.book)).length;
            return (
              <FilterChipOption
                key={t}
                label={`${TASK_TYPE_LABELS[t]} (${count})`}
                active={checked}
                onClick={() => {
                  const next = checked ? state.selectedTaskTypes.filter((x) => x !== t) : [...new Set([...state.selectedTaskTypes, t])];
                  if (next.length === 0) return;
                  const nextBooks = pruneToggle(state.selectedBooks, AVAILABLE_BOOKS, (b) =>
                    ALL_LISTENING.some((q) => q.book === b && next.includes(q.taskType)),
                  );
                  mutate({ selectedTaskTypes: next, selectedBooks: nextBooks });
                }}
              />
            );
          })}
        </FilterGroup>
      </FilterSheet>

      {filtered.length === 0 ? (
        <p className="mt-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-600">Không có câu nào khớp bộ lọc này.</p>
      ) : statusFilter !== null && filtered.every((q) => (progress[q.id]?.status ?? "not-started") !== statusFilter) ? (
        <p className="mt-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-600">
          Không có câu nào ở trạng thái "
          {statusFilter === "correct" ? "Đã làm đúng" : statusFilter === "wrong" ? "Cần ôn lại" : "Chưa làm"}".
        </p>
      ) : (
        <div className="mt-3 flex flex-col gap-2">
          {filtered.map((q, i) => {
            const status = progress[q.id]?.status;
            if (statusFilter !== null && (status ?? "not-started") !== statusFilter) return null;
            const borderCls =
              status === "correct" ? "border-l-emerald-400" : status === "wrong" ? "border-l-rose-400" : "border-l-neutral-200";
            const mondaiNumber = getListeningMondaiNumber(q);
            return (
              <button
                key={q.id}
                onClick={() => onOpen(q.id)}
                className={`flex items-center gap-3 rounded-2xl border border-l-4 border-neutral-200 bg-white px-4 py-3.5 text-left hover:border-rose-200 hover:bg-rose-50/40 ${borderCls}`}
              >
                <span className="w-6 shrink-0 text-xs font-semibold text-neutral-300">{String(i + 1).padStart(2, "0")}</span>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold text-neutral-800">{q.scenario || q.question}</div>
                  <div className="truncate text-xs text-neutral-500">
                    {mondaiNumber ? `Mondai ${mondaiNumber} · ` : ""}{TASK_TYPE_LABELS[q.taskType]} · {q.level}
                  </div>
                </div>
                {status === "correct" ? (
                  sharedProgress[q.id]?.mastered ? (
                    <span className="shrink-0 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-600">✓ Đã thuộc</span>
                  ) : (
                    <span className="shrink-0 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-600">
                      ✓ {Math.min(sharedProgress[q.id]?.directionStreaks?.answer ?? 0, MASTERY_STREAK_THRESHOLD)}/{MASTERY_STREAK_THRESHOLD}
                    </span>
                  )
                ) : status === "wrong" ? (
                  <span className="shrink-0 rounded-full bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-600">✗ sai</span>
                ) : (
                  <span className="shrink-0 rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-semibold text-neutral-400">chưa làm</span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function QuestionView({
  question,
  filtered,
  onBack,
  onOpen,
}: {
  question: ListeningQuestion;
  filtered: ListeningQuestion[];
  onBack: () => void;
  onOpen: (id: string) => void;
}) {
  const [selected, setSelected] = useState<number | null>(null);
  const [progressMap, setProgressMap] = useState<ListeningProgressMap>({});
  const [showTranslation, setShowTranslation] = useState(false);
  const [showFurigana, setShowFurigana] = useState(false);
  const [floatingNavVisible, setFloatingNavVisible] = useState(false);
  const answered = selected !== null;
  const currentIndex = filtered.findIndex((q) => q.id === question.id);
  const mondaiNumber = getListeningMondaiNumber(question);
  const jlptPointQuestionPrompt = getJlptPointQuestionPrompt(question);
  const prevQuestion = currentIndex > 0 ? filtered[currentIndex - 1] : null;
  const nextQuestion = currentIndex >= 0 && currentIndex < filtered.length - 1 ? filtered[currentIndex + 1] : null;

  useEffect(() => {
    let hideTimer: number | undefined;
    function handleScroll() {
      setFloatingNavVisible(true);
      if (hideTimer !== undefined) window.clearTimeout(hideTimer);
      hideTimer = window.setTimeout(() => setFloatingNavVisible(false), 1000);
    }

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", handleScroll);
      if (hideTimer !== undefined) window.clearTimeout(hideTimer);
    };
  }, []);

  const floatingNavBottom = useFloatingNav(true, (!!prevQuestion || !!nextQuestion) && floatingNavVisible);

  // Reopening a question you already answered (from the color-coded list)
  // should show that same answered state right away -- your pick, right/
  // wrong highlighting, "Làm lại" -- not a blank unanswered card that only
  // updates once you answer it again.
  useEffect(() => {
    let cancelled = false;
    loadListeningProgress().then((map) => {
      if (cancelled) return;
      setSelected(map[question.id]?.selectedIndex ?? null);
      setProgressMap(map);
    });
    return () => {
      cancelled = true;
    };
  }, [question.id]);

  // 問題3/4/5 do not give the learner question/answer text to read before
  // the audio. 問題4 has a picture/context in the paper, but our converted
  // books only have a text prompt for some items, so keep that prompt while
  // hiding the question/options. All three types expose numbered choices;
  // the Japanese text is revealed after the learner answers for review.
  const isAudioOnlyOptions = question.book !== "kaiwa-100cau" && ["gaiyou", "hatsugen", "sokuji"].includes(question.taskType);
  const isBlind = (isAudioOnlyOptions || question.optionsInAudio) && !question.optionsImage;
  // Keep every Japanese furigana surface behind the same gate as its source
  // text. This also protects future controls from exposing audio-only words
  // before an answer is submitted.
  const showVisibleFurigana = showFurigana && (!isBlind || answered);
  const audioPrompt = isBlind && !answered
    ? question.taskType === "hatsugen" && question.scenario
      ? question.scenario
      : question.taskType === "gaiyou"
        ? "Nghe toàn bộ bài rồi chọn đáp án đúng"
        : "Nghe rồi chọn đáp án đúng"
    : question.scenario || jlptPointQuestionPrompt?.text || question.question;
  // Immediate-response items store the spoken line in `scenario` and leave
  // `question` empty. Keep the prompt visible after answering so the learner
  // can review the Japanese line and its translation here.
  const showAudioPrompt = !(answered && question.taskType === "sokuji" && Boolean(question.question));
  const optionExplanations = question.optionExplanations ?? [];
  const hasOptionExplanations = optionExplanations.some((explanation) => explanation.trim());
  const audioPromptTranslation = question.scenario ? question.scenarioVi : question.questionPromptVi;
  const audioPromptFurigana = question.scenario
    ? question.scenarioFurigana
    : jlptPointQuestionPrompt?.furigana ?? question.questionFurigana;

  function selectAnswer(oi: number) {
    const correct = oi === question.correctIndex;
    setSelected(oi);
    setProgressMap((m) => ({ ...m, [question.id]: { status: correct ? "correct" : "wrong", selectedIndex: oi } }));
    // Own lightweight map (unprefixed id, correct/wrong + which option was
    // picked, reset-able by "Làm lại") drives this screen's own list
    // coloring/restore-on-reopen. Dual-written into the shared
    // progressState.ts map too (single "answer" direction, same id -- no
    // prefix needed since Dictation below uses its own "dict:" id space to
    // avoid colliding on the same underlying question) so Listening gets
    // mastery streaks, "due for review", and shows up in Home/Stats like
    // every other content type.
    recordListeningAnswer(question.id, oi, correct);
    recordSharedAnswer(question.id, correct, "answer", ["answer"]);
  }

  return (
    <div className="mx-auto max-w-6xl px-2.5 py-2 md:px-8 md:py-6">
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={onBack} className="flex items-center gap-1 text-sm font-medium text-neutral-500 hover:text-neutral-700">
          <ChevronLeft size={15} /> Luyện nghe
        </button>
        <span className="rounded-full px-2.5 py-1 text-xs font-semibold" style={levelBadgeStyle(question.level)}>
          {question.level}
        </span>
        {mondaiNumber ? (
          <span className="rounded-full bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-600">Mondai {mondaiNumber}</span>
        ) : null}
        <span className="inline-flex items-center rounded-full bg-neutral-100 pl-2.5 text-xs font-semibold text-neutral-600">
          {TASK_TYPE_LABELS[question.taskType]}
          <ListeningTypeInfo taskType={question.taskType} />
        </span>
        <StudyFeedbackButton
          entityId={`study:listening:${question.id}`}
          snapshot={{
            title: question.questionPrompt || question.scenario || question.question || question.questionVi || question.scenarioVi || "Câu nghe",
            context: `${question.level} · ${BOOK_LABELS[question.book]}${mondaiNumber ? ` · Mondai ${mondaiNumber}` : ""}`,
            currentValue: answered
              ? Number.isInteger(question.correctIndex) && question.correctIndex >= 0 && question.correctIndex < question.options.length
                ? `Phương án ${question.correctIndex + 1}: ${question.options[question.correctIndex]}`
                : "Chưa có đáp án trong dữ liệu"
              : "Đáp án sẽ hiện sau khi trả lời",
            sources: [BOOK_LABELS[question.book], question.level, mondaiNumber ? `Mondai ${mondaiNumber}` : ""].filter(Boolean),
          }}
        />
      </div>

      <QuestionPalette
        summary={`Câu ${currentIndex + 1}/${filtered.length} · đã làm ${filtered.filter((q) => progressMap[q.id]).length}`}
        onJump={(i) => onOpen(filtered[i].id)}
        items={filtered.map((q, i) => {
          const attempt = progressMap[q.id];
          const status: PaletteStatus = i === currentIndex ? "current" : !attempt ? "unanswered" : attempt.status === "correct" ? "correct" : "wrong";
          return { id: q.id, status };
        })}
      />

      <Card className="mt-4 gap-3.5 rounded-2xl border-neutral-200 p-5 ring-0">
        {showAudioPrompt ? (
          <>
            <div className="flex items-start gap-2 whitespace-pre-line text-sm font-semibold text-neutral-700">
              <Headphones size={17} className="mt-0.5 shrink-0 text-neutral-400" />
              <span>
                {jlptPointQuestionPrompt ? (
                  <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-neutral-400">
                    Câu hỏi · {question.question}
                  </span>
                ) : null}
                {showVisibleFurigana ? <FuriganaText annotations={audioPromptFurigana} text={audioPrompt} /> : audioPrompt}
              </span>
            </div>
            {answered && showTranslation && audioPromptTranslation ? (
              <div className="ml-[25px] whitespace-pre-line text-sm text-neutral-400">{audioPromptTranslation}</div>
            ) : null}
          </>
        ) : null}
        <AudioPlayer
          key={question.id}
          src={assetUrl(question.audioUrl)}
          startAtSeconds={question.audioStartSec}
          endAtSeconds={question.audioEndSec}
          translationToggle={
            answered && question.turns.length === 0
              ? { active: showTranslation, onToggle: () => setShowTranslation((v) => !v) }
              : undefined
          }
        />
      </Card>

      {question.questionImage ? (
        <Card className="mt-4 gap-0 rounded-2xl border-neutral-200 p-3 ring-0">
          <img src={assetUrl(question.questionImage)} alt="Hình minh họa câu nghe" className="w-full rounded-lg" />
        </Card>
      ) : null}

      {/* Audio-only response items with no turns[] at all rely on the toggle
          above (question.scenarioVi). But many gaiyou/hatsugen/sokuji items in the actual
          data (shinkanzen/soumatome N3) store an EMPTY scenario/scenarioVi
          and put the real translation in turns[0].textVi instead -- those
          still need the Transcript card below to have anywhere to show it,
          so this no longer excludes audio-only response types once turns exist. */}
      {answered && question.turns.length > 0 ? (
        <ListeningTranscriptCard
          turns={question.turns}
          showFurigana={showVisibleFurigana}
          onToggleFurigana={() => setShowFurigana((v) => !v)}
          showTranslation={showTranslation}
          onToggleTranslation={() => setShowTranslation((v) => !v)}
          showTranslationToggle={question.optionsVi.some((text) => text.trim() && !/^Lựa chọn\s+/iu.test(text.trim()))}
        />
      ) : null}

      <Card className="mt-4 gap-0 rounded-2xl border-neutral-200 p-5 ring-0">
        {answered && question.turns.length === 0 ? (
          <div className="mb-3 flex justify-end">
            <FuriganaToggle active={showFurigana} onToggle={() => setShowFurigana((v) => !v)} />
          </div>
        ) : null}
        {!isBlind || answered ? (
          <>
            <div className="whitespace-pre-line font-semibold text-neutral-800">
            {showVisibleFurigana ? <FuriganaText annotations={question.questionFurigana} text={question.question} /> : question.question}
            </div>
            {answered && showTranslation ? <div className="mt-1 whitespace-pre-line text-sm text-neutral-500">{question.questionVi}</div> : null}
          </>
        ) : null}

        {isBlind && !answered ? (
          <div className="grid grid-cols-3 gap-2">
            {question.options.map((_, oi) => (
              <button
                key={oi}
                onClick={() => selectAnswer(oi)}
                className="rounded-lg border border-neutral-200 py-3 text-center text-lg font-semibold hover:bg-neutral-50"
              >
                {oi + 1}
              </button>
            ))}
          </div>
        ) : question.optionsImage ? (
          <>
            <img
              src={assetUrl(question.optionsImage)}
              alt="Đáp án minh hoạ"
              className="mt-4 w-full rounded-lg border border-neutral-200"
            />
            <div className="mt-3 grid grid-cols-4 gap-2">
              {Array.from({ length: question.optionCount ?? 4 }, (_, oi) => {
                let cls = "border-neutral-200 hover:bg-neutral-50";
                if (answered) {
                  if (oi === question.correctIndex) cls = "border-emerald-300 bg-emerald-50 text-emerald-700";
                  else if (oi === selected) cls = "border-rose-300 bg-rose-50 text-rose-700";
                  else cls = "border-neutral-200 opacity-50";
                }
                return (
                  <button
                    key={oi}
                    disabled={answered}
                    onClick={() => selectAnswer(oi)}
                    className={`rounded-lg border py-2 text-center text-sm font-semibold ${cls}`}
                  >
                    {oi + 1}
                  </button>
                );
              })}
            </div>
          </>
        ) : (
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {question.options.map((opt, oi) => {
              let cls = "border-neutral-200 hover:bg-neutral-50";
              if (answered) {
                if (oi === question.correctIndex) cls = "border-emerald-300 bg-emerald-50 text-emerald-700";
                else if (oi === selected) cls = "border-rose-300 bg-rose-50 text-rose-700";
                else cls = "border-neutral-200 opacity-50";
              }
              return (
                <button
                  key={oi}
                  disabled={answered}
                  onClick={() => selectAnswer(oi)}
                  className={`rounded-lg border px-3 py-2 text-left text-sm ${cls}`}
                >
                  {showVisibleFurigana ? <FuriganaText annotations={question.optionFurigana?.[oi]} text={opt} /> : opt}
                  {answered && showTranslation ? <span className="block text-xs text-neutral-400">{question.optionsVi[oi]}</span> : null}
                </button>
              );
            })}
          </div>
        )}

        {answered ? (
          <div className="mt-4 space-y-3 border-t border-neutral-100 pt-3 text-sm">
            <div className={selected === question.correctIndex ? "font-semibold text-emerald-700" : "font-semibold text-rose-700"}>
              {selected === question.correctIndex ? "✓ Đúng" : "✗ Sai"}
            </div>
            {question.explanation ? <div className="text-neutral-600">{question.explanation}</div> : null}
            {hasOptionExplanations ? (
              <div className="border-t border-neutral-100 pt-3">
                <div className="text-xs font-bold tracking-wide text-neutral-400 uppercase">Giải thích từng đáp án</div>
                <div className="mt-2 space-y-2 text-xs leading-relaxed text-neutral-600">
                  {optionExplanations.map((explanation, oi) =>
                    explanation.trim() ? (
                      <div key={oi} className="flex gap-2">
                        <span
                          className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                            oi === question.correctIndex
                              ? "bg-emerald-100 text-emerald-700"
                              : "bg-rose-50 text-rose-600"
                          }`}
                        >
                          {oi + 1}
                        </span>
                        <span>{explanation}</span>
                      </div>
                    ) : null,
                  )}
                </div>
              </div>
            ) : null}
            {question.notes ? <div className="rounded-lg bg-amber-50 p-2 text-xs text-amber-700">{question.notes}</div> : null}
          </div>
        ) : null}
      </Card>

      {answered ? (
        <div className="mt-6 flex gap-2">
          <Button
            variant="outline"
            onClick={() => {
              setSelected(null);
              setShowTranslation(false);
              setShowFurigana(false);
              setProgressMap((m) => {
                const next = { ...m };
                delete next[question.id];
                return next;
              });
              clearListeningAnswer(question.id);
            }}
          >
            <Undo2 size={16} /> Làm lại câu này
          </Button>
        </div>
      ) : null}

      {prevQuestion ? (
        <button
          onClick={() => onOpen(prevQuestion.id)}
          aria-label="Câu trước"
          aria-hidden={!floatingNavVisible}
          tabIndex={floatingNavVisible ? 0 : -1}
          className={`fixed ${floatingNavBottom} left-4 z-20 floating-action-button bg-white text-neutral-600 shadow-lg ring-1 ring-neutral-200 transition-opacity duration-200 active:bg-neutral-50 md:hidden ${floatingNavVisible ? "opacity-100" : "pointer-events-none opacity-0"}`}
        >
          <ChevronLeft size={18} />
        </button>
      ) : null}
      {nextQuestion ? (
        <button
          onClick={() => onOpen(nextQuestion.id)}
          aria-label="Câu sau"
          aria-hidden={!floatingNavVisible}
          tabIndex={floatingNavVisible ? 0 : -1}
          className={`fixed right-4 ${floatingNavBottom} z-20 floating-action-button bg-rose-600 text-white shadow-lg transition-opacity duration-200 active:bg-rose-700 md:hidden ${floatingNavVisible ? "opacity-100" : "pointer-events-none opacity-0"}`}
        >
          <ChevronRight size={18} />
        </button>
      ) : null}
    </div>
  );
}
