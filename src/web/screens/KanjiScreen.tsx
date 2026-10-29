import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { Grid2x2, Layers, Flag, CheckCircle2, Clock, ChevronLeft, ChevronRight, Shuffle, Network, BookOpen } from "lucide-react";
import type { Kanji } from "../../types/kanji.ts";
import { KANJI_STUDY_SETS, type KanjiStudySetId } from "../../data/kanjiStudySets.ts";
import { RADICAL_CARDS } from "../../data/radicalCards.ts";
import { storageGet, storageSet } from "../../platform/storage.ts";
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
  isFlagged,
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
  KANJI_MODE_SHORT_LABELS,
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
import { LoadingScreen } from "../components/LoadingScreen.tsx";
import { KanjiMnemonicChoice } from "../components/KanjiMnemonicChoice.tsx";
import "../../kanji-card-layout.css";

const KanjiMapScreen = lazy(() => import("./KanjiMapScreen.tsx").then((module) => ({ default: module.KanjiMapScreen })));
const KanjiBookResources = lazy(() => import("../components/KanjiBookResources.tsx").then((module) => ({ default: module.KanjiBookResources })));
const RadicalLibraryScreen = lazy(() => import("./RadicalLibraryScreen.tsx").then((module) => ({ default: module.RadicalLibraryScreen })));

type KanjiViewMode = "cards" | "radicals" | "map";

function KanjiModeSelector({ active, onSelect }: { active: KanjiViewMode; onSelect: (mode: KanjiViewMode) => void }) {
  const modes: { id: KanjiViewMode; label: string; icon: typeof Layers }[] = [
    { id: "cards", label: "Thẻ Kanji", icon: Layers },
    { id: "radicals", label: "Bộ thủ", icon: BookOpen },
    { id: "map", label: "Kanji Map", icon: Network },
  ];
  return (
    <div className="mt-3 inline-flex max-w-full flex-wrap items-center gap-1 rounded-xl border border-neutral-200 bg-neutral-100 p-1" role="group" aria-label="Chế độ xem Kanji">
      {modes.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          type="button"
          className={`rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${active === id ? "bg-white text-rose-600 shadow-sm" : "text-neutral-600 hover:bg-white/70"}`}
          aria-pressed={active === id}
          onClick={() => onSelect(id)}
        >
          <span className="inline-flex items-center gap-1.5"><Icon size={14} /> {label}</span>
        </button>
      ))}
    </div>
  );
}

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
// Active-filter ring for the same 4 stat cards -- each bucket's own tone
// instead of one flat black ring, so the highlight reads as "this card" not
// as an error/warning state.
const BUCKET_ACTIVE_RING: Record<ProgressBucket, string> = {
  mastered: "border-emerald-400 ring-2 ring-emerald-400",
  learning: "border-amber-400 ring-2 ring-amber-400",
  flagged: "border-rose-400 ring-2 ring-rose-400",
  new: "border-neutral-400 ring-2 ring-neutral-400",
};
const STUDY_SET_STORAGE_KEY = "kanjiWebStudySet";

function isKanjiStudySetId(value: unknown): value is KanjiStudySetId {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(KANJI_STUDY_SETS, value);
}

function meaningLine(k: Kanji): { text: string; isDraft: boolean } {
  if (k.meanings.vi.length > 0) return { text: k.meanings.vi.join(", "), isDraft: false };
  if (k.meanings.viDraft && k.meanings.viDraft.length > 0) return { text: k.meanings.viDraft.join(", "), isDraft: true };
  return { text: "(chưa có nghĩa tiếng Việt)", isDraft: false };
}

async function getFilteredList(state: KanjiViewerState, studySetId: KanjiStudySetId | null = null): Promise<Kanji[]> {
  const map = await loadProgressMap();
  // A source collection is an alternative to JLPT-level filtering. This
  // keeps every item from the workbook set even when its app level differs
  // from the set's N3 label.
  const collectionState = studySetId ? { ...state, selectedLevels: [...AVAILABLE_LEVELS] } : state;
  const ordered = getOrderedList(collectionState);
  let collectionList = ordered;
  if (studySetId) {
    const ids = KANJI_STUDY_SETS[studySetId].ids;
    if (state.randomOrder) {
      const idSet = new Set<string>(ids);
      collectionList = ordered.filter((kanji) => idSet.has(kanji.id));
    } else {
      const byId = new Map(ALL_KANJI.map((kanji) => [kanji.id, kanji]));
      collectionList = ids.flatMap((id) => {
        const kanji = byId.get(id);
        return kanji ? [kanji] : [];
      });
    }
  }
  return filterByProgress(collectionList, map, state.progressFilter);
}

export function KanjiScreen({
  onOpenVocab,
  jumpToId,
  initialMapTab,
  onMapTabChange,
  onCurrentItemChange,
}: {
  onOpenVocab: (vocabId: string) => void;
  onOpenQuiz: () => void;
  jumpToId?: string;
  initialMapTab?: "structure" | "vocab";
  onMapTabChange?: (tab: "structure" | "vocab") => void;
  // Lets the router keep the URL (and its "return to X" bookmark for the
  // floating back button) pointed at whichever card is actually on screen,
  // even though paging Trước/Tiếp is handled entirely by this screen's own
  // `mutate()` state rather than a route change.
  onCurrentItemChange?: (id: string | undefined, text?: string) => void;
}) {
  const [state, setState] = useState<KanjiViewerState | null>(null);
  const [list, setList] = useState<Kanji[]>([]);
  const [mapMode, setMapMode] = useState(initialMapTab !== undefined);
  const [mapView, setMapView] = useState<"structure" | "vocab">(initialMapTab ?? "structure");
  const [mapCharacter, setMapCharacter] = useState<string | null>(null);
  const [radicalMode, setRadicalMode] = useState(false);
  const [radicalCharacter, setRadicalCharacter] = useState<string | null>(null);
  // Opening a card from the map is a temporary viewing context. Keep the
  // Kanji filter/list state intact even when that card is outside the filter.
  const [mapCardCharacter, setMapCardCharacter] = useState<string | null>(null);
  const mapCard = mapCardCharacter ? ALL_KANJI.find((item) => item.character === mapCardCharacter) : undefined;
  const [studySetId, setStudySetId] = useState<KanjiStudySetId | null>(null);
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

  // See web VocabScreen.tsx's identical field: keeps mutate() persisting the
  // pre-jump level filter/progressFilter/viewMode instead of the ones
  // resolveJumpState overrides just to display the jumped-to kanji, so
  // opening a link/search result never permanently changes the levels used
  // by Quiz/reminders elsewhere, nor silently clears "Đến hạn ôn lại".
  const baseFilterRef = useRef<Pick<KanjiViewerState, "selectedLevels" | "progressFilter" | "viewMode"> | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let s = await loadViewerState();
      const savedStudySet = await storageGet<unknown>(STUDY_SET_STORAGE_KEY);
      let activeStudySetId = isKanjiStudySetId(savedStudySet) ? savedStudySet : null;
      if (savedStudySet != null && activeStudySetId === null) {
        await storageSet(STUDY_SET_STORAGE_KEY, null);
      }
      let l: Kanji[];
      // Only committed to the ref after the `cancelled` check below, so a
      // slower already-superseded jump can't clobber a newer one's base.
      let nextBase: typeof baseFilterRef.current = null;
      if (jumpToId) {
        const jumpTargetId = ALL_KANJI.find((k) => k.id === jumpToId || k.character === jumpToId)?.id ?? jumpToId;
        const jumped = resolveJumpState(s, jumpTargetId);
        if (jumped) {
          nextBase = { selectedLevels: s.selectedLevels, progressFilter: s.progressFilter, viewMode: s.viewMode };
          // A deep link outside the active source set must still open. The
          // saved set remains intact and is restored on the next fresh visit.
          if (activeStudySetId && !new Set<string>(KANJI_STUDY_SETS[activeStudySetId].ids).has(jumpTargetId)) {
            activeStudySetId = null;
          }
          s = jumped;
          l = await getFilteredList(s, activeStudySetId);
          s = { ...s, index: Math.max(0, l.findIndex((kanji) => kanji.id === jumpTargetId)) };
        } else {
          l = await getFilteredList(s, activeStudySetId);
          s = { ...s, index: Math.min(s.index, Math.max(l.length - 1, 0)) };
          await saveViewerState(s);
        }
      } else {
        // Entering the screen fresh (not via a jump link) always lands on
        // the overview grid, regardless of whatever mode was last saved --
        // "which kanji do I already know" should be the first thing you see
        // each visit, not wherever you happened to leave off studying.
        l = await getFilteredList(s, activeStudySetId);
        s = { ...s, index: Math.min(s.index, Math.max(l.length - 1, 0)), viewMode: "grid" };
        await saveViewerState(s);
      }
      if (cancelled) return;
      baseFilterRef.current = nextBase;
      setStudySetId(activeStudySetId);
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
    const k = mapCard ?? list[state.index];
    if (state.viewMode === "grid" && !mapCard) {
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
  }, [mapCard, state, list]);

  async function mutate(
    partial: Partial<KanjiViewerState>,
    recomputeList = true,
    listStudySetId: KanjiStudySetId | null = studySetId,
  ) {
    if (!state) return;
    const next: KanjiViewerState = { ...state, ...partial };
    // Restore the pre-jump base, then re-apply `partial` on top so an
    // explicit change made THIS call still wins -- see web VocabScreen.tsx's
    // identical comment for the full reasoning.
    const toPersist = baseFilterRef.current ? { ...next, ...baseFilterRef.current, ...partial } : next;
    await saveViewerState(toPersist);
    if (baseFilterRef.current) {
      baseFilterRef.current = { ...baseFilterRef.current, progressFilter: toPersist.progressFilter, viewMode: toPersist.viewMode };
    }
    const newList = recomputeList ? await getFilteredList(next, listStudySetId) : list;
    setMapCardCharacter(null);
    setState(next);
    setList(newList);
  }

  async function applyLevelSelection(newLevels: (typeof AVAILABLE_LEVELS)[number][]) {
    if (newLevels.length === 0) return;
    baseFilterRef.current = null;
    setStudySetId(null);
    await storageSet(STUDY_SET_STORAGE_KEY, null);
    await mutate({ selectedLevels: newLevels, index: 0 }, true, null);
  }

  async function applyStudySetSelection(nextStudySetId: KanjiStudySetId | null) {
    if (!state) return;
    baseFilterRef.current = null;
    setStudySetId(nextStudySetId);
    await storageSet(STUDY_SET_STORAGE_KEY, nextStudySetId);
    await mutate({ index: 0 }, true, nextStudySetId);
  }

  async function resetFilters() {
    if (!state) return;
    baseFilterRef.current = null;
    setStudySetId(null);
    await storageSet(STUDY_SET_STORAGE_KEY, null);
    await mutate({ selectedLevels: [...AVAILABLE_LEVELS], index: 0 }, true, null);
  }

  async function refreshProgress() {
    const k = mapCard ?? list[state!.index];
    if (!k) return;
    const p = await getProgress(k.id);
    setProgress(p);
  }

  const floatingNavBottom = useFloatingNav(!!state && !mapMode && (!!mapCard || state.viewMode !== "grid"));

  const selectedMapKanji = mapMode && mapCharacter ? ALL_KANJI.find((item) => item.character === mapCharacter) : undefined;
  const mapCardIndex = mapCard ? list.findIndex((item) => item.id === mapCard.id) : -1;
  const cardIndex = mapCard ? mapCardIndex : state?.index ?? 0;
  const currentId = radicalMode ? undefined : mapMode ? selectedMapKanji?.id : mapCard?.id ?? (state && state.viewMode !== "grid" ? list[state.index]?.id : undefined);
  const currentText = radicalMode ? undefined : mapMode ? selectedMapKanji?.character : mapCard?.character ?? (state && state.viewMode !== "grid" ? list[state.index]?.character : undefined);
  useEffect(() => {
    onCurrentItemChange?.(currentId, currentText);
  }, [currentId, currentText, onCurrentItemChange]);

  if (!state) {
    return <LoadingScreen variant="study" title="Kanji" />;
  }

  const k = mapCard ?? list[state.index];
  const totalSelected = list.length;
  const isGrid = state.viewMode === "grid" && !mapCard;
  const bucketCounts = gridMap ? countBuckets(list, gridMap) : null;
  const allChecked = !studySetId && state.selectedLevels.length === AVAILABLE_LEVELS.length;
  const activeFilterCount = studySetId ? 1 : allChecked ? 0 : state.selectedLevels.length;
  const related = k ? vocabForKanjiChar(k.character) : null;

  function openMapKanjiCard() {
    if (!state || !mapCharacter) {
      setMapMode(false);
      return;
    }
    const target = ALL_KANJI.find((item) => item.character === mapCharacter);
    if (!target) {
      setMapMode(false);
      return;
    }
    setMapCardCharacter(target.character);
    setMapMode(false);
  }

  function openMapRadicalCard(character: string) {
    setRadicalCharacter(character);
    setMapMode(false);
    setRadicalMode(true);
  }

  function selectKanjiView(mode: KanjiViewMode) {
    if (mode === "radicals") {
      setMapMode(false);
      setRadicalMode(true);
      return;
    }
    if (mode === "map") {
      setRadicalMode(false);
      setMapCharacter(mapCharacter ?? k?.character ?? ALL_KANJI[0]?.character ?? null);
      setMapMode(true);
      return;
    }
    setMapMode(false);
    setRadicalMode(false);
  }

  if (mapMode) {
    return (
      <Suspense fallback={<LoadingScreen variant="study" title="Kanji Map" />}>
        <KanjiMapScreen
          initialCharacter={mapCharacter ?? k?.character}
          initialView={mapView}
          onSelectCharacter={setMapCharacter}
          onBackToCards={() => {
            setMapView("structure");
            onMapTabChange?.("structure");
            void openMapKanjiCard();
          }}
          onSelectRadical={openMapRadicalCard}
          onOpenVocab={onOpenVocab}
          onViewChange={(view) => {
            setMapView(view);
            onMapTabChange?.(view);
          }}
        />
      </Suspense>
    );
  }

  if (radicalMode) {
    return (
      <div className="mx-auto max-w-6xl px-2.5 py-2 md:px-8 md:py-6">
        <PageHeader title="Bộ thủ" subtitle={`${RADICAL_CARDS.length} bộ · thẻ tham khảo`} icon={{ img: "icon-kanji.png", bg: "#ffe4e6" }} />
        <KanjiModeSelector active="radicals" onSelect={selectKanjiView} />
        <Suspense fallback={<LoadingScreen variant="study" title="Bộ thủ" />}>
          <RadicalLibraryScreen
            initialCharacter={radicalCharacter}
            onOpenKanji={(character) => {
              setMapCardCharacter(character);
              setRadicalMode(false);
            }}
          />
        </Suspense>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-2.5 py-2 md:px-8 md:py-6">
      <PageHeader
        title="Kanji"
        subtitle={isGrid ? `${list.length} thẻ` : mapCard && mapCardIndex < 0 ? "Ngoài bộ lọc hiện tại" : `${list.length > 0 ? cardIndex + 1 : 0} / ${totalSelected}`}
        icon={{ img: "icon-kanji.png", bg: "#ffe4e6" }}
        action={
          <Button variant="outline" size="icon" onClick={() => mutate({ viewMode: isGrid ? "card" : "grid" }, false)}>
            {isGrid ? <Layers size={16} /> : <Grid2x2 size={16} />}
          </Button>
        }
      />

      <KanjiModeSelector active="cards" onSelect={selectKanjiView} />

      <FilterBar>
        <FilterTrigger count={activeFilterCount} onClick={() => setFilterOpen(true)} />
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
          studySetId
            ? [{
                key: studySetId,
                label: KANJI_STUDY_SETS[studySetId].label,
                onRemove: () => void applyStudySetSelection(null),
              }]
            : allChecked
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
        onReset={() => void resetFilters()}
      >
        {studySetId ? (
          <p className="text-sm leading-relaxed text-neutral-500">
            Đang lọc theo bộ tài liệu {studySetId}. Bộ lọc cấp JLPT được tạm thay thế để hiển thị đầy đủ danh sách này. Chạm lại tên bộ để bỏ lọc.
          </p>
        ) : (
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
        )}
        <FilterGroup title="Bộ tài liệu">
          {(Object.keys(KANJI_STUDY_SETS) as KanjiStudySetId[]).map((setId) => (
            <FilterChipOption
              key={setId}
              label={KANJI_STUDY_SETS[setId].label}
              active={studySetId === setId}
              onClick={() => applyStudySetSelection(studySetId === setId ? null : setId)}
            />
          ))}
        </FilterGroup>
        {!studySetId ? (
          <p className="text-xs leading-relaxed text-neutral-400">
            Chọn bộ tài liệu sẽ tạm thay thế lọc cấp JLPT, vì một số Kanji trong Excel được app xếp ở cấp khác.
          </p>
        ) : null}
      </FilterSheet>

      {isGrid ? null : (
        <div className="mt-3 hidden items-center gap-2 md:flex">
          <Button variant="outline" disabled={cardIndex <= 0} onClick={() => mutate({ index: cardIndex - 1, viewMode: "card" }, false)}>
            <ChevronLeft size={16} /> Trước
          </Button>
          <Button
            variant="outline"
            className="ml-auto"
            disabled={cardIndex < 0 || cardIndex >= list.length - 1}
            onClick={() => mutate({ index: cardIndex + 1, viewMode: "card" }, false)}
          >
            Tiếp <ChevronRight size={16} />
          </Button>
        </div>
      )}

      {isGrid || cardIndex <= 0 ? null : (
        <button
          onClick={() => mutate({ index: cardIndex - 1, viewMode: "card" }, false)}
          aria-label="Trước"
          className={`fixed ${floatingNavBottom} left-4 z-20 floating-action-button bg-white text-neutral-600 shadow-lg ring-1 ring-neutral-200 active:bg-neutral-50 md:hidden`}
        >
          <ChevronLeft size={18} />
        </button>
      )}
      {isGrid || cardIndex < 0 || cardIndex >= list.length - 1 ? null : (
        <button
          onClick={() => mutate({ index: cardIndex + 1, viewMode: "card" }, false)}
          aria-label="Tiếp"
          className={`fixed right-4 ${floatingNavBottom} z-20 floating-action-button bg-rose-600 text-white shadow-lg active:bg-rose-700 md:hidden`}
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
        <Card className="kanji-redesign mt-3 gap-0 rounded-2xl border-neutral-200 p-4 ring-0 sm:p-6">
          <div className="kanji-card-top flex flex-wrap items-center justify-between gap-2">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <Badge style={levelBadgeStyle(k.level)}>{k.level}</Badge>
                {isDueForReview(progress ?? undefined) ? (
                  <span className="flex items-center gap-1 text-xs font-semibold text-amber-700">
                    <Clock size={13} /> Đến hạn ôn lại
                  </span>
                ) : null}
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <button
                  title={isFlagged(progress) ? "Bỏ đánh dấu khó" : "Đánh dấu khó, cần học lại"}
                  onClick={async () => {
                    await toggleFlag(k.id);
                    await refreshProgress();
                  }}
                  className={`flex h-7.5 w-7.5 items-center justify-center rounded-full ${
                    isFlagged(progress) ? "text-rose-500" : "text-slate-400 hover:bg-white/70 hover:text-slate-600"
                  }`}
                >
                  <Flag size={17} fill={isFlagged(progress) ? "currentColor" : "none"} />
                </button>
                <button
                  title={progress?.mastered ? "Đã thuộc" : "Đánh dấu đã thuộc"}
                  onClick={async () => {
                    await toggleMastered(k.id);
                    await refreshProgress();
                  }}
                  className={`flex h-7.5 w-7.5 items-center justify-center rounded-full ${
                    progress?.mastered ? "bg-emerald-50 text-emerald-600" : "text-slate-400 hover:bg-white/70 hover:text-slate-600"
                  }`}
                >
                  <CheckCircle2 size={17} />
                </button>
              </div>
          </div>
          <section className="kanji-hero">
            <div className="kanji-character">{k.character}</div>
            <div className="kanji-hero-divider" />
            <p className="kanji-meaning">
              {meaningLine(k).text}
              {meaningLine(k).isDraft ? (
                <span title="Dịch bằng AI, chưa được kiểm duyệt" className="ml-2 inline-flex rounded bg-amber-100 px-1.5 py-0.5 align-middle text-[10px] font-semibold text-amber-700">nháp AI</span>
              ) : null}
            </p>
            <div className="kanji-reading-row">
              <span className="kanji-reading-chip"><strong>On</strong> {k.readings.on.length > 0 ? k.readings.on.join("、") : "—"}</span>
              <span className="kanji-reading-chip"><strong>Kun</strong> {k.readings.kun.length > 0 ? k.readings.kun.join("、") : "—"}</span>
            </div>
          </section>

          <div className="kanji-info-sections">
            <section className="kanji-info-block kanji-hanviet">
              <h3>Hán Việt:</h3><p>{formatHanViet(k.hanViet)}</p>
            </section>
            <section className="kanji-info-block kanji-structure">
              <h3>Cấu tạo chữ</h3>
              <div className="kanji-meta-row">
                <span><small>Bộ thủ</small><strong>{k.radical?.character ? `${k.radical.character}${k.radical.raw ? ` (bộ ${k.radical.raw})` : ""}` : "—"}</strong></span>
                {k.strokeCount != null ? <span><small>Số nét</small><strong>{k.strokeCount}</strong></span> : null}
                {k.frequency != null ? <span><small>Tần suất</small><strong>{k.frequency}</strong></span> : null}
              </div>
              <button
                type="button"
                onClick={() => {
                  setMapCharacter(k.character);
                  setMapMode(true);
                }}
                aria-label={`Mở Kanji Map cho ${k.character}`}
                className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-sky-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-sky-700 transition-colors hover:bg-sky-50"
              >
                <Network size={13} /> Xem Kanji Map
              </button>
            </section>
            <KanjiMnemonicChoice kanji={k} />
            <Suspense fallback={null}><KanjiBookResources kanji={k} onOpenVocab={onOpenVocab} /></Suspense>
            {k.meanings.en.length > 0 ? (
              <section className="kanji-info-block kanji-extra">
                <h3>English:</h3><p>{k.meanings.en.join(", ")}</p>
              </section>
            ) : null}
          </div>

          {related && related.shown.length > 0 ? (
            <details className="kanji-more-details">
              <summary>
                Xuất hiện trong các tài liệu <span className="ml-2 font-normal text-neutral-400">{related.total} từ vựng chứa chữ</span>
              </summary>
              <div className="kanji-info-sections">
              <section className="kanji-info-block kanji-related">
                <h3>Từ vựng chứa chữ này{related.total > related.shown.length ? ` (${related.total})` : ""}</h3>
                <div className="kanji-vocab-list">
                  {related.shown.map((v) => <button key={v.id} onClick={() => onOpenVocab(v.id)}>{v.word}{v.reading ? <span>{v.reading}</span> : null}</button>)}
                </div>
              </section>
              </div>
            </details>
          ) : null}

          {progress ? (
            <details className="mt-2.5 rounded-xl border border-neutral-200 bg-white text-sm">
              <summary className="cursor-pointer px-3 py-2.5 font-semibold text-neutral-600">
                Tiến độ học <span className="ml-2 font-normal text-neutral-400">{KANJI_MASTERY_DIRECTIONS.length} dạng</span>
              </summary>
              <div className="flex flex-wrap gap-1.5 border-t border-neutral-100 px-3 py-2.5">
                {KANJI_MASTERY_DIRECTIONS.map((dir) => {
                  const streak = progress.directionStreaks?.[dir] ?? 0;
                  const done = streak >= MASTERY_STREAK_THRESHOLD;
                  return (
                    <span
                      key={dir}
                      title={KANJI_MODE_LABELS[dir]}
                      className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${
                        done ? "border-emerald-300 bg-emerald-50 text-emerald-700" : "border-amber-200 bg-amber-50 text-amber-700"
                      }`}
                    >
                      {done ? "✓" : `${streak}/${MASTERY_STREAK_THRESHOLD}`} {KANJI_MODE_SHORT_LABELS[dir]}
                    </span>
                  );
                })}
              </div>
            </details>
          ) : null}

        </Card>
      )}
    </div>
  );
}
