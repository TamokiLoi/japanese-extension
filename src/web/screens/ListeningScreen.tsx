import { useEffect, useState } from "react";
import { Headphones, ChevronLeft, ChevronRight, Globe, RotateCcw, Undo2 } from "lucide-react";
import {
  ALL_LISTENING,
  AVAILABLE_BOOKS,
  AVAILABLE_TASK_TYPES,
  BOOK_LABELS,
  TASK_TYPE_LABELS,
  findListeningById,
  getFilteredList,
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
import type { ListeningQuestion } from "../../types/listening.ts";
import { recordAnswer as recordSharedAnswer, clearProgress as clearSharedProgress } from "../../popup/progressState.ts";
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

// A flat list (filterable by book/dạng câu, same layout as Reading/
// QuizBook) + play/answer/reveal flow. Progress is dual-written: its own
// lightweight correct/wrong map (see recordListeningAnswer) drives this
// screen's own coloring, and the shared progressState.ts map (see
// selectAnswer below) plugs it into Home/Stats like every other content type.
export function ListeningScreen({
  topBar,
  jumpToId,
  onCurrentItemChange,
}: {
  topBar?: React.ReactNode;
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
  return <ListView topBar={topBar} state={state} setState={setState} filtered={filtered} onOpen={setCurrentId} />;
}

function ListView({
  topBar,
  state,
  setState,
  filtered,
  onOpen,
}: {
  topBar?: React.ReactNode;
  state: ListeningViewerState | null;
  setState: (s: ListeningViewerState) => void;
  filtered: ListeningQuestion[];
  onOpen: (id: string) => void;
}) {
  const confirm = useConfirm();
  const [filterOpen, setFilterOpen] = useState(false);
  const [progress, setProgress] = useState<ListeningProgressMap>({});

  useEffect(() => {
    // Reloaded every time this list mounts (including navigating back from a
    // question) since QuestionView is a different component at the same
    // JSX position -- React fully unmounts/remounts across that switch, so
    // this effect reliably reruns and picks up whatever just changed.
    loadListeningProgress().then(setProgress);
  }, []);

  async function mutate(partial: Partial<ListeningViewerState>) {
    if (!state) return;
    const next = { ...state, ...partial };
    await saveViewerState(next);
    setState(next);
  }

  if (!state) return <div className="p-6 text-neutral-400">Đang tải...</div>;

  const allBooksChecked = state.selectedBooks.length === AVAILABLE_BOOKS.length;
  const allTaskTypesChecked = state.selectedTaskTypes.length === AVAILABLE_TASK_TYPES.length;
  const filterCount = (allBooksChecked ? 0 : state.selectedBooks.length) + (allTaskTypesChecked ? 0 : state.selectedTaskTypes.length);
  const correctCount = filtered.filter((q) => progress[q.id]?.status === "correct").length;
  const wrongCount = filtered.filter((q) => progress[q.id]?.status === "wrong").length;
  const attemptedCount = correctCount + wrongCount;

  async function resetAllFiltered() {
    if (!(await confirm(`Đặt lại toàn bộ ${attemptedCount} câu đã làm trong bộ lọc hiện tại về "chưa làm"? Không thể hoàn tác.`))) return;
    const ids = filtered.map((q) => q.id);
    await clearListeningAnswers(ids);
    await clearSharedProgress(ids);
    setProgress(await loadListeningProgress());
  }

  return (
    <div className="mx-auto max-w-3xl px-2.5 py-2 md:px-8 md:py-6">
      {topBar}
      <PageHeader title="Luyện nghe" icon={{ img: "icon-listening.png", bg: "#fce7f3" }} />

      <FilterBar>
        <FilterTrigger count={filterCount} onClick={() => setFilterOpen(true)} />
      </FilterBar>

      <ActiveFilters
        chips={[
          ...(allBooksChecked
            ? []
            : state.selectedBooks.map((book) => ({
                key: `book-${book}`,
                label: BOOK_LABELS[book],
                onRemove: () => {
                  const next = state.selectedBooks.filter((b) => b !== book);
                  if (next.length === 0) return;
                  mutate({ selectedBooks: next });
                },
              }))),
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
        onReset={() => mutate({ selectedBooks: [...AVAILABLE_BOOKS], selectedTaskTypes: [...AVAILABLE_TASK_TYPES] })}
      >
        <FilterGroup title="Sách">
          {AVAILABLE_BOOKS.map((book) => {
            const checked = state.selectedBooks.includes(book);
            const count = ALL_LISTENING.filter((q) => q.book === book && state.selectedTaskTypes.includes(q.taskType)).length;
            return (
              <FilterChipOption
                key={book}
                label={`${BOOK_LABELS[book]} (${count})`}
                active={checked}
                onClick={() => {
                  const next = checked ? state.selectedBooks.filter((b) => b !== book) : [...new Set([...state.selectedBooks, book])];
                  if (next.length === 0) return;
                  const nextTaskTypes = pruneToggle(state.selectedTaskTypes, AVAILABLE_TASK_TYPES, (t) =>
                    ALL_LISTENING.some((q) => q.taskType === t && next.includes(q.book)),
                  );
                  mutate({ selectedBooks: next, selectedTaskTypes: nextTaskTypes });
                }}
              />
            );
          })}
        </FilterGroup>

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

      <div className="mt-4 grid grid-cols-3 gap-3">
        <StatCard label="Tổng số câu" value={filtered.length} />
        <StatCard label="Đã làm đúng" value={correctCount} tone="emerald" />
        <StatCard label="Cần ôn lại" value={wrongCount} tone="rose" />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-4 text-xs text-neutral-500">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-[3px] border border-emerald-300 bg-emerald-100" /> Đã làm đúng
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-[3px] border border-rose-300 bg-rose-100" /> Cần ôn lại
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-[3px] border border-neutral-200 bg-white" /> Chưa làm
        </span>
        {attemptedCount > 0 ? (
          <button onClick={resetAllFiltered} className="flex items-center gap-1.5 font-semibold text-neutral-400 hover:text-rose-600">
            <RotateCcw size={12} /> Đặt lại tất cả ({attemptedCount})
          </button>
        ) : null}
      </div>

      {filtered.length === 0 ? (
        <p className="mt-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-600">Không có câu nào khớp bộ lọc này.</p>
      ) : (
        <div className="mt-3 flex flex-col gap-2">
          {filtered.map((q, i) => {
            const status = progress[q.id]?.status;
            const borderCls =
              status === "correct" ? "border-l-emerald-400" : status === "wrong" ? "border-l-rose-400" : "border-l-neutral-200";
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
                    {TASK_TYPE_LABELS[q.taskType]} · {q.level}
                  </div>
                </div>
                {status === "correct" ? (
                  <span className="shrink-0 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-600">✓ đúng</span>
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
  const [showTranslation, setShowTranslation] = useState(true);
  const answered = selected !== null;
  const currentIndex = filtered.findIndex((q) => q.id === question.id);
  const prevQuestion = currentIndex > 0 ? filtered[currentIndex - 1] : null;
  const nextQuestion = currentIndex >= 0 && currentIndex < filtered.length - 1 ? filtered[currentIndex + 1] : null;

  useFloatingNav(true);

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

  // Real 発話表現・即時応答 (sokuji) items print NOTHING on paper -- the test
  // taker hears a line and picks 1/2/3 from memory alone, no printed
  // question/options to read along with. Showing the Japanese text upfront
  // (as we do for kadai/point/gaiyou, which DO print at least the question
  // or picture options) defeats the point of practicing this format, so
  // keep it hidden -- blind numbered buttons only -- until answered.
  const isBlind = question.taskType === "sokuji" && !question.optionsImage;

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
    <div className="mx-auto max-w-3xl px-2.5 py-2 md:px-8 md:py-6">
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={onBack} className="flex items-center gap-1 text-sm font-medium text-neutral-500 hover:text-neutral-700">
          <ChevronLeft size={15} /> Luyện nghe
        </button>
        <span className="rounded-full px-2.5 py-1 text-xs font-semibold" style={levelBadgeStyle(question.level)}>
          {question.level}
        </span>
        <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-semibold text-neutral-600">
          {TASK_TYPE_LABELS[question.taskType]}
        </span>
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
        <div className="flex items-start gap-2 text-sm font-semibold text-neutral-700">
          <Headphones size={17} className="mt-0.5 shrink-0 text-neutral-400" />
          <span>{isBlind && !answered ? "Nghe rồi chọn đáp án đúng" : question.scenario || question.question}</span>
        </div>
        {answered && question.scenarioVi ? <div className="ml-[25px] text-sm text-neutral-400">{question.scenarioVi}</div> : null}
        <AudioPlayer key={question.id} src={assetUrl(question.audioUrl)} />
      </Card>

      {answered && question.turns.length > 0 ? (
        <Card className="mt-4 gap-0 rounded-2xl border-neutral-200 p-5 ring-0">
          <div className="flex items-center justify-between">
            <div className="text-xs font-bold tracking-wide text-neutral-400 uppercase">Transcript</div>
            <button
              onClick={() => setShowTranslation((v) => !v)}
              className="flex items-center gap-1.5 rounded-full border border-neutral-200 px-3 py-1 text-xs font-semibold text-neutral-600 hover:bg-neutral-50"
            >
              <Globe size={13} /> {showTranslation ? "Ẩn bản dịch" : "Hiện bản dịch"}
            </button>
          </div>
          <div className="mt-3 flex flex-col gap-3.5">
            {question.turns.map((t, i) => (
              <div key={i}>
                <div className="text-[14.5px] leading-relaxed text-neutral-800">
                  <b className="font-bold text-neutral-400">{t.speaker}：</b>
                  {t.text}
                </div>
                {showTranslation && t.textVi ? (
                  <div className="mt-1 border-l-2 border-neutral-300 pl-3 text-[13px] leading-snug text-neutral-500 italic">{t.textVi}</div>
                ) : null}
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      <Card className="mt-4 gap-0 rounded-2xl border-neutral-200 p-5 ring-0">
        {!isBlind || answered ? (
          <>
            <div className="font-semibold text-neutral-800">{question.question}</div>
            {answered ? <div className="mt-1 text-sm text-neutral-500">{question.questionVi}</div> : null}
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
                  {opt}
                  {answered ? <span className="block text-xs text-neutral-400">{question.optionsVi[oi]}</span> : null}
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
          className="fixed bottom-36 left-4 z-20 flex h-10 w-10 items-center justify-center rounded-full bg-white text-neutral-600 shadow-lg ring-1 ring-neutral-200 active:bg-neutral-50 md:hidden"
        >
          <ChevronLeft size={18} />
        </button>
      ) : null}
      {nextQuestion ? (
        <button
          onClick={() => onOpen(nextQuestion.id)}
          aria-label="Câu sau"
          className="fixed right-4 bottom-36 z-20 flex h-10 w-10 items-center justify-center rounded-full bg-rose-600 text-white shadow-lg active:bg-rose-700 md:hidden"
        >
          <ChevronRight size={18} />
        </button>
      ) : null}
    </div>
  );
}
