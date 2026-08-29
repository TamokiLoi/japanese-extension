import { useEffect, useState } from "react";
import type { ReadingPassage, ReadingLength, ReadingBook } from "../../types/reading.ts";
import {
  ALL_READING,
  AVAILABLE_LEVELS,
  AVAILABLE_LENGTHS,
  AVAILABLE_BOOKS,
  LENGTH_LABELS,
  BOOK_LABELS,
  BOOK_DIFFICULTY_NOTE,
  pickRandomPassage,
  findReadingById,
  loadViewerState,
  saveViewerState,
  getPassageProgress,
  resetPassageAnswers,
  type ReadingViewerState,
} from "../readingState.ts";
import type { JlptLevel } from "../../types/kanji.ts";
import { LevelDot } from "../LevelDot.tsx";
import { ExpandTabButton } from "../TabMode.tsx";
import { CollapsibleSection } from "../CollapsibleSection.tsx";

function matchesFilters(p: ReadingPassage, state: ReadingViewerState): boolean {
  return state.selectedLevels.includes(p.level) && state.selectedLengths.includes(p.length) && state.selectedBooks.includes(p.book);
}

function StatusIcon({ status, correct, total }: { status: "not-started" | "in-progress" | "done"; correct: number; total: number }) {
  if (status === "done") {
    const allCorrect = correct === total;
    return (
      <span className={`reading-status-badge ${allCorrect ? "reading-status-perfect" : "reading-status-done"}`}>
        ✓ {correct}/{total}
      </span>
    );
  }
  if (status === "in-progress") {
    return <span className="reading-status-badge reading-status-progress">⋯ đang làm</span>;
  }
  return <span className="reading-status-badge reading-status-todo">chưa làm</span>;
}

// Minutes shown as a small range around the stored estimate, so it reads
// like "~3-4 phút" instead of implying false precision.
function timelineLabel(passage: ReadingPassage): string {
  const min = passage.estimatedMinutes;
  const max = min + (passage.length === "long" ? 3 : passage.length === "medium" ? 2 : 1);
  return `${LENGTH_LABELS[passage.length]} · ~${min}-${max} phút`;
}

function ReadingBody({ passage, showFurigana }: { passage: ReadingPassage; showFurigana: boolean }) {
  return (
    <>
      {passage.body.map((seg, i) =>
        showFurigana && seg.furigana ? (
          <ruby key={i}>
            {seg.text}
            <rt>{seg.furigana}</rt>
          </ruby>
        ) : (
          <span key={i}>
            {seg.text.split("\n").map((line, li, arr) => (
              <span key={li}>
                {line}
                {li < arr.length - 1 ? <br /> : null}
              </span>
            ))}
          </span>
        ),
      )}
    </>
  );
}

const STATUS_LABELS = { all: "Tất cả", "not-started": "Chưa làm", done: "Đã làm" } as const;

export function ReadingScreen({ onBack }: { onBack: () => void }) {
  const [state, setState] = useState<ReadingViewerState | null>(null);
  const [error, setError] = useState<string | undefined>(undefined);
  const [detailId, setDetailId] = useState<string | null>(null);

  useEffect(() => {
    loadViewerState().then(setState);
  }, []);

  async function mutate(partial: Partial<ReadingViewerState>) {
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
        <span className="counter">Luyện đọc</span>
        <ExpandTabButton screenHash="reading" />
      </header>
    );
  }

  const passage = state.currentPassageId ? findReadingById(state.currentPassageId) : undefined;

  if (passage) {
    return <PassageView passage={passage} state={state} onBack={onBack} mutate={mutate} setError={setError} />;
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
  state: ReadingViewerState;
  onBack: () => void;
  mutate: (partial: Partial<ReadingViewerState>) => Promise<void>;
  error?: string;
  setError: (e?: string) => void;
  detailId: string | null;
  setDetailId: (id: string | null) => void;
}) {
  const filtered = ALL_READING.filter((p) => matchesFilters(p, state));
  const doneCount = filtered.filter((p) => getPassageProgress(p, state.answers).status === "done").length;

  const visiblePassages = filtered.filter((p) => {
    if (state.listStatusFilter === "all") return true;
    const progress = getPassageProgress(p, state.answers);
    if (state.listStatusFilter === "done") return progress.status === "done";
    return progress.status !== "done";
  });

  const statusDotClass = (status: "not-started" | "in-progress" | "done", correct: number, total: number) => {
    if (status === "done") return correct === total ? "reading-tile-perfect" : "reading-tile-done";
    if (status === "in-progress") return "reading-tile-progress";
    return "reading-tile-todo";
  };

  async function openPassage(passage: ReadingPassage) {
    await mutate({
      currentPassageId: passage.id,
      answers: { ...state.answers, [passage.id]: state.answers[passage.id] ?? passage.questions.map(() => null) },
    });
  }

  async function handleStart() {
    const passage = pickRandomPassage(state.selectedLevels, state.selectedLengths, state.selectedBooks);
    if (!passage) {
      setError("Không có bài đọc nào khớp bộ lọc này.");
      return;
    }
    await openPassage(passage);
  }

  const detailPassage = detailId ? findReadingById(detailId) : undefined;
  const detailProgress = detailPassage ? getPassageProgress(detailPassage, state.answers) : null;

  async function handleResetDetail(passage: ReadingPassage) {
    if (!confirm(`Làm lại "${passage.title}" từ đầu? Kết quả đã trả lời sẽ bị xoá.`)) return;
    await mutate(resetPassageAnswers(state, passage.id));
  }

  return (
    <>
      <header className="toolbar">
        <button className="icon-btn" title="Về menu" onClick={onBack}>
          ←
        </button>
        <span className="counter">Luyện đọc</span>
        <ExpandTabButton screenHash="reading" />
      </header>

      <CollapsibleSection
        className="quiz-setup"
        title="Bộ lọc"
        defaultOpen
        summary={`${state.selectedBooks.length}/${AVAILABLE_BOOKS.length} sách`}
      >
        {AVAILABLE_LEVELS.length > 1 ? (
          <div className="quiz-setup-group">
            <div className="quiz-setup-label">Cấp độ</div>
            <div className="level-selector-inline">
              {AVAILABLE_LEVELS.map((level) => {
                const checked = state.selectedLevels.includes(level);
                const count = ALL_READING.filter(
                  (p) => p.level === level && state.selectedLengths.includes(p.length) && state.selectedBooks.includes(p.book),
                ).length;
                return (
                  <label key={level} className="level-check">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => {
                        const next = e.target.checked
                          ? [...new Set([...state.selectedLevels, level])]
                          : state.selectedLevels.filter((l) => l !== level);
                        if (next.length === 0) return;
                        mutate({ selectedLevels: next });
                      }}
                    />
                    <LevelDot level={level} />
                    {level} <span className="muted">({count})</span>
                  </label>
                );
              })}
            </div>
          </div>
        ) : null}

        <div className="quiz-setup-group">
          <div className="quiz-setup-label">Sách</div>
          <div className="reading-book-radio-row">
            {AVAILABLE_BOOKS.map((book) => {
              const checked = state.selectedBooks.includes(book);
              const count = ALL_READING.filter(
                (p) => p.book === book && state.selectedLevels.includes(p.level) && state.selectedLengths.includes(p.length),
              ).length;
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
                    <span className="reading-book-radio-title">{BOOK_LABELS[book]}</span>
                    <span className="reading-book-radio-note">
                      {BOOK_DIFFICULTY_NOTE[book]} · {count} bài
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
        </div>

        <div className="quiz-setup-group">
          <div className="quiz-setup-label">Độ dài bài đọc</div>
          <div className="quiz-radio-row">
            {AVAILABLE_LENGTHS.map((length) => {
              const checked = state.selectedLengths.includes(length);
              const count = ALL_READING.filter(
                (p) => p.length === length && state.selectedLevels.includes(p.level) && state.selectedBooks.includes(p.book),
              ).length;
              return (
                <label key={length} className="quiz-radio">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => {
                      const next = e.target.checked
                        ? [...new Set([...state.selectedLengths, length])]
                        : state.selectedLengths.filter((l) => l !== length);
                      if (next.length === 0) return;
                      mutate({ selectedLengths: next });
                    }}
                  />
                  {LENGTH_LABELS[length]} <span className="muted">({count})</span>
                </label>
              );
            })}
          </div>
        </div>
      </CollapsibleSection>

      <div className="quiz-setup">
        {error ? <p className="quiz-error">{error}</p> : null}

        <button className="primary-action-btn" onClick={handleStart}>
          🎲 Random bài đọc
        </button>
      </div>

      <section className="reading-list-section">
        <div className="reading-list-summary">
          <span>
            Đã hoàn thành <strong>{doneCount}/{filtered.length}</strong> bài
          </span>
          <div className="reading-status-filter-row">
            {(["all", "not-started", "done"] as const).map((s) => (
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
          {detailPassage && detailProgress ? (
            <>
              <div className="reading-detail-title">{detailPassage.title}</div>
              <div className="reading-detail-meta">
                {BOOK_LABELS[detailPassage.book]} · {LENGTH_LABELS[detailPassage.length]}
                {AVAILABLE_LEVELS.length > 1 ? ` · ${detailPassage.level}` : ""} · {timelineLabel(detailPassage)}
              </div>
              <div className="reading-detail-footer">
                <StatusIcon status={detailProgress.status} correct={detailProgress.correct} total={detailProgress.total} />
                {detailProgress.status !== "not-started" ? (
                  <button className="reading-reset-btn" onClick={() => handleResetDetail(detailPassage)}>
                    ↺ Làm lại
                  </button>
                ) : null}
              </div>
            </>
          ) : (
            <span className="reading-detail-empty">Di chuột vào một bài để xem chi tiết, bấm để mở</span>
          )}
        </div>
        {visiblePassages.length === 0 ? (
          <p className="quiz-error reading-empty">Không có bài đọc nào khớp bộ lọc này.</p>
        ) : (
          <div className="reading-tile-grid">
            {visiblePassages.map((p) => {
              const progress = getPassageProgress(p, state.answers);
              return (
                <button
                  key={p.id}
                  className={`reading-tile ${statusDotClass(progress.status, progress.correct, progress.total)}`}
                  onMouseEnter={() => setDetailId(p.id)}
                  onFocus={() => setDetailId(p.id)}
                  onClick={() => openPassage(p)}
                >
                  読
                </button>
              );
            })}
          </div>
        )}
      </section>
    </>
  );
}

function PassageView({
  passage,
  state,
  onBack,
  mutate,
  setError,
}: {
  passage: ReadingPassage;
  state: ReadingViewerState;
  onBack: () => void;
  mutate: (partial: Partial<ReadingViewerState>) => Promise<void>;
  setError: (e?: string) => void;
}) {
  const answers = state.answers[passage.id] ?? passage.questions.map(() => null);
  const answeredCount = answers.filter((a) => a !== null).length;
  const total = passage.questions.length;
  const allAnswered = answeredCount >= total;
  const correctCount = passage.questions.filter((q, qi) => answers[qi] === q.correctIndex).length;

  async function handleReset() {
    if (!confirm(`Làm lại "${passage.title}" từ đầu? Kết quả đã trả lời sẽ bị xoá.`)) return;
    await mutate(resetPassageAnswers(state, passage.id));
  }

  async function handleAnother() {
    const next = pickRandomPassage(state.selectedLevels, state.selectedLengths, state.selectedBooks, passage.id);
    if (!next) {
      setError("Không có bài đọc nào khớp bộ lọc này.");
      await mutate({ currentPassageId: null });
      return;
    }
    await mutate({
      currentPassageId: next.id,
      answers: { ...state.answers, [next.id]: state.answers[next.id] ?? next.questions.map(() => null) },
    });
  }

  return (
    <>
      <header className="toolbar">
        <button className="icon-btn" title="Về menu" onClick={onBack}>
          ←
        </button>
        <span className="counter">Luyện đọc</span>
        <ExpandTabButton screenHash="reading" />
      </header>

      <main className="reading-card">
        <div className="reading-meta">
          <button className="reading-change-filter" title="Về danh sách bài đọc" onClick={() => mutate({ currentPassageId: null })}>
            ☰ Danh sách
          </button>
          <span className="level-badge" data-level={passage.level}>
            {passage.level}
          </span>
          <span className="reading-book-badge">{BOOK_LABELS[passage.book]}</span>
          <span className="reading-timeline">{timelineLabel(passage)}</span>
        </div>
        <h2 className="reading-title">{passage.title}</h2>

        <div className="reading-progress-row">
          <div className="reading-progress-bar">
            <div className="reading-progress-bar-fill" style={{ width: `${total ? (answeredCount / total) * 100 : 0}%` }}></div>
          </div>
          <span className="reading-progress-label">
            {answeredCount}/{total} câu
          </span>
          {answeredCount > 0 ? (
            <button className="reading-reset-btn" title="Làm lại từ đầu" onClick={handleReset}>
              ↺ Làm lại
            </button>
          ) : null}
        </div>

        {allAnswered && total > 0 ? (
          <div className={`reading-score-banner ${correctCount === total ? "reading-score-perfect" : ""}`}>
            {correctCount === total ? "🎉" : "📊"} Đúng {correctCount}/{total} câu ({Math.round((correctCount / total) * 100)}%)
          </div>
        ) : null}

        <div className="reading-toolbar-row">
          <button
            className={`secondary-action-btn reading-toggle-btn ${state.showFurigana ? "reading-toggle-on" : ""}`}
            onClick={() => mutate({ showFurigana: !state.showFurigana })}
          >
            {state.showFurigana ? "Ẩn furigana" : "Hiện furigana"}
          </button>
          <button
            className={`secondary-action-btn reading-toggle-btn ${state.showTranslation ? "reading-toggle-on" : ""}`}
            onClick={() => mutate({ showTranslation: !state.showTranslation })}
          >
            {state.showTranslation ? "Ẩn bản dịch" : "Xem bản dịch"}
          </button>
          {passage.studyNote ? (
            <button
              className={`secondary-action-btn reading-toggle-btn ${state.showStudyNote ? "reading-toggle-on" : ""}`}
              onClick={() => mutate({ showStudyNote: !state.showStudyNote })}
            >
              {state.showStudyNote ? "Ẩn ghi chú" : "Xem ghi chú"}
            </button>
          ) : null}
        </div>

        <div className="reading-body">
          <ReadingBody passage={passage} showFurigana={state.showFurigana} />
        </div>

        {state.showTranslation ? (
          <div className="reading-translation">
            {passage.translationVi.split("\n").map((line, i, arr) => (
              <span key={i}>
                {line}
                {i < arr.length - 1 ? <br /> : null}
              </span>
            ))}
          </div>
        ) : null}

        {state.showStudyNote && passage.studyNote ? (
          <div className="reading-study-note">
            {passage.studyNote.split("\n").map((line, i, arr) => (
              <span key={i}>
                {line}
                {i < arr.length - 1 ? <br /> : null}
              </span>
            ))}
          </div>
        ) : null}

        <div className="reading-questions">
          {passage.questions.map((q, qi) => {
            const answered = answers[qi];
            return (
              <div key={qi} className="reading-question">
                <div className="reading-question-prompt">
                  Câu {qi + 1}: {q.question}
                </div>
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
                        onClick={() => {
                          const newAnswers = [...answers];
                          newAnswers[qi] = oi;
                          mutate({ answers: { ...state.answers, [passage.id]: newAnswers } });
                        }}
                      >
                        {opt}
                      </button>
                    );
                  })}
                </div>
                {answered !== null ? (
                  <>
                    <div className="reading-question-vi">{q.questionVi}</div>
                    <div className="reading-explanation">{q.explanation}</div>
                  </>
                ) : null}
              </div>
            );
          })}
        </div>

        <button className="primary-action-btn reading-another-btn" onClick={handleAnother}>
          🎲 Bài khác
        </button>
      </main>
    </>
  );
}
