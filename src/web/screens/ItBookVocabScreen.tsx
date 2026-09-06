import { useEffect, useState } from "react";
import { Grid2x2, Layers, Flag, CheckCircle2, Clock, ChevronLeft, ChevronRight, Shuffle } from "lucide-react";
import {
  ALL_IT_BOOK_VOCAB,
  AVAILABLE_LESSONS,
  LESSON_LABELS,
  countForLesson,
  getOrderedList,
  loadViewerState,
  saveViewerState,
  type ItBookViewerState,
} from "../../popup/itBookState.ts";
import {
  getProgress,
  markViewed,
  loadProgressMap,
  toggleFlag,
  toggleMastered,
  filterByProgress,
  bucketFor,
  countBuckets,
  isDueForReview,
  type ItemProgress,
  type ProgressMap,
  type ProgressBucket,
} from "../../popup/progressState.ts";
import { formatHanViet } from "../../hanVietFormat.ts";
import { Card } from "../components/ui/card.tsx";
import { Badge } from "../components/ui/badge.tsx";
import { Button } from "../components/ui/button.tsx";
import { PageHeader } from "../components/PageHeader.tsx";
import { useFloatingNav } from "../WebAppShell.tsx";
import { FilterBar, FilterTrigger } from "../components/FilterBar.tsx";
import { ActiveFilters } from "../components/ActiveFilters.tsx";
import { FilterSheet, FilterGroup, FilterChipOption } from "../components/FilterSheet.tsx";
import type { ItBookVocabWord } from "../../types/itBook.ts";

const BUCKET_ORDER: ProgressBucket[] = ["mastered", "learning", "flagged", "new"];
const BUCKET_LABEL: Record<ProgressBucket, string> = {
  mastered: "Đã thuộc",
  learning: "Đang học",
  flagged: "Cần ôn lại",
  new: "Chưa học",
};
const BUCKET_TILE_COLOR: Record<ProgressBucket, string> = {
  mastered: "bg-emerald-100 text-emerald-700 hover:bg-emerald-200",
  learning: "bg-amber-100 text-amber-700 hover:bg-amber-200",
  flagged: "bg-rose-100 text-rose-700 hover:bg-rose-200",
  new: "bg-neutral-100 text-neutral-500 hover:bg-neutral-200",
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

async function getFilteredList(state: ItBookViewerState): Promise<ItBookVocabWord[]> {
  const map = await loadProgressMap();
  return filterByProgress(getOrderedList(state), map, state.progressFilter);
}

export function ItBookVocabScreen({ jumpToLesson }: { jumpToLesson?: number } = {}) {
  const [state, setState] = useState<ItBookViewerState | null>(null);
  const [list, setList] = useState<ItBookVocabWord[]>([]);
  const [progress, setProgress] = useState<ItemProgress | null>(null);
  const [gridMap, setGridMap] = useState<ProgressMap | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const [bucketFilter, setBucketFilter] = useState<ProgressBucket | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let s = await loadViewerState();
      // Coming from "Bài học IT"'s "N từ vựng của bài này" link -- narrow the
      // filter to just that lesson instead of whatever was last selected, so
      // the count the user just saw actually matches what they land on.
      if (jumpToLesson !== undefined) s = { ...s, selectedLessons: [jumpToLesson] };
      const l = await getFilteredList(s);
      // Always lands on the overview grid on a fresh visit, regardless of
      // whatever mode was last saved -- mirrors VocabScreen.tsx/KanjiScreen.tsx.
      s = { ...s, index: Math.min(s.index, Math.max(l.length - 1, 0)), viewMode: "grid" };
      await saveViewerState(s);
      if (cancelled) return;
      setState(s);
      setList(l);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jumpToLesson]);

  useEffect(() => {
    let cancelled = false;
    if (!state) return;
    const v = list[state.index];
    if (state.viewMode === "grid") {
      loadProgressMap().then((m) => {
        if (!cancelled) setGridMap(m);
      });
      setProgress(null);
    } else if (v) {
      getProgress(v.id).then((p) => {
        if (!cancelled) setProgress(p);
      });
      void markViewed(v.id);
      setGridMap(null);
    } else {
      setProgress(null);
      setGridMap(null);
    }
    return () => {
      cancelled = true;
    };
  }, [state, list]);

  async function mutate(partial: Partial<ItBookViewerState>, recomputeList = true) {
    if (!state) return;
    const next: ItBookViewerState = { ...state, ...partial };
    await saveViewerState(next);
    const newList = recomputeList ? await getFilteredList(next) : list;
    setState(next);
    setList(newList);
  }

  async function applyLessonSelection(newLessons: number[]) {
    if (newLessons.length === 0) return;
    await mutate({ selectedLessons: newLessons, index: 0 });
  }

  async function refreshProgress() {
    const v = list[state!.index];
    if (!v) return;
    const p = await getProgress(v.id);
    setProgress(p);
  }

  useFloatingNav(!!state && state.viewMode !== "grid");

  if (!state) {
    return <div className="p-6 text-neutral-400">Đang tải...</div>;
  }

  const v = list[state.index];
  const totalSelected = list.length;
  const isGrid = state.viewMode === "grid";
  const bucketCounts = gridMap ? countBuckets(list, gridMap) : null;
  const allChecked = state.selectedLessons.length === AVAILABLE_LESSONS.length;

  return (
    <div className="mx-auto max-w-4xl px-2.5 py-2 md:px-8 md:py-6">
      <PageHeader
        title="Từ vựng IT"
        subtitle={isGrid ? `${list.length} thẻ` : `${list.length > 0 ? state.index + 1 : 0} / ${totalSelected}`}
        icon={{ img: "icon-vocab.png", bg: "#e0e7ff" }}
        action={
          <Button variant="outline" size="icon" onClick={() => mutate({ viewMode: isGrid ? "card" : "grid" }, false)}>
            {isGrid ? <Layers size={16} /> : <Grid2x2 size={16} />}
          </Button>
        }
      />

      <FilterBar>
        <FilterTrigger count={allChecked ? 0 : state.selectedLessons.length} onClick={() => setFilterOpen(true)} />
        <button
          title="Đến hạn ôn lại"
          onClick={() => mutate({ progressFilter: state.progressFilter === "due" ? "all" : "due", index: 0 })}
          className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium ${
            state.progressFilter === "due" ? "border-rose-300 bg-rose-50 text-rose-600" : "border-neutral-200 text-neutral-500 hover:bg-neutral-50"
          }`}
        >
          <Clock size={13} /> Đến hạn ôn lại
        </button>
        <button
          title="Ngẫu nhiên"
          onClick={() => {
            const randomOrder = !state.randomOrder;
            mutate({ randomOrder, shuffleSeed: randomOrder ? Date.now() : state.shuffleSeed, index: 0 });
          }}
          className={`flex shrink-0 items-center justify-center rounded-full border p-1.5 ${
            state.randomOrder ? "border-rose-300 bg-rose-50 text-rose-600" : "border-neutral-200 text-neutral-500 hover:bg-neutral-50"
          }`}
        >
          <Shuffle size={14} />
        </button>
      </FilterBar>

      <ActiveFilters
        chips={[
          ...(allChecked
            ? []
            : state.selectedLessons.map((l) => ({
                key: String(l),
                label: LESSON_LABELS[l],
                onRemove: () => applyLessonSelection(state.selectedLessons.filter((x) => x !== l)),
              }))),
          ...(state.progressFilter === "due"
            ? [
                {
                  key: "progress",
                  label: "Đến hạn ôn lại",
                  onRemove: () => mutate({ progressFilter: "all", index: 0 }),
                },
              ]
            : []),
        ]}
      />

      <FilterSheet
        open={filterOpen}
        onClose={() => setFilterOpen(false)}
        title="Bộ lọc từ vựng IT"
        onReset={() => applyLessonSelection([...AVAILABLE_LESSONS])}
      >
        <FilterGroup title="Bài học">
          <FilterChipOption
            label={`Tất cả (${ALL_IT_BOOK_VOCAB.length})`}
            active={allChecked}
            onClick={() => applyLessonSelection(allChecked ? state.selectedLessons : [...AVAILABLE_LESSONS])}
          />
          {AVAILABLE_LESSONS.map((lesson) => {
            const checked = state.selectedLessons.includes(lesson);
            return (
              <FilterChipOption
                key={lesson}
                label={`${LESSON_LABELS[lesson]} (${countForLesson(lesson)})`}
                active={checked}
                onClick={() => {
                  const next = checked ? state.selectedLessons.filter((l) => l !== lesson) : [...new Set([...state.selectedLessons, lesson])];
                  applyLessonSelection(next);
                }}
              />
            );
          })}
        </FilterGroup>
      </FilterSheet>

      {isGrid ? null : (
        <div className="mt-3 hidden items-center gap-2 md:flex">
          <Button variant="outline" disabled={state.index === 0} onClick={() => mutate({ index: state.index - 1 }, false)}>
            <ChevronLeft size={16} /> Trước
          </Button>
          <Button
            variant="outline"
            size="icon"
            title="Nhảy tới 1 thẻ bất kỳ"
            onClick={() => {
              if (list.length === 0) return;
              mutate({ index: Math.floor(Math.random() * list.length) }, false);
            }}
          >
            <Shuffle size={16} />
          </Button>
          <Button
            variant="outline"
            className="ml-auto"
            disabled={state.index >= list.length - 1}
            onClick={() => mutate({ index: state.index + 1 }, false)}
          >
            Tiếp <ChevronRight size={16} />
          </Button>
        </div>
      )}

      {isGrid || state.index === 0 ? null : (
        <button
          onClick={() => mutate({ index: state.index - 1 }, false)}
          aria-label="Trước"
          className="fixed bottom-36 left-4 z-20 flex h-10 w-10 items-center justify-center rounded-full bg-white text-neutral-600 shadow-lg ring-1 ring-neutral-200 active:bg-neutral-50 md:hidden"
        >
          <ChevronLeft size={18} />
        </button>
      )}
      {isGrid || state.index >= list.length - 1 ? null : (
        <button
          onClick={() => mutate({ index: state.index + 1 }, false)}
          aria-label="Tiếp"
          className="fixed right-4 bottom-36 z-20 flex h-10 w-10 items-center justify-center rounded-full bg-rose-600 text-white shadow-lg active:bg-rose-700 md:hidden"
        >
          <ChevronRight size={18} />
        </button>
      )}

      {isGrid ? (
        bucketCounts && gridMap ? (
          <div className="mt-6">
            <div className="grid grid-cols-2 gap-3">
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
            {list.length === 0 ? (
              <p className="mt-6 text-neutral-400">Không có từ vựng nào ở bộ lọc này.</p>
            ) : list.every((item) => bucketFilter !== null && bucketFor(gridMap[item.id]) !== bucketFilter) ? (
              <p className="mt-6 text-neutral-400">Không có thẻ nào ở trạng thái "{BUCKET_LABEL[bucketFilter!]}".</p>
            ) : (
              <div className="mt-4 grid grid-cols-4 gap-2 sm:grid-cols-6 md:grid-cols-8">
                {list.map((item, i) => {
                  const bucket = bucketFor(gridMap[item.id]);
                  if (bucketFilter !== null && bucket !== bucketFilter) return null;
                  return (
                    <button
                      key={item.id}
                      title={`${item.word} · ${BUCKET_LABEL[bucket]}`}
                      onClick={() => mutate({ index: i, viewMode: "card" }, false)}
                      className={`truncate rounded-lg px-2 py-2 text-sm font-medium transition-colors ${BUCKET_TILE_COLOR[bucket]}`}
                    >
                      {item.word}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        ) : null
      ) : !v ? (
        <p className="mt-6 text-neutral-400">Không có từ vựng nào ở bộ lọc này.</p>
      ) : (
        <Card className="mt-3 gap-0 rounded-2xl border-neutral-200 p-6 ring-0">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <Badge variant="secondary">{LESSON_LABELS[v.lesson]}</Badge>
              {isDueForReview(progress ?? undefined) ? (
                <span className="flex items-center gap-1 text-xs font-semibold text-amber-600">
                  <Clock size={13} /> Đến hạn ôn lại
                </span>
              ) : null}
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <button
                title={progress?.flagged ? "Bỏ đánh dấu khó" : "Đánh dấu khó, cần học lại"}
                onClick={async () => {
                  await toggleFlag(v.id);
                  await refreshProgress();
                }}
                className={`flex h-7.5 w-7.5 items-center justify-center rounded-full ${
                  progress?.flagged ? "text-rose-500" : "text-neutral-300 hover:text-neutral-400"
                }`}
              >
                <Flag size={17} fill={progress?.flagged ? "currentColor" : "none"} />
              </button>
              <button
                title={progress?.mastered ? "Đã thuộc" : "Đánh dấu đã thuộc"}
                onClick={async () => {
                  await toggleMastered(v.id);
                  await refreshProgress();
                }}
                className={`flex h-7.5 w-7.5 items-center justify-center rounded-full ${
                  progress?.mastered ? "bg-emerald-50 text-emerald-600" : "text-neutral-300 hover:text-neutral-400"
                }`}
              >
                <CheckCircle2 size={17} />
              </button>
            </div>
          </div>

          <div className="mt-6 text-center text-4xl font-bold text-neutral-800">{v.word}</div>
          {v.reading ? <div className="mt-1 text-center text-neutral-500">{v.reading}</div> : null}

          <dl className="mt-6 grid grid-cols-[100px_1fr] gap-y-2 text-sm">
            {v.hanViet.length > 0 ? (
              <>
                <dt className="text-neutral-400">Hán Việt</dt>
                <dd className="font-semibold text-rose-600">{formatHanViet(v.hanViet)}</dd>
              </>
            ) : null}
            <dt className="text-neutral-400">Nghĩa</dt>
            <dd className="text-neutral-800">{v.meaningVi || "—"}</dd>
          </dl>
        </Card>
      )}
    </div>
  );
}
