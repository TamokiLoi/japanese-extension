import { useEffect, useState } from "react";
import { Shuffle, Undo2, List as ListIcon } from "lucide-react";
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
  type QuizBookViewerState,
} from "../../popup/quizBookState.ts";
import { Card } from "../components/ui/card.tsx";
import { Button } from "../components/ui/button.tsx";
import { PageHeader } from "../components/PageHeader.tsx";
import { FilterBar, FilterTrigger } from "../components/FilterBar.tsx";
import { ActiveFilters } from "../components/ActiveFilters.tsx";
import { FilterSheet, FilterGroup, FilterChipOption } from "../components/FilterSheet.tsx";

function matchesFilters(q: QuizBookQuestion, state: QuizBookViewerState): boolean {
  return state.selectedCategories.includes(q.category) && state.selectedBooks.includes(q.book);
}

const STATUS_LABELS = { all: "Tất cả", "not-started": "Chưa làm", done: "Đã làm", known: "Đã biết" } as const;

export function QuizBookScreen() {
  const [state, setState] = useState<QuizBookViewerState | null>(null);
  const [error, setError] = useState<string | undefined>(undefined);

  useEffect(() => {
    loadViewerState().then(setState);
  }, []);

  async function mutate(partial: Partial<QuizBookViewerState>) {
    if (!state) return;
    const next = { ...state, ...partial };
    await saveViewerState(next);
    setState(next);
    setError(undefined);
  }

  if (!state) return <div className="p-6 text-neutral-400">Đang tải...</div>;

  const question = state.currentQuestionId ? findQuizBookById(state.currentQuestionId) : undefined;

  if (question) {
    return <QuestionView q={question} state={state} mutate={mutate} />;
  }

  return <ListView state={state} mutate={mutate} error={error} setError={setError} />;
}

function ListView({
  state,
  mutate,
  error,
  setError,
}: {
  state: QuizBookViewerState;
  mutate: (partial: Partial<QuizBookViewerState>) => Promise<void>;
  error?: string;
  setError: (e?: string) => void;
}) {
  const [filterOpen, setFilterOpen] = useState(false);
  const filtered = ALL_QUIZBOOK.filter((q) => matchesFilters(q, state));
  const progressOf = (q: QuizBookQuestion) => getQuestionProgress(q.id, state.answers, state.correctStreaks);
  const doneCount = filtered.filter((q) => progressOf(q).status !== "not-started").length;
  const knownCount = filtered.filter((q) => progressOf(q).status === "known").length;
  const correctCount = filtered.filter((q) => progressOf(q).correct).length;

  const visibleQuestions = filtered.filter((q) => {
    if (state.listStatusFilter === "all") return true;
    const status = progressOf(q).status;
    if (state.listStatusFilter === "done") return status === "done" || status === "known";
    return status === state.listStatusFilter;
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
    if (!confirm("Làm lại câu này từ đầu? Kết quả đã trả lời sẽ bị xoá.")) return;
    await mutate(resetQuestionAnswer(state, id));
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 md:px-8 md:py-10">
      <PageHeader
        title="Luyện đề"
        subtitle={`${filtered.length} câu · đã làm ${doneCount}/${filtered.length} · đúng ${correctCount}/${doneCount || 0} · đã biết ${knownCount}`}
      />

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
        <div className="ml-auto flex gap-1.5">
          {(["all", "not-started", "done", "known"] as const).map((s) => (
            <button
              key={s}
              onClick={() => mutate({ listStatusFilter: s })}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium ${state.listStatusFilter === s ? "border-rose-300 bg-rose-50 text-rose-600" : "border-neutral-200 text-neutral-500"}`}
            >
              {STATUS_LABELS[s]}
            </button>
          ))}
        </div>
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
                  mutate({ selectedGroup: group, selectedBooks: booksInGroup(group) });
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
                  mutate({ selectedBooks: next });
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
                  mutate({ selectedCategories: next });
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
            return (
              <button
                key={q.id}
                onClick={() => mutate({ currentQuestionId: q.id, sessionIds: null, sessionIndex: 0 })}
                className="flex items-center gap-3 rounded-xl border border-neutral-200 bg-white px-4 py-3 text-left hover:border-rose-200 hover:bg-rose-50/40"
              >
                <span className="w-6 shrink-0 text-xs font-semibold text-neutral-300">{String(i + 1).padStart(2, "0")}</span>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold text-neutral-800">{q.question}</div>
                  <div className="truncate text-xs text-neutral-500">
                    {BOOK_LABELS[q.book]} · {CATEGORY_LABELS[q.category]} · {q.level}
                  </div>
                </div>
                {progress.status === "known" ? (
                  <span className="shrink-0 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-600">★ đã biết</span>
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
}: {
  q: QuizBookQuestion;
  state: QuizBookViewerState;
  mutate: (partial: Partial<QuizBookViewerState>) => Promise<void>;
}) {
  const answered = state.answers[q.id] ?? null;
  const session = state.sessionIds;
  const sessionPos = session ? session.indexOf(q.id) : -1;
  const isLastInSession = session !== null && sessionPos === session.length - 1;

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
    if (!confirm("Làm lại câu này từ đầu? Kết quả đã trả lời sẽ bị xoá.")) return;
    await mutate(resetQuestionAnswer(state, q.id));
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 md:px-8 md:py-10">
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => mutate({ currentQuestionId: null })}
          className="flex items-center gap-1 text-sm font-medium text-neutral-500 hover:text-neutral-700"
        >
          <ListIcon size={15} /> Danh sách
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

      <Card className="mt-4 gap-0 p-6">
        <div className="font-semibold text-neutral-800">{q.question}</div>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
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
                onClick={() => mutate(recordAnswer(state, q.id, oi))}
                className={`rounded-lg border px-3 py-2 text-left text-sm ${cls}`}
              >
                {opt}
              </button>
            );
          })}
        </div>

        {answered !== null ? (
          <div className="mt-4 space-y-1 border-t border-neutral-100 pt-3 text-sm">
            {q.explanation ? <div className="text-neutral-600">{q.explanation}</div> : null}
            {q.notes.length ? <div className="text-neutral-400">{q.notes.join(" · ")}</div> : null}
            <button onClick={handleReset} className="flex items-center gap-1 pt-1 text-xs font-semibold text-neutral-400 hover:text-neutral-600">
              <Undo2 size={12} /> Làm lại câu này
            </button>
          </div>
        ) : null}
      </Card>

      <Button className="mt-6 w-full" onClick={handleAnother}>
        {session ? (isLastInSession ? "🏁 Hoàn thành" : "Câu tiếp theo →") : <><Shuffle size={16} /> Câu khác</>}
      </Button>
    </div>
  );
}
