import { useEffect, useRef, useState } from "react";
import { VocabPartOfSpeechTag } from "../../components/vocabpartofspeechtag.tsx";
import { VocabVerbMetadata } from "../../components/vocabverbmetadata.tsx";
import { Grid2x2, Layers, Flag, CheckCircle2, Clock, ChevronLeft, ChevronRight, Shuffle, BookOpenText, GraduationCap, ChevronDown, Volume2, MessageSquarePlus } from "lucide-react";
import { speakJapanese } from "../lib/speak.ts";
import { pruneToggle } from "../../popup/filterUtils.ts";
import type { VerbConjugations } from "../../types/vocab.ts";
import { VOCAB_MASTERY_DIRECTIONS, VOCAB_MODE_LABELS, VOCAB_MODE_SHORT_LABELS } from "../../popup/quizState.ts";
import {
  ALL_VOCAB,
  AVAILABLE_SOURCES,
  AVAILABLE_LEVELS,
  SOURCE_LABELS,
  SOURCE_GROUPS,
  countForSource,
  countForLevel,
  getOrderedList,
  loadViewerState,
  saveViewerState,
  resolveJumpState,
  findVocabByWordReading,
  type VocabCard,
  type VocabSource,
  type VocabViewerState,
} from "../../popup/vocabState.ts";
import type { JlptLevel } from "../../types/kanji.ts";
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
  isFlagged,
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
import { LoadingScreen } from "../components/LoadingScreen.tsx";
import { CorrectionEditorSheet, CORRECTION_ISSUE_LABELS } from "../components/CorrectionEditorSheet.tsx";
import { loadCorrectionsForEntity, type DataCorrectionEntry } from "../../popup/dataCorrectionState.ts";

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

// Mazii's own labelling ("Tên thể tiếng Việt (kanji/kana)") -- meaning-based
// Vietnamese name where the form has one (Quá khứ, Phủ định...), otherwise
// just the form's Japanese name (Te), matching CHUA-CONVERT.md's POC spec.
const CONJUGATION_LABELS: Record<keyof VerbConjugations, string> = {
  masu: "Lịch sự (ます)",
  te: "Thể Te (て)",
  ta: "Quá khứ (た)",
  nai: "Phủ định (ない)",
  potential: "Khả năng (られる/える)",
  passive: "Bị động (られる)",
  causative: "Sai khiến (させる)",
  causativePassive: "Sai khiến bị động (させられる)",
  conditionalBa: "Điều kiện (ば)",
  conditionalTara: "Điều kiện (たら)",
  volitional: "Ý chí (よう/おう)",
  imperative: "Mệnh lệnh (ろ/よ)",
  prohibitive: "Cấm chỉ (な)",
};
const CONJUGATION_ORDER = Object.keys(CONJUGATION_LABELS) as (keyof VerbConjugations)[];

function VerbConjugationTable({ conjugations }: { conjugations: VerbConjugations }) {
  const [open, setOpen] = useState(false);
  const rows = CONJUGATION_ORDER.filter((k) => conjugations[k]);
  if (rows.length === 0) return null;
  return (
    <div className="mt-4">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between rounded-2xl border border-neutral-200 bg-white px-4 py-2.5 text-left text-sm font-medium text-neutral-600 hover:bg-neutral-50"
      >
        <span>Bảng chia thể ({rows.length})</span>
        <ChevronDown size={16} className={`shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open ? (
        <dl className="mt-2 divide-y divide-neutral-100 rounded-2xl border border-neutral-200 bg-white px-4">
          {rows.map((k) => (
            <div key={k} className="flex items-center justify-between gap-3 py-2.5 text-sm">
              <dt className="text-neutral-400">{CONJUGATION_LABELS[k]}</dt>
              <dd className="font-medium text-neutral-800">{conjugations[k]}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </div>
  );
}

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
  onOpenVocab,
  jumpToId,
  onCurrentItemChange,
}: {
  onOpenKanji: (kanjiId: string) => void;
  onOpenReading: (passageId: string) => void;
  onOpenQuizBook: (questionId: string) => void;
  onOpenQuiz: () => void;
  onOpenVocab: (vocabId: string) => void;
  jumpToId?: string;
  onCurrentItemChange?: (id: string | undefined) => void;
}) {
  const [state, setState] = useState<VocabViewerState | null>(null);
  const [list, setList] = useState<VocabCard[]>([]);
  const [progress, setProgress] = useState<ItemProgress | null>(null);
  const [gridMap, setGridMap] = useState<ProgressMap | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const [correctionOpen, setCorrectionOpen] = useState(false);
  const [corrections, setCorrections] = useState<DataCorrectionEntry[]>([]);
  // See KanjiScreen.tsx's identical field for why this is local/display-only
  // instead of living in state.progressFilter.
  const [bucketFilter, setBucketFilter] = useState<ProgressBucket | null>(null);
  // Voice availability can change after mount (voice list loads
  // asynchronously on some browsers, or the device finishes downloading a
  // Japanese TTS voice pack while this screen is still open), so keep
  // listening instead of only checking once.

  // While a jump view is open, holds the selectedSources/selectedLevels/
  // progressFilter/viewMode that were actually persisted BEFORE
  // resolveJumpState overrode them for display -- mutate() below keeps
  // saving these instead of the jump-view ones (refreshing progressFilter/
  // viewMode here as the user changes them, see mutate()), so e.g. opening
  // a search result that happens to also live in another bộ never
  // permanently changes the study filter or clears "Đến hạn ôn lại" used
  // elsewhere (Quiz, reminders). Cleared (null) outside a jump view, or once
  // the user explicitly edits the source/level filter themselves.
  const baseFilterRef = useRef<Pick<VocabViewerState, "selectedSources" | "selectedLevels" | "progressFilter" | "viewMode"> | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let s = await loadViewerState();
      let l: VocabCard[];
      // Computed locally and only committed to the ref once this effect run
      // is confirmed to still be the latest one (after the `cancelled`
      // check below) -- otherwise a slower, already-superseded jump (e.g.
      // two jump links clicked in quick succession) could resolve after a
      // newer one and clobber the ref with its stale base filter.
      let nextBase: typeof baseFilterRef.current = null;
      if (jumpToId) {
        const jumped = resolveJumpState(s, jumpToId);
        if (jumped) {
          nextBase = { selectedSources: s.selectedSources, selectedLevels: s.selectedLevels, progressFilter: s.progressFilter, viewMode: s.viewMode };
          s = jumped;
          l = getOrderedList(s);
        } else {
          l = await getFilteredList(s);
          s = { ...s, index: Math.min(s.index, Math.max(l.length - 1, 0)) };
          await saveViewerState(s);
        }
      } else {
        // Entering the screen fresh (not via a jump link) always lands on
        // the overview grid, regardless of whatever mode was last saved --
        // mirrors KanjiScreen.tsx's viewMode reset.
        l = await getFilteredList(s);
        s = { ...s, index: Math.min(s.index, Math.max(l.length - 1, 0)), viewMode: "grid" };
        await saveViewerState(s);
      }
      if (cancelled) return;
      baseFilterRef.current = nextBase;
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
    // Restore the pre-jump base for these 4 fields, then re-apply `partial`
    // on top -- so an explicit change made THIS call (e.g. toggling "Đến
    // hạn ôn lại" or the grid/card button while a jump view is open) always
    // wins over the stale base, instead of resolveJumpState's display-only
    // override (still sitting in `next` via `state`) silently overwriting
    // the user's real saved filter.
    const toPersist = baseFilterRef.current ? { ...next, ...baseFilterRef.current, ...partial } : next;
    await saveViewerState(toPersist);
    // Keep the ref's progressFilter/viewMode in sync with whatever just got
    // persisted, so the NEXT mutate() call (one that doesn't touch these
    // fields) preserves this call's explicit change instead of reverting to
    // the original pre-jump value.
    if (baseFilterRef.current) {
      baseFilterRef.current = { ...baseFilterRef.current, progressFilter: toPersist.progressFilter, viewMode: toPersist.viewMode };
    }
    const newList = recomputeList ? await getFilteredList(next) : list;
    setState(next);
    setList(newList);
  }

  async function applySourceSelection(newSources: VocabSource[]) {
    if (newSources.length === 0) return;
    // The user is now explicitly choosing a filter -- it should stick,
    // overriding whatever pre-jump filter mutate() would otherwise keep
    // persisting instead.
    baseFilterRef.current = null;
    await mutate({ selectedSources: newSources, index: 0 });
  }

  // Gộp các nguồn đang chọn theo SOURCE_GROUPS để hiển thị active-filter
  // chip: cả nhóm được chọn đủ (vd cả 2 bộ "Từ đồng nghĩa N3") thì gộp 1
  // chip, còn chọn dở dang (vd chỉ Tango N3 trong nhóm 5 bộ Tango) thì vẫn
  // hiện riêng từng nguồn như cũ.
  function sourceFilterChips(selectedSources: VocabSource[]) {
    const chips: { key: string; label: string; onRemove: () => void }[] = [];
    for (const group of SOURCE_GROUPS) {
      const selectedMembers = group.sources.filter((s) => selectedSources.includes(s));
      if (selectedMembers.length === 0) continue;
      if (group.sources.length > 1 && selectedMembers.length === group.sources.length) {
        chips.push({
          key: group.id,
          label: group.label,
          onRemove: () => applySourceSelection(selectedSources.filter((s) => !group.sources.includes(s))),
        });
      } else {
        for (const s of selectedMembers) {
          chips.push({ key: s, label: SOURCE_LABELS[s], onRemove: () => applySourceSelection(selectedSources.filter((x) => x !== s)) });
        }
      }
    }
    return chips;
  }

  // Cấp độ điều khiển Nguồn, cùng cơ chế pruneToggle với màn Ngữ pháp: đổi
  // cấp độ thì loại khỏi selectedSources những nguồn không còn từ nào ở
  // (các) cấp độ mới, giữ nguyên các nguồn vẫn còn hợp lệ -- tránh tình
  // trạng chọn N3 mà nguồn "Tango N1" vẫn ở trạng thái đang chọn dù 0 từ
  // khớp. Nếu prune hết sạch thì rơi về "mọi nguồn có dữ liệu ở cấp mới".
  async function applyLevelSelection(newLevels: JlptLevel[]) {
    if (newLevels.length === 0) return;
    baseFilterRef.current = null;
    const nextSources = pruneToggle(state!.selectedSources, AVAILABLE_SOURCES, (source) =>
      ALL_VOCAB.some((v) => v.sources.includes(source) && newLevels.includes(v.level)),
    );
    await mutate({ selectedLevels: newLevels, selectedSources: nextSources, index: 0 });
  }

  async function refreshProgress() {
    const v = list[state!.index];
    if (!v) return;
    const p = await getProgress(v.id);
    setProgress(p);
  }



  const floatingNavBottom = useFloatingNav(!!state && state.viewMode !== "grid");

  const currentId = state && state.viewMode !== "grid" ? list[state.index]?.id : undefined;
  useEffect(() => {
    onCurrentItemChange?.(currentId);
  }, [currentId, onCurrentItemChange]);

  useEffect(() => {
    let cancelled = false;
    if (!currentId) {
      setCorrections([]);
      return;
    }
    void loadCorrectionsForEntity(currentId).then((entries) => {
      if (!cancelled) setCorrections(entries);
    });
    return () => {
      cancelled = true;
    };
  }, [currentId]);

  if (!state) {
    return <LoadingScreen />;
  }

  const v = list[state.index];
  const totalSelected = list.length;
  const isGrid = state.viewMode === "grid";
  const bucketCounts = gridMap ? countBuckets(list, gridMap) : null;
  const allChecked = state.selectedSources.length === AVAILABLE_SOURCES.length;
  const allLevelsChecked = state.selectedLevels.length === AVAILABLE_LEVELS.length;
  const readingMatches = v ? findMatchingReadingPassages(v) : [];
  const quizBookMatches = v ? findMatchingQuizBookQuestions(v) : [];

  return (
    <div className="mx-auto max-w-6xl px-2.5 py-2 md:px-8 md:py-6">
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
        <FilterTrigger
          count={(allChecked ? 0 : state.selectedSources.length) + (allLevelsChecked ? 0 : state.selectedLevels.length)}
          onClick={() => setFilterOpen(true)}
        />
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
          ...(allLevelsChecked
            ? []
            : state.selectedLevels.map((l) => ({
                key: `level-${l}`,
                label: l,
                onRemove: () => applyLevelSelection(state.selectedLevels.filter((x) => x !== l)),
              }))),
          ...(allChecked ? [] : sourceFilterChips(state.selectedSources)),
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
        onReset={() => {
          applyLevelSelection([...AVAILABLE_LEVELS]);
          applySourceSelection([...AVAILABLE_SOURCES]);
        }}
      >
        <FilterGroup title="Cấp độ">
          <FilterChipOption
            label={`Tất cả cấp độ (${ALL_VOCAB.length})`}
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
          <FilterChipOption
            label={`Tất cả (${ALL_VOCAB.filter((v) => state.selectedLevels.includes(v.level)).length})`}
            active={allChecked}
            onClick={() =>
              applySourceSelection(
                allChecked
                  ? state.selectedSources
                  : AVAILABLE_SOURCES.filter((source) => ALL_VOCAB.some((v) => v.sources.includes(source) && state.selectedLevels.includes(v.level))),
              )
            }
          />
          {SOURCE_GROUPS.map((group) => {
            const checked = group.sources.every((s) => state.selectedSources.includes(s));
            const count = ALL_VOCAB.filter((v) => group.sources.some((s) => v.sources.includes(s)) && state.selectedLevels.includes(v.level)).length;
            return (
              <FilterChipOption
                key={group.id}
                label={`${group.label} (${count})`}
                active={checked}
                onClick={() => {
                  const next = checked
                    ? state.selectedSources.filter((s) => !group.sources.includes(s))
                    : [...new Set([...state.selectedSources, ...group.sources])];
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
          className={`fixed ${floatingNavBottom} left-4 z-20 flex h-10 w-10 items-center justify-center rounded-full bg-white text-neutral-600 shadow-lg ring-1 ring-neutral-200 active:bg-neutral-50 md:hidden`}
        >
          <ChevronLeft size={18} />
        </button>
      )}
      {isGrid || state.index >= list.length - 1 ? null : (
        <button
          onClick={() => mutate({ index: state.index + 1 }, false)}
          aria-label="Tiếp"
          className={`fixed right-4 ${floatingNavBottom} z-20 flex h-10 w-10 items-center justify-center rounded-full bg-rose-600 text-white shadow-lg active:bg-rose-700 md:hidden`}
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
        <Card className="mt-3 gap-0 rounded-2xl border-neutral-200 p-6 ring-0 md:mx-auto md:max-w-2xl">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <Badge style={levelBadgeStyle(v.level)}>{v.level}</Badge>
              <Badge variant="secondary">{v.sources.map((s) => SOURCE_LABELS[s]).join(" · ")}</Badge>
              {isDueForReview(progress ?? undefined) ? (
                <span className="flex items-center gap-1 text-xs font-semibold text-amber-600">
                  <Clock size={13} /> Đến hạn ôn lại
                </span>
              ) : null}
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <button
                onClick={() => speakJapanese(v.reading || v.word)}
                aria-label="Phát âm"
                title="Phát âm tiếng Nhật"
                className="flex h-7.5 w-7.5 items-center justify-center rounded-full text-neutral-400 hover:bg-neutral-100 hover:text-rose-500"
              >
                <Volume2 size={17} />
              </button>
              <button
                onClick={() => setCorrectionOpen(true)}
                aria-label="Góp ý dữ liệu"
                title="Góp ý nghĩa hoặc dữ liệu chưa chính xác"
                className={`relative flex h-7.5 w-7.5 items-center justify-center rounded-full hover:bg-amber-50 hover:text-amber-600 ${
                  corrections.length > 0 ? "text-amber-600" : "text-neutral-300"
                }`}
              >
                <MessageSquarePlus size={17} />
                {corrections.length > 0 ? (
                  <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500 px-1 text-[9px] font-bold text-white">
                    {corrections.length}
                  </span>
                ) : null}
              </button>
              <button
                title={isFlagged(progress) ? "Bỏ đánh dấu khó" : "Đánh dấu khó, cần học lại"}
                onClick={async () => {
                  await toggleFlag(v.id);
                  await refreshProgress();
                }}
                className={`flex h-7.5 w-7.5 items-center justify-center rounded-full ${
                  isFlagged(progress) ? "text-rose-500" : "text-neutral-300 hover:text-neutral-400"
                }`}
              >
                <Flag size={17} fill={isFlagged(progress) ? "currentColor" : "none"} />
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

          <div className="mt-5 rounded-2xl border border-[#e8b96e] bg-[#fff5dc] px-4 py-5 text-center">
            {v.reading ? <div className="text-sm text-[#675d51]">{v.reading}</div> : null}
            <div className="mt-1 break-words font-serif text-4xl font-bold text-[#194e75] sm:text-5xl">
              <WordWithKanjiLinks word={v.word} onOpenKanji={onOpenKanji} />
            </div>
            <div className="mx-auto mt-3 h-px max-w-[280px] bg-[#dfc796]" />
            <div className="mt-3 text-base font-semibold text-[#125b86] italic">{v.meaningVi || "—"}</div>
          </div>

          {v.hanViet.length > 0 ? (
            <section className="mt-3 rounded-xl border-l-4 border-[#e86916] bg-[#fff0e5] px-3 py-2.5 text-sm">
              <span className="font-semibold text-[#bd4a0c]">Hán Việt:</span>{" "}
              <span className="font-bold text-[#ad470e]">{formatHanViet(v.hanViet)}</span>
            </section>
          ) : null}
          {((v.partOfSpeech && v.partOfSpeech !== "Khác") || v.verbGroup || v.transitivity || (v.verbForms?.length ?? 0) > 0) ? (
            <section className="mt-2 rounded-xl border-l-4 border-[#8b43b0] bg-[#fbf6ff] px-3 py-2.5 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-[#8238a7]">Phân loại:</span>
                {v.partOfSpeech && v.partOfSpeech !== "Khác" ? <VocabPartOfSpeechTag partOfSpeech={v.partOfSpeech} /> : null}
              </div>
              <VocabVerbMetadata verbGroup={v.verbGroup} transitivity={v.transitivity} forms={v.verbForms} />
            </section>
          ) : null}

          {v.english ? (
            <section className="mt-3 rounded-xl border-l-4 border-[#8a786b] bg-[#f7f5f3] px-3 py-2.5 text-sm">
              <span className="font-semibold text-[#756558]">English:</span>{" "}
              <span className="italic text-neutral-700">{v.english}</span>
            </section>
          ) : null}

          <CorrectionEditorSheet
            open={correctionOpen}
            onClose={() => setCorrectionOpen(false)}
            entityId={v.id}
            snapshot={{
              word: v.word,
              reading: v.reading,
              meaningVi: v.meaningVi,
              sources: v.sources.map((source) => SOURCE_LABELS[source]),
            }}
            onSaved={(saved) => setCorrections((current) => [saved, ...current.filter((entry) => entry.id !== saved.id)])}
          />

          {readingMatches.length > 0 || quizBookMatches.length > 0 ? (
            <details className="mt-2.5 rounded-xl border border-neutral-200 bg-white text-sm">
              <summary className="cursor-pointer px-3 py-2.5 font-semibold text-neutral-600">
                Xuất hiện trong tài liệu <span className="ml-2 font-normal text-neutral-400">{readingMatches.length} bài đọc · {quizBookMatches.length} đề thi</span>
              </summary>
              <div className="border-t border-neutral-100 px-3 pb-3">
          {readingMatches.length > 0 ? (
            <div className="mt-3 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2.5">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-sky-800">
                <BookOpenText size={14} /> Xuất hiện trong bài đọc
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {readingMatches.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => onOpenReading(p.id)}
                    className="rounded-lg border border-sky-200 bg-white px-2.5 py-1 text-xs text-sky-800 hover:bg-sky-100"
                  >
                    {p.title}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {quizBookMatches.length > 0 ? (
            <div className="mt-3 rounded-xl border border-violet-200 bg-violet-50 px-3 py-2.5">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-violet-800">
                <GraduationCap size={14} /> Xuất hiện trong luyện đề
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {quizBookMatches.map((qq) => (
                  <button
                    key={qq.id}
                    onClick={() => onOpenQuizBook(qq.id)}
                    className="rounded-lg border border-violet-200 bg-white px-2.5 py-1 text-xs text-violet-800 hover:bg-violet-100"
                  >
                    {qq.question.slice(0, 24)}
                    {qq.question.length > 24 ? "…" : ""}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
              </div>
            </details>
          ) : null}
          {progress ? (
            <details className="mt-2.5 rounded-xl border border-neutral-200 bg-white text-sm">
              <summary className="cursor-pointer px-3 py-2.5 font-semibold text-neutral-600">
                Tiến độ học <span className="ml-2 font-normal text-neutral-400">{VOCAB_MASTERY_DIRECTIONS.length} dạng</span>
              </summary>
              <div className="flex flex-wrap gap-1.5 border-t border-neutral-100 px-3 py-2.5">
                {VOCAB_MASTERY_DIRECTIONS.map((dir) => {
                  const streak = progress.directionStreaks?.[dir] ?? 0;
                  const done = streak >= MASTERY_STREAK_THRESHOLD;
                  return (
                    <span
                      key={dir}
                      title={VOCAB_MODE_LABELS[dir]}
                      className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${
                        done ? "border-emerald-300 bg-emerald-50 text-emerald-700" : "border-amber-200 bg-amber-50 text-amber-700"
                      }`}
                    >
                      {done ? "✓" : `${streak}/${MASTERY_STREAK_THRESHOLD}`} {VOCAB_MODE_SHORT_LABELS[dir]}
                    </span>
                  );
                })}
              </div>
            </details>
          ) : null}
          {(v.synonym || v.pairVerb || corrections.length > 0 || v.mnemonic.length > 0 || v.example || v.conjugations) ? (
            <details className="mt-2.5 rounded-xl border border-neutral-200 bg-white text-sm">
              <summary className="cursor-pointer px-3 py-2.5 font-semibold text-neutral-600">
                Thông tin bổ sung <span className="ml-2 font-normal text-neutral-400">{[
                  v.example && "Ví dụ",
                  v.mnemonic.length > 0 && "Ghi nhớ",
                  (v.synonym || v.pairVerb) && "Từ liên quan",
                  v.conjugations && "Chia thể",
                  corrections.length > 0 && `${corrections.length} góp ý`,
                ].filter(Boolean).join(" · ")}</span>
              </summary>
              <div className="border-t border-neutral-100 px-3 pb-3">

          {v.synonym || v.pairVerb ? <dl className="mt-3 grid grid-cols-[100px_1fr] gap-y-2 rounded-xl border-l-4 border-[#38856b] bg-[#eff9f4] px-3 py-2.5 text-sm">
            {v.synonym ? (
              <>
                <dt className="text-neutral-400">Đồng nghĩa</dt>
                <dd className="text-neutral-800">
                  {v.synonym.word}
                  {v.synonym.reading ? ` (${v.synonym.reading})` : ""}
                </dd>
              </>
            ) : null}
            {v.pairVerb
              ? (() => {
                  const target = findVocabByWordReading(v.pairVerb.word, v.pairVerb.reading);
                  return (
                    <>
                      <dt className="text-neutral-400">
                        {v.transitivity === "Tự động từ" ? "Tha động từ" : v.transitivity === "Tha động từ" ? "Tự động từ" : "Cặp tự/tha động từ"}
                      </dt>
                      <dd className="text-neutral-800">
                        {target ? (
                          <button
                            onClick={() => onOpenVocab(target.id)}
                            className="cursor-pointer font-medium text-rose-600 decoration-dotted decoration-2 underline-offset-4 hover:underline"
                          >
                            {v.pairVerb.word}
                            {v.pairVerb.reading ? ` (${v.pairVerb.reading})` : ""}
                          </button>
                        ) : (
                          <>
                            {v.pairVerb.word}
                            {v.pairVerb.reading ? ` (${v.pairVerb.reading})` : ""}
                          </>
                        )}
                      </dd>
                    </>
                  );
                })()
              : null}
          </dl> : null}

          {corrections.length > 0 ? (
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-left text-sm text-amber-900">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold">Góp ý dữ liệu của bạn ({corrections.length})</span>
                <button onClick={() => setCorrectionOpen(true)} className="text-xs font-semibold text-amber-700 hover:underline">
                  Thêm góp ý
                </button>
              </div>
              <div className="mt-2 space-y-2">
                {corrections.slice(0, 3).map((entry) => (
                  <div key={entry.id} className="rounded-lg bg-white/70 px-3 py-2">
                    <div className="text-xs font-semibold text-amber-700">{CORRECTION_ISSUE_LABELS[entry.issueType]}</div>
                    <div className="mt-0.5 whitespace-pre-wrap text-neutral-700">{entry.suggestedValue}</div>
                  </div>
                ))}
              </div>
              {corrections.length > 3 ? <div className="mt-2 text-xs text-amber-700">Còn {corrections.length - 3} góp ý trong Cài đặt.</div> : null}
            </div>
          ) : null}

          {v.mnemonic.length > 0 ? (
            <div className="mt-3 rounded-xl border-l-4 border-amber-500 bg-amber-50 p-3 text-sm text-amber-900">
              <span className="font-semibold">Mẹo nhớ:</span> {v.mnemonic.join(" / ")}
            </div>
          ) : null}

          {v.example ? (
            <div className="mt-3 rounded-xl border-l-4 border-sky-600 bg-sky-50 p-3 text-sm">
              <div className="mb-1 font-semibold text-sky-700">Mẫu câu</div>
              <div className="flex items-start justify-between gap-2">
                <div className="text-neutral-800">{v.example}</div>
                <button
                  onClick={() => speakJapanese(v.example!)}
                  aria-label="Phát âm ví dụ"
                  className="shrink-0 text-sky-600 hover:text-sky-800"
                >
                  <Volume2 size={16} />
                </button>
              </div>
              {v.exampleVi ? <div className="mt-1 text-sky-800">{v.exampleVi}</div> : null}
            </div>
          ) : null}

          {v.conjugations ? <VerbConjugationTable conjugations={v.conjugations} /> : null}
              </div>
            </details>
          ) : null}

        </Card>
      )}
    </div>
  );
}
