import { useEffect, useState, type ReactNode } from "react";
import { Shuffle, Undo2, ChevronLeft, ChevronRight, Sparkles, BarChart3, Library, PenSquare, CheckCircle2, Languages } from "lucide-react";
import type { ReadingPassage } from "../../types/reading.ts";
import { findUniqueTextRanges, type TextRange } from "../../lib/textRanges.ts";
import {
  ALL_READING,
  AVAILABLE_LEVELS,
  AVAILABLE_LENGTHS,
  AVAILABLE_BOOKS,
  AVAILABLE_JLPT_EXAMS,
  AVAILABLE_TOPICS,
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
  matchesReadingSources,
  splitBodyIntoSentences,
  type ReadingPassageViewOptions,
  type ReadingViewerState,
} from "../../popup/readingState.ts";
import { findVocabInPassage, findBunpoInPassage, getVocabReferenceTerms } from "../../popup/readingLinks.ts";
import { extractMatchChunks } from "../../popup/bunpoLinks.ts";
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
import { LoadingScreen } from "../components/LoadingScreen.tsx";

function timelineLabel(passage: ReadingPassage): string {
  const min = passage.estimatedMinutes;
  const max = min + (passage.length === "long" ? 3 : passage.length === "medium" ? 2 : 1);
  return `${LENGTH_LABELS[passage.length]} · ~${min}-${max} phút`;
}

type ReferenceTerm = { text: string; kind: "vocab" | "bunpo" };

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function renderTextWithReferences(
  text: string,
  terms: ReferenceTerm[],
  highlightReferences: boolean,
  underlineRanges: TextRange[] = [],
  sourceOffset = 0,
): ReactNode {
  const renderLines = (value: string, keyPrefix: string) =>
    value.split("\n").map((line, lineIndex, lines) => (
      <span key={`${keyPrefix}-${lineIndex}`}>
        {line}
        {lineIndex < lines.length - 1 ? <br /> : null}
      </span>
    ));

  const uniqueTerms = highlightReferences
    ? [...new Set(terms.map((term) => term.text).filter((term) => term.length >= 2))].sort((a, b) => b.length - a.length)
    : [];
  const referenceRanges: TextRange[] = [];
  for (const term of uniqueTerms) {
    const pattern = new RegExp(escapeRegExp(term), "gu");
    for (const match of text.matchAll(pattern)) {
      const start = match.index ?? 0;
      referenceRanges.push({ start, end: start + match[0].length });
    }
  }
  const localUnderlineRanges = underlineRanges.flatMap((range) => {
    const start = Math.max(0, range.start - sourceOffset);
    const end = Math.min(text.length, range.end - sourceOffset);
    return start < end ? [{ start, end }] : [];
  });
  if (referenceRanges.length === 0 && localUnderlineRanges.length === 0) return renderLines(text, "plain");

  const boundaries = new Set([0, text.length]);
  for (const range of [...referenceRanges, ...localUnderlineRanges]) {
    boundaries.add(range.start);
    boundaries.add(range.end);
  }
  const points = [...boundaries].sort((a, b) => a - b);
  return points.slice(0, -1).map((start, index) => {
    const end = points[index + 1];
    const part = text.slice(start, end);
    const isReference = referenceRanges.some((range) => start >= range.start && end <= range.end);
    const isUnderlined = localUnderlineRanges.some((range) => start >= range.start && end <= range.end);
    const content = renderLines(part, `marked-${index}`);
    return isReference || isUnderlined ? (
      <strong key={index} className={isReference
        ? "font-extrabold text-rose-700 underline decoration-rose-200 decoration-2 underline-offset-2"
        : "font-bold underline decoration-2 underline-offset-2"}>
        {content}
      </strong>
    ) : <span key={index}>{content}</span>;
  });
}

function ReadingBody({
  passage,
  showFurigana,
  referenceTerms = [],
  highlightReferences = false,
}: {
  passage: ReadingPassage;
  showFurigana: boolean;
  referenceTerms?: ReferenceTerm[];
  highlightReferences?: boolean;
}) {
  const passageText = passage.body.map((segment) => segment.text).join("");
  const underlineRanges = findUniqueTextRanges(passageText, passage.underlinedPhrases, passage.underlinedRanges);
  let sourceOffset = 0;
  return (
    <>
      {passage.body.map((seg, i) => {
        const offset = sourceOffset;
        sourceOffset += seg.text.length;
        return showFurigana && seg.furigana ? (
          <ruby key={i}>
            {renderTextWithReferences(seg.text, referenceTerms, highlightReferences, underlineRanges, offset)}
            <rt className="text-[10px] text-neutral-400">{seg.furigana}</rt>
          </ruby>
        ) : (
          <span key={i}>{renderTextWithReferences(seg.text, referenceTerms, highlightReferences, underlineRanges, offset)}</span>
        );
      })}
    </>
  );
}

// Used instead of plain ReadingBody when "Xem bản dịch" is on and the
// passage has per-sentence data -- interleaves each JP sentence with its VI
// translation right below it (same idea as Listening's turn+textVi), rather
// than one dense translated block after the whole passage.
function ReadingBodyInterleaved({
  passage,
  showFurigana,
  referenceTerms = [],
  highlightReferences = false,
}: {
  passage: ReadingPassage;
  showFurigana: boolean;
  referenceTerms?: ReferenceTerm[];
  highlightReferences?: boolean;
}) {
  const groups = splitBodyIntoSentences(passage.body);
  const passageText = passage.body.map((segment) => segment.text).join("");
  const underlineRanges = findUniqueTextRanges(passageText, passage.underlinedPhrases, passage.underlinedRanges);
  let sourceSearchFrom = 0;
  return (
    <div className="flex flex-col gap-3">
      {groups.map((segs, gi) => (
        <div key={gi}>
          <div>
            {segs.map((seg, si) => {
              const matchOffset = passageText.indexOf(seg.text, sourceSearchFrom);
              const offset = matchOffset >= 0 ? matchOffset : sourceSearchFrom;
              sourceSearchFrom = offset + seg.text.length;
              return showFurigana && seg.furigana ? (
                <ruby key={si}>
                  {renderTextWithReferences(seg.text, referenceTerms, highlightReferences, underlineRanges, offset)}
                  <rt className="text-[10px] text-neutral-400">{seg.furigana}</rt>
                </ruby>
              ) : (
                <span key={si}>{renderTextWithReferences(seg.text, referenceTerms, highlightReferences, underlineRanges, offset)}</span>
              );
            })}
          </div>
          {passage.sentencesVi?.[gi] ? (
            <div className="mt-1 border-l-2 border-neutral-300 pl-3 text-sm leading-snug text-neutral-500 italic">
              {passage.sentencesVi[gi]}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

export function ReadingScreen({
  targetId,
  onOpenVocab,
  onOpenBunpo,
  onCurrentItemChange,
}: {
  targetId?: string;
  onOpenVocab: (vocabId: string) => void;
  onOpenBunpo: (bunpoId: string) => void;
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
          resultsRevealed: getPassageProgress(passage, s.answers).status === "done",
        };
        await saveViewerState(s);
      } else if (s.currentPassageId) {
        const currentPassage = findReadingById(s.currentPassageId);
        if (currentPassage && getPassageProgress(currentPassage, s.answers).status === "done" && !s.resultsRevealed) {
          s = { ...s, resultsRevealed: true };
          await saveViewerState(s);
        }
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

  if (!state) return <LoadingScreen />;

  const passage = state.currentPassageId ? findReadingById(state.currentPassageId) : undefined;

  // Lifted up from ListView (rather than each screen recomputing its own
  // copy) so PassageView can sequence Trước/Tiếp through the exact same
  // filtered+status-filtered order the user was browsing in the list --
  // same reasoning as BunpoScreen.tsx's DetailView visibleList.
  const filtered = ALL_READING.filter((p) => matchesFilters(p, state));
  const visiblePassages = filtered.filter((p) => {
    if (state.listStatusFilter === "all") return true;
    const progress = getPassageProgress(p, state.answers);
    if (state.listStatusFilter === "needs-review") return progress.status === "done" && progress.correct < progress.total;
    return progress.status === state.listStatusFilter;
  });

  async function openPassage(passage: ReadingPassage) {
    await mutate({
      currentPassageId: passage.id,
      answers: { ...state!.answers, [passage.id]: state!.answers[passage.id] ?? passage.questions.map(() => null) },
      // Reset the session-level fallback when switching passages; per-passage
      // display choices are retained separately in passageViewOptions.
      showFurigana: false,
      showTranslation: false,
      showStudyNote: false,
      resultsRevealed: getPassageProgress(passage, state!.answers).status === "done",
    });
  }

  if (passage) {
    return (
      <PassageView
        passage={passage}
        state={state}
        mutate={mutate}
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
  filtered,
  visiblePassages,
  openPassage,
}: {
  state: ReadingViewerState;
  mutate: (partial: Partial<ReadingViewerState>) => Promise<void>;
  error?: string;
  setError: (e?: string) => void;
  filtered: ReadingPassage[];
  visiblePassages: ReadingPassage[];
  openPassage: (passage: ReadingPassage) => Promise<void>;
}) {
  const confirm = useConfirm();
  const [filterOpen, setFilterOpen] = useState(false);
  const statusCounts = filtered.reduce(
    (acc, p) => {
      const progress = getPassageProgress(p, state.answers);
      acc[progress.status]++;
      if (progress.status === "done" && progress.correct < progress.total) acc.needsReview++;
      return acc;
    },
    { done: 0, "in-progress": 0, "not-started": 0, needsReview: 0 } as Record<"done" | "in-progress" | "not-started", number> & {
      needsReview: number;
    },
  );

  const allLevelsChecked = AVAILABLE_LEVELS.length <= 1 || state.selectedLevels.length === AVAILABLE_LEVELS.length;
  const regularBooks = AVAILABLE_BOOKS.filter((book) => book !== "jlpt-exam");
  const selectedRegularBooks = state.selectedBooks.filter((book) => book !== "jlpt-exam");
  const allBooksChecked = selectedRegularBooks.length === regularBooks.length && state.selectedExamIds.length === AVAILABLE_JLPT_EXAMS.length;
  const allLengthsChecked = state.selectedLengths.length === AVAILABLE_LENGTHS.length;
  const allTopicsChecked = state.selectedTopics.length === AVAILABLE_TOPICS.length;
  const filterCount =
    (allLevelsChecked ? 0 : state.selectedLevels.length) +
    (allBooksChecked ? 0 : selectedRegularBooks.length + state.selectedExamIds.length) +
    (allLengthsChecked ? 0 : state.selectedLengths.length) +
    (state.selectedBooks.includes("jlpt-exam") && !allTopicsChecked ? state.selectedTopics.length : 0);

  async function handleStart() {
    const passage = pickRandomPassage(state.selectedLevels, state.selectedLengths, state.selectedBooks, undefined, state.selectedTopics, state.selectedExamIds);
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
    <div className="mx-auto max-w-6xl px-2.5 py-2 md:px-8 md:py-6">
      <PageHeader title="Luyện đọc" subtitle={`${filtered.length} bài`} icon={{ img: "icon-reading.png", bg: "#ede9fe" }} />

      <div className="mt-4 grid grid-cols-2 gap-3">
        <StatCard
          label="Đã hoàn thành"
          value={statusCounts.done}
          tone="emerald"
          active={state.listStatusFilter === "done"}
          onClick={() => mutate({ listStatusFilter: state.listStatusFilter === "done" ? "all" : "done" })}
        />
        <StatCard
          label="Đang làm dở"
          value={statusCounts["in-progress"]}
          tone="amber"
          active={state.listStatusFilter === "in-progress"}
          onClick={() => mutate({ listStatusFilter: state.listStatusFilter === "in-progress" ? "all" : "in-progress" })}
        />
        <StatCard
          label="Chưa làm"
          value={statusCounts["not-started"]}
          active={state.listStatusFilter === "not-started"}
          onClick={() => mutate({ listStatusFilter: state.listStatusFilter === "not-started" ? "all" : "not-started" })}
        />
        <StatCard
          label="Cần ôn lại"
          value={statusCounts.needsReview}
          tone="rose"
          active={state.listStatusFilter === "needs-review"}
          onClick={() => mutate({ listStatusFilter: state.listStatusFilter === "needs-review" ? "all" : "needs-review" })}
        />
      </div>

      <FilterBar>
        <FilterTrigger count={filterCount} onClick={() => setFilterOpen(true)} />
        <Button size="sm" variant="outline" onClick={handleStart}>
          <Shuffle size={14} /> Random bài đọc
        </Button>
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
            : selectedRegularBooks.map((book) => ({
                key: `book-${book}`,
                label: BOOK_LABELS[book],
                onRemove: () => {
                  const next = state.selectedBooks.filter((b) => b !== book);
                  if (next.length === 0 && state.selectedExamIds.length === 0) return;
                  mutate({ selectedBooks: next });
                },
              }))),
          ...(!allBooksChecked && state.selectedExamIds.length === AVAILABLE_JLPT_EXAMS.length
            ? [{
                key: "jlpt-exams-all",
                label: "Tất cả đề JLPT",
                onRemove: () => {
                  if (selectedRegularBooks.length === 0) return;
                  mutate({ selectedExamIds: [], selectedBooks: selectedRegularBooks });
                },
              }]
            : !allBooksChecked ? state.selectedExamIds.flatMap((id) => {
                const exam = AVAILABLE_JLPT_EXAMS.find((item) => item.id === id);
                return exam ? [{
                  key: `exam-${id}`,
                  label: exam.label,
                  onRemove: () => {
                    const nextExamIds = state.selectedExamIds.filter((item) => item !== id);
                    if (nextExamIds.length === 0 && selectedRegularBooks.length === 0) return;
                    mutate({ selectedExamIds: nextExamIds, selectedBooks: nextExamIds.length ? state.selectedBooks : selectedRegularBooks });
                  },
                }] : [];
              }) : []),
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
          ...(allTopicsChecked || !state.selectedBooks.includes("jlpt-exam")
            ? []
            : state.selectedTopics.map((topic) => ({
                key: `topic-${topic}`,
                label: topic,
                onRemove: () => {
                  const next = state.selectedTopics.filter((item) => item !== topic);
                  if (next.length === 0) return;
                  mutate({ selectedTopics: next });
                },
              }))),
        ]}
      />

      {error ? <p className="mt-3 rounded-lg bg-rose-50 p-3 text-sm text-rose-600">{error}</p> : null}

      <FilterSheet
        open={filterOpen}
        onClose={() => setFilterOpen(false)}
        title="Bộ lọc luyện đọc"
        onReset={() => mutate({ selectedLevels: [...AVAILABLE_LEVELS], selectedBooks: [...AVAILABLE_BOOKS], selectedExamIds: AVAILABLE_JLPT_EXAMS.map((exam) => exam.id), selectedLengths: [...AVAILABLE_LENGTHS], selectedTopics: [...AVAILABLE_TOPICS] })}
      >
        {AVAILABLE_LEVELS.length > 1 ? (
          <FilterGroup title="Cấp độ">
            {AVAILABLE_LEVELS.map((level) => {
              const checked = state.selectedLevels.includes(level);
              const count = ALL_READING.filter(
                (p) => p.level === level && state.selectedLengths.includes(p.length) && matchesReadingSources(p, state.selectedBooks, state.selectedExamIds),
              ).length;
              return (
                <FilterChipOption
                  key={level}
                  label={`${level} (${count})`}
                  active={checked}
                  onClick={() => {
                    const next = checked ? state.selectedLevels.filter((l) => l !== level) : [...new Set([...state.selectedLevels, level])];
                    if (next.length === 0) return;
                      const nextExamIds = state.selectedExamIds.length
                        ? pruneToggle(state.selectedExamIds, AVAILABLE_JLPT_EXAMS.map((exam) => exam.id), (id) =>
                            ALL_READING.some((p) => p.examId === id && next.includes(p.level) && state.selectedLengths.includes(p.length)),
                          )
                        : [];
                      const nextBooks = pruneToggle(state.selectedBooks, AVAILABLE_BOOKS, (book) =>
                        ALL_READING.some((p) => p.book === book && next.includes(p.level) && state.selectedLengths.includes(p.length) && (book !== "jlpt-exam" || (!!p.examId && nextExamIds.includes(p.examId)))),
                      );
                      const nextLengths = pruneToggle(state.selectedLengths, AVAILABLE_LENGTHS, (length) =>
                        ALL_READING.some((p) => p.length === length && next.includes(p.level) && matchesReadingSources(p, nextBooks, nextExamIds)),
                      );
                    mutate({ selectedLevels: next, selectedBooks: nextBooks, selectedExamIds: nextExamIds, selectedLengths: nextLengths });
                  }}
                />
              );
            })}
          </FilterGroup>
        ) : null}

        <FilterGroup title="Sách">
            {AVAILABLE_BOOKS.filter((book) => book !== "jlpt-exam").map((book) => {
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
                  const nextLevels = pruneToggle(state.selectedLevels, AVAILABLE_LEVELS, (level) =>
                      ALL_READING.some((p) => p.level === level && next.includes(p.book) && state.selectedLengths.includes(p.length) && matchesReadingSources(p, next, state.selectedExamIds)),
                    );
                    const nextLengths = pruneToggle(state.selectedLengths, AVAILABLE_LENGTHS, (length) =>
                      ALL_READING.some((p) => p.length === length && next.includes(p.book) && nextLevels.includes(p.level) && matchesReadingSources(p, next, state.selectedExamIds)),
                    );
                    mutate({ selectedBooks: next, selectedLevels: nextLevels, selectedLengths: nextLengths });
                  }}
                />
              );
            })}
            {AVAILABLE_JLPT_EXAMS.map((exam) => {
              const checked = state.selectedExamIds.includes(exam.id);
              const count = ALL_READING.filter((p) => p.examId === exam.id && state.selectedLevels.includes(p.level) && state.selectedLengths.includes(p.length)).length;
              return (
                <FilterChipOption
                  key={exam.id}
                  label={`${exam.label} (${count})`}
                  active={checked}
                  onClick={() => {
                    const nextExamIds = checked
                      ? state.selectedExamIds.filter((id) => id !== exam.id)
                      : [...new Set([...state.selectedExamIds, exam.id])];
                    if (nextExamIds.length === 0 && selectedRegularBooks.length === 0) return;
                    const nextBooks = nextExamIds.length
                      ? [...new Set([...state.selectedBooks, "jlpt-exam" as const])]
                      : state.selectedBooks.filter((book) => book !== "jlpt-exam");
                    const nextLevels = pruneToggle(state.selectedLevels, AVAILABLE_LEVELS, (level) =>
                      ALL_READING.some((p) => p.level === level && state.selectedLengths.includes(p.length) && matchesReadingSources(p, nextBooks, nextExamIds)),
                    );
                    const nextLengths = pruneToggle(state.selectedLengths, AVAILABLE_LENGTHS, (length) =>
                      ALL_READING.some((p) => p.length === length && nextLevels.includes(p.level) && matchesReadingSources(p, nextBooks, nextExamIds)),
                    );
                    mutate({ selectedExamIds: nextExamIds, selectedBooks: nextBooks, selectedLevels: nextLevels, selectedLengths: nextLengths });
                  }}
                />
              );
            })}
        </FilterGroup>

        {state.selectedBooks.includes("jlpt-exam") ? (
          <FilterGroup title="Phần đề JLPT">
            {AVAILABLE_TOPICS.filter((topic) => ALL_READING.some((p) => p.book === "jlpt-exam" && p.topic === topic && !!p.examId && state.selectedExamIds.includes(p.examId) && state.selectedLevels.includes(p.level) && state.selectedLengths.includes(p.length))).map((topic) => {
              const checked = state.selectedTopics.includes(topic);
              const count = ALL_READING.filter(
                (p) => p.book === "jlpt-exam" && p.topic === topic && !!p.examId && state.selectedExamIds.includes(p.examId) && state.selectedLevels.includes(p.level) && state.selectedLengths.includes(p.length),
              ).length;
              return (
                <FilterChipOption
                  key={topic}
                  label={`${topic} (${count})`}
                  active={checked}
                  onClick={() => {
                    const next = checked ? state.selectedTopics.filter((item) => item !== topic) : [...new Set([...state.selectedTopics, topic])];
                    if (next.length === 0) return;
                    mutate({ selectedTopics: next });
                  }}
                />
              );
            })}
          </FilterGroup>
        ) : null}

        <FilterGroup title="Độ dài bài đọc">
          {AVAILABLE_LENGTHS.map((length) => {
            const checked = state.selectedLengths.includes(length);
            const count = ALL_READING.filter(
              (p) => p.length === length && state.selectedLevels.includes(p.level) && matchesReadingSources(p, state.selectedBooks, state.selectedExamIds),
            ).length;
            return (
              <FilterChipOption
                key={length}
                label={`${LENGTH_LABELS[length]} (${count})`}
                active={checked}
                onClick={() => {
                  const next = checked ? state.selectedLengths.filter((l) => l !== length) : [...new Set([...state.selectedLengths, length])];
                  if (next.length === 0) return;
                  const nextLevels = pruneToggle(state.selectedLevels, AVAILABLE_LEVELS, (level) =>
                      ALL_READING.some((p) => p.level === level && next.includes(p.length) && matchesReadingSources(p, state.selectedBooks, state.selectedExamIds)),
                    );
                    const nextExamIds = state.selectedExamIds.length
                      ? pruneToggle(state.selectedExamIds, AVAILABLE_JLPT_EXAMS.map((exam) => exam.id), (id) =>
                          ALL_READING.some((p) => p.examId === id && next.includes(p.length) && nextLevels.includes(p.level)),
                        )
                      : [];
                    const nextBooks = pruneToggle(state.selectedBooks, AVAILABLE_BOOKS, (book) =>
                      ALL_READING.some((p) => p.book === book && next.includes(p.length) && nextLevels.includes(p.level) && (book !== "jlpt-exam" || (!!p.examId && nextExamIds.includes(p.examId)))),
                    );
                  mutate({ selectedLengths: next, selectedLevels: nextLevels, selectedBooks: nextBooks, selectedExamIds: nextExamIds });
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
                    {p.topic ? ` · ${p.topic}` : ""}
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
  onOpenVocab,
  onOpenBunpo,
  visiblePassages,
  openPassage,
}: {
  passage: ReadingPassage;
  state: ReadingViewerState;
  mutate: (partial: Partial<ReadingViewerState>) => Promise<void>;
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
  const referenceTerms: ReferenceTerm[] = [
    ...vocabMatches.flatMap((v) => getVocabReferenceTerms(v).map((text) => ({ text, kind: "vocab" as const }))),
    ...bunpoMatches.flatMap((g) => extractMatchChunks(g.pattern).map((text) => ({ text, kind: "bunpo" as const }))),
  ];
  const [referenceTab, setReferenceTab] = useState<"questions" | "references">("questions");
  const [floatingNavVisible, setFloatingNavVisible] = useState(false);
  const viewOptions = state.passageViewOptions[passage.id] ?? {};
  const showFurigana = viewOptions.showFurigana ?? state.showFurigana;
  const showTranslation = viewOptions.showTranslation ?? state.showTranslation;
  const showStudyNote = viewOptions.showStudyNote ?? state.showStudyNote;
  const highlightReferences = viewOptions.highlightReferences ?? (allAnswered && state.resultsRevealed);
  const visibleQuestionTranslations = viewOptions.visibleQuestionTranslations ?? {};

  useEffect(() => {
    setReferenceTab("questions");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [passage.id]);

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

  function updateViewOptions(partial: Partial<ReadingPassageViewOptions>) {
    void mutate({
      passageViewOptions: {
        ...state.passageViewOptions,
        [passage.id]: { ...viewOptions, ...partial },
      },
    });
  }

  const currentIndex = visiblePassages.findIndex((p) => p.id === passage.id);
  const prevPassage = currentIndex > 0 ? visiblePassages[currentIndex - 1] : null;
  const nextPassage = currentIndex >= 0 && currentIndex < visiblePassages.length - 1 ? visiblePassages[currentIndex + 1] : null;

  const floatingNavBottom = useFloatingNav(true, (!!prevPassage || !!nextPassage) && floatingNavVisible);

  async function handleReset() {
    if (!(await confirm(`Làm lại "${passage.title}" từ đầu? Kết quả đã trả lời sẽ bị xoá.`))) return;
    await mutate({ ...resetPassageAnswers(state, passage.id), resultsRevealed: false });
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
        {passage.topic ? <span className="rounded-full bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-600">{passage.topic}</span> : null}
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
          onClick={() => updateViewOptions({ showFurigana: !showFurigana })}
          className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${showFurigana ? "border-rose-300 bg-rose-50 text-rose-600" : "border-neutral-200 text-neutral-600"}`}
        >
          {showFurigana ? "Ẩn furigana" : "Hiện furigana"}
        </button>
        <button
          onClick={() => updateViewOptions({ showTranslation: !showTranslation })}
          className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${showTranslation ? "border-rose-300 bg-rose-50 text-rose-600" : "border-neutral-200 text-neutral-600"}`}
        >
          {showTranslation ? "Ẩn bản dịch" : "Xem bản dịch"}
        </button>
        {passage.studyNote ? (
          <button
            onClick={() => updateViewOptions({ showStudyNote: !showStudyNote })}
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${showStudyNote ? "border-rose-300 bg-rose-50 text-rose-600" : "border-neutral-200 text-neutral-600"}`}
          >
            {showStudyNote ? "Ẩn ghi chú" : "Xem ghi chú"}
          </button>
        ) : null}
      </div>

      <Card className="mt-4 gap-0 rounded-2xl border-neutral-200 p-5 ring-0">
        <div className="text-lg leading-loose text-neutral-800">
          {showTranslation && passage.sentencesVi ? (
            <ReadingBodyInterleaved
              passage={passage}
              showFurigana={showFurigana}
              referenceTerms={referenceTerms}
              highlightReferences={highlightReferences}
            />
          ) : (
            <ReadingBody
              passage={passage}
              showFurigana={showFurigana}
              referenceTerms={referenceTerms}
              highlightReferences={highlightReferences}
            />
          )}
        </div>
      </Card>

      {showTranslation && !passage.sentencesVi ? (
        <div className="mt-3 rounded-xl bg-amber-50 p-4 text-sm leading-relaxed text-amber-800">
          {passage.translationVi.split("\n").map((line, i, arr) => (
            <span key={i}>
              {line}
              {i < arr.length - 1 ? <br /> : null}
            </span>
          ))}
        </div>
      ) : null}

      {showStudyNote && passage.studyNote ? (
        <div className="mt-3 rounded-xl bg-sky-50 p-4 text-sm leading-relaxed text-sky-800">
          {passage.studyNote.split("\n").map((line, i, arr) => (
            <span key={i}>
              {line}
              {i < arr.length - 1 ? <br /> : null}
            </span>
          ))}
        </div>
      ) : null}

      <div className="mt-5 flex rounded-xl border border-neutral-200 bg-neutral-50 p-1" role="tablist" aria-label="Nội dung bài đọc">
        <button
          role="tab"
          aria-selected={referenceTab === "questions"}
          onClick={() => setReferenceTab("questions")}
          className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
            referenceTab === "questions" ? "bg-white text-neutral-800 shadow-sm" : "text-neutral-500 hover:text-neutral-700"
          }`}
        >
          Câu hỏi ({total})
        </button>
        {vocabMatches.length > 0 || bunpoMatches.length > 0 ? (
          <button
            role="tab"
            aria-selected={referenceTab === "references"}
            onClick={() => setReferenceTab("references")}
            className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
              referenceTab === "references" ? "bg-white text-neutral-800 shadow-sm" : "text-neutral-500 hover:text-neutral-700"
            }`}
          >
            Tham khảo ({vocabMatches.length + bunpoMatches.length})
          </button>
        ) : null}
      </div>

      {referenceTab === "references" ? (
        <Card className="mt-4 gap-4 rounded-2xl border-neutral-200 p-4 ring-0">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-bold text-neutral-800">Từ vựng và ngữ pháp trong bài</h2>
              <p className="mt-0.5 text-xs text-neutral-500">Ưu tiên các từ khó và mẫu ngữ pháp đáng chú ý trong bài đọc.</p>
            </div>
            <button
              onClick={() => updateViewOptions({ highlightReferences: !highlightReferences })}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
                highlightReferences ? "border-rose-300 bg-rose-50 text-rose-600" : "border-neutral-200 text-neutral-600"
              }`}
            >
              {highlightReferences ? "Tắt bôi đậm trong bài" : "Bôi đậm trong bài"}
            </button>
          </div>

          {vocabMatches.length > 0 ? (
            <div>
              <div className="flex items-center gap-1.5 text-xs font-semibold text-neutral-500">
                <Library size={14} /> Từ vựng trọng tâm
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {vocabMatches.map((v) => (
                  <button
                    key={v.id}
                    onClick={() => onOpenVocab(v.id)}
                    className="rounded-lg border border-neutral-200 px-2.5 py-1 text-xs text-neutral-600 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700"
                  >
                    {v.word}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          {bunpoMatches.length > 0 ? (
            <div>
              <div className="flex items-center gap-1.5 text-xs font-semibold text-neutral-500">
                <PenSquare size={14} /> Ngữ pháp trong bài
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {bunpoMatches.map((g) => (
                  <button
                    key={g.id}
                    onClick={() => onOpenBunpo(g.id)}
                    className="rounded-lg border border-neutral-200 px-2.5 py-1 text-xs text-neutral-600 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700"
                  >
                    {g.pattern}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </Card>
      ) : (
      <>
      <div className="mt-6 flex flex-col gap-4">
        {passage.questions.map((q, qi) => {
          const answered = answers[qi];
          const showQuestionTranslation = visibleQuestionTranslations[qi] === true;
          return (
            <Card key={qi} className="gap-0 rounded-2xl border-neutral-200 p-5 ring-0">
              <div className="flex flex-col items-start gap-2">
                <div className="font-semibold text-neutral-800">
                  Câu {q.sourceNumber ?? qi + 1}: {renderTextWithReferences(
                    q.question,
                    [],
                    false,
                    findUniqueTextRanges(q.question, q.underline ? [q.underline] : []),
                  )}
                </div>
                {q.questionVi?.trim() ? (
                  <button
                    type="button"
                    onClick={() =>
                      updateViewOptions({
                        visibleQuestionTranslations: {
                          ...visibleQuestionTranslations,
                          [qi]: !showQuestionTranslation,
                        },
                      })
                    }
                    className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors ${
                      showQuestionTranslation
                        ? "border-sky-200 bg-sky-50 text-sky-700"
                        : "border-neutral-200 text-neutral-500 hover:border-sky-200 hover:bg-sky-50 hover:text-sky-700"
                    }`}
                  >
                    <Languages size={13} /> {showQuestionTranslation ? "Ẩn dịch câu hỏi" : "Xem dịch câu hỏi"}
                  </button>
                ) : null}
              </div>
              {showQuestionTranslation && q.questionVi?.trim() ? <div className="mt-2 rounded-lg bg-sky-50 px-3 py-2 text-sm text-sky-800">{q.questionVi}</div> : null}
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
                      {state.resultsRevealed && answered !== null ? (
                        <span className="mt-0.5 block text-xs text-neutral-400">{q.optionsVi[oi]}</span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
              {state.resultsRevealed && answered !== null && q.explanation ? (
                <div className="mt-3 space-y-3 border-t border-neutral-100 pt-3 text-sm">
                  <div>
                    <div className="text-xs font-semibold tracking-wide text-neutral-400 uppercase">Giải thích</div>
                    <div className="mt-1 text-neutral-600">{q.explanation}</div>
                  </div>
                </div>
              ) : null}
            </Card>
          );
        })}
      </div>

      <div className="mt-6 flex flex-col gap-2">
        {!allAnswered || !state.resultsRevealed ? (
          <Button
            className="w-full"
            onClick={() => mutate({ resultsRevealed: !state.resultsRevealed })}
            disabled={answeredCount === 0}
            title={answeredCount === 0 ? "Chọn ít nhất 1 câu trả lời trước" : undefined}
          >
            <CheckCircle2 size={16} /> {state.resultsRevealed ? "Ẩn kết quả" : "Kiểm tra kết quả"}
          </Button>
        ) : null}
        <div className="flex gap-2">
          {answeredCount > 0 ? (
            <Button variant="outline" className="flex-1" onClick={handleReset}>
              <Undo2 size={16} /> Làm lại cả bài
            </Button>
          ) : null}
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => nextPassage && openPassage(nextPassage)}
            disabled={!nextPassage}
          >
            <ChevronRight size={16} /> Bài tiếp theo
          </Button>
        </div>
      </div>
      </>
      )}

      {prevPassage ? (
        <button
          onClick={() => openPassage(prevPassage)}
          aria-label="Bài trước"
          aria-hidden={!floatingNavVisible}
          tabIndex={floatingNavVisible ? 0 : -1}
          className={`fixed ${floatingNavBottom} left-4 z-20 flex h-9 w-9 items-center justify-center rounded-full bg-white text-neutral-600 shadow-lg ring-1 ring-neutral-200 transition-opacity duration-200 active:bg-neutral-50 md:hidden ${floatingNavVisible ? "opacity-100" : "pointer-events-none opacity-0"}`}
        >
          <ChevronLeft size={16} />
        </button>
      ) : null}
      {nextPassage ? (
        <button
          onClick={() => openPassage(nextPassage)}
          aria-label="Bài sau"
          aria-hidden={!floatingNavVisible}
          tabIndex={floatingNavVisible ? 0 : -1}
          className={`fixed right-4 ${floatingNavBottom} z-20 flex h-9 w-9 items-center justify-center rounded-full bg-rose-600 text-white shadow-lg transition-opacity duration-200 active:bg-rose-700 md:hidden ${floatingNavVisible ? "opacity-100" : "pointer-events-none opacity-0"}`}
        >
          <ChevronRight size={16} />
        </button>
      ) : null}
    </div>
  );
}
