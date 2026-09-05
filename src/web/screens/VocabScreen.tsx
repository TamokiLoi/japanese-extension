import { useEffect, useState } from "react";
import { Grid2x2, Layers, Flag, CheckCircle2, Clock, ChevronLeft, ChevronRight, Shuffle, BookOpenText, GraduationCap } from "lucide-react";
import { VOCAB_MASTERY_DIRECTIONS, VOCAB_MODE_LABELS, VOCAB_MODE_SHORT_LABELS, loadQuizSettings, saveQuizSettings } from "../../popup/quizState.ts";
import {
  ALL_VOCAB,
  AVAILABLE_SOURCES,
  SOURCE_LABELS,
  countForSource,
  getOrderedList,
  loadViewerState,
  saveViewerState,
  resolveJumpState,
  type VocabCard,
  type VocabSource,
  type VocabViewerState,
} from "../../popup/vocabState.ts";
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
  MASTERY_STREAK_THRESHOLD,
  type ItemProgress,
  type ProgressMap,
  type ProgressBucket,
} from "../../popup/progressState.ts";
import { kanjiIdForChar } from "../../popup/kanjiVocabLinks.ts";
import { findMatchingReadingPassages, findMatchingQuizBookQuestions } from "../../popup/vocabLinks.ts";
import { formatHanViet } from "../../hanVietFormat.ts";
import { Card, CardContent } from "../components/ui/card.tsx";
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
const BUCKET_ACTIVE_RING: Record<ProgressBucket, string> = {
  mastered: "border-emerald-400 ring-2 ring-emerald-400",
  learning: "border-amber-400 ring-2 ring-amber-400",
  flagged: "border-rose-400 ring-2 ring-rose-400",
  new: "border-neutral-400 ring-2 ring-neutral-400",
};

function WordWithKanjiLinks({ word, onOpenKanji }: { word: string; onOpenKanji: (kanjiId: string) => void }) {
  return (
    <>
      {[...word].map((ch, i) => {
        const kanjiId = kanjiIdForChar(ch);
        return kanjiId ? (
          <span
            key={i}
            className="cursor-pointer decoration-dotted decoration-2 underline-offset-4 hover:underline"
            onClick={() => onOpenKanji(kanjiId)}
          >
            {ch}
          </span>
        ) : (
          <span key={i}>{ch}</span>
        );
      })}
    </>
  );
}

async function getFilteredList(state: VocabViewerState): Promise<VocabCard[]> {
  const map = await loadProgressMap();
  return filterByProgress(getOrderedList(state), map, state.progressFilter);
}

export function VocabScreen({
  onOpenKanji,
  onOpenReading,
  onOpenQuizBook,
  onOpenQuiz,
  jumpToId,
  onCurrentItemChange,
}: {
  onOpenKanji: (kanjiId: string) => void;
  onOpenReading: (passageId: string) => void;
  onOpenQuizBook: (questionId: string) => void;
  onOpenQuiz: () => void;
  jumpToId?: string;
  onCurrentItemChange?: (id: string | undefined) => void;
}) {
  const [state, setState] = useState<VocabViewerState | null>(null);
  const [list, setList] = useState<VocabCard[]>([]);
  const [progress, setProgress] = useState<ItemProgress | null>(null);
  const [gridMap, setGridMap] = useState<ProgressMap | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  // See KanjiScreen.tsx's identical field for why this is local/display-only
  // instead of living in state.progressFilter.
  const [bucketFilter, setBucketFilter] = useState<ProgressBucket | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let s = await loadViewerState();
      let l: VocabCard[];
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
        // mirrors KanjiScreen.tsx's viewMode reset.
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
      // Fire-and-forget -- looking at a card's detail is itself "studying"
      // it today, independent of whether the user also flags/masters it.
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

  async function mutate(partial: Partial<VocabViewerState>, recomputeList = true) {
    if (!state) return;
    const next: VocabViewerState = { ...state, ...partial };
    await saveViewerState(next);
    const newList = recomputeList ? await getFilteredList(next) : list;
    setState(next);
    setList(newList);
  }

  async function applySourceSelection(newSources: VocabSource[]) {
    if (newSources.length === 0) return;
    await mutate({ selectedSources: newSources, index: 0 });
  }

  async function refreshProgress() {
    const v = list[state!.index];
    if (!v) return;
    const p = await getProgress(v.id);
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

  const v = list[state.index];
  const totalSelected = list.length;
  const isGrid = state.viewMode === "grid";
  const bucketCounts = gridMap ? countBuckets(list, gridMap) : null;
  const allChecked = state.selectedSources.length === AVAILABLE_SOURCES.length;
  const readingMatches = v ? findMatchingReadingPassages(v) : [];
  const quizBookMatches = v ? findMatchingQuizBookQuestions(v) : [];

  return (
    <div className="mx-auto max-w-4xl px-2.5 py-2 md:px-8 md:py-6">
      <PageHeader
        title="Từ vựng"
        subtitle={isGrid ? `${list.length} thẻ` : `${list.length > 0 ? state.index + 1 : 0} / ${totalSelected}`}
        icon={{ img: "icon-vocab.png", bg: "#ffedd5" }}
        action={
          <Button variant="outline" size="icon" onClick={() => mutate({ viewMode: isGrid ? "card" : "grid" }, false)}>
            {isGrid ? <Layers size={16} /> : <Grid2x2 size={16} />}
          </Button>
        }
      />

      <FilterBar>
        <FilterTrigger count={allChecked ? 0 : state.selectedSources.length} onClick={() => setFilterOpen(true)} />
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
            : state.selectedSources.map((s) => ({
                key: s,
                label: SOURCE_LABELS[s],
                onRemove: () => applySourceSelection(state.selectedSources.filter((x) => x !== s)),
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
        title="Bộ lọc từ vựng"
        onReset={() => applySourceSelection([...AVAILABLE_SOURCES])}
      >
        <FilterGroup title="Nguồn">
          <FilterChipOption
            label={`Tất cả (${ALL_VOCAB.length})`}
            active={allChecked}
            onClick={() => applySourceSelection(allChecked ? state.selectedSources : [...AVAILABLE_SOURCES])}
          />
          {AVAILABLE_SOURCES.map((source) => {
            const checked = state.selectedSources.includes(source);
            return (
              <FilterChipOption
                key={source}
                label={`${SOURCE_LABELS[source]} (${countForSource(source)})`}
                active={checked}
                onClick={() => {
                  const next = checked
                    ? state.selectedSources.filter((s) => s !== source)
                    : [...new Set([...state.selectedSources, source])];
                  applySourceSelection(next);
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
              <Badge style={levelBadgeStyle(v.level)}>{v.level}</Badge>
              <Badge variant="secondary">{SOURCE_LABELS[v.source]}</Badge>
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

          <div className="mt-6 text-center text-4xl font-bold text-neutral-800">
            <WordWithKanjiLinks word={v.word} onOpenKanji={onOpenKanji} />
          </div>
          {v.reading ? <div className="mt-1 text-center text-neutral-500">{v.reading}</div> : null}

          {progress ? (
            <div className="mt-3.5 flex gap-1 overflow-x-auto px-1 pb-1">
              {VOCAB_MASTERY_DIRECTIONS.map((dir) => {
                const streak = progress.directionStreaks[dir] ?? 0;
                const done = streak >= MASTERY_STREAK_THRESHOLD;
                return (
                  <span
                    key={dir}
                    title={VOCAB_MODE_LABELS[dir]}
                    className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] font-medium whitespace-nowrap ${
                      done ? "border-emerald-300 bg-emerald-50 text-emerald-600" : "border-amber-200 bg-amber-50 text-amber-600"
                    }`}
                  >
                    {done ? "✓" : `${streak}/${MASTERY_STREAK_THRESHOLD}`} {VOCAB_MODE_SHORT_LABELS[dir]}
                  </span>
                );
              })}
            </div>
          ) : null}

          {progress
            ? (() => {
                const missing = VOCAB_MASTERY_DIRECTIONS.find((dir) => (progress.directionStreaks[dir] ?? 0) < MASTERY_STREAK_THRESHOLD);
                if (!missing) return null;
                return (
                  <button
                    onClick={async () => {
                      const qs = await loadQuizSettings();
                      await saveQuizSettings({ ...qs, contentType: "vocab", vocabMode: missing });
                      onOpenQuiz();
                    }}
                    className="mx-auto mt-2 block text-xs font-semibold text-rose-600 hover:underline"
                  >
                    Luyện ngay dạng còn thiếu: {VOCAB_MODE_LABELS[missing]}
                  </button>
                );
              })()
            : null}

          <dl className="mt-6 grid grid-cols-[100px_1fr] gap-y-2 text-sm">
            {v.hanViet.length > 0 ? (
              <>
                <dt className="text-neutral-400">Hán Việt</dt>
                <dd className="font-semibold text-rose-600">{formatHanViet(v.hanViet)}</dd>
              </>
            ) : null}
            <dt className="text-neutral-400">Nghĩa</dt>
            <dd className="text-neutral-800">{v.meaningVi || "—"}</dd>
            {v.synonym ? (
              <>
                <dt className="text-neutral-400">Đồng nghĩa</dt>
                <dd className="text-neutral-800">
                  {v.synonym.word}
                  {v.synonym.reading ? ` (${v.synonym.reading})` : ""}
                </dd>
              </>
            ) : null}
          </dl>

          {v.mnemonic.length > 0 ? (
            <div className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
              <span className="font-semibold">Mẹo nhớ:</span> {v.mnemonic.join(" / ")}
            </div>
          ) : null}

          {v.example ? (
            <div className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm">
              <div className="text-neutral-800">{v.example}</div>
              {v.exampleVi ? <div className="mt-1 text-emerald-700">{v.exampleVi}</div> : null}
            </div>
          ) : null}

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
      )}
    </div>
  );
}
