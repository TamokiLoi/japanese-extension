import { useEffect, useState } from "react";
import { Shuffle, Undo2, ChevronLeft, ChevronRight, RotateCcw } from "lucide-react";
import type { QuizBookQuestion } from "../../types/quizBook.ts";
import {
  ALL_QUIZBOOK,
  AVAILABLE_CATEGORIES,
  AVAILABLE_GROUPS,
  GROUP_LABELS,
  BOOK_GROUP,
  booksInGroup,
  CATEGORY_LABELS,
  BOOK_LABELS,
  QUESTION_COUNT_OPTIONS,
  ALL_QUESTIONS_SENTINEL,
  pickRandomQuestion,
  findQuizBookById,
  loadViewerState,
  saveViewerState,
  getQuestionProgress,
  resetQuestionAnswer,
  recordAnswer,
  buildSession,
  matchesFilters,
  type QuizBookViewerState,
} from "../../popup/quizBookState.ts";
import {
  recordAnswer as recordGlobalAnswer,
  clearProgress as clearGlobalProgress,
  loadProgressMap,
  type ProgressMap,
} from "../../popup/progressState.ts";
import { pruneToggle } from "../../popup/filterUtils.ts";
import { Card } from "../components/ui/card.tsx";
import { Button } from "../components/ui/button.tsx";
import { PageHeader } from "../components/PageHeader.tsx";
import { StatCard } from "../components/StatCard.tsx";
import { FilterBar, FilterTrigger } from "../components/FilterBar.tsx";
import { ActiveFilters } from "../components/ActiveFilters.tsx";
import { FilterSheet, FilterGroup, FilterChipOption } from "../components/FilterSheet.tsx";
import { QuestionPalette, type PaletteStatus } from "../components/QuestionPalette.tsx";
import { useConfirm } from "../components/ConfirmDialog.tsx";
import { useFloatingNav } from "../WebAppShell.tsx";

export function QuizBookScreen({
  targetId,
  onCurrentItemChange,
}: {
  targetId?: string;
  onCurrentItemChange?: (id: string | undefined) => void;
} = {}) {
  const [state, setState] = useState<QuizBookViewerState | null>(null);
  const [error, setError] = useState<string | undefined>(undefined);
  // "Cần ôn lại" (below) reads the same wrong-streak auto-flag that Kanji/
  // Vocab/Bunpo use (progressState.ts), which recordGlobalAnswer already
  // writes to on every answer here -- this just needs to be re-read after
  // each answer/reset so the list's counts stay in sync.
  const [progressMap, setProgressMap] = useState<ProgressMap>({});

  async function refreshProgressMap() {
    setProgressMap(await loadProgressMap());
  }

  useEffect(() => {
    refreshProgressMap();
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let s = await loadViewerState();
      const target = targetId ? findQuizBookById(targetId) : undefined;
      if (target) {
        // Cross-linked in from another screen (e.g. a Vocab/Bunpo reference)
        // rather than a "Bắt đầu" session -- page through the rest of the
        // same book in its natural order so Trước/Tiếp has something to do
        // instead of landing on a lone question with no way to browse on.
        const bookQuestions = ALL_QUIZBOOK.filter((q) => q.book === target.book);
        const sessionIndex = bookQuestions.findIndex((q) => q.id === target.id);
        s = { ...s, currentQuestionId: target.id, sessionIds: bookQuestions.map((q) => q.id), sessionIndex: Math.max(0, sessionIndex) };
        await saveViewerState(s);
      }
      if (cancelled) return;
      setState(s);
    })();
    return () => {
      cancelled = true;
    };
  }, [targetId]);

  async function mutate(partial: Partial<QuizBookViewerState>) {
    if (!state) return;
    const next = { ...state, ...partial };
    await saveViewerState(next);
    setState(next);
    setError(undefined);
  }

  useEffect(() => {
    onCurrentItemChange?.(state?.currentQuestionId ?? undefined);
  }, [state?.currentQuestionId, onCurrentItemChange]);

  if (!state) return <div className="p-6 text-neutral-400">Đang tải...</div>;

  const question = state.currentQuestionId ? findQuizBookById(state.currentQuestionId) : undefined;

  if (question) {
    return <QuestionView q={question} state={state} mutate={mutate} onAnswered={refreshProgressMap} />;
  }

  return <ListView state={state} mutate={mutate} error={error} setError={setError} progressMap={progressMap} onProgressChange={refreshProgressMap} />;
}

function ListView({
  state,
  mutate,
  error,
  setError,
  progressMap,
  onProgressChange,
}: {
  state: QuizBookViewerState;
  mutate: (partial: Partial<QuizBookViewerState>) => Promise<void>;
  error?: string;
  setError: (e?: string) => void;
  progressMap: ProgressMap;
  onProgressChange: () => Promise<void>;
}) {
  const confirm = useConfirm();
  const [filterOpen, setFilterOpen] = useState(false);
  const filtered = ALL_QUIZBOOK.filter((q) => matchesFilters(q, state));
  const progressOf = (q: QuizBookQuestion) => getQuestionProgress(q.id, state.answers, state.correctStreaks);
  // "Cần ôn lại" reuses the same wrong-streak auto-flag Kanji/Vocab/Bunpo
  // show (progressState.ts) -- recordGlobalAnswer already writes it on every
  // answer here, this just reads it back.
  const isFlagged = (q: QuizBookQuestion) => progressMap[q.id]?.flagged ?? false;
  const doneCount = filtered.filter((q) => progressOf(q).status !== "not-started").length;
  const correctCount = filtered.filter((q) => progressOf(q).correct).length;
  const needsReviewCount = filtered.filter(isFlagged).length;
  const inProgressCount = filtered.filter((q) => progressOf(q).status !== "not-started" && !isFlagged(q)).length;

  const visibleQuestions = filtered.filter((q) => {
    if (state.listStatusFilter === "all") return true;
    const status = progressOf(q).status;
    if (state.listStatusFilter === "needs-review") return isFlagged(q);
    if (state.listStatusFilter === "in-progress") return status !== "not-started" && !isFlagged(q);
    if (state.listStatusFilter === "correct") return progressOf(q).correct;
    if (state.listStatusFilter === "done") return status === "done" || status === "known";
    return status === state.listStatusFilter; // "not-started" | "known" (popup screen's own filter chips)
  });

  const quizPoolSize = filtered.length;
  const defaultCount = Math.min(state.questionCount, quizPoolSize) || quizPoolSize;
  const countOptions = [...QUESTION_COUNT_OPTIONS.filter((n) => n <= quizPoolSize), ALL_QUESTIONS_SENTINEL];
  const selectedCount =
    state.questionCount >= quizPoolSize
      ? ALL_QUESTIONS_SENTINEL
      : countOptions.reduce((closest, n) => (Math.abs(n - defaultCount) < Math.abs(closest - defaultCount) ? n : closest));
  const effectiveCount = Math.min(selectedCount, quizPoolSize);

  const booksInCurrentGroup = booksInGroup(state.selectedGroup);
  const allBooksInGroupChecked = booksInCurrentGroup.every((b) => state.selectedBooks.includes(b));
  const allCategoriesChecked = state.selectedCategories.length === AVAILABLE_CATEGORIES.length;
  const filterCount = (allBooksInGroupChecked ? 0 : state.selectedBooks.length) + (allCategoriesChecked ? 0 : state.selectedCategories.length);

  async function handleStart() {
    if (filtered.length === 0) {
      setError("Không có câu hỏi nào khớp bộ lọc này.");
      return;
    }
    const sessionIds = buildSession(filtered, state.questionCount);
    const first = findQuizBookById(sessionIds[0])!;
    await mutate({ currentQuestionId: first.id, sessionIds, sessionIndex: 0 });
  }

  async function handleResetRow(id: string) {
    if (!(await confirm("Làm lại câu này từ đầu? Kết quả đã trả lời sẽ bị xoá."))) return;
    await mutate(resetQuestionAnswer(state, id));
    // resetQuestionAnswer only clears this screen's own answers/streaks --
    // also clear the shared progressState.ts entry recordAnswer() writes on
    // every answer, or Home/Stats would keep showing this question's old
    // mastery streak as if it were never reset.
    await clearGlobalProgress([id]);
    await onProgressChange();
  }

  async function handleResetAllFiltered() {
    if (doneCount === 0) return;
    if (!(await confirm(`Đặt lại toàn bộ ${doneCount} câu đã làm trong bộ lọc hiện tại về "chưa làm"? Không thể hoàn tác.`))) return;
    const ids = filtered.map((q) => q.id);
    const next = ids.reduce((s, id) => resetQuestionAnswer(s, id), state);
    await mutate(next);
    await clearGlobalProgress(ids);
    await onProgressChange();
  }

  return (
    <div className="mx-auto max-w-4xl px-2.5 py-2 md:px-8 md:py-6">
      <PageHeader title="Luyện đề" subtitle={`${filtered.length} câu`} icon={{ img: "icon-review.png", bg: "#ffe4e6" }} />

      <div className="mt-4 grid grid-cols-2 gap-3">
        <StatCard
          label="Đã làm"
          active={state.listStatusFilter === "done"}
          onClick={() => mutate({ listStatusFilter: state.listStatusFilter === "done" ? "all" : "done" })}
          value={
            <>
              {doneCount}
              <span className="text-xs font-semibold text-neutral-400">/{filtered.length}</span>
            </>
          }
        />
        <StatCard
          label="Đúng"
          tone="emerald"
          active={state.listStatusFilter === "correct"}
          onClick={() => mutate({ listStatusFilter: state.listStatusFilter === "correct" ? "all" : "correct" })}
          value={
            <>
              {correctCount}
              <span className="text-xs font-semibold text-neutral-400">/{doneCount}</span>
            </>
          }
        />
        <StatCard
          label="Đang làm"
          tone="amber"
          active={state.listStatusFilter === "in-progress"}
          onClick={() => mutate({ listStatusFilter: state.listStatusFilter === "in-progress" ? "all" : "in-progress" })}
          value={inProgressCount}
        />
        <StatCard
          label="Cần ôn lại"
          tone="rose"
          active={state.listStatusFilter === "needs-review"}
          onClick={() => mutate({ listStatusFilter: state.listStatusFilter === "needs-review" ? "all" : "needs-review" })}
          value={needsReviewCount}
        />
      </div>

      <FilterBar>
        <FilterTrigger count={filterCount} onClick={() => setFilterOpen(true)} />
        <select
          value={selectedCount}
          onChange={(e) => mutate({ questionCount: Number(e.target.value) })}
          className="max-w-[45%] truncate rounded-full border border-neutral-200 px-3 py-1.5 text-xs font-medium text-neutral-600 sm:max-w-none"
        >
          {countOptions.map((n) => (
            <option key={n} value={n}>
              {n === ALL_QUESTIONS_SENTINEL ? "Tất cả" : `${n} câu`}
            </option>
          ))}
        </select>
        {doneCount > 0 ? (
          <button onClick={handleResetAllFiltered} className="flex items-center gap-1.5 text-xs font-semibold text-neutral-400 hover:text-rose-600">
            <RotateCcw size={12} /> Đặt lại tất cả ({doneCount})
          </button>
        ) : null}
      </FilterBar>

      <ActiveFilters
        chips={[
          ...(allBooksInGroupChecked
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
          ...(allCategoriesChecked
            ? []
            : state.selectedCategories.map((c) => ({
                key: `cat-${c}`,
                label: CATEGORY_LABELS[c],
                onRemove: () => {
                  const next = state.selectedCategories.filter((x) => x !== c);
                  if (next.length === 0) return;
                  mutate({ selectedCategories: next });
                },
              }))),
        ]}
      />

      {error ? <p className="mt-3 rounded-lg bg-rose-50 p-3 text-sm text-rose-600">{error}</p> : null}

      <Button className="mt-4 w-full" onClick={handleStart}>
        <Shuffle size={16} /> Bắt đầu ({effectiveCount} câu)
      </Button>

      <FilterSheet
        open={filterOpen}
        onClose={() => setFilterOpen(false)}
        title="Bộ lọc luyện đề"
        onReset={() => mutate({ selectedBooks: booksInCurrentGroup, selectedCategories: [...AVAILABLE_CATEGORIES] })}
      >
        {AVAILABLE_GROUPS.length > 1 ? (
          <FilterGroup title="Nguồn">
            {AVAILABLE_GROUPS.map((group) => (
              <FilterChipOption
                key={group}
                label={`${GROUP_LABELS[group]} (${ALL_QUIZBOOK.filter((q) => BOOK_GROUP[q.book] === group).length})`}
                active={state.selectedGroup === group}
                onClick={() => {
                  if (group === state.selectedGroup) return;
                  const nextBooks = booksInGroup(group);
                  const nextCategories = pruneToggle(state.selectedCategories, AVAILABLE_CATEGORIES, (c) =>
                    ALL_QUIZBOOK.some((q) => q.category === c && nextBooks.includes(q.book)),
                  );
                  mutate({ selectedGroup: group, selectedBooks: nextBooks, selectedCategories: nextCategories });
                }}
              />
            ))}
          </FilterGroup>
        ) : null}

        <FilterGroup title={GROUP_LABELS[state.selectedGroup]}>
          {booksInCurrentGroup.map((book) => {
            const checked = state.selectedBooks.includes(book);
            const count = ALL_QUIZBOOK.filter((q) => q.book === book && state.selectedCategories.includes(q.category)).length;
            return (
              <FilterChipOption
                key={book}
                label={`${BOOK_LABELS[book]} (${count})`}
                active={checked}
                onClick={() => {
                  const next = checked ? state.selectedBooks.filter((b) => b !== book) : [...new Set([...state.selectedBooks, book])];
                  if (next.length === 0) return;
                  const nextCategories = pruneToggle(state.selectedCategories, AVAILABLE_CATEGORIES, (c) =>
                    ALL_QUIZBOOK.some((q) => q.category === c && next.includes(q.book)),
                  );
                  mutate({ selectedBooks: next, selectedCategories: nextCategories });
                }}
              />
            );
          })}
        </FilterGroup>

        <FilterGroup title="Dạng câu hỏi">
          {AVAILABLE_CATEGORIES.map((category) => {
            const checked = state.selectedCategories.includes(category);
            const count = ALL_QUIZBOOK.filter((q) => q.category === category && state.selectedBooks.includes(q.book)).length;
            return (
              <FilterChipOption
                key={category}
                label={`${CATEGORY_LABELS[category]} (${count})`}
                active={checked}
                onClick={() => {
                  const next = checked
                    ? state.selectedCategories.filter((c) => c !== category)
                    : [...new Set([...state.selectedCategories, category])];
                  if (next.length === 0) return;
                  const nextBooks = pruneToggle(state.selectedBooks, booksInCurrentGroup, (b) =>
                    ALL_QUIZBOOK.some((q) => q.book === b && next.includes(q.category)),
                  );
                  mutate({ selectedCategories: next, selectedBooks: nextBooks });
                }}
              />
            );
          })}
        </FilterGroup>
      </FilterSheet>

      {visibleQuestions.length === 0 ? (
        <p className="mt-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-600">Không có câu hỏi nào khớp bộ lọc này.</p>
      ) : (
        <div className="mt-4 flex flex-col gap-2">
          {visibleQuestions.map((q, i) => {
            const progress = progressOf(q);
            const borderCls =
              progress.status === "not-started"
                ? "border-l-neutral-200"
                : progress.correct
                  ? "border-l-emerald-400"
                  : "border-l-rose-400";
            return (
              <button
                key={q.id}
                onClick={() =>
                  mutate({ currentQuestionId: q.id, sessionIds: visibleQuestions.map((vq) => vq.id), sessionIndex: i })
                }
                className={`flex items-center gap-3 rounded-2xl border border-l-4 border-neutral-200 bg-white px-4 py-3.5 text-left hover:border-rose-200 hover:bg-rose-50/40 ${borderCls}`}
              >
                <span className="w-6 shrink-0 text-xs font-semibold text-neutral-300">{String(i + 1).padStart(2, "0")}</span>
                <div className="min-w-0 flex-1">
                  <div className={`truncate font-semibold ${q.question ? "text-neutral-800" : "text-neutral-400 italic"}`}>
                    {q.question || "(Thiếu đề bài do lỗi trích xuất dữ liệu gốc)"}
                  </div>
                  <div className="truncate text-xs text-neutral-500">
                    {BOOK_LABELS[q.book]} · {CATEGORY_LABELS[q.category]} · {q.level}
                  </div>
                </div>
                {progress.status === "known" ? (
                  <span className="shrink-0 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">★ đã biết</span>
                ) : progress.status === "done" ? (
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${progress.correct ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600"}`}
                  >
                    {progress.correct ? "✓ đúng" : "✗ sai"}
                  </span>
                ) : (
                  <span className="shrink-0 rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-semibold text-neutral-400">chưa làm</span>
                )}
                {progress.status !== "not-started" ? (
                  <span
                    role="button"
                    title="Làm lại từ đầu"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleResetRow(q.id);
                    }}
                    className="shrink-0 text-neutral-300 hover:text-neutral-500"
                  >
                    <Undo2 size={14} />
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function QuestionView({
  q,
  state,
  mutate,
  onAnswered,
}: {
  q: QuizBookQuestion;
  state: QuizBookViewerState;
  mutate: (partial: Partial<QuizBookViewerState>) => Promise<void>;
  onAnswered: () => Promise<void>;
}) {
  const confirm = useConfirm();
  useFloatingNav(true);
  const answered = state.answers[q.id] ?? null;
  const session = state.sessionIds;
  const sessionPos = session ? session.indexOf(q.id) : -1;
  const isLastInSession = session !== null && sessionPos === session.length - 1;
  const prevId = session && sessionPos > 0 ? session[sessionPos - 1] : undefined;
  const nextId = session && sessionPos >= 0 && sessionPos < session.length - 1 ? session[sessionPos + 1] : undefined;

  async function handleAnother() {
    if (session) {
      if (isLastInSession) {
        await mutate({ currentQuestionId: null, sessionIds: null, sessionIndex: 0 });
        return;
      }
      const next = findQuizBookById(session[sessionPos + 1])!;
      await mutate({ currentQuestionId: next.id, sessionIndex: sessionPos + 1 });
      return;
    }
    const next = pickRandomQuestion(state.selectedCategories, state.selectedBooks, q.id);
    if (!next) {
      await mutate({ currentQuestionId: null });
      return;
    }
    await mutate({ currentQuestionId: next.id });
  }

  async function handleReset() {
    if (!(await confirm("Làm lại câu này từ đầu? Kết quả đã trả lời sẽ bị xoá."))) return;
    await mutate(resetQuestionAnswer(state, q.id));
    await clearGlobalProgress([q.id]);
    await onAnswered();
  }

  async function jumpTo(i: number) {
    if (!session) return;
    const target = findQuizBookById(session[i]);
    if (!target) return;
    await mutate({ currentQuestionId: target.id, sessionIndex: i });
  }

  return (
    <div className="mx-auto max-w-4xl px-2.5 py-2 md:px-8 md:py-6">
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => mutate({ currentQuestionId: null })}
          className="flex items-center gap-1 text-sm font-medium text-neutral-500 hover:text-neutral-700"
        >
          <ChevronLeft size={15} /> Luyện đề
        </button>
        <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-semibold text-neutral-600">{q.level}</span>
        <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-semibold text-neutral-600">{BOOK_LABELS[q.book]}</span>
        <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-semibold text-neutral-600">{CATEGORY_LABELS[q.category]}</span>
        {session ? (
          <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-semibold text-neutral-600">
            Câu {sessionPos + 1}/{session.length}
          </span>
        ) : null}
      </div>

      {session ? (
        <QuestionPalette
          onJump={jumpTo}
          summary={(() => {
            const done = session.filter((id) => getQuestionProgress(id, state.answers, state.correctStreaks).status !== "not-started").length;
            const correct = session.filter((id) => getQuestionProgress(id, state.answers, state.correctStreaks).correct).length;
            return `Câu ${sessionPos + 1}/${session.length} · đã làm ${done} · đúng ${correct}`;
          })()}
          items={session.map((id, i) => {
            const progress = getQuestionProgress(id, state.answers, state.correctStreaks);
            const status: PaletteStatus =
              i === sessionPos ? "current" : progress.status === "not-started" ? "unanswered" : progress.correct ? "correct" : "wrong";
            return { id, status, title: progress.status === "known" ? "Đã biết" : undefined };
          })}
        />
      ) : null}

      <Card className="mt-4 gap-0 rounded-2xl border-neutral-200 p-6 ring-0">
        {q.passage ? (
          <div className="mb-4 rounded-lg bg-neutral-50 p-4 text-sm leading-relaxed whitespace-pre-line text-neutral-700">{q.passage}</div>
        ) : null}
        <div className={`font-semibold ${q.question ? "text-neutral-800" : "text-neutral-400 italic"}`}>
          {q.question || "(Thiếu đề bài do lỗi trích xuất dữ liệu gốc — vẫn có thể chọn đáp án bên dưới)"}
        </div>
        <div
          className={`mt-4 grid gap-2 ${q.options.every((o) => o.length <= 10) ? "grid-cols-2" : "grid-cols-1 sm:grid-cols-2"}`}
        >
          {q.options.map((opt, oi) => {
            let cls = "border-neutral-200 hover:bg-neutral-50";
            if (answered !== null) {
              if (oi === q.correctIndex) cls = "border-emerald-300 bg-emerald-50 text-emerald-700";
              else if (oi === answered) cls = "border-rose-300 bg-rose-50 text-rose-700";
              else cls = "border-neutral-200 opacity-50";
            }
            return (
              <button
                key={oi}
                disabled={answered !== null}
                onClick={async () => {
                  await recordGlobalAnswer(q.id, oi === q.correctIndex, "answer", ["answer"]);
                  await mutate(recordAnswer(state, q.id, oi));
                  await onAnswered();
                }}
                className={`rounded-lg border px-3 py-2 text-left text-sm ${cls}`}
              >
                {opt}
              </button>
            );
          })}
        </div>

        {answered !== null ? (
          <div className="mt-4 space-y-3 border-t border-neutral-100 pt-3 text-sm">
            {q.explanation ? <div className="text-neutral-600">{q.explanation}</div> : null}
            {q.notes.length ? (
              <div>
                <div className="text-xs font-semibold tracking-wide text-neutral-400 uppercase">Ghi chú</div>
                <div className="mt-1 flex flex-col gap-1">
                  {q.notes.map((note, i) => (
                    <div key={i} className="text-neutral-400">
                      {note}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
            <button onClick={handleReset} className="flex items-center gap-1 pt-1 text-xs font-semibold text-neutral-400 hover:text-neutral-600">
              <Undo2 size={12} /> Làm lại câu này
            </button>
          </div>
        ) : null}
      </Card>

      <Button className="mt-6 w-full" onClick={handleAnother}>
        {session ? (isLastInSession ? "🏁 Hoàn thành" : "Câu tiếp theo →") : <><Shuffle size={16} /> Câu khác</>}
      </Button>

      {prevId ? (
        <button
          onClick={() => mutate({ currentQuestionId: prevId, sessionIndex: sessionPos - 1 })}
          aria-label="Câu trước"
          className="fixed bottom-36 left-4 z-20 flex h-10 w-10 items-center justify-center rounded-full bg-white text-neutral-600 shadow-lg ring-1 ring-neutral-200 active:bg-neutral-50 md:hidden"
        >
          <ChevronLeft size={18} />
        </button>
      ) : null}
      {nextId ? (
        <button
          onClick={() => mutate({ currentQuestionId: nextId, sessionIndex: sessionPos + 1 })}
          aria-label="Câu sau"
          className="fixed right-4 bottom-36 z-20 flex h-10 w-10 items-center justify-center rounded-full bg-rose-600 text-white shadow-lg active:bg-rose-700 md:hidden"
        >
          <ChevronRight size={18} />
        </button>
      ) : null}
    </div>
  );
}
