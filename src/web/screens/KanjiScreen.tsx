import { useEffect, useState } from "react";
import { Grid2x2, Layers, Flag, CheckCircle2, Clock, ChevronLeft, ChevronRight, Shuffle } from "lucide-react";
import type { Kanji } from "../../types/kanji.ts";
import {
  ALL_KANJI,
  AVAILABLE_LEVELS,
  countForLevel,
  getOrderedList,
  loadViewerState,
  saveViewerState,
  resolveJumpState,
  type KanjiViewerState,
} from "../../popup/kanjiState.ts";
import {
  getProgress,
  loadProgressMap,
  toggleFlag,
  toggleMastered,
  markViewed,
  filterByProgress,
  bucketFor,
  countBuckets,
  isDueForReview,
  MASTERY_STREAK_THRESHOLD,
  type ItemProgress,
  type ProgressMap,
  type ProgressBucket,
} from "../../popup/progressState.ts";
import { vocabForKanjiChar } from "../../popup/kanjiVocabLinks.ts";
import { formatHanViet } from "../../hanVietFormat.ts";
import {
  KANJI_MASTERY_DIRECTIONS,
  KANJI_MODE_LABELS,
  saveQuizSettings,
  loadQuizSettings,
} from "../../popup/quizState.ts";
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

function meaningLine(k: Kanji): { text: string; isDraft: boolean } {
  if (k.meanings.vi.length > 0) return { text: k.meanings.vi.join(", "), isDraft: false };
  if (k.meanings.viDraft && k.meanings.viDraft.length > 0) return { text: k.meanings.viDraft.join(", "), isDraft: true };
  return { text: "(chưa có nghĩa tiếng Việt)", isDraft: false };
}

async function getFilteredList(state: KanjiViewerState): Promise<Kanji[]> {
  const map = await loadProgressMap();
  return filterByProgress(getOrderedList(state), map, state.progressFilter);
}

export function KanjiScreen({
  onOpenVocab,
  onOpenQuiz,
  jumpToId,
  onCurrentItemChange,
}: {
  onOpenVocab: (vocabId: string) => void;
  onOpenQuiz: () => void;
  jumpToId?: string;
  // Lets the router keep the URL (and its "return to X" bookmark for the
  // floating back button) pointed at whichever card is actually on screen,
  // even though paging Trước/Tiếp is handled entirely by this screen's own
  // `mutate()` state rather than a route change.
  onCurrentItemChange?: (id: string | undefined) => void;
}) {
  const [state, setState] = useState<KanjiViewerState | null>(null);
  const [list, setList] = useState<Kanji[]>([]);
  const [progress, setProgress] = useState<ItemProgress | null>(null);
  const [gridMap, setGridMap] = useState<ProgressMap | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  // Which of the 4 overview stat cards (Đã thuộc/Đang học/Cần ôn lại/Chưa
  // học) is narrowing the grid tiles right now, if any -- tapping a card
  // toggles it. Local/display-only on purpose: it only hides non-matching
  // tiles (their `list` index stays put, so tapping one still opens the
  // right card), it never touches `state.progressFilter` or refetches --
  // that field is reserved for "Đến hạn ôn lại" now, the one axis the
  // buckets can't express (see BUCKET_ORDER vs. ProgressFilter's "due").
  const [bucketFilter, setBucketFilter] = useState<ProgressBucket | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let s = await loadViewerState();
      let l: Kanji[];
      if (jumpToId) {
        const jumped = resolveJumpState(s, jumpToId);
        if (jumped) {
          s = jumped;
          l = getOrderedList(s);
        } else {
          l = await getFilteredList(s);
          s = { ...s, index: Math.min(s.index, Math.max(l.length - 1, 0)) };
        }
      } else {
        // Entering the screen fresh (not via a jump link) always lands on
        // the overview grid, regardless of whatever mode was last saved --
        // "which kanji do I already know" should be the first thing you see
        // each visit, not wherever you happened to leave off studying.
        l = await getFilteredList(s);
        s = { ...s, index: Math.min(s.index, Math.max(l.length - 1, 0)), viewMode: "grid" };
      }
      await saveViewerState(s);
      if (cancelled) return;
      setState(s);
      setList(l);
    })();
    return () => {
      cancelled = true;
    };
  }, [jumpToId]);

  useEffect(() => {
    let cancelled = false;
    if (!state) return;
    const k = list[state.index];
    if (state.viewMode === "grid") {
      loadProgressMap().then((m) => {
        if (!cancelled) setGridMap(m);
      });
      setProgress(null);
    } else if (k) {
      getProgress(k.id).then((p) => {
        if (!cancelled) setProgress(p);
      });
      // Fire-and-forget -- looking at a card's detail is itself "studying"
      // it today, independent of whether the user also flags/masters it.
      void markViewed(k.id);
      setGridMap(null);
    } else {
      setProgress(null);
      setGridMap(null);
    }
    return () => {
      cancelled = true;
    };
  }, [state, list]);

  async function mutate(partial: Partial<KanjiViewerState>, recomputeList = true) {
    if (!state) return;
    const next: KanjiViewerState = { ...state, ...partial };
    await saveViewerState(next);
    const newList = recomputeList ? await getFilteredList(next) : list;
    setState(next);
    setList(newList);
  }

  async function applyLevelSelection(newLevels: (typeof AVAILABLE_LEVELS)[number][]) {
    if (newLevels.length === 0) return;
    await mutate({ selectedLevels: newLevels, index: 0 });
  }

  async function refreshProgress() {
    const k = list[state!.index];
    if (!k) return;
    const p = await getProgress(k.id);
    setProgress(p);
  }

  useFloatingNav(!!state && state.viewMode !== "grid");

  const currentId = state && state.viewMode !== "grid" ? list[state.index]?.id : undefined;
  useEffect(() => {
    onCurrentItemChange?.(currentId);
  }, [currentId, onCurrentItemChange]);

  if (!state) {
    return <div className="p-6 text-neutral-400">Đang tải...</div>;
  }

  const k = list[state.index];
  const totalSelected = list.length;
  const isGrid = state.viewMode === "grid";
  const bucketCounts = gridMap ? countBuckets(list, gridMap) : null;
  const allChecked = state.selectedLevels.length === AVAILABLE_LEVELS.length;
  const related = k ? vocabForKanjiChar(k.character) : null;

  return (
    <div className="mx-auto max-w-4xl px-2.5 py-2 md:px-8 md:py-6">
      <PageHeader
        title="Kanji"
        subtitle={isGrid ? `${list.length} thẻ` : `${list.length > 0 ? state.index + 1 : 0} / ${totalSelected}`}
        icon={{ img: "icon-kanji.png", bg: "#ffe4e6" }}
        action={
          <Button variant="outline" size="icon" onClick={() => mutate({ viewMode: isGrid ? "card" : "grid" }, false)}>
            {isGrid ? <Layers size={16} /> : <Grid2x2 size={16} />}
          </Button>
        }
      />

      <FilterBar>
        <FilterTrigger count={allChecked ? 0 : state.selectedLevels.length} onClick={() => setFilterOpen(true)} />
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
        chips={
          allChecked
            ? []
            : state.selectedLevels.map((level) => ({
                key: level,
                label: level,
                onRemove: () => applyLevelSelection(state.selectedLevels.filter((l) => l !== level)),
              }))
        }
      />

      <FilterSheet
        open={filterOpen}
        onClose={() => setFilterOpen(false)}
        title="Bộ lọc Kanji"
        onReset={() => applyLevelSelection([...AVAILABLE_LEVELS])}
      >
        <FilterGroup title="Cấp độ">
          <FilterChipOption
            label={`Tất cả (${ALL_KANJI.length})`}
            active={allChecked}
            onClick={() => applyLevelSelection(allChecked ? state.selectedLevels : [...AVAILABLE_LEVELS])}
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
      </FilterSheet>

      {isGrid ? null : (
        <div className="mt-3 hidden items-center gap-2 md:flex">
          <Button variant="outline" disabled={state.index === 0} onClick={() => mutate({ index: state.index - 1 }, false)}>
            <ChevronLeft size={16} /> Trước
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
                    bucketFilter === b ? "border-neutral-800 ring-2 ring-neutral-800" : "border-neutral-200"
                  }`}
                >
                  <div className="text-xl font-bold">{bucketCounts[b]}</div>
                  <div className="text-xs font-semibold">{BUCKET_LABEL[b]}</div>
                </button>
              ))}
            </div>
            {list.length === 0 ? (
              <p className="mt-6 text-neutral-400">Không có Kanji nào ở bộ lọc này.</p>
            ) : list.every((item) => bucketFilter !== null && bucketFor(gridMap[item.id]) !== bucketFilter) ? (
              <p className="mt-6 text-neutral-400">Không có thẻ nào ở trạng thái "{BUCKET_LABEL[bucketFilter!]}".</p>
            ) : (
              <div className="mt-4 grid grid-cols-5 gap-2 sm:grid-cols-8 md:grid-cols-10">
                {list.map((item, i) => {
                  const bucket = bucketFor(gridMap[item.id]);
                  if (bucketFilter !== null && bucket !== bucketFilter) return null;
                  return (
                    <button
                      key={item.id}
                      title={`${item.character} · ${BUCKET_LABEL[bucket]}`}
                      onClick={() => mutate({ index: i, viewMode: "card" }, false)}
                      className={`rounded-lg py-2 text-center text-lg font-medium transition-colors ${BUCKET_TILE_COLOR[bucket]}`}
                    >
                      {item.character}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        ) : null
      ) : !k ? (
        <p className="mt-6 text-neutral-400">Không có Kanji nào ở bộ lọc này.</p>
      ) : (
        <Card className="mt-3 gap-0 rounded-2xl border-neutral-200 p-6 ring-0">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <Badge style={levelBadgeStyle(k.level)}>{k.level}</Badge>
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
                  await toggleFlag(k.id);
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
                  await toggleMastered(k.id);
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

          <div className="mt-6 text-center text-6xl font-bold text-neutral-800">{k.character}</div>

          {progress ? (
            <div className="mx-auto mt-3.5 flex max-w-xs flex-wrap items-center justify-center gap-1.5">
              {KANJI_MASTERY_DIRECTIONS.map((dir) => {
                const streak = progress.directionStreaks[dir] ?? 0;
                const done = streak >= MASTERY_STREAK_THRESHOLD;
                return (
                  <span
                    key={dir}
                    className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${
                      done ? "border-emerald-300 bg-emerald-50 text-emerald-600" : "border-amber-200 bg-amber-50 text-amber-600"
                    }`}
                  >
                    {done ? "✓" : `${streak}/${MASTERY_STREAK_THRESHOLD}`} {KANJI_MODE_LABELS[dir]}
                  </span>
                );
              })}
            </div>
          ) : null}

          {progress
            ? (() => {
                const missing = KANJI_MASTERY_DIRECTIONS.find((dir) => (progress.directionStreaks[dir] ?? 0) < MASTERY_STREAK_THRESHOLD);
                if (!missing) return null;
                return (
                  <button
                    onClick={async () => {
                      const qs = await loadQuizSettings();
                      await saveQuizSettings({ ...qs, contentType: "kanji", kanjiMode: missing });
                      onOpenQuiz();
                    }}
                    className="mx-auto mt-2 block text-xs font-semibold text-rose-600 hover:underline"
                  >
                    Luyện ngay dạng còn thiếu: {KANJI_MODE_LABELS[missing]}
                  </button>
                );
              })()
            : null}

          <dl className="mt-6 grid grid-cols-[100px_1fr] gap-y-2 text-sm">
            <dt className="text-neutral-400">Hán Việt</dt>
            <dd className="font-semibold text-rose-600">{formatHanViet(k.hanViet)}</dd>

            <dt className="text-neutral-400">Âm On</dt>
            <dd className="text-neutral-800">{k.readings.on.length > 0 ? k.readings.on.join("、") : "—"}</dd>

            <dt className="text-neutral-400">Âm Kun</dt>
            <dd className="text-neutral-800">{k.readings.kun.length > 0 ? k.readings.kun.join("、") : "—"}</dd>

            <dt className="text-neutral-400">Nghĩa</dt>
            <dd className="text-neutral-800">
              {meaningLine(k).text}
              {meaningLine(k).isDraft ? (
                <span
                  title="Dịch bằng AI, chưa được kiểm duyệt"
                  className="ml-1.5 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700"
                >
                  nháp AI
                </span>
              ) : null}
            </dd>

            <dt className="text-neutral-400">English</dt>
            <dd className="text-neutral-500">{k.meanings.en.join(", ") || "—"}</dd>

            <dt className="text-neutral-400">Bộ thủ</dt>
            <dd className="text-neutral-800">
              {k.radical?.character ? `${k.radical.character}${k.radical.raw ? ` (bộ ${k.radical.raw})` : ""}` : "—"}
            </dd>

            <dt className="text-neutral-400">Số nét</dt>
            <dd className="text-neutral-800">{k.strokeCount ?? "—"}</dd>
          </dl>

          {k.mnemonic ? (
            <div className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
              <span className="font-semibold">Mẹo nhớ:</span> {k.mnemonic}
            </div>
          ) : null}

          {related && related.shown.length > 0 ? (
            <div className="mt-4">
              <div className="text-xs font-semibold text-neutral-400">
                Từ vựng chứa chữ này{related.total > related.shown.length ? ` (${related.total})` : ""}
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {related.shown.map((v) => (
                  <button
                    key={v.id}
                    onClick={() => onOpenVocab(v.id)}
                    className="rounded-lg border border-neutral-200 px-2.5 py-1 text-xs text-neutral-600 hover:bg-neutral-50"
                  >
                    {v.word}
                    {v.reading ? <span className="text-neutral-400"> {v.reading}</span> : null}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </Card>
      )}
    </div>
  );
}
