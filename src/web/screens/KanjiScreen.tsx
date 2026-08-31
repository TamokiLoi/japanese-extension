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
  filterByProgress,
  bucketFor,
  countBuckets,
  isDueForReview,
  type ItemProgress,
  type ProgressMap,
  type ProgressBucket,
} from "../../popup/progressState.ts";
import { vocabForKanjiChar } from "../../popup/kanjiVocabLinks.ts";
import { formatHanViet } from "../../hanVietFormat.ts";
import { Card } from "../components/ui/card.tsx";
import { Badge } from "../components/ui/badge.tsx";
import { Button } from "../components/ui/button.tsx";
import { levelBadgeStyle } from "../lib/levelColors.tsx";
import { PageHeader } from "../components/PageHeader.tsx";
import { FilterBar, FilterTrigger } from "../components/FilterBar.tsx";
import { ActiveFilters } from "../components/ActiveFilters.tsx";
import { FilterSheet, FilterGroup, FilterChipOption } from "../components/FilterSheet.tsx";

const PROGRESS_FILTER_LABELS: Record<KanjiViewerState["progressFilter"], string> = {
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
  jumpToId,
}: {
  onOpenVocab: (vocabId: string) => void;
  jumpToId?: string;
}) {
  const [state, setState] = useState<KanjiViewerState | null>(null);
  const [list, setList] = useState<Kanji[]>([]);
  const [progress, setProgress] = useState<ItemProgress | null>(null);
  const [gridMap, setGridMap] = useState<ProgressMap | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);

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
    <div className="mx-auto max-w-4xl px-4 py-6 md:px-8 md:py-10">
      <PageHeader
        title="Kanji"
        subtitle={isGrid ? `${list.length} thẻ` : `${list.length > 0 ? state.index + 1 : 0} / ${totalSelected}`}
        action={
          <Button variant="outline" size="icon" onClick={() => mutate({ viewMode: isGrid ? "card" : "grid" }, false)}>
            {isGrid ? <Layers size={16} /> : <Grid2x2 size={16} />}
          </Button>
        }
      />

      <FilterBar>
        <FilterTrigger count={allChecked ? 0 : state.selectedLevels.length} onClick={() => setFilterOpen(true)} />
        <select
          value={state.progressFilter}
          onChange={(e) => mutate({ progressFilter: e.target.value as KanjiViewerState["progressFilter"], index: 0 })}
          className="max-w-[45%] truncate rounded-full border border-neutral-200 px-3 py-1.5 text-xs font-medium text-neutral-600 sm:max-w-none"
        >
          {(Object.keys(PROGRESS_FILTER_LABELS) as KanjiViewerState["progressFilter"][]).map((f) => (
            <option key={f} value={f}>
              {PROGRESS_FILTER_LABELS[f]}
            </option>
          ))}
        </select>
        <button
          onClick={() => {
            const randomOrder = !state.randomOrder;
            mutate({ randomOrder, shuffleSeed: randomOrder ? Date.now() : state.shuffleSeed, index: 0 });
          }}
          className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold ${
            state.randomOrder ? "border-rose-300 bg-rose-50 text-rose-600" : "border-neutral-200 text-neutral-500 hover:bg-neutral-50"
          }`}
        >
          <Shuffle size={13} /> Ngẫu nhiên
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
              <p className="mt-6 text-neutral-400">Không có Kanji nào ở bộ lọc này.</p>
            ) : (
              <div className="mt-4 grid grid-cols-5 gap-2 sm:grid-cols-8 md:grid-cols-10">
                {list.map((item, i) => {
                  const bucket = bucketFor(gridMap[item.id]);
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
        <Card className="mt-6 gap-0 p-6">
          <div className="flex items-start justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <Badge style={levelBadgeStyle(k.level)}>{k.level}</Badge>
              {isDueForReview(progress ?? undefined) ? (
                <span className="flex items-center gap-1 text-xs font-semibold text-amber-600">
                  <Clock size={13} /> Đến hạn ôn lại
                </span>
              ) : null}
            </div>
            <button
              title={progress?.flagged ? "Bỏ đánh dấu khó" : "Đánh dấu khó, cần học lại"}
              onClick={async () => {
                await toggleFlag(k.id);
                await refreshProgress();
              }}
              className={progress?.flagged ? "text-rose-500" : "text-neutral-300 hover:text-neutral-400"}
            >
              <Flag size={20} fill={progress?.flagged ? "currentColor" : "none"} />
            </button>
          </div>

          <div className="mt-6 text-center text-6xl font-bold text-neutral-800">{k.character}</div>

          <button
            onClick={async () => {
              await toggleMastered(k.id);
              await refreshProgress();
            }}
            className={`mx-auto mt-4 flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${
              progress?.mastered ? "border-emerald-300 bg-emerald-50 text-emerald-600" : "border-neutral-200 text-neutral-500"
            }`}
          >
            <CheckCircle2 size={14} /> {progress?.mastered ? "Đã thuộc" : "Đánh dấu đã thuộc"}
          </button>

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

      {isGrid ? null : (
        <div className="mt-6 flex items-center gap-2">
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
    </div>
  );
}
