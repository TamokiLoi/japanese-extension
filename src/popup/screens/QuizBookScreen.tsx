import { useEffect, useState } from "react";
import type { QuizBookQuestion, QuizBookCategory } from "../../types/quizBook.ts";
import {
  ALL_QUIZBOOK,
  AVAILABLE_CATEGORIES,
  AVAILABLE_GROUPS,
  GROUP_LABELS,
  BOOK_GROUP,
  booksInGroup,
  CATEGORY_LABELS,
  BOOK_LABELS,
  BOOK_LEVELS,
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
  type QuizBookGroup,
  type QuizBookViewerState,
} from "../quizBookState.ts";
import { LevelDot } from "../LevelDot.tsx";
import { ExpandTabButton } from "../TabMode.tsx";

function matchesFilters(q: QuizBookQuestion, state: QuizBookViewerState): boolean {
  return state.selectedCategories.includes(q.category) && state.selectedBooks.includes(q.book);
}

function StatusIcon({ status, correct }: { status: "not-started" | "done" | "known"; correct: boolean }) {
  if (status === "known") {
    return <span className="reading-status-badge reading-status-known">★ đã biết</span>;
  }
  if (status === "done") {
    return <span className={`reading-status-badge ${correct ? "reading-status-perfect" : "reading-status-done"}`}>{correct ? "✓ đúng" : "✗ sai"}</span>;
  }
  return <span className="reading-status-badge reading-status-todo">chưa làm</span>;
}

const CATEGORY_ICON: Record<QuizBookCategory, string> = { moji: "字", goi: "語", bunpou: "文" };
const STATUS_LABELS = { all: "Tất cả", "not-started": "Chưa làm", done: "Đã làm", known: "Đã biết" } as const;

export function QuizBookScreen({ onBack }: { onBack: () => void }) {
  const [state, setState] = useState<QuizBookViewerState | null>(null);
  const [error, setError] = useState<string | undefined>(undefined);
  const [detailId, setDetailId] = useState<string | null>(null);

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

  if (!state) {
    return (
      <header className="toolbar">
        <button className="icon-btn" title="Về menu" onClick={onBack}>
          ←
        </button>
        <span className="counter">Luyện đề</span>
        <ExpandTabButton screenHash="quizBook" />
      </header>
    );
  }

  const question = state.currentQuestionId ? findQuizBookById(state.currentQuestionId) : undefined;

  if (question) {
    return <QuestionView q={question} state={state} onBack={onBack} mutate={mutate} />;
  }

  return (
    <ListView state={state} onBack={onBack} mutate={mutate} error={error} setError={setError} detailId={detailId} setDetailId={setDetailId} />
  );
}

function ListView({
  state,
  onBack,
  mutate,
  error,
  setError,
  detailId,
  setDetailId,
}: {
  state: QuizBookViewerState;
  onBack: () => void;
  mutate: (partial: Partial<QuizBookViewerState>) => Promise<void>;
  error?: string;
  setError: (e?: string) => void;
  detailId: string | null;
  setDetailId: (id: string | null) => void;
}) {
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

  async function handleStart() {
    if (filtered.length === 0) {
      setError("Không có câu hỏi nào khớp bộ lọc này.");
      return;
    }
    const sessionIds = buildSession(filtered, state.questionCount);
    const first = findQuizBookById(sessionIds[0])!;
    await mutate({ currentQuestionId: first.id, sessionIds, sessionIndex: 0 });
  }

  const detailQuestion = detailId ? findQuizBookById(detailId) : undefined;
  const detailProgress = detailQuestion ? getQuestionProgress(detailQuestion.id, state.answers, state.correctStreaks) : null;

  async function handleResetDetail(id: string) {
    if (!confirm("Làm lại câu này từ đầu? Kết quả đã trả lời sẽ bị xoá.")) return;
    await mutate(resetQuestionAnswer(state, id));
  }

  return (
    <>
      <header className="toolbar">
        <button className="icon-btn" title="Về menu" onClick={onBack}>
          ←
        </button>
        <span className="counter">Luyện đề</span>
        <ExpandTabButton screenHash="quizBook" />
      </header>

      <section className="quiz-setup">
        {AVAILABLE_GROUPS.length > 1 ? (
          <div className="quiz-setup-group">
            <div className="quiz-setup-label">Nguồn</div>
            <div className="quiz-radio-row">
              {AVAILABLE_GROUPS.map((group) => {
                const count = ALL_QUIZBOOK.filter((q) => BOOK_GROUP[q.book] === group).length;
                return (
                  <label key={group} className="quiz-radio">
                    <input
                      type="radio"
                      name="group"
                      checked={state.selectedGroup === group}
                      onChange={() => {
                        if (group === state.selectedGroup) return;
                        mutate({ selectedGroup: group, selectedBooks: booksInGroup(group) });
                      }}
                    />
                    {GROUP_LABELS[group]} <span className="muted">({count})</span>
                  </label>
                );
              })}
            </div>
          </div>
        ) : null}

        <div className="quiz-setup-group">
          <div className="quiz-setup-label">{GROUP_LABELS[state.selectedGroup]}</div>
          <div className="reading-book-radio-row">
            {booksInGroup(state.selectedGroup).map((book) => {
              const checked = state.selectedBooks.includes(book);
              const count = ALL_QUIZBOOK.filter((q) => q.book === book && state.selectedCategories.includes(q.category)).length;
              return (
                <label key={book} className="quiz-radio reading-book-radio">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => {
                      const next = e.target.checked
                        ? [...new Set([...state.selectedBooks, book])]
                        : state.selectedBooks.filter((b) => b !== book);
                      if (next.length === 0) return;
                      mutate({ selectedBooks: next });
                    }}
                  />
                  <span className="reading-book-radio-body">
                    <span className="reading-book-radio-title">
                      <LevelDot level={BOOK_LEVELS[book]} />
                      {BOOK_LABELS[book]}
                    </span>
                    <span className="reading-book-radio-note">{count} câu</span>
                  </span>
                </label>
              );
            })}
          </div>
        </div>

        <div className="quiz-setup-group">
          <div className="quiz-setup-label">Dạng câu hỏi</div>
          <div className="quiz-radio-row">
            {AVAILABLE_CATEGORIES.map((category) => {
              const checked = state.selectedCategories.includes(category);
              const count = ALL_QUIZBOOK.filter((q) => q.category === category && state.selectedBooks.includes(q.book)).length;
              return (
                <label key={category} className="quiz-radio">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => {
                      const next = e.target.checked
                        ? [...new Set([...state.selectedCategories, category])]
                        : state.selectedCategories.filter((c) => c !== category);
                      if (next.length === 0) return;
                      mutate({ selectedCategories: next });
                    }}
                  />
                  {CATEGORY_LABELS[category]} <span className="muted">({count})</span>
                </label>
              );
            })}
          </div>
        </div>

        <div className="quiz-setup-group">
          <div className="quiz-setup-label">Số câu (trong {quizPoolSize} câu khớp bộ lọc)</div>
          <div className="quiz-count-row">
            <select value={selectedCount} onChange={(e) => mutate({ questionCount: Number(e.target.value) })}>
              {countOptions.map((n) => (
                <option key={n} value={n}>
                  {n === ALL_QUESTIONS_SENTINEL ? "Tất cả" : `${n} câu`}
                </option>
              ))}
            </select>
          </div>
        </div>

        {error ? <p className="quiz-error">{error}</p> : null}

        <button className="primary-action-btn" onClick={handleStart}>
          🎲 Bắt đầu ({effectiveCount} câu)
        </button>
      </section>

      <section className="reading-list-section">
        <div className="reading-list-summary">
          <span>
            Đã làm <strong>{doneCount}/{filtered.length}</strong> câu · đúng <strong>{correctCount}/{doneCount || 0}</strong> · đã biết{" "}
            <strong>{knownCount}</strong>
          </span>
          <div className="reading-status-filter-row">
            {(["all", "not-started", "done", "known"] as const).map((s) => (
              <button
                key={s}
                className={`reading-status-filter-btn ${state.listStatusFilter === s ? "reading-status-filter-active" : ""}`}
                onClick={() => mutate({ listStatusFilter: s })}
              >
                {STATUS_LABELS[s]}
              </button>
            ))}
          </div>
        </div>
        <div className="reading-detail">
          {detailQuestion && detailProgress ? (
            <>
              <div className="reading-detail-title">{detailQuestion.question}</div>
              <div className="reading-detail-meta">
                {BOOK_LABELS[detailQuestion.book]} · {CATEGORY_LABELS[detailQuestion.category]} · {detailQuestion.level}
              </div>
              <div className="reading-detail-footer">
                <StatusIcon status={detailProgress.status} correct={detailProgress.correct} />
                {detailProgress.status !== "not-started" ? (
                  <button className="reading-reset-btn" onClick={() => handleResetDetail(detailQuestion.id)}>
                    ↺ Làm lại
                  </button>
                ) : null}
              </div>
            </>
          ) : (
            <span className="reading-detail-empty">Di chuột vào một câu để xem chi tiết, bấm để mở</span>
          )}
        </div>
        {visibleQuestions.length === 0 ? (
          <p className="quiz-error reading-empty">Không có câu hỏi nào khớp bộ lọc này.</p>
        ) : (
          <div className="reading-tile-grid">
            {visibleQuestions.map((q) => {
              const progress = progressOf(q);
              const cls =
                progress.status === "known"
                  ? "reading-tile-known"
                  : progress.status === "done"
                    ? progress.correct
                      ? "reading-tile-perfect"
                      : "reading-tile-done reading-tile-wrong"
                    : "reading-tile-todo";
              return (
                <button
                  key={q.id}
                  className={`reading-tile ${cls}`}
                  onMouseEnter={() => setDetailId(q.id)}
                  onFocus={() => setDetailId(q.id)}
                  onClick={() => mutate({ currentQuestionId: q.id, sessionIds: null, sessionIndex: 0 })}
                >
                  {CATEGORY_ICON[q.category]}
                </button>
              );
            })}
          </div>
        )}
      </section>
    </>
  );
}

function QuestionView({
  q,
  state,
  onBack,
  mutate,
}: {
  q: QuizBookQuestion;
  state: QuizBookViewerState;
  onBack: () => void;
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
    <>
      <header className="toolbar">
        <button className="icon-btn" title="Về menu" onClick={onBack}>
          ←
        </button>
        <span className="counter">Luyện đề</span>
        <ExpandTabButton screenHash="quizBook" />
      </header>

      <main className="reading-card">
        <div className="reading-meta">
          <span className="level-badge" data-level={q.level}>
            {q.level}
          </span>
          <span className="reading-book-badge">{BOOK_LABELS[q.book]}</span>
          <span className="reading-timeline">{CATEGORY_LABELS[q.category]}</span>
          {session ? (
            <span className="reading-book-badge">
              Câu {sessionPos + 1}/{session.length}
            </span>
          ) : null}
          <button className="reading-change-filter" title="Về danh sách câu hỏi" onClick={() => mutate({ currentQuestionId: null })}>
            ☰ Danh sách
          </button>
        </div>

        <div className="reading-question">
          <div className="reading-question-prompt">{q.question}</div>
          <div className="quiz-choices">
            {q.options.map((opt, oi) => {
              const classes = ["quiz-choice"];
              if (answered !== null) {
                if (oi === q.correctIndex) classes.push("quiz-choice-correct");
                else if (oi === answered) classes.push("quiz-choice-wrong");
              }
              return (
                <button
                  key={oi}
                  className={classes.join(" ")}
                  disabled={answered !== null}
                  onClick={() => mutate(recordAnswer(state, q.id, oi))}
                >
                  {opt}
                </button>
              );
            })}
          </div>
        </div>

        {answered !== null ? (
          <>
            {q.explanation ? <div className="reading-question-vi">{q.explanation}</div> : null}
            {q.notes.length ? <div className="reading-explanation">{q.notes.join(" · ")}</div> : null}
            <button className="reading-reset-btn" title="Làm lại từ đầu" onClick={handleReset}>
              ↺ Làm lại câu này
            </button>
          </>
        ) : null}

        <button className="primary-action-btn reading-another-btn" onClick={handleAnother}>
          {session ? (isLastInSession ? "🏁 Hoàn thành" : "➜ Câu tiếp theo") : "🎲 Câu khác"}
        </button>
      </main>
    </>
  );
}
