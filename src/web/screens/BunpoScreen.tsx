import { Fragment, useEffect, useState } from "react";
import { Flag, CheckCircle2, ChevronLeft, ChevronRight, BookOpenText, GraduationCap, Info, X, MessageSquarePlus, GitBranch } from "lucide-react";
import type { BunpoGrammarPoint, BunpoRelatedKind, BunpoSource } from "../../types/bunpo.ts";
import type { JlptLevel } from "../../types/kanji.ts";
import {
  ALL_BUNPO,
  AVAILABLE_LEVELS,
  AVAILABLE_SOURCES,
  AVAILABLE_CHAPTERS,
  SOURCE_LABELS,
  TRY_N3_CHAPTERS,
  tryN3GrammarIds,
  findBunpoById,
  findChapterTitle,
  getFilteredList,
  loadViewerState,
  saveViewerState,
  type BunpoViewerState,
} from "../../popup/bunpoState.ts";
import { useDebouncedValue } from "../../popup/useDebouncedValue.ts";
import {
  markViewed,
  loadProgressMap,
  toggleFlag,
  toggleMastered,
  filterByProgress,
  bucketFor,
  countBuckets,
  defaultProgress,
  isFlagged,
  BUCKET_ITEM_BORDER,
  type ItemProgress,
  type ProgressFilter,
  type ProgressMap,
  type ProgressBucket,
} from "../../popup/progressState.ts";
import { findMatchingReadingPassages, findMatchingQuizBookQuestions, findBunpoByPattern, findRelatedBunpo, highlightPatternInExample, parseUsage, isGrammarFormula, splitGrammarFormula, formatGrammarFormulaInline } from "../../popup/bunpoLinks.ts";
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
import { LoadingScreen } from "../components/LoadingScreen.tsx";
import { CorrectionEditorSheet, CORRECTION_ISSUE_LABELS } from "../components/CorrectionEditorSheet.tsx";
import { loadCorrectionsForEntity, type DataCorrectionEntry } from "../../popup/dataCorrectionState.ts";
import "../../grammar-detail.css";

const BUCKET_ORDER: ProgressBucket[] = ["mastered", "learning", "flagged", "new"];
const RELATED_LABEL: Record<BunpoRelatedKind, string> = {
  form: "Cùng cấu trúc",
  meaning: "Nghĩa gần",
  both: "Cấu trúc & nghĩa",
  confusable: "Dễ nhầm",
};
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
const BUCKET_ACTIVE_RING: Record<ProgressBucket, string> = {
  mastered: "border-emerald-400 ring-2 ring-emerald-400",
  learning: "border-amber-400 ring-2 ring-amber-400",
  flagged: "border-rose-400 ring-2 ring-rose-400",
  new: "border-neutral-400 ring-2 ring-neutral-400",
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
  const base = filterByProgress(getFilteredList(state).filter((g) => matchesQuery(g, q)), progressMap, state.progressFilter);
  if (state.tryN3Chapter === null || !state.selectedSources.includes("try-n3")) return base;
  const ids = tryN3GrammarIds(state.tryN3Chapter);
  return base.filter((g) => ids.has(g.id));
}

export function BunpoScreen({
  onOpenReading,
  onOpenQuizBook,
  onOpenMap,
  targetId,
  onCurrentItemChange,
}: {
  onOpenReading: (passageId: string) => void;
  onOpenQuizBook: (questionId: string) => void;
  onOpenMap: (level: "N5" | "N3") => void;
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

  // Functional setState so each call builds on the LATEST state instead of
  // whatever `state` this closure captured at render time -- two mutate()
  // calls fired close together (e.g. FilterSheet's onReset calling it twice
  // in the same tick, or a debounced search-query save racing a row click)
  // would otherwise both compute `next` off the same stale snapshot, and
  // whichever's setState/save resolves last silently wins, dropping the
  // other's change.
  function mutate(partial: Partial<BunpoViewerState>) {
    setState((prev) => {
      if (!prev) return prev;
      const next = { ...prev, ...partial };
      void saveViewerState(next);
      return next;
    });
  }

  useEffect(() => {
    onCurrentItemChange?.(state?.currentGrammarId ?? undefined);
  }, [state?.currentGrammarId, onCurrentItemChange]);

  if (!state) return <LoadingScreen />;

  const current = state.currentGrammarId ? findBunpoById(state.currentGrammarId) : undefined;

  if (current) {
    return <DetailView g={current} state={state} onOpenReading={onOpenReading} onOpenQuizBook={onOpenQuizBook} mutate={mutate} />;
  }

  return <ListView state={state} mutate={mutate} onOpenMap={onOpenMap} />;
}

function ListView({
  state,
  mutate,
  onOpenMap,
}: {
  state: BunpoViewerState;
  mutate: (partial: Partial<BunpoViewerState>) => void;
  onOpenMap: (level: "N5" | "N3") => void;
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
  const selectedTryN3Ids =
    state.tryN3Chapter !== null && state.selectedSources.includes("try-n3") ? tryN3GrammarIds(state.tryN3Chapter) : null;
  const chapterFiltered = selectedTryN3Ids ? filtered.filter((g) => selectedTryN3Ids.has(g.id)) : filtered;
  const bucketCounts = progressMap ? countBuckets(chapterFiltered, progressMap) : null;
  const tryN3N3CardCount = ALL_BUNPO.filter((g) => g.level === "N3" && g.sources.includes("try-n3")).length;
  const visibleRows =
    bucketFilter !== null && progressMap ? chapterFiltered.filter((g) => bucketFor(progressMap[g.id]) === bucketFilter) : chapterFiltered;

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
    <div className="mx-auto max-w-6xl px-2.5 py-2 md:px-8 md:py-6">
      <PageHeader title="Ngữ pháp" subtitle={`${chapterFiltered.length} mẫu ngữ pháp`} icon={{ img: "icon-grammar.png", bg: "#d1fae5" }} />

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onOpenMap("N5")}
          className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-sm font-semibold text-violet-800 transition-colors hover:bg-violet-100"
        >
          <GitBranch size={17} aria-hidden="true" />
          Sơ đồ ngữ pháp N5
        </button>
        <button
          type="button"
          onClick={() => onOpenMap("N3")}
          className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-sm font-semibold text-sky-800 transition-colors hover:bg-sky-100"
        >
          <GitBranch size={17} aria-hidden="true" />
          Sơ đồ ngữ pháp N3
        </button>
      </div>

      {bucketCounts ? (
        <div className="mt-4 grid grid-cols-2 gap-3">
          {BUCKET_ORDER.map((b) => (
            <button
              key={b}
              onClick={() => setBucketFilter(bucketFilter === b ? null : b)}
              className={`rounded-2xl border border-t-4 bg-white p-4 text-left transition-colors ${BUCKET_STAT_COLOR[b]} ${
                bucketFilter === b ? BUCKET_ACTIVE_RING[b] : "border-neutral-200"
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
                  mutate({ selectedSources: next as BunpoSource[], tryN3Chapter: next.includes("try-n3") ? state.tryN3Chapter : null });
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

      {!allSourcesChecked && state.selectedSources.includes("try-n3") ? (
        <section className="mt-4 rounded-2xl border border-rose-100 bg-rose-50/40 p-3.5 sm:p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <div className="text-sm font-bold text-neutral-800">Theo bài trong sách TRY! N3</div>
              <p className="mt-0.5 text-xs text-neutral-500">
                Cấu trúc 11 bài của sách, tách biệt với 15 chương ngữ pháp hiện có.
              </p>
            </div>
            <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-rose-600 ring-1 ring-rose-100">
              11 bài · 155 câu
            </span>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            <button
              type="button"
              onClick={() => mutate({ tryN3Chapter: null })}
              className={`rounded-xl border bg-white p-3 text-left transition-colors ${
                state.tryN3Chapter === null
                  ? "border-rose-300 ring-2 ring-rose-100"
                  : "border-neutral-200 hover:border-rose-200"
              }`}
            >
              <div className="text-xs font-bold text-rose-600">Tất cả bài</div>
              <div className="mt-1 text-[11px] text-neutral-500">{tryN3N3CardCount} thẻ N3 liên quan</div>
            </button>
            {TRY_N3_CHAPTERS.map((unit) => {
              const mappedCount = tryN3GrammarIds(unit.chapter).size;
              return (
              <button
                key={unit.chapter}
                type="button"
                onClick={() => mutate({ tryN3Chapter: unit.chapter })}
                className={`rounded-xl border bg-white p-3 text-left transition-colors ${
                  state.tryN3Chapter === unit.chapter
                    ? "border-rose-300 ring-2 ring-rose-100"
                    : "border-neutral-200 hover:border-rose-200"
                }`}
              >
                <div className="text-xs font-bold text-neutral-800">Bài {unit.chapter}</div>
                <div className="mt-1 line-clamp-2 text-[11px] leading-snug text-neutral-500">{unit.titleVi}</div>
                <div className="mt-2 text-[10px] font-semibold text-neutral-400">
                  {mappedCount} thẻ · {unit.quizCount} câu
                </div>
              </button>
              );
            })}
          </div>

          {state.tryN3Chapter !== null ? (
            <div className="mt-3 rounded-xl bg-white px-3 py-2 text-xs text-neutral-500 ring-1 ring-rose-100">
              Đang lọc danh sách theo <span className="font-semibold text-rose-600">Bài {state.tryN3Chapter}</span>.
              Các thẻ bên dưới là những mẫu đã được liên kết với bài trong sách; một mẫu có thể xuất hiện ở nhiều bài nếu sách dùng lại cấu trúc đó.
            </div>
          ) : null}
        </section>
      ) : null}

      <FilterSheet
        open={filterOpen}
        onClose={() => setFilterOpen(false)}
        title="Bộ lọc ngữ pháp"
        onReset={() => {
          applyLevelSelection([...AVAILABLE_LEVELS]);
          mutate({ selectedSources: [...AVAILABLE_SOURCES], tryN3Chapter: null });
        }}
      >
        <FilterGroup title="Cấp độ">
          <FilterChipOption
            label={`Tất cả cấp độ (${ALL_BUNPO.filter((g) => g.sources.some((s) => state.selectedSources.includes(s))).length})`}
            active={allLevelsChecked}
            onClick={() => applyLevelSelection(allLevelsChecked ? state.selectedLevels : [...AVAILABLE_LEVELS])}
          />
          {AVAILABLE_LEVELS.map((level) => {
            const checked = state.selectedLevels.includes(level);
            // Factors in the currently selected sources, same as the
            // "Nguồn" chips below factor in the selected levels -- otherwise
            // a level chip could show a nonzero count that actually yields 0
            // items once combined with the active source filter.
            const count = ALL_BUNPO.filter((g) => g.level === level && g.sources.some((s) => state.selectedSources.includes(s))).length;
            return (
              <FilterChipOption
                key={level}
                label={`${level} (${count})`}
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
          {/* "Lộ trình N3" isn't a real book/tài liệu like the others here --
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
                  mutate({ selectedSources: next as BunpoSource[], tryN3Chapter: next.includes("try-n3") ? state.tryN3Chapter : null });
                }}
              />
            );
          })}
        </FilterGroup>
        {AVAILABLE_SOURCES.includes("theo-chuong") ? (
          <FilterGroup title="Lộ trình N3">
            <FilterChipOption
              label={`Bật lộ trình 15 chương (${ALL_BUNPO.filter((g) => g.sources.includes("theo-chuong") && state.selectedLevels.includes(g.level)).length})`}
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
        {chapterFiltered.length === 0 ? (
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
                // Commit the live (not yet debounce-persisted) query
                // together with currentGrammarId in the same update -- so
                // DetailView's visibleList (computed from
                // state.listSearchQuery) matches what was actually on
                // screen when tapped, instead of racing the ~150ms debounce
                // and briefly using a stale/unfiltered query.
                onClick={() => mutate({ currentGrammarId: g.id, listSearchQuery: query })}
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
  mutate: (partial: Partial<BunpoViewerState>) => void;
}) {
  const [progress, setProgress] = useState<ItemProgress | null>(null);
  const [visibleList, setVisibleList] = useState<BunpoGrammarPoint[]>([]);
  const [showUsageGlossary, setShowUsageGlossary] = useState(false);
  const [correctionOpen, setCorrectionOpen] = useState(false);
  const [corrections, setCorrections] = useState<DataCorrectionEntry[]>([]);

  // One shared load -- getProgress(id) internally re-reads loadProgressMap()
  // itself, so calling both separately (as this used to) did the same
  // storage read/parse twice on every mount and every flag/mastered toggle.
  async function loadDetail(): Promise<{ p: ItemProgress; progressMap: ProgressMap }> {
    const progressMap = await loadProgressMap();
    return { p: progressMap[g.id] ?? defaultProgress(), progressMap };
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { p, progressMap } = await loadDetail();
      if (cancelled) return;
      setProgress(p);
      setVisibleList(getVisibleList(state, state.listSearchQuery, progressMap));
      setCorrections(await loadCorrectionsForEntity(g.id));
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
  const relatedBunpo = g.level === "N3" ? findRelatedBunpo(g) : [];
  const parsedUsage = g.usage ? parseUsage(g.usage) : null;
  const usageIsFormula = g.usage ? isGrammarFormula(g.usage) : false;
  const formulaLines = [
    ...(g.formula ? [formatGrammarFormulaInline(g.formula)] : []),
    ...(usageIsFormula && g.usage !== g.formula ? [formatGrammarFormulaInline(g.usage!)] : []),
  ];

  const currentIndex = visibleList.findIndex((item) => item.id === g.id);
  const prevItem = currentIndex > 0 ? visibleList[currentIndex - 1] : null;
  const nextItem = currentIndex >= 0 && currentIndex < visibleList.length - 1 ? visibleList[currentIndex + 1] : null;

  // Also recomputes visibleList (not just `progress`) -- toggling
  // flag/mastered can move `g` in or out of the current progressFilter
  // bucket (e.g. progressFilter "flagged"), and without this the position
  // counter and prev/next targets kept pointing at the stale pre-toggle list
  // until the user left and re-entered the detail view.
  async function refreshProgress() {
    const { p, progressMap } = await loadDetail();
    setProgress(p);
    setVisibleList(getVisibleList(state, state.listSearchQuery, progressMap));
  }

  const floatingNavBottom = useFloatingNav(true);

  if (!progress) return <LoadingScreen />;

  return (
    <div className="mx-auto max-w-6xl px-2.5 py-2 md:px-8 md:py-6">
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
          className={`fixed ${floatingNavBottom} left-4 z-20 floating-action-button bg-white text-neutral-600 shadow-lg ring-1 ring-neutral-200 active:bg-neutral-50 md:hidden`}
        >
          <ChevronLeft size={18} />
        </button>
      ) : null}
      {nextItem ? (
        <button
          onClick={() => mutate({ currentGrammarId: nextItem.id })}
          aria-label="Mẫu sau"
          className={`fixed right-4 ${floatingNavBottom} z-20 floating-action-button bg-rose-600 text-white shadow-lg active:bg-rose-700 md:hidden`}
        >
          <ChevronRight size={18} />
        </button>
      ) : null}

      <Card className="grammar-detail-card mt-4 gap-0 rounded-2xl border-neutral-200 p-4 sm:p-6 ring-0">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <Badge style={levelBadgeStyle(g.level)}>{g.level}</Badge>
            {g.chapterTitle ? <span className="grammar-chapter-tag">{g.chapterTitle}</span> : null}
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              title="Góp ý hoặc ghi chú dữ liệu"
              onClick={() => setCorrectionOpen(true)}
              className={`flex h-7.5 w-7.5 items-center justify-center rounded-full ${
                corrections.length > 0 ? "text-amber-600" : "text-neutral-300 hover:text-neutral-400"
              }`}
            >
              <MessageSquarePlus size={17} />
            </button>
            <button
              title={isFlagged(progress) ? "Bỏ đánh dấu khó" : "Đánh dấu khó, cần học lại"}
              onClick={async () => {
                await toggleFlag(g.id);
                await refreshProgress();
              }}
              className={`flex h-7.5 w-7.5 items-center justify-center rounded-full ${
                isFlagged(progress) ? "text-rose-500" : "text-neutral-300 hover:text-neutral-400"
              }`}
            >
              <Flag size={17} fill={isFlagged(progress) ? "currentColor" : "none"} />
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
        <div className="grammar-hero">
          <div className="grammar-pattern">
            {splitGrammarFormula(g.pattern).map((line, index) => <div key={index} className="grammar-pattern-line">{line}</div>)}
          </div>
          <div className="grammar-hero-divider" />
          <p className="grammar-meaning">{g.meaningVi}</p>
        </div>

        <div className="grammar-sections">
          {formulaLines.length > 0 ? (
            <section className="grammar-section grammar-section--formula">
              <h3 className="grammar-section-title">▣ Công thức
                {usageIsFormula ? <button title="Giải thích ký hiệu thể" onClick={() => setShowUsageGlossary(true)} className="ml-1 text-neutral-400 hover:text-neutral-700"><Info size={13} /></button> : null}
              </h3>
              <div className="grammar-section-body grammar-formula-lines">
                {formulaLines.map((line, index) => <div key={index} className="grammar-formula-line">{line}</div>)}
              </div>
            </section>
          ) : null}
          {g.usage && !usageIsFormula ? (
            <section className="grammar-section grammar-section--usage">
              <h3 className="grammar-section-title">Cách dùng
                <button title="Giải thích ký hiệu thể" onClick={() => setShowUsageGlossary(true)} className="ml-1 text-neutral-400 hover:text-neutral-700"><Info size={13} /></button>
              </h3>
              <div className="grammar-section-body">
                {parsedUsage ? <>
                  <div className="grammar-source-line">Nguồn: {parsedUsage.source}</div>
                  <div className="mt-1 border-l-2 border-purple-200 pl-2 text-xs italic text-neutral-600">{parsedUsage.jp}</div>
                  <div className="mt-1.5">{parsedUsage.vi}</div>
                </> : <div>{g.usage}</div>}
              </div>
            </section>
          ) : null}
          {g.examTip ? <section className="grammar-section grammar-section--tip"><h3 className="grammar-section-title">✦ Mẹo làm JLPT</h3><p className="grammar-section-body">{g.examTip}</p></section> : null}
        </div>

        <CorrectionEditorSheet
          open={correctionOpen}
          onClose={() => setCorrectionOpen(false)}
          entityType="grammar"
          entityId={g.id}
          snapshot={{
            pattern: g.pattern,
            level: g.level,
            meaningVi: g.meaningVi,
            sources: g.sources.map((source) => SOURCE_LABELS[source]),
            chapter: g.chapter,
            chapterTitle: g.chapterTitle,
          }}
          onSaved={(saved) => setCorrections((current) => [saved, ...current.filter((entry) => entry.id !== saved.id)])}
        />

        {g.example.trim() || g.moreExamples?.length ? <div className="grammar-sections">
        <section className="grammar-section grammar-section--example">
          <h3 className="grammar-section-title">☏ Ví dụ</h3>
          <div className="grammar-entry">
          <div className="grammar-example-jp">
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
          <div className="grammar-example-vi">{g.exampleVi}</div>
          </div>
          {g.moreExamples?.map((ex, i) => (
            <div key={i} className="grammar-entry">
              <div className="grammar-example-jp">
                {highlightPatternInExample(ex.jp, g.pattern).map((frag, j) =>
                  frag.highlighted ? (
                    <mark key={j} className="rounded bg-emerald-200 px-0.5">
                      {frag.text}
                    </mark>
                  ) : (
                    <Fragment key={j}>{frag.text}</Fragment>
                  ),
                )}
              </div>
              <div className="grammar-example-vi">{ex.vi}</div>
            </div>
          ))}
        </section>
        </div> : null}

        {relatedBunpo.length > 0 ? (
          <div className="grammar-sections">
            <section className="grammar-section grammar-section--related">
            <h3 className="grammar-section-title">↗ Mẫu liên quan</h3>
            <div className="mt-2 space-y-2.5">
              {relatedBunpo.map(({ target, relation, note }) => (
                <div key={target.id}>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      onClick={() => mutate({ currentGrammarId: target.id })}
                      className="grammar-link-pattern"
                    >
                      {target.pattern}
                    </button>
                    <span className="grammar-tag">
                      {RELATED_LABEL[relation]}
                    </span>
                  </div>
                  <div className="grammar-section-body">{note}</div>
                </div>
              ))}
            </div></section>
          </div>
        ) : null}

        {g.level !== "N3" && g.compareWith && g.compareWith.length > 0 ? (
          <div className="grammar-sections">
            <section className="grammar-section grammar-section--related">
            <h3 className="grammar-section-title">Dễ nhầm với</h3>
            <div className="mt-2 space-y-2.5">
              {g.compareWith.map((c, i) => {
                const target = findBunpoByPattern(c.pattern, g.level);
                return (
                  <div key={i}>
                    {target ? (
                        <button onClick={() => mutate({ currentGrammarId: target.id })} className="grammar-link-pattern">
                        {c.pattern}
                      </button>
                    ) : (
                      <span className="grammar-link-pattern">{c.pattern}</span>
                    )}
                    <div className="grammar-section-body">{c.note}</div>
                  </div>
                );
              })}
            </div>
            </section>
          </div>
        ) : null}

        {progress.dueAt ? <div className="grammar-sections">
          <section className="grammar-section grammar-section--study">
            <div className="grammar-study-status"><strong>Ôn tập</strong><span>{progress.dueAt <= Date.now() ? "Đến hạn" : `Đến hạn ${new Date(progress.dueAt).toLocaleDateString("vi-VN")}`}</span></div>
          </section>
        </div> : null}

        {readingMatches.length > 0 || quizBookMatches.length > 0 ? (
          <details className="mt-2.5 rounded-xl border border-neutral-200 bg-white text-sm">
            <summary className="cursor-pointer px-3 py-2.5 font-semibold text-neutral-600">
              Xuất hiện trong các tài liệu <span className="ml-2 font-normal text-neutral-400">{readingMatches.length} bài đọc · {quizBookMatches.length} đề thi</span>
            </summary>
            <div className="border-t border-neutral-100 px-3 pb-3">
              {readingMatches.length > 0 ? (
                <section className="mt-3 grammar-document-group grammar-document-group--reading">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-neutral-500"><BookOpenText size={14} /> Bài đọc</div>
                  <div className="grammar-link-list">
                    {readingMatches.map((p) => <button key={p.id} onClick={() => onOpenReading(p.id)}>{p.title}</button>)}
                  </div>
                </section>
              ) : null}
              {quizBookMatches.length > 0 ? (
                <section className="mt-3 grammar-document-group grammar-document-group--quiz">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-neutral-500"><GraduationCap size={14} /> Luyện đề</div>
                  <div className="grammar-link-list">
                    {quizBookMatches.map((qq) => (
                      <button key={qq.id} onClick={() => onOpenQuizBook(qq.id)}>
                        {qq.question.slice(0, 24)}{qq.question.length > 24 ? "…" : ""}
                      </button>
                    ))}
                  </div>
                </section>
              ) : null}
            </div>
          </details>
        ) : null}

        {g.sources.length > 0 || corrections.length > 0 || g.chapterTitle ? (
          <div className="grammar-sections">
            <section className="grammar-section grammar-section--notes">
              <h3 className="grammar-section-title">Ghi chú & nguồn</h3>
              <div className="grammar-source-line">{g.sources.map((source) => SOURCE_LABELS[source]).join(" · ")}{g.chapter !== undefined ? ` · Chương ${g.chapter}` : ""}</div>
              {g.chapterTitle ? <div className="grammar-section-body">{g.chapterTitle}</div> : null}
              {corrections.length > 0 ? <div className="grammar-correction-list">
                {corrections.slice(0, 2).map((entry) => (
                  <div key={entry.id} className="grammar-correction-entry">
                    <div className="font-semibold text-amber-700">{CORRECTION_ISSUE_LABELS[entry.issueType]}</div>
                    <div className="whitespace-pre-wrap text-neutral-700">{entry.suggestedValue}</div>
                  </div>
                ))}
                {corrections.length > 2 ? <div className="mt-1 text-amber-700">Còn {corrections.length - 2} ghi chú trong Cài đặt.</div> : null}
              </div> : null}
            </section>
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
