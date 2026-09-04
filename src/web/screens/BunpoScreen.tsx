import { Fragment, useEffect, useState } from "react";
import { Flag, CheckCircle2, ChevronLeft, ChevronRight, BookOpenText, GraduationCap, Info, X } from "lucide-react";
import type { BunpoGrammarPoint, BunpoSource } from "../../types/bunpo.ts";
import type { JlptLevel } from "../../types/kanji.ts";
import {
  ALL_BUNPO,
  AVAILABLE_LEVELS,
  AVAILABLE_SOURCES,
  AVAILABLE_CHAPTERS,
  SOURCE_LABELS,
  countForLevel,
  findBunpoById,
  findChapterTitle,
  getFilteredList,
  loadViewerState,
  saveViewerState,
  type BunpoViewerState,
} from "../../popup/bunpoState.ts";
import { useDebouncedValue } from "../../popup/useDebouncedValue.ts";
import {
  getProgress,
  markViewed,
  loadProgressMap,
  toggleFlag,
  toggleMastered,
  filterByProgress,
  bucketFor,
  countBuckets,
  BUCKET_ITEM_BORDER,
  type ItemProgress,
  type ProgressFilter,
  type ProgressMap,
  type ProgressBucket,
} from "../../popup/progressState.ts";
import { findMatchingReadingPassages, findMatchingQuizBookQuestions, highlightPatternInExample, parseUsage } from "../../popup/bunpoLinks.ts";
import { pruneToggle } from "../../popup/filterUtils.ts";
import { Card } from "../components/ui/card.tsx";
import { Badge } from "../components/ui/badge.tsx";
import { Button } from "../components/ui/button.tsx";
import { levelBadgeStyle } from "../lib/levelColors.tsx";
import { PageHeader } from "../components/PageHeader.tsx";
import { useFloatingNav } from "../WebAppShell.tsx";
import { FilterBar, FilterTrigger } from "../components/FilterBar.tsx";
import { ActiveFilters } from "../components/ActiveFilters.tsx";
import { FilterSheet, FilterGroup, FilterChipOption } from "../components/FilterSheet.tsx";

const BUCKET_ORDER: ProgressBucket[] = ["mastered", "learning", "flagged", "new"];
const BUCKET_LABEL: Record<ProgressBucket, string> = {
  mastered: "Đã thuộc",
  learning: "Đang học",
  flagged: "Cần ôn lại",
  new: "Chưa học",
};
const BUCKET_STAT_COLOR: Record<ProgressBucket, string> = {
  mastered: "border-t-emerald-300 text-emerald-600",
  learning: "border-t-amber-300 text-amber-600",
  flagged: "border-t-rose-300 text-rose-600",
  new: "border-t-neutral-300 text-neutral-600",
};

const USAGE_TERM_GLOSSARY: { term: string; explanation: string }[] = [
  { term: "辞書形", explanation: "Thể từ điển (dạng nguyên mẫu của động từ), vd: 食べる" },
  { term: "ます形", explanation: "Thể ます (dạng lịch sự), vd: 食べます" },
  { term: "て形", explanation: "Thể て, vd: 食べて" },
  { term: "た形", explanation: "Thể た (quá khứ thông thường), vd: 食べた" },
  { term: "ば形", explanation: "Thể ば (giả định), vd: 食べれば" },
  { term: "ない形", explanation: "Thể ない (phủ định), vd: 食べない" },
  { term: "意向形", explanation: "Thể ý chí / dự định, vd: 食べよう" },
  { term: "普通形", explanation: "Thể thông thường (từ điển／ない／た／なかった tuỳ loại từ và thì)" },
];

function matchesQuery(g: BunpoGrammarPoint, q: string): boolean {
  if (!q) return true;
  return g.pattern.toLowerCase().includes(q) || g.meaningVi.toLowerCase().includes(q);
}

function getVisibleList(state: BunpoViewerState, searchQuery: string, progressMap: ProgressMap): BunpoGrammarPoint[] {
  const q = searchQuery.trim().toLowerCase();
  return filterByProgress(getFilteredList(state).filter((g) => matchesQuery(g, q)), progressMap, state.progressFilter);
}

export function BunpoScreen({
  onOpenReading,
  onOpenQuizBook,
  targetId,
  onCurrentItemChange,
}: {
  onOpenReading: (passageId: string) => void;
  onOpenQuizBook: (questionId: string) => void;
  targetId?: string;
  onCurrentItemChange?: (id: string | undefined) => void;
}) {
  const [state, setState] = useState<BunpoViewerState | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let s = await loadViewerState();
      if (targetId && findBunpoById(targetId)) {
        s = { ...s, currentGrammarId: targetId };
        await saveViewerState(s);
      }
      if (cancelled) return;
      setState(s);
    })();
    return () => {
      cancelled = true;
    };
  }, [targetId]);

  async function mutate(partial: Partial<BunpoViewerState>) {
    if (!state) return;
    const next = { ...state, ...partial };
    await saveViewerState(next);
    setState(next);
  }

  useEffect(() => {
    onCurrentItemChange?.(state?.currentGrammarId ?? undefined);
  }, [state?.currentGrammarId, onCurrentItemChange]);

  if (!state) return <div className="p-6 text-neutral-400">Đang tải...</div>;

  const current = state.currentGrammarId ? findBunpoById(state.currentGrammarId) : undefined;

  if (current) {
    return <DetailView g={current} state={state} onOpenReading={onOpenReading} onOpenQuizBook={onOpenQuizBook} mutate={mutate} />;
  }

  return <ListView state={state} mutate={mutate} />;
}

function ListView({
  state,
  mutate,
}: {
  state: BunpoViewerState;
  mutate: (partial: Partial<BunpoViewerState>) => Promise<void>;
}) {
  const [query, setQuery] = useState(state.listSearchQuery);
  const debouncedQuery = useDebouncedValue(query, 150);
  const [progressMap, setProgressMap] = useState<ProgressMap | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  // See KanjiScreen.tsx's identical field -- local/display-only, narrows the
  // rendered rows without touching state.progressFilter or refetching.
  const [bucketFilter, setBucketFilter] = useState<ProgressBucket | null>(null);

  useEffect(() => {
    loadProgressMap().then(setProgressMap);
  }, [state]);

  useEffect(() => {
    if (debouncedQuery !== state.listSearchQuery) {
      mutate({ listSearchQuery: debouncedQuery });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQuery]);

  const allLevelsChecked = state.selectedLevels.length === AVAILABLE_LEVELS.length;
  const allSourcesChecked = state.selectedSources.length === AVAILABLE_SOURCES.length;
  const theoChuongChecked = state.selectedSources.includes("theo-chuong");
  const allChaptersSelected = state.selectedChapters.length === AVAILABLE_CHAPTERS.length;

  const filtered = progressMap ? getVisibleList(state, debouncedQuery, progressMap) : [];
  const bucketCounts = progressMap ? countBuckets(filtered, progressMap) : null;
  const visibleRows =
    bucketFilter !== null && progressMap ? filtered.filter((g) => bucketFor(progressMap[g.id]) === bucketFilter) : filtered;

  function applyLevelSelection(newLevels: JlptLevel[]) {
    if (newLevels.length === 0) return;
    const nextSources = pruneToggle(
      state.selectedSources,
      AVAILABLE_SOURCES,
      (source) => ALL_BUNPO.some((g) => g.sources.includes(source) && newLevels.includes(g.level)),
    );
    mutate({ selectedLevels: newLevels, selectedSources: nextSources as BunpoSource[] });
  }

  return (
    <div className="mx-auto max-w-4xl px-2.5 py-2 md:px-8 md:py-6">
      <PageHeader title="Ngữ pháp" subtitle={`${filtered.length} mẫu ngữ pháp`} icon={{ img: "icon-grammar.png", bg: "#d1fae5" }} />

      {bucketCounts ? (
        <div className="mt-4 grid grid-cols-2 gap-3">
          {BUCKET_ORDER.map((b) => (
            <button
              key={b}
              onClick={() => setBucketFilter(bucketFilter === b ? null : b)}
              className={`rounded-2xl border border-t-4 bg-white p-4 text-left transition-colors ${BUCKET_STAT_COLOR[b]} ${
                bucketFilter === b ? "border-neutral-800 ring-2 ring-neutral-800" : "border-neutral-200"
              }`}
            >
              <div className="text-xl font-bold">{bucketCounts[b]}</div>
              <div className="text-xs font-semibold">{BUCKET_LABEL[b]}</div>
            </button>
          ))}
        </div>
      ) : null}

      <input
        type="text"
        placeholder="Tìm theo mẫu ngữ pháp hoặc nghĩa..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="mt-4 w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm"
      />

      <FilterBar>
        <FilterTrigger
          count={
            (allLevelsChecked ? 0 : state.selectedLevels.length) +
            (allSourcesChecked ? 0 : state.selectedSources.length) +
            (theoChuongChecked && !allChaptersSelected ? state.selectedChapters.length : 0)
          }
          onClick={() => setFilterOpen(true)}
        />
      </FilterBar>

      <ActiveFilters
        chips={[
          ...(allLevelsChecked
            ? []
            : state.selectedLevels.map((level) => ({
                key: `level-${level}`,
                label: level,
                onRemove: () => applyLevelSelection(state.selectedLevels.filter((l) => l !== level)),
              }))),
          ...(allSourcesChecked
            ? []
            : state.selectedSources.map((source) => ({
                key: `source-${source}`,
                label: SOURCE_LABELS[source],
                onRemove: () => {
                  const next = state.selectedSources.filter((s) => s !== source);
                  if (next.length === 0) return;
                  mutate({ selectedSources: next as BunpoSource[] });
                },
              }))),
          ...(state.progressFilter !== "all"
            ? [
                {
                  key: "progress",
                  label: state.progressFilter === "unmastered" ? "Chưa thuộc" : "Đã đánh dấu khó",
                  onRemove: () => mutate({ progressFilter: "all" as ProgressFilter }),
                },
              ]
            : []),
        ]}
      />

      <FilterSheet
        open={filterOpen}
        onClose={() => setFilterOpen(false)}
        title="Bộ lọc ngữ pháp"
        onReset={() => {
          applyLevelSelection([...AVAILABLE_LEVELS]);
          mutate({ selectedSources: [...AVAILABLE_SOURCES] });
        }}
      >
        <FilterGroup title="Cấp độ">
          <FilterChipOption
            label={`Tất cả cấp độ (${ALL_BUNPO.length})`}
            active={allLevelsChecked}
            onClick={() => applyLevelSelection(allLevelsChecked ? state.selectedLevels : [...AVAILABLE_LEVELS])}
          />
          {AVAILABLE_LEVELS.map((level) => {
            const checked = state.selectedLevels.includes(level);
            return (
              <FilterChipOption
                key={level}
                label={`${level} (${countForLevel(level)})`}
                active={checked}
                onClick={() => {
                  const next = checked ? state.selectedLevels.filter((l) => l !== level) : [...new Set([...state.selectedLevels, level])];
                  applyLevelSelection(next);
                }}
              />
            );
          })}
        </FilterGroup>
        <FilterGroup title="Nguồn">
          {/* "Học theo chương" isn't a real book/tài liệu like the others here --
              it's an organizing structure (with its own chapter picker), so it
              gets its own group below instead of sitting in this list as if it
              were just another source. */}
          {AVAILABLE_SOURCES.filter((source) => source !== "theo-chuong").map((source) => {
            const checked = state.selectedSources.includes(source);
            const count = ALL_BUNPO.filter(
              (g) => g.sources.includes(source) && state.selectedLevels.includes(g.level),
            ).length;
            return (
              <FilterChipOption
                key={source}
                label={`${SOURCE_LABELS[source]} (${count})`}
                active={checked}
                onClick={() => {
                  const next = checked
                    ? state.selectedSources.filter((s) => s !== source)
                    : [...new Set([...state.selectedSources, source])];
                  if (next.length === 0) return;
                  mutate({ selectedSources: next as BunpoSource[] });
                }}
              />
            );
          })}
        </FilterGroup>
        {AVAILABLE_SOURCES.includes("theo-chuong") ? (
          <FilterGroup title="Học theo chương">
            <FilterChipOption
              label={`Bật lọc theo chương (${ALL_BUNPO.filter((g) => g.sources.includes("theo-chuong") && state.selectedLevels.includes(g.level)).length})`}
              active={theoChuongChecked}
              onClick={() => {
                const next = theoChuongChecked
                  ? state.selectedSources.filter((s) => s !== "theo-chuong")
                  : [...new Set([...state.selectedSources, "theo-chuong"])];
                if (next.length === 0) return;
                mutate({ selectedSources: next as BunpoSource[] });
              }}
            />
            {theoChuongChecked ? (
              <>
                <FilterChipOption
                  label="Tất cả các chương"
                  active={allChaptersSelected}
                  onClick={() => mutate({ selectedChapters: [...AVAILABLE_CHAPTERS] })}
                />
                {AVAILABLE_CHAPTERS.map((c) => {
                  const checked = state.selectedChapters.includes(c);
                  const title = findChapterTitle(c);
                  return (
                    <FilterChipOption
                      key={c}
                      label={`Chương ${c}${title ? `: ${title}` : ""}`}
                      active={checked}
                      onClick={() => {
                        const next = checked
                          ? state.selectedChapters.filter((x) => x !== c)
                          : [...new Set([...state.selectedChapters, c])];
                        if (next.length === 0) return;
                        mutate({ selectedChapters: next });
                      }}
                    />
                  );
                })}
              </>
            ) : null}
          </FilterGroup>
        ) : null}
      </FilterSheet>

      <div className="mt-4 flex flex-col gap-2">
        {filtered.length === 0 ? (
          <p className="mt-6 text-neutral-400">Không có mẫu ngữ pháp nào khớp bộ lọc này.</p>
        ) : visibleRows.length === 0 ? (
          <p className="mt-6 text-neutral-400">Không có mẫu nào ở trạng thái "{BUCKET_LABEL[bucketFilter!]}".</p>
        ) : (
          progressMap &&
          visibleRows.map((g, i) => {
            const bucket = bucketFor(progressMap[g.id]);
            return (
              <button
                key={g.id}
                onClick={() => mutate({ currentGrammarId: g.id })}
                className={`flex items-center gap-3 rounded-2xl border border-l-4 border-neutral-200 bg-white px-4 py-3.5 text-left hover:border-rose-200 hover:bg-rose-50/40 ${BUCKET_ITEM_BORDER[bucket]}`}
              >
                <span className="w-6 shrink-0 text-xs font-semibold text-neutral-300">{String(i + 1).padStart(2, "0")}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 font-semibold text-neutral-800">
                    {bucket === "flagged" ? <Flag size={14} className="shrink-0 text-rose-500" /> : null}
                    <span className="truncate">{g.pattern}</span>
                    {g.chapter !== undefined ? <span className="shrink-0 text-xs font-normal text-neutral-400">· Chương {g.chapter}</span> : null}
                  </div>
                  <div className="truncate text-sm text-neutral-500">{g.meaningVi}</div>
                </div>
                {bucket === "mastered" ? <CheckCircle2 size={16} className="shrink-0 text-emerald-500" /> : null}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

function DetailView({
  g,
  state,
  onOpenReading,
  onOpenQuizBook,
  mutate,
}: {
  g: BunpoGrammarPoint;
  state: BunpoViewerState;
  onOpenReading: (passageId: string) => void;
  onOpenQuizBook: (questionId: string) => void;
  mutate: (partial: Partial<BunpoViewerState>) => Promise<void>;
}) {
  const [progress, setProgress] = useState<ItemProgress | null>(null);
  const [visibleList, setVisibleList] = useState<BunpoGrammarPoint[]>([]);
  const [showUsageGlossary, setShowUsageGlossary] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [p, progressMap] = await Promise.all([getProgress(g.id), loadProgressMap()]);
      if (cancelled) return;
      setProgress(p);
      setVisibleList(getVisibleList(state, state.listSearchQuery, progressMap));
      // Fire-and-forget -- looking at a grammar point's detail is itself
      // "studying" it today, independent of whether the user also
      // flags/masters it.
      void markViewed(g.id);
    })();
    return () => {
      cancelled = true;
    };
  }, [g.id, state]);

  const readingMatches = findMatchingReadingPassages(g);
  const quizBookMatches = findMatchingQuizBookQuestions(g);
  const parsedUsage = g.usage ? parseUsage(g.usage) : null;

  const currentIndex = visibleList.findIndex((item) => item.id === g.id);
  const prevItem = currentIndex > 0 ? visibleList[currentIndex - 1] : null;
  const nextItem = currentIndex >= 0 && currentIndex < visibleList.length - 1 ? visibleList[currentIndex + 1] : null;

  async function refreshProgress() {
    setProgress(await getProgress(g.id));
  }

  useFloatingNav(true);

  if (!progress) return <div className="p-6 text-neutral-400">Đang tải...</div>;

  return (
    <div className="mx-auto max-w-4xl px-2.5 py-2 md:px-8 md:py-6">
      <div className="flex items-center gap-3">
        <button
          onClick={() => mutate({ currentGrammarId: null })}
          className="flex items-center gap-1 text-sm font-medium text-neutral-500 hover:text-neutral-700"
        >
          <ChevronLeft size={15} /> Ngữ pháp
        </button>
        <span className="text-xs text-neutral-300">·</span>
        <span className="text-sm text-neutral-400">
          {currentIndex >= 0 ? `${currentIndex + 1} / ${visibleList.length}` : ""}
        </span>
      </div>

      <div className="mt-1 truncate text-sm text-neutral-400">
        {g.sources.map((s) => SOURCE_LABELS[s]).join(" · ")}
        {g.chapter !== undefined ? ` · Chương ${g.chapter}` : ""}
      </div>

      <div className="mt-3 hidden items-center gap-2 md:flex">
        <Button variant="outline" disabled={!prevItem} onClick={() => prevItem && mutate({ currentGrammarId: prevItem.id })}>
          <ChevronLeft size={16} /> Mẫu trước
        </Button>
        <Button variant="outline" className="ml-auto" disabled={!nextItem} onClick={() => nextItem && mutate({ currentGrammarId: nextItem.id })}>
          Mẫu sau <ChevronRight size={16} />
        </Button>
      </div>

      {prevItem ? (
        <button
          onClick={() => mutate({ currentGrammarId: prevItem.id })}
          aria-label="Mẫu trước"
          className="fixed bottom-36 left-4 z-20 flex h-10 w-10 items-center justify-center rounded-full bg-white text-neutral-600 shadow-lg ring-1 ring-neutral-200 active:bg-neutral-50 md:hidden"
        >
          <ChevronLeft size={18} />
        </button>
      ) : null}
      {nextItem ? (
        <button
          onClick={() => mutate({ currentGrammarId: nextItem.id })}
          aria-label="Mẫu sau"
          className="fixed right-4 bottom-36 z-20 flex h-10 w-10 items-center justify-center rounded-full bg-rose-600 text-white shadow-lg active:bg-rose-700 md:hidden"
        >
          <ChevronRight size={18} />
        </button>
      ) : null}

      <Card className="mt-4 gap-0 rounded-2xl border-neutral-200 p-6 ring-0">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <Badge style={levelBadgeStyle(g.level)}>{g.level}</Badge>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              title={progress.flagged ? "Bỏ đánh dấu khó" : "Đánh dấu khó, cần học lại"}
              onClick={async () => {
                await toggleFlag(g.id);
                await refreshProgress();
              }}
              className={`flex h-7.5 w-7.5 items-center justify-center rounded-full ${
                progress.flagged ? "text-rose-500" : "text-neutral-300 hover:text-neutral-400"
              }`}
            >
              <Flag size={17} fill={progress.flagged ? "currentColor" : "none"} />
            </button>
            <button
              title={progress.mastered ? "Đã thuộc" : "Đánh dấu đã thuộc"}
              onClick={async () => {
                await toggleMastered(g.id);
                await refreshProgress();
              }}
              className={`flex h-7.5 w-7.5 items-center justify-center rounded-full ${
                progress.mastered ? "bg-emerald-50 text-emerald-600" : "text-neutral-300 hover:text-neutral-400"
              }`}
            >
              <CheckCircle2 size={17} />
            </button>
          </div>
        </div>
        {g.chapterTitle ? <div className="mt-1 text-sm text-neutral-400">{g.chapterTitle}</div> : null}

        <div className="mt-6 text-center text-3xl font-bold text-neutral-800">{g.pattern}</div>

        <dl className="mt-6 grid grid-cols-[100px_1fr] gap-y-3 text-sm">
          {g.formula ? (
            <>
              <dt className="text-neutral-400">Công thức</dt>
              <dd className="text-neutral-800">{g.formula}</dd>
            </>
          ) : null}
          <dt className="text-neutral-400">Nghĩa</dt>
          <dd className="text-neutral-800">{g.meaningVi}</dd>
          {g.usage ? (
            <>
              <dt className="flex items-center gap-1 text-neutral-400">
                Cách dùng
                <button title="Giải thích ký hiệu thể" onClick={() => setShowUsageGlossary(true)} className="text-neutral-300 hover:text-neutral-500">
                  <Info size={13} />
                </button>
              </dt>
              <dd className="whitespace-pre-line text-neutral-800">
                {parsedUsage ? (
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-neutral-400">Nguồn: {parsedUsage.source}</div>
                    <div className="mt-1 border-l-2 border-neutral-200 pl-2 text-xs leading-relaxed text-neutral-500 italic">{parsedUsage.jp}</div>
                    <div className="mt-1.5 leading-relaxed text-neutral-800">{parsedUsage.vi}</div>
                  </div>
                ) : (
                  g.usage
                )}
              </dd>
            </>
          ) : null}
          {g.examTip ? (
            <>
              <dt className="text-neutral-400">Key JLPT</dt>
              <dd className="text-neutral-800">{g.examTip}</dd>
            </>
          ) : null}
        </dl>

        <div className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm">
          <div className="text-neutral-800">
            {highlightPatternInExample(g.example, g.pattern).map((frag, i) =>
              frag.highlighted ? (
                <mark key={i} className="rounded bg-emerald-200 px-0.5">
                  {frag.text}
                </mark>
              ) : (
                <Fragment key={i}>{frag.text}</Fragment>
              ),
            )}
          </div>
          <div className="mt-1 text-emerald-700">{g.exampleVi}</div>
        </div>

        {readingMatches.length > 0 ? (
          <div className="mt-4">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-neutral-400">
              <BookOpenText size={14} /> Xuất hiện trong bài đọc
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {readingMatches.map((p) => (
                <button
                  key={p.id}
                  onClick={() => onOpenReading(p.id)}
                  className="rounded-lg border border-neutral-200 px-2.5 py-1 text-xs text-neutral-600 hover:bg-neutral-50"
                >
                  {p.title}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {quizBookMatches.length > 0 ? (
          <div className="mt-4">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-neutral-400">
              <GraduationCap size={14} /> Xuất hiện trong luyện đề
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {quizBookMatches.map((qq) => (
                <button
                  key={qq.id}
                  onClick={() => onOpenQuizBook(qq.id)}
                  className="rounded-lg border border-neutral-200 px-2.5 py-1 text-xs text-neutral-600 hover:bg-neutral-50"
                >
                  {qq.question.slice(0, 24)}
                  {qq.question.length > 24 ? "…" : ""}
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </Card>

      {showUsageGlossary ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowUsageGlossary(false);
          }}
        >
          <div className="relative max-h-[80vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-5 shadow-xl">
            <button
              onClick={() => setShowUsageGlossary(false)}
              className="absolute right-4 top-4 text-neutral-400 hover:text-neutral-600"
            >
              <X size={18} />
            </button>
            <div className="text-base font-semibold text-neutral-800">Giải thích ký hiệu thể</div>
            <dl className="mt-4 grid grid-cols-[100px_1fr] gap-y-2 text-sm">
              {USAGE_TERM_GLOSSARY.map((entry) => (
                <Fragment key={entry.term}>
                  <dt className="font-semibold text-neutral-700">{entry.term}</dt>
                  <dd className="text-neutral-600">{entry.explanation}</dd>
                </Fragment>
              ))}
            </dl>
          </div>
        </div>
      ) : null}
    </div>
  );
}
