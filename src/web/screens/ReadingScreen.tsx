import { useEffect, useState } from "react";
import { Shuffle, Undo2, ChevronLeft, ChevronRight, Sparkles, BarChart3, Library, PenSquare, ClipboardList, CheckCircle2 } from "lucide-react";
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
  readingQuestionId,
  loadViewerState,
  saveViewerState,
  getPassageProgress,
  resetPassageAnswers,
  matchesFilters,
  type ReadingViewerState,
} from "../../popup/readingState.ts";
import { findVocabInPassage, findBunpoInPassage } from "../../popup/readingLinks.ts";
import { recordAnswer } from "../../popup/progressState.ts";
import { pruneToggle } from "../../popup/filterUtils.ts";
import { Card } from "../components/ui/card.tsx";
import { Button } from "../components/ui/button.tsx";
import { levelBadgeStyle } from "../lib/levelColors.tsx";
import { PageHeader } from "../components/PageHeader.tsx";
import { StatCard } from "../components/StatCard.tsx";
import { useConfirm } from "../components/ConfirmDialog.tsx";
import { useFloatingNav } from "../WebAppShell.tsx";
import { FilterBar, FilterTrigger } from "../components/FilterBar.tsx";
import { ActiveFilters } from "../components/ActiveFilters.tsx";
import { FilterSheet, FilterGroup, FilterChipOption } from "../components/FilterSheet.tsx";

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

const STATUS_LABELS = { all: "Tất cả", "not-started": "Chưa làm", done: "Đã xong" } as const;

export function ReadingScreen({
  targetId,
  onOpenVocab,
  onOpenBunpo,
  onOpenStats,
  onCurrentItemChange,
}: {
  targetId?: string;
  onOpenVocab: (vocabId: string) => void;
  onOpenBunpo: (bunpoId: string) => void;
  onOpenStats: () => void;
  onCurrentItemChange?: (id: string | undefined) => void;
}) {
  const [state, setState] = useState<ReadingViewerState | null>(null);
  const [error, setError] = useState<string | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let s = await loadViewerState();
      const passage = targetId ? findReadingById(targetId) : undefined;
      if (passage) {
        s = {
          ...s,
          currentPassageId: passage.id,
          answers: { ...s.answers, [passage.id]: s.answers[passage.id] ?? passage.questions.map(() => null) },
          showFurigana: false,
          showTranslation: false,
          showStudyNote: false,
          resultsRevealed: false,
        };
        await saveViewerState(s);
      }
      if (cancelled) return;
      setState(s);
    })();
    return () => {
      cancelled = true;
    };
  }, [targetId]);

  async function mutate(partial: Partial<ReadingViewerState>) {
    if (!state) return;
    const next = { ...state, ...partial };
    await saveViewerState(next);
    setState(next);
    setError(undefined);
  }

  useEffect(() => {
    onCurrentItemChange?.(state?.currentPassageId ?? undefined);
  }, [state?.currentPassageId, onCurrentItemChange]);

  if (!state) return <div className="p-6 text-neutral-400">Đang tải...</div>;

  const passage = state.currentPassageId ? findReadingById(state.currentPassageId) : undefined;

  // Lifted up from ListView (rather than each screen recomputing its own
  // copy) so PassageView can sequence Trước/Tiếp through the exact same
  // filtered+status-filtered order the user was browsing in the list --
  // same reasoning as BunpoScreen.tsx's DetailView visibleList.
  const filtered = ALL_READING.filter((p) => matchesFilters(p, state));
  const visiblePassages = filtered.filter((p) => {
    if (state.listStatusFilter === "all") return true;
    const progress = getPassageProgress(p, state.answers);
    if (state.listStatusFilter === "done") return progress.status === "done";
    return progress.status !== "done";
  });

  async function openPassage(passage: ReadingPassage) {
    await mutate({
      currentPassageId: passage.id,
      answers: { ...state!.answers, [passage.id]: state!.answers[passage.id] ?? passage.questions.map(() => null) },
      // Furigana/translation/study-note visibility is a per-reading-session
      // toggle, not a lasting preference -- reset to the default (hidden)
      // each time a (possibly unrelated) new passage is opened, so a choice
      // made on one passage doesn't silently carry over to the next.
      showFurigana: false,
      showTranslation: false,
      showStudyNote: false,
      resultsRevealed: false,
    });
  }

  if (passage) {
    return (
      <PassageView
        passage={passage}
        state={state}
        mutate={mutate}
        setError={setError}
        onOpenVocab={onOpenVocab}
        onOpenBunpo={onOpenBunpo}
        visiblePassages={visiblePassages}
        openPassage={openPassage}
      />
    );
  }

  return (
    <ListView
      state={state}
      mutate={mutate}
      error={error}
      setError={setError}
      onOpenStats={onOpenStats}
      filtered={filtered}
      visiblePassages={visiblePassages}
      openPassage={openPassage}
    />
  );
}

function ListView({
  state,
  mutate,
  error,
  setError,
  onOpenStats,
  filtered,
  visiblePassages,
  openPassage,
}: {
  state: ReadingViewerState;
  mutate: (partial: Partial<ReadingViewerState>) => Promise<void>;
  error?: string;
  setError: (e?: string) => void;
  onOpenStats: () => void;
  filtered: ReadingPassage[];
  visiblePassages: ReadingPassage[];
  openPassage: (passage: ReadingPassage) => Promise<void>;
}) {
  const confirm = useConfirm();
  const [filterOpen, setFilterOpen] = useState(false);
  const statusCounts = filtered.reduce(
    (acc, p) => {
      acc[getPassageProgress(p, state.answers).status]++;
      return acc;
    },
    { done: 0, "in-progress": 0, "not-started": 0 } as Record<"done" | "in-progress" | "not-started", number>,
  );

  const allLevelsChecked = AVAILABLE_LEVELS.length <= 1 || state.selectedLevels.length === AVAILABLE_LEVELS.length;
  const allBooksChecked = state.selectedBooks.length === AVAILABLE_BOOKS.length;
  const allLengthsChecked = state.selectedLengths.length === AVAILABLE_LENGTHS.length;
  const filterCount =
    (allLevelsChecked ? 0 : state.selectedLevels.length) +
    (allBooksChecked ? 0 : state.selectedBooks.length) +
    (allLengthsChecked ? 0 : state.selectedLengths.length);

  async function handleStart() {
    const passage = pickRandomPassage(state.selectedLevels, state.selectedLengths, state.selectedBooks);
    if (!passage) {
      setError("Không có bài đọc nào khớp bộ lọc này.");
      return;
    }
    await openPassage(passage);
  }

  async function handleResetRow(passage: ReadingPassage) {
    if (!(await confirm(`Làm lại "${passage.title}" từ đầu? Kết quả đã trả lời sẽ bị xoá.`))) return;
    await mutate(resetPassageAnswers(state, passage.id));
  }

  return (
    <div className="mx-auto max-w-4xl px-2.5 py-2 md:px-8 md:py-6">
      <PageHeader title="Luyện đọc" icon={{ img: "icon-reading.png", bg: "#ede9fe" }} />

      <div className="mt-4 grid grid-cols-3 gap-3">
        <StatCard label="Tổng số bài" value={filtered.length} />
        <StatCard label="Đã hoàn thành" value={statusCounts.done} tone="emerald" />
        <StatCard label="Đang làm dở" value={statusCounts["in-progress"]} tone="amber" />
      </div>

      <FilterBar>
        <FilterTrigger count={filterCount} onClick={() => setFilterOpen(true)} />
        <Button size="sm" variant="outline" onClick={handleStart}>
          <Shuffle size={14} /> Random bài đọc
        </Button>
        <Button size="sm" variant="outline" onClick={onOpenStats}>
          <ClipboardList size={14} /> Câu sai cần ôn lại
        </Button>
        <div className="flex flex-wrap gap-1.5">
          {(["all", "not-started", "done"] as const).map((s) => (
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
          ...(allLevelsChecked
            ? []
            : state.selectedLevels.map((level) => ({
                key: `level-${level}`,
                label: level,
                onRemove: () => {
                  const next = state.selectedLevels.filter((l) => l !== level);
                  if (next.length === 0) return;
                  mutate({ selectedLevels: next });
                },
              }))),
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
          ...(allLengthsChecked
            ? []
            : state.selectedLengths.map((length) => ({
                key: `length-${length}`,
                label: LENGTH_LABELS[length],
                onRemove: () => {
                  const next = state.selectedLengths.filter((l) => l !== length);
                  if (next.length === 0) return;
                  mutate({ selectedLengths: next });
                },
              }))),
        ]}
      />

      {error ? <p className="mt-3 rounded-lg bg-rose-50 p-3 text-sm text-rose-600">{error}</p> : null}

      <FilterSheet
        open={filterOpen}
        onClose={() => setFilterOpen(false)}
        title="Bộ lọc luyện đọc"
        onReset={() => mutate({ selectedLevels: [...AVAILABLE_LEVELS], selectedBooks: [...AVAILABLE_BOOKS], selectedLengths: [...AVAILABLE_LENGTHS] })}
      >
        {AVAILABLE_LEVELS.length > 1 ? (
          <FilterGroup title="Cấp độ">
            {AVAILABLE_LEVELS.map((level) => {
              const checked = state.selectedLevels.includes(level);
              const count = ALL_READING.filter(
                (p) => p.level === level && state.selectedLengths.includes(p.length) && state.selectedBooks.includes(p.book),
              ).length;
              return (
                <FilterChipOption
                  key={level}
                  label={`${level} (${count})`}
                  active={checked}
                  onClick={() => {
                    const next = checked ? state.selectedLevels.filter((l) => l !== level) : [...new Set([...state.selectedLevels, level])];
                    if (next.length === 0) return;
                    const nextBooks = pruneToggle(state.selectedBooks, AVAILABLE_BOOKS, (b) =>
                      ALL_READING.some((p) => p.book === b && next.includes(p.level) && state.selectedLengths.includes(p.length)),
                    );
                    const nextLengths = pruneToggle(state.selectedLengths, AVAILABLE_LENGTHS, (l) =>
                      ALL_READING.some((p) => p.length === l && next.includes(p.level) && nextBooks.includes(p.book)),
                    );
                    mutate({ selectedLevels: next, selectedBooks: nextBooks, selectedLengths: nextLengths });
                  }}
                />
              );
            })}
          </FilterGroup>
        ) : null}

        <FilterGroup title="Sách">
          {AVAILABLE_BOOKS.map((book) => {
            const checked = state.selectedBooks.includes(book);
            const count = ALL_READING.filter(
              (p) => p.book === book && state.selectedLevels.includes(p.level) && state.selectedLengths.includes(p.length),
            ).length;
            return (
              <FilterChipOption
                key={book}
                label={`${BOOK_LABELS[book]} (${count})`}
                active={checked}
                onClick={() => {
                  const next = checked ? state.selectedBooks.filter((b) => b !== book) : [...new Set([...state.selectedBooks, book])];
                  if (next.length === 0) return;
                  const nextLevels = pruneToggle(state.selectedLevels, AVAILABLE_LEVELS, (lv) =>
                    ALL_READING.some((p) => p.level === lv && next.includes(p.book) && state.selectedLengths.includes(p.length)),
                  );
                  const nextLengths = pruneToggle(state.selectedLengths, AVAILABLE_LENGTHS, (l) =>
                    ALL_READING.some((p) => p.length === l && next.includes(p.book) && nextLevels.includes(p.level)),
                  );
                  mutate({ selectedBooks: next, selectedLevels: nextLevels, selectedLengths: nextLengths });
                }}
              />
            );
          })}
        </FilterGroup>

        <FilterGroup title="Độ dài bài đọc">
          {AVAILABLE_LENGTHS.map((length) => {
            const checked = state.selectedLengths.includes(length);
            const count = ALL_READING.filter(
              (p) => p.length === length && state.selectedLevels.includes(p.level) && state.selectedBooks.includes(p.book),
            ).length;
            return (
              <FilterChipOption
                key={length}
                label={`${LENGTH_LABELS[length]} (${count})`}
                active={checked}
                onClick={() => {
                  const next = checked ? state.selectedLengths.filter((l) => l !== length) : [...new Set([...state.selectedLengths, length])];
                  if (next.length === 0) return;
                  const nextLevels = pruneToggle(state.selectedLevels, AVAILABLE_LEVELS, (lv) =>
                    ALL_READING.some((p) => p.level === lv && next.includes(p.length) && state.selectedBooks.includes(p.book)),
                  );
                  const nextBooks = pruneToggle(state.selectedBooks, AVAILABLE_BOOKS, (b) =>
                    ALL_READING.some((p) => p.book === b && next.includes(p.length) && nextLevels.includes(p.level)),
                  );
                  mutate({ selectedLengths: next, selectedLevels: nextLevels, selectedBooks: nextBooks });
                }}
              />
            );
          })}
        </FilterGroup>
      </FilterSheet>

      {visiblePassages.length === 0 ? (
        <p className="mt-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-600">Không có bài đọc nào khớp bộ lọc này.</p>
      ) : (
        <div className="mt-4 flex flex-col gap-2">
          {visiblePassages.map((p, i) => {
            const progress = getPassageProgress(p, state.answers);
            const borderCls =
              progress.status === "not-started"
                ? "border-l-neutral-200"
                : progress.status === "in-progress"
                  ? "border-l-amber-400"
                  : progress.correct === progress.total
                    ? "border-l-emerald-400"
                    : "border-l-rose-400";
            return (
              <button
                key={p.id}
                onClick={() => openPassage(p)}
                className={`flex items-center gap-3 rounded-2xl border border-l-4 border-neutral-200 bg-white px-4 py-3.5 text-left hover:border-rose-200 hover:bg-rose-50/40 ${borderCls}`}
              >
                <span className="w-6 shrink-0 text-xs font-semibold text-neutral-300">{String(i + 1).padStart(2, "0")}</span>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold text-neutral-800">{p.title}</div>
                  <div className="truncate text-xs text-neutral-500">
                    {BOOK_LABELS[p.book]}
                    {AVAILABLE_LEVELS.length > 1 ? ` · ${p.level}` : ""} · {timelineLabel(p)}
                  </div>
                </div>
                {progress.status === "done" ? (
                  <span className="shrink-0 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-600">
                    ✓ {progress.correct}/{progress.total}
                  </span>
                ) : progress.status === "in-progress" ? (
                  <span className="shrink-0 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-600">⋯ đang làm</span>
                ) : (
                  <span className="shrink-0 rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-semibold text-neutral-400">chưa làm</span>
                )}
                {progress.status !== "not-started" ? (
                  <span
                    role="button"
                    title="Làm lại từ đầu"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleResetRow(p);
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

function PassageView({
  passage,
  state,
  mutate,
  setError,
  onOpenVocab,
  onOpenBunpo,
  visiblePassages,
  openPassage,
}: {
  passage: ReadingPassage;
  state: ReadingViewerState;
  mutate: (partial: Partial<ReadingViewerState>) => Promise<void>;
  setError: (e?: string) => void;
  onOpenVocab: (vocabId: string) => void;
  onOpenBunpo: (bunpoId: string) => void;
  visiblePassages: ReadingPassage[];
  openPassage: (passage: ReadingPassage) => Promise<void>;
}) {
  const confirm = useConfirm();
  const answers = state.answers[passage.id] ?? passage.questions.map(() => null);
  const answeredCount = answers.filter((a) => a !== null).length;
  const total = passage.questions.length;
  const allAnswered = answeredCount >= total;
  const correctCount = passage.questions.filter((q, qi) => answers[qi] === q.correctIndex).length;
  const vocabMatches = findVocabInPassage(passage);
  const bunpoMatches = findBunpoInPassage(passage);

  const currentIndex = visiblePassages.findIndex((p) => p.id === passage.id);
  const prevPassage = currentIndex > 0 ? visiblePassages[currentIndex - 1] : null;
  const nextPassage = currentIndex >= 0 && currentIndex < visiblePassages.length - 1 ? visiblePassages[currentIndex + 1] : null;

  useFloatingNav(true);

  async function handleReset() {
    if (!(await confirm(`Làm lại "${passage.title}" từ đầu? Kết quả đã trả lời sẽ bị xoá.`))) return;
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
      showFurigana: false,
      showTranslation: false,
      showStudyNote: false,
      resultsRevealed: false,
    });
  }

  return (
    <div className="mx-auto max-w-3xl px-2.5 py-2 md:px-8 md:py-6">
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => mutate({ currentPassageId: null })}
          className="flex items-center gap-1 text-sm font-medium text-neutral-500 hover:text-neutral-700"
        >
          <ChevronLeft size={15} /> Luyện đọc
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
      </div>

      {state.resultsRevealed && allAnswered && total > 0 ? (
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

      <Card className="mt-4 gap-0 rounded-2xl border-neutral-200 p-5 ring-0">
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

      {vocabMatches.length > 0 || bunpoMatches.length > 0 ? (
        <Card className="mt-3 gap-3 rounded-2xl border-neutral-200 p-4 ring-0">
          {vocabMatches.length > 0 ? (
            <div>
              <div className="flex items-center gap-1.5 text-xs font-semibold text-neutral-400">
                <Library size={14} /> Từ vựng trong bài (bấm để xem lại)
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {vocabMatches.map((v) => (
                  <button
                    key={v.id}
                    onClick={() => onOpenVocab(v.id)}
                    className="rounded-lg border border-neutral-200 px-2.5 py-1 text-xs text-neutral-600 hover:bg-neutral-50"
                  >
                    {v.word}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          {bunpoMatches.length > 0 ? (
            <div>
              <div className="flex items-center gap-1.5 text-xs font-semibold text-neutral-400">
                <PenSquare size={14} /> Ngữ pháp trong bài (bấm để xem lại)
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {bunpoMatches.map((g) => (
                  <button
                    key={g.id}
                    onClick={() => onOpenBunpo(g.id)}
                    className="rounded-lg border border-neutral-200 px-2.5 py-1 text-xs text-neutral-600 hover:bg-neutral-50"
                  >
                    {g.pattern}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </Card>
      ) : null}

      <div className="mt-6 flex flex-col gap-4">
        {passage.questions.map((q, qi) => {
          const answered = answers[qi];
          return (
            <Card key={qi} className="gap-0 rounded-2xl border-neutral-200 p-5 ring-0">
              <div className="font-semibold text-neutral-800">
                Câu {qi + 1}: {q.question}
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {q.options.map((opt, oi) => {
                  let cls = "border-neutral-200 hover:bg-neutral-50";
                  if (state.resultsRevealed && answered !== null) {
                    if (oi === q.correctIndex) cls = "border-emerald-300 bg-emerald-50 text-emerald-700";
                    else if (oi === answered) cls = "border-rose-300 bg-rose-50 text-rose-700";
                    else cls = "border-neutral-200 opacity-50";
                  } else if (answered !== null && oi === answered) {
                    // Answered but not checked yet -- a neutral "this is your
                    // pick" highlight that doesn't leak correct/wrong.
                    cls = "border-neutral-400 bg-neutral-100 text-neutral-700";
                  }
                  return (
                    <button
                      key={oi}
                      disabled={answered !== null}
                      onClick={() => {
                        void recordAnswer(readingQuestionId(passage.id, qi), oi === q.correctIndex, "answer", ["answer"]);
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
              {state.resultsRevealed && answered !== null ? (
                <div className="mt-3 space-y-3 border-t border-neutral-100 pt-3 text-sm">
                  <div>
                    <div className="text-xs font-semibold tracking-wide text-neutral-400 uppercase">Dịch câu hỏi</div>
                    <div className="mt-1 text-neutral-600">{q.questionVi}</div>
                  </div>
                  <div>
                    <div className="text-xs font-semibold tracking-wide text-neutral-400 uppercase">Dịch đáp án</div>
                    <div className="mt-1 grid gap-2 sm:grid-cols-2">
                      {q.optionsVi.map((optVi, oi) => (
                        <div
                          key={oi}
                          className={`rounded-lg border px-3 py-2 text-sm ${
                            oi === q.correctIndex
                              ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                              : oi === answered
                                ? "border-rose-300 bg-rose-50 text-rose-700"
                                : "border-neutral-200 text-neutral-500"
                          }`}
                        >
                          {optVi}
                        </div>
                      ))}
                    </div>
                  </div>
                  {q.explanation ? (
                    <div>
                      <div className="text-xs font-semibold tracking-wide text-neutral-400 uppercase">Giải thích</div>
                      <div className="mt-1 text-neutral-600">{q.explanation}</div>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </Card>
          );
        })}
      </div>

      <div className="mt-6 flex flex-col gap-2">
        <Button
          className="w-full"
          onClick={() => mutate({ resultsRevealed: !state.resultsRevealed })}
          disabled={answeredCount === 0}
          title={answeredCount === 0 ? "Chọn ít nhất 1 câu trả lời trước" : undefined}
        >
          <CheckCircle2 size={16} /> {state.resultsRevealed ? "Ẩn kết quả" : "Kiểm tra kết quả"}
        </Button>
        <div className="flex gap-2">
          {answeredCount > 0 ? (
            <Button variant="outline" className="flex-1" onClick={handleReset}>
              <Undo2 size={16} /> Làm lại cả bài
            </Button>
          ) : null}
          <Button variant="outline" className="flex-1" onClick={handleAnother}>
            <Shuffle size={16} /> Bài khác
          </Button>
        </div>
      </div>

      {prevPassage ? (
        <button
          onClick={() => openPassage(prevPassage)}
          aria-label="Bài trước"
          className="fixed bottom-36 left-4 z-20 flex h-10 w-10 items-center justify-center rounded-full bg-white text-neutral-600 shadow-lg ring-1 ring-neutral-200 active:bg-neutral-50 md:hidden"
        >
          <ChevronLeft size={18} />
        </button>
      ) : null}
      {nextPassage ? (
        <button
          onClick={() => openPassage(nextPassage)}
          aria-label="Bài sau"
          className="fixed right-4 bottom-36 z-20 flex h-10 w-10 items-center justify-center rounded-full bg-rose-600 text-white shadow-lg active:bg-rose-700 md:hidden"
        >
          <ChevronRight size={18} />
        </button>
      ) : null}
    </div>
  );
}
