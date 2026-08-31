import { useEffect, useState } from "react";
import { Shuffle, Undo2, List as ListIcon, Sparkles, BarChart3 } from "lucide-react";
import type { ReadingPassage } from "../../types/reading.ts";
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
} from "../../popup/readingState.ts";
import { Card } from "../components/ui/card.tsx";
import { Button } from "../components/ui/button.tsx";
import { LevelDot, levelBadgeStyle } from "../lib/levelColors.tsx";

function matchesFilters(p: ReadingPassage, state: ReadingViewerState): boolean {
  return state.selectedLevels.includes(p.level) && state.selectedLengths.includes(p.length) && state.selectedBooks.includes(p.book);
}

const STATUS_TILE_COLOR = {
  perfect: "bg-emerald-100 text-emerald-700 hover:bg-emerald-200",
  done: "bg-sky-100 text-sky-700 hover:bg-sky-200",
  progress: "bg-amber-100 text-amber-700 hover:bg-amber-200",
  todo: "bg-neutral-100 text-neutral-400 hover:bg-neutral-200",
} as const;

function tileColor(status: "not-started" | "in-progress" | "done", correct: number, total: number): string {
  if (status === "done") return STATUS_TILE_COLOR[correct === total ? "perfect" : "done"];
  if (status === "in-progress") return STATUS_TILE_COLOR.progress;
  return STATUS_TILE_COLOR.todo;
}

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
            <rt className="text-[10px] text-neutral-400">{seg.furigana}</rt>
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

export function ReadingScreen() {
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

  if (!state) return <div className="p-6 text-neutral-400">Đang tải...</div>;

  const passage = state.currentPassageId ? findReadingById(state.currentPassageId) : undefined;

  if (passage) {
    return <PassageView passage={passage} state={state} mutate={mutate} setError={setError} />;
  }

  return <ListView state={state} mutate={mutate} error={error} setError={setError} detailId={detailId} setDetailId={setDetailId} />;
}

function ListView({
  state,
  mutate,
  error,
  setError,
  detailId,
  setDetailId,
}: {
  state: ReadingViewerState;
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

  async function openPassage(passage: ReadingPassage) {
    await mutate({
      currentPassageId: passage.id,
      answers: { ...state.answers, [passage.id]: state.answers[passage.id] ?? passage.questions.map(() => null) },
    });
  }

  async function handleStart() {
    const passage = pickRandomPassage(state.selectedLevels, state.selectedLengths, state.selectedBooks);
    if (!passage) {
      setDetailId(null);
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
    <div className="mx-auto max-w-4xl px-4 py-6 md:px-8 md:py-10">
      <h1 className="text-2xl font-bold text-neutral-800">Luyện đọc</h1>

      <Card className="mt-4 gap-4 p-5">
        {AVAILABLE_LEVELS.length > 1 ? (
          <div>
            <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-neutral-400">Cấp độ</div>
            <div className="flex flex-wrap gap-2">
              {AVAILABLE_LEVELS.map((level) => {
                const checked = state.selectedLevels.includes(level);
                const count = ALL_READING.filter(
                  (p) => p.level === level && state.selectedLengths.includes(p.length) && state.selectedBooks.includes(p.book),
                ).length;
                return (
                  <button
                    key={level}
                    onClick={() => {
                      const next = checked ? state.selectedLevels.filter((l) => l !== level) : [...new Set([...state.selectedLevels, level])];
                      if (next.length === 0) return;
                      mutate({ selectedLevels: next });
                    }}
                    className={`flex items-center rounded-full border px-3 py-1 text-xs font-medium ${checked ? "border-rose-300 bg-rose-50 text-rose-600" : "border-neutral-200 text-neutral-500"}`}
                  >
                    <LevelDot level={level} />
                    {level} ({count})
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        <div>
          <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-neutral-400">Sách</div>
          <div className="flex flex-wrap gap-2">
            {AVAILABLE_BOOKS.map((book) => {
              const checked = state.selectedBooks.includes(book);
              const count = ALL_READING.filter(
                (p) => p.book === book && state.selectedLevels.includes(p.level) && state.selectedLengths.includes(p.length),
              ).length;
              return (
                <button
                  key={book}
                  onClick={() => {
                    const next = checked ? state.selectedBooks.filter((b) => b !== book) : [...new Set([...state.selectedBooks, book])];
                    if (next.length === 0) return;
                    mutate({ selectedBooks: next });
                  }}
                  className={`rounded-xl border px-3 py-2 text-left text-xs ${checked ? "border-violet-300 bg-violet-50" : "border-neutral-200"}`}
                >
                  <div className={`font-semibold ${checked ? "text-violet-700" : "text-neutral-600"}`}>{BOOK_LABELS[book]}</div>
                  <div className="text-neutral-400">
                    {BOOK_DIFFICULTY_NOTE[book]} · {count} bài
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-neutral-400">Độ dài bài đọc</div>
          <div className="flex flex-wrap gap-2">
            {AVAILABLE_LENGTHS.map((length) => {
              const checked = state.selectedLengths.includes(length);
              const count = ALL_READING.filter(
                (p) => p.length === length && state.selectedLevels.includes(p.level) && state.selectedBooks.includes(p.book),
              ).length;
              return (
                <button
                  key={length}
                  onClick={() => {
                    const next = checked ? state.selectedLengths.filter((l) => l !== length) : [...new Set([...state.selectedLengths, length])];
                    if (next.length === 0) return;
                    mutate({ selectedLengths: next });
                  }}
                  className={`rounded-full border px-3 py-1 text-xs font-medium ${checked ? "border-rose-300 bg-rose-50 text-rose-600" : "border-neutral-200 text-neutral-500"}`}
                >
                  {LENGTH_LABELS[length]} ({count})
                </button>
              );
            })}
          </div>
        </div>
      </Card>

      {error ? <p className="mt-3 rounded-lg bg-rose-50 p-3 text-sm text-rose-600">{error}</p> : null}

      <Button className="mt-4 w-full" onClick={handleStart}>
        <Shuffle size={16} /> Random bài đọc
      </Button>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm text-neutral-500">
          Đã hoàn thành <strong className="text-neutral-800">{doneCount}/{filtered.length}</strong> bài
        </span>
        <div className="flex gap-1.5">
          {(["all", "not-started", "done"] as const).map((s) => (
            <button
              key={s}
              onClick={() => mutate({ listStatusFilter: s })}
              className={`rounded-full border px-3 py-1 text-xs font-medium ${state.listStatusFilter === s ? "border-rose-300 bg-rose-50 text-rose-600" : "border-neutral-200 text-neutral-500"}`}
            >
              {STATUS_LABELS[s]}
            </button>
          ))}
        </div>
      </div>

      <Card className="mt-3 gap-0 p-4">
        {detailPassage && detailProgress ? (
          <div>
            <div className="font-semibold text-neutral-800">{detailPassage.title}</div>
            <div className="mt-0.5 text-sm text-neutral-500">
              {BOOK_LABELS[detailPassage.book]} · {LENGTH_LABELS[detailPassage.length]}
              {AVAILABLE_LEVELS.length > 1 ? ` · ${detailPassage.level}` : ""} · {timelineLabel(detailPassage)}
            </div>
            <div className="mt-2 flex items-center gap-2">
              {detailProgress.status === "done" ? (
                <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-600">
                  ✓ {detailProgress.correct}/{detailProgress.total}
                </span>
              ) : detailProgress.status === "in-progress" ? (
                <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-600">⋯ đang làm</span>
              ) : (
                <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-semibold text-neutral-400">chưa làm</span>
              )}
              {detailProgress.status !== "not-started" ? (
                <button
                  onClick={() => handleResetDetail(detailPassage)}
                  className="flex items-center gap-1 text-xs font-semibold text-neutral-400 hover:text-neutral-600"
                >
                  <Undo2 size={12} /> Làm lại
                </button>
              ) : null}
            </div>
          </div>
        ) : (
          <span className="text-sm text-neutral-400">Di chuột vào một bài để xem chi tiết, bấm để mở</span>
        )}
      </Card>

      {visiblePassages.length === 0 ? (
        <p className="mt-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-600">Không có bài đọc nào khớp bộ lọc này.</p>
      ) : (
        <div className="mt-3 grid grid-cols-8 gap-2 sm:grid-cols-10 md:grid-cols-12">
          {visiblePassages.map((p) => {
            const progress = getPassageProgress(p, state.answers);
            return (
              <button
                key={p.id}
                onMouseEnter={() => setDetailId(p.id)}
                onFocus={() => setDetailId(p.id)}
                onClick={() => openPassage(p)}
                className={`flex aspect-square items-center justify-center rounded-lg text-lg font-medium transition-colors ${tileColor(progress.status, progress.correct, progress.total)}`}
              >
                読
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function PassageView({
  passage,
  state,
  mutate,
  setError,
}: {
  passage: ReadingPassage;
  state: ReadingViewerState;
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
    <div className="mx-auto max-w-3xl px-4 py-6 md:px-8 md:py-10">
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => mutate({ currentPassageId: null })}
          className="flex items-center gap-1 text-sm font-medium text-neutral-500 hover:text-neutral-700"
        >
          <ListIcon size={15} /> Danh sách
        </button>
        <span className="rounded-full px-2.5 py-1 text-xs font-semibold" style={levelBadgeStyle(passage.level)}>
          {passage.level}
        </span>
        <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-semibold text-neutral-500">{BOOK_LABELS[passage.book]}</span>
        <span className="text-xs text-neutral-400">{timelineLabel(passage)}</span>
      </div>

      <h1 className="mt-3 text-2xl font-bold text-neutral-800">{passage.title}</h1>

      <div className="mt-4 flex items-center gap-3">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-neutral-100">
          <div className="h-full rounded-full bg-rose-400" style={{ width: `${total ? (answeredCount / total) * 100 : 0}%` }} />
        </div>
        <span className="shrink-0 text-xs font-medium text-neutral-500">
          {answeredCount}/{total} câu
        </span>
        {answeredCount > 0 ? (
          <button onClick={handleReset} title="Làm lại từ đầu" className="flex shrink-0 items-center gap-1 text-xs font-semibold text-neutral-400 hover:text-neutral-600">
            <Undo2 size={12} /> Làm lại
          </button>
        ) : null}
      </div>

      {allAnswered && total > 0 ? (
        <div className={`mt-4 flex items-center gap-2 rounded-xl p-3 text-sm font-semibold ${correctCount === total ? "bg-emerald-50 text-emerald-700" : "bg-sky-50 text-sky-700"}`}>
          {correctCount === total ? <Sparkles size={16} /> : <BarChart3 size={16} />}
          Đúng {correctCount}/{total} câu ({Math.round((correctCount / total) * 100)}%)
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          onClick={() => mutate({ showFurigana: !state.showFurigana })}
          className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${state.showFurigana ? "border-rose-300 bg-rose-50 text-rose-600" : "border-neutral-200 text-neutral-600"}`}
        >
          {state.showFurigana ? "Ẩn furigana" : "Hiện furigana"}
        </button>
        <button
          onClick={() => mutate({ showTranslation: !state.showTranslation })}
          className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${state.showTranslation ? "border-rose-300 bg-rose-50 text-rose-600" : "border-neutral-200 text-neutral-600"}`}
        >
          {state.showTranslation ? "Ẩn bản dịch" : "Xem bản dịch"}
        </button>
        {passage.studyNote ? (
          <button
            onClick={() => mutate({ showStudyNote: !state.showStudyNote })}
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${state.showStudyNote ? "border-rose-300 bg-rose-50 text-rose-600" : "border-neutral-200 text-neutral-600"}`}
          >
            {state.showStudyNote ? "Ẩn ghi chú" : "Xem ghi chú"}
          </button>
        ) : null}
      </div>

      <Card className="mt-4 gap-0 p-5">
        <div className="text-lg leading-loose text-neutral-800">
          <ReadingBody passage={passage} showFurigana={state.showFurigana} />
        </div>
      </Card>

      {state.showTranslation ? (
        <div className="mt-3 rounded-xl bg-amber-50 p-4 text-sm leading-relaxed text-amber-800">
          {passage.translationVi.split("\n").map((line, i, arr) => (
            <span key={i}>
              {line}
              {i < arr.length - 1 ? <br /> : null}
            </span>
          ))}
        </div>
      ) : null}

      {state.showStudyNote && passage.studyNote ? (
        <div className="mt-3 rounded-xl bg-sky-50 p-4 text-sm leading-relaxed text-sky-800">
          {passage.studyNote.split("\n").map((line, i, arr) => (
            <span key={i}>
              {line}
              {i < arr.length - 1 ? <br /> : null}
            </span>
          ))}
        </div>
      ) : null}

      <div className="mt-6 flex flex-col gap-4">
        {passage.questions.map((q, qi) => {
          const answered = answers[qi];
          return (
            <Card key={qi} className="gap-0 p-5">
              <div className="font-semibold text-neutral-800">
                Câu {qi + 1}: {q.question}
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
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
                      onClick={() => {
                        const newAnswers = [...answers];
                        newAnswers[qi] = oi;
                        mutate({ answers: { ...state.answers, [passage.id]: newAnswers } });
                      }}
                      className={`rounded-lg border px-3 py-2 text-left text-sm ${cls}`}
                    >
                      {opt}
                    </button>
                  );
                })}
              </div>
              {answered !== null ? (
                <div className="mt-3 space-y-1 border-t border-neutral-100 pt-3 text-sm">
                  <div className="text-neutral-400">{q.questionVi}</div>
                  <div className="text-neutral-600">{q.explanation}</div>
                </div>
              ) : null}
            </Card>
          );
        })}
      </div>

      <Button className="mt-6 w-full" onClick={handleAnother}>
        <Shuffle size={16} /> Bài khác
      </Button>
    </div>
  );
}
