import { useEffect, useState } from "react";
import { Grid2x2, Layers, Flag, CheckCircle2, Clock, ChevronLeft, ChevronRight, Shuffle, BookOpenText, GraduationCap } from "lucide-react";
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
import { kanjiIdForChar } from "../../popup/kanjiVocabLinks.ts";
import { findMatchingReadingPassages, findMatchingQuizBookQuestions } from "../../popup/vocabLinks.ts";
import { saveViewerState as saveReadingViewerState, loadViewerState as loadReadingViewerState } from "../../popup/readingState.ts";
import { saveViewerState as saveQuizBookViewerState, loadViewerState as loadQuizBookViewerState } from "../../popup/quizBookState.ts";
import { formatHanViet } from "../../hanVietFormat.ts";
import { Card, CardContent } from "../components/ui/card.tsx";
import { Badge } from "../components/ui/badge.tsx";
import { Button } from "../components/ui/button.tsx";
import { levelBadgeStyle } from "../lib/levelColors.tsx";
import { PageHeader } from "../components/PageHeader.tsx";
import { FilterBar, FilterTrigger } from "../components/FilterBar.tsx";
import { ActiveFilters } from "../components/ActiveFilters.tsx";
import { FilterSheet, FilterGroup, FilterChipOption } from "../components/FilterSheet.tsx";

const PROGRESS_FILTER_LABELS: Record<VocabViewerState["progressFilter"], string> = {
  all: "Tất cả thẻ",
  unmastered: "Chưa thuộc",
  flagged: "Đã đánh dấu khó",
  due: "Đến hạn ôn lại",
};

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
  jumpToId,
}: {
  onOpenKanji: (kanjiId: string) => void;
  onOpenReading: () => void;
  onOpenQuizBook: () => void;
  jumpToId?: string;
}) {
  const [state, setState] = useState<VocabViewerState | null>(null);
  const [list, setList] = useState<VocabCard[]>([]);
  const [progress, setProgress] = useState<ItemProgress | null>(null);
  const [gridMap, setGridMap] = useState<ProgressMap | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);

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
        l = await getFilteredList(s);
        s = { ...s, index: Math.min(s.index, Math.max(l.length - 1, 0)) };
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

  async function handleOpenReading(passageId: string) {
    const readingState = await loadReadingViewerState();
    await saveReadingViewerState({ ...readingState, currentPassageId: passageId });
    onOpenReading();
  }

  async function handleOpenQuizBook(questionId: string) {
    const qbState = await loadQuizBookViewerState();
    await saveQuizBookViewerState({ ...qbState, currentQuestionId: questionId });
    onOpenQuizBook();
  }

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
        action={
          <Button variant="outline" size="icon" onClick={() => mutate({ viewMode: isGrid ? "card" : "grid" }, false)}>
            {isGrid ? <Layers size={16} /> : <Grid2x2 size={16} />}
          </Button>
        }
      />

      <FilterBar>
        <FilterTrigger count={allChecked ? 0 : state.selectedSources.length} onClick={() => setFilterOpen(true)} />
        <select
          value={state.progressFilter}
          onChange={(e) => mutate({ progressFilter: e.target.value as VocabViewerState["progressFilter"], index: 0 })}
          className="max-w-[45%] truncate rounded-full border border-neutral-200 px-3 py-1.5 text-xs font-medium text-neutral-600 sm:max-w-none"
        >
          {(Object.keys(PROGRESS_FILTER_LABELS) as VocabViewerState["progressFilter"][]).map((f) => (
            <option key={f} value={f}>
              {PROGRESS_FILTER_LABELS[f]}
            </option>
          ))}
        </select>
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
          ...(state.progressFilter !== "all"
            ? [
                {
                  key: "progress",
                  label: PROGRESS_FILTER_LABELS[state.progressFilter],
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
        <div className="mt-3 flex items-center gap-2">
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

      {isGrid ? (
        bucketCounts && gridMap ? (
          <div className="mt-6">
            <div className="flex flex-wrap gap-4 text-sm text-neutral-500">
              {BUCKET_ORDER.map((b) => (
                <span key={b}>
                  {BUCKET_LABEL[b]} <strong className="text-neutral-800">{bucketCounts[b]}</strong>
                </span>
              ))}
            </div>
            {list.length === 0 ? (
              <p className="mt-6 text-neutral-400">Không có từ vựng nào ở bộ lọc này.</p>
            ) : (
              <div className="mt-4 grid grid-cols-4 gap-2 sm:grid-cols-6 md:grid-cols-8">
                {list.map((item, i) => {
                  const bucket = bucketFor(gridMap[item.id]);
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
        <Card className="mt-3 gap-0 p-6">
          <div className="flex items-start justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <Badge style={levelBadgeStyle(v.level)}>{v.level}</Badge>
              <Badge variant="secondary">{SOURCE_LABELS[v.source]}</Badge>
              {isDueForReview(progress ?? undefined) ? (
                <span className="flex items-center gap-1 text-xs font-semibold text-amber-600">
                  <Clock size={13} /> Đến hạn ôn lại
                </span>
              ) : null}
            </div>
            <button
              title={progress?.flagged ? "Bỏ đánh dấu khó" : "Đánh dấu khó, cần học lại"}
              onClick={async () => {
                await toggleFlag(v.id);
                await refreshProgress();
              }}
              className={progress?.flagged ? "text-rose-500" : "text-neutral-300 hover:text-neutral-400"}
            >
              <Flag size={20} fill={progress?.flagged ? "currentColor" : "none"} />
            </button>
          </div>

          <div className="mt-6 text-center text-4xl font-bold text-neutral-800">
            <WordWithKanjiLinks word={v.word} onOpenKanji={onOpenKanji} />
          </div>
          {v.reading ? <div className="mt-1 text-center text-neutral-500">{v.reading}</div> : null}

          <button
            onClick={async () => {
              await toggleMastered(v.id);
              await refreshProgress();
            }}
            className={`mx-auto mt-4 flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${
              progress?.mastered ? "border-emerald-300 bg-emerald-50 text-emerald-600" : "border-neutral-200 text-neutral-500"
            }`}
          >
            <CheckCircle2 size={14} /> {progress?.mastered ? "Đã thuộc" : "Đánh dấu đã thuộc"}
          </button>

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
                    onClick={() => handleOpenReading(p.id)}
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
                    onClick={() => handleOpenQuizBook(qq.id)}
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
