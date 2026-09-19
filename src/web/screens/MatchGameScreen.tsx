import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { Check, Shuffle, Sparkles } from "lucide-react";
import {
  ALL_VOCAB,
  AVAILABLE_LEVELS,
  AVAILABLE_SOURCES,
  SOURCE_GROUPS,
  SOURCE_LABELS,
  countForLevel,
  findVocabById,
  type VocabCard,
  type VocabSource,
} from "../../popup/vocabState.ts";
import { pruneToggle } from "../../popup/filterUtils.ts";
import type { JlptLevel } from "../../types/kanji.ts";
import { newSlotId, type SessionSlot } from "../../popup/sessionSlots.ts";
import {
  loadMatchGameSlots,
  saveMatchGameSlot,
  deleteMatchGameSlot,
  type MatchGameSessionData,
  type MatchGameTile,
} from "../../popup/matchGameState.ts";
import { FilterBar, FilterTrigger } from "../components/FilterBar.tsx";
import { ActiveFilters } from "../components/ActiveFilters.tsx";
import { FilterSheet, FilterGroup, FilterChipOption } from "../components/FilterSheet.tsx";
import { PageHeader } from "../components/PageHeader.tsx";
import { Card } from "../components/ui/card.tsx";
import { Button } from "../components/ui/button.tsx";

// "Ghép cặp": tap-to-match instead of drag-and-drop -- same interaction
// works identically with mouse and touch (no pointer/touch code paths to
// keep in sync), so no new dependency is needed unlike a real drag library.
// The Cấp độ/Nguồn filter below reuses the exact same FilterBar/FilterSheet
// components (and the same level<->source pruneToggle interaction) as the
// Vocab screen, but is entirely its own independent state -- it does NOT
// read or write the Vocab screen's saved VocabViewerState. Always starts
// from DEFAULT_LEVELS/DEFAULT_SOURCES below instead.
//
// Progress is saved as a "slot" (matchGameState.ts, built on the same
// sessionSlots.ts multi-slot store quizState.ts's Quiz uses) -- every
// distinct start gets its own resumable/deletable slot, never overwriting
// an earlier unfinished game. Any control that changes what's being played
// (mode/batch size/cấp độ/nguồn, or "Chơi lại") goes through
// `startFreshGame`, which creates a brand-new slot -- it deliberately does
// NOT touch/delete whatever slot was already in progress before that change,
// so the old one stays resumable later.
const DEFAULT_LEVELS: JlptLevel[] = ["N3"];
const DEFAULT_SOURCES: VocabSource[] = ["mimikara-n3"];

type PairMode = "meaning" | "reading";
const BATCH_SIZE_OPTIONS = [4, 6, 8, 10];
const DEFAULT_BATCH_SIZE = 6;

function answerOf(card: VocabCard, mode: PairMode): string {
  return mode === "reading" ? (card.reading as string) : card.meaningVi || "?";
}

function shuffled<T>(items: T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function buildPool(levels: JlptLevel[], sources: VocabSource[], mode: PairMode): VocabCard[] {
  const filtered = ALL_VOCAB.filter((v) => levels.includes(v.level) && v.sources.some((s) => sources.includes(s)));
  // "reading" pairs only make sense for kanji words whose reading isn't
  // just itself (mirrors quizState.ts's "reading" mode pool filter).
  const usable = mode === "reading" ? filtered.filter((v) => v.reading && v.reading !== v.word) : filtered.filter((v) => v.meaningVi);
  return shuffled(usable);
}

export function MatchGameScreen() {
  const [phase, setPhase] = useState<"loading" | "resume" | "game">("loading");
  const [resumeSlots, setResumeSlots] = useState<SessionSlot<MatchGameSessionData>[]>([]);

  const [gameId, setGameId] = useState<string | null>(null);
  const [mode, setMode] = useState<PairMode>("meaning");
  const [batchSize, setBatchSize] = useState(DEFAULT_BATCH_SIZE);
  const [selectedLevels, setSelectedLevels] = useState<JlptLevel[]>(DEFAULT_LEVELS);
  const [selectedSources, setSelectedSources] = useState<VocabSource[]>(DEFAULT_SOURCES);
  const [filterOpen, setFilterOpen] = useState(false);
  const [pool, setPool] = useState<VocabCard[] | null>(null);
  const [batchIndex, setBatchIndex] = useState(0);
  const [matchedIds, setMatchedIds] = useState<Set<string>>(new Set());
  const [selectedLeft, setSelectedLeft] = useState<string | null>(null);
  const [selectedRight, setSelectedRight] = useState<string | null>(null);
  const [wrongFlash, setWrongFlash] = useState<{ left: string; right: string } | null>(null);
  const [correctCount, setCorrectCount] = useState(0);
  const [wrongCount, setWrongCount] = useState(0);
  const [leftOrder, setLeftOrder] = useState<MatchGameTile[]>([]);
  const [rightOrder, setRightOrder] = useState<MatchGameTile[]>([]);
  // Set right before restoring a saved slot's exact leftOrder/rightOrder, so
  // the batch-change effect below (which normally re-shuffles a new batch)
  // skips its one run for that restore instead of clobbering it.
  const skipNextBatchEffect = useRef(false);

  async function refreshResumeSlots(): Promise<SessionSlot<MatchGameSessionData>[]> {
    const slots = await loadMatchGameSlots();
    setResumeSlots(slots);
    return slots;
  }

  useEffect(() => {
    void refreshResumeSlots().then((slots) => {
      if (slots.length > 0) setPhase("resume");
      else startFreshGame(DEFAULT_LEVELS, DEFAULT_SOURCES, "meaning", DEFAULT_BATCH_SIZE);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function startFreshGame(levels: JlptLevel[], sources: VocabSource[], gameMode: PairMode, size: number) {
    const newPool = buildPool(levels, sources, gameMode);
    setSelectedLevels(levels);
    setSelectedSources(sources);
    setMode(gameMode);
    setBatchSize(size);
    setPool(newPool);
    setBatchIndex(0);
    setCorrectCount(0);
    setWrongCount(0);
    setGameId(newPool.length > 0 ? newSlotId() : null);
    setPhase("game");
  }

  function resumeGame(slot: SessionSlot<MatchGameSessionData>) {
    const data = slot.data;
    const cards = data.poolIds.map((id) => findVocabById(id));
    if (cards.some((c) => !c)) {
      // Vocab dataset changed since this slot was saved (word removed/id
      // changed) -- can't rebuild it faithfully, drop it instead of resuming
      // into a broken game.
      void deleteMatchGameSlot(slot.id);
      void refreshResumeSlots();
      return;
    }
    skipNextBatchEffect.current = true;
    setSelectedLevels(data.selectedLevels);
    setSelectedSources(data.selectedSources);
    setMode(data.mode);
    setBatchSize(data.batchSize);
    setPool(cards as VocabCard[]);
    setBatchIndex(data.batchIndex);
    setLeftOrder(data.leftOrder);
    setRightOrder(data.rightOrder);
    setMatchedIds(new Set(data.matchedIds));
    setSelectedLeft(null);
    setSelectedRight(null);
    setWrongFlash(null);
    setCorrectCount(data.correctCount);
    setWrongCount(data.wrongCount);
    setGameId(slot.id);
    setPhase("game");
  }

  function applyLevelSelection(newLevels: JlptLevel[]) {
    if (newLevels.length === 0) return;
    const nextSources = pruneToggle(selectedSources, AVAILABLE_SOURCES, (source) => ALL_VOCAB.some((v) => v.sources.includes(source) && newLevels.includes(v.level)));
    startFreshGame(newLevels, nextSources, mode, batchSize);
  }

  function applySourceSelection(newSources: VocabSource[]) {
    if (newSources.length === 0) return;
    startFreshGame(selectedLevels, newSources, mode, batchSize);
  }

  // Same grouping as VocabScreen.tsx's sourceFilterChips: a fully-selected
  // group (e.g. both "Từ đồng nghĩa N3" sources) collapses into 1 chip,
  // a partial selection still lists each source separately.
  function sourceFilterChips(sources: VocabSource[]) {
    const chips: { key: string; label: string; onRemove: () => void }[] = [];
    for (const group of SOURCE_GROUPS) {
      const selectedMembers = group.sources.filter((s) => sources.includes(s));
      if (selectedMembers.length === 0) continue;
      if (group.sources.length > 1 && selectedMembers.length === group.sources.length) {
        chips.push({ key: group.id, label: group.label, onRemove: () => applySourceSelection(sources.filter((s) => !group.sources.includes(s))) });
      } else {
        for (const s of selectedMembers) {
          chips.push({ key: s, label: SOURCE_LABELS[s], onRemove: () => applySourceSelection(sources.filter((x) => x !== s)) });
        }
      }
    }
    return chips;
  }

  const batchWords = useMemo(() => (pool ? pool.slice(batchIndex * batchSize, batchIndex * batchSize + batchSize) : []), [pool, batchIndex, batchSize]);

  useEffect(() => {
    if (batchWords.length === 0) return;
    if (skipNextBatchEffect.current) {
      skipNextBatchEffect.current = false;
      return;
    }
    const newLeft = shuffled(batchWords.map((v) => ({ cardId: v.id, text: v.word })));
    const newRight = shuffled(batchWords.map((v) => ({ cardId: v.id, text: answerOf(v, mode) })));
    setLeftOrder(newLeft);
    setRightOrder(newRight);
    setMatchedIds(new Set());
    setSelectedLeft(null);
    setSelectedRight(null);
    setWrongFlash(null);
    if (gameId && pool) {
      void saveMatchGameSlot(gameId, {
        selectedLevels,
        selectedSources,
        mode,
        batchSize,
        poolIds: pool.map((v) => v.id),
        batchIndex,
        leftOrder: newLeft,
        rightOrder: newRight,
        matchedIds: [],
        correctCount,
        wrongCount,
      });
    }
    // batchWords itself is a new array each render (useMemo over pool/index),
    // so key on the actual word ids to only reset when the batch truly changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batchWords.map((v) => v.id).join(","), mode]);

  // Deletes the slot once the whole pool (every batch) has been cleared --
  // a finished game is no longer "in progress", so it drops off the resume
  // list instead of lingering there forever.
  useEffect(() => {
    if (!pool || !gameId) return;
    const totalBatches = Math.ceil(pool.length / batchSize);
    const isLastBatch = batchIndex >= totalBatches - 1;
    const batchDone = batchWords.length > 0 && matchedIds.size === batchWords.length;
    if (batchDone && isLastBatch) {
      void deleteMatchGameSlot(gameId);
      setGameId(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchedIds, batchIndex, pool, gameId, batchSize]);

  function pickLeft(cardId: string) {
    if (matchedIds.has(cardId) || wrongFlash) return;
    setSelectedLeft(cardId === selectedLeft ? null : cardId);
  }

  function pickRight(cardId: string) {
    if (matchedIds.has(cardId) || wrongFlash) return;
    if (cardId === selectedRight) {
      setSelectedRight(null);
      return;
    }
    if (!selectedLeft) {
      setSelectedRight(cardId);
      return;
    }
    if (selectedLeft === cardId) {
      const newMatchedIds = new Set(matchedIds).add(cardId);
      const newCorrect = correctCount + 1;
      setMatchedIds(newMatchedIds);
      setSelectedLeft(null);
      setSelectedRight(null);
      setCorrectCount(newCorrect);
      if (gameId && pool) {
        void saveMatchGameSlot(gameId, {
          selectedLevels,
          selectedSources,
          mode,
          batchSize,
          poolIds: pool.map((v) => v.id),
          batchIndex,
          leftOrder,
          rightOrder,
          matchedIds: [...newMatchedIds],
          correctCount: newCorrect,
          wrongCount,
        });
      }
    } else {
      const newWrong = wrongCount + 1;
      setWrongFlash({ left: selectedLeft, right: cardId });
      setWrongCount(newWrong);
      if (gameId && pool) {
        void saveMatchGameSlot(gameId, {
          selectedLevels,
          selectedSources,
          mode,
          batchSize,
          poolIds: pool.map((v) => v.id),
          batchIndex,
          leftOrder,
          rightOrder,
          matchedIds: [...matchedIds],
          correctCount,
          wrongCount: newWrong,
        });
      }
      setTimeout(() => {
        setWrongFlash(null);
        setSelectedLeft(null);
        setSelectedRight(null);
      }, 500);
    }
  }

  if (phase === "loading") {
    return <div className="mx-auto max-w-3xl px-2.5 py-6 text-center text-neutral-400">Đang tải...</div>;
  }

  if (phase === "resume") {
    return (
      <div className="mx-auto max-w-3xl px-2.5 py-2 md:px-8 md:py-6">
        <PageHeader title="Ghép cặp" icon={{ img: "icon-practice.png", bg: "#fae8ff" }} />
        <p className="mt-3 text-neutral-500">Bạn có {resumeSlots.length} ván đang chơi dở:</p>
        <div className="mt-4 flex flex-col gap-2">
          {resumeSlots.map((slot) => (
            <div key={slot.id} className="flex items-center justify-between gap-3 rounded-xl border border-neutral-200 bg-white px-4 py-3">
              <div className="min-w-0">
                <div className="truncate font-semibold text-neutral-800">{slot.title}</div>
                <div className="text-sm text-neutral-500">{slot.subtitle}</div>
              </div>
              <div className="flex shrink-0 gap-2">
                <Button size="sm" onClick={() => resumeGame(slot)}>
                  Tiếp tục
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    await deleteMatchGameSlot(slot.id);
                    await refreshResumeSlots();
                  }}
                >
                  Xoá
                </Button>
              </div>
            </div>
          ))}
        </div>
        <Button
          variant="outline"
          className="mt-4 w-full"
          onClick={() => startFreshGame(DEFAULT_LEVELS, DEFAULT_SOURCES, "meaning", DEFAULT_BATCH_SIZE)}
        >
          Ván mới
        </Button>
      </div>
    );
  }

  if (pool === null) {
    return <div className="mx-auto max-w-3xl px-2.5 py-6 text-center text-neutral-400">Đang tải...</div>;
  }

  const allLevelsChecked = selectedLevels.length === AVAILABLE_LEVELS.length;
  const allSourcesChecked = selectedSources.length === AVAILABLE_SOURCES.length;

  const header = (
    <>
      <PageHeader title="Ghép cặp" subtitle={`${pool.length} từ`} icon={{ img: "icon-practice.png", bg: "#fae8ff" }} />
      <div className="mt-3 flex items-center gap-2 text-sm">
        <select
          value={mode}
          onChange={(e) => startFreshGame(selectedLevels, selectedSources, e.target.value as PairMode, batchSize)}
          className="rounded-lg border border-neutral-200 px-2 py-1 text-sm"
        >
          <option value="meaning">Từ ↔ Nghĩa</option>
          <option value="reading">Từ ↔ Cách đọc</option>
        </select>
        <select
          value={batchSize}
          onChange={(e) => startFreshGame(selectedLevels, selectedSources, mode, Number(e.target.value))}
          className="rounded-lg border border-neutral-200 px-2 py-1 text-sm"
        >
          {BATCH_SIZE_OPTIONS.map((n) => (
            <option key={n} value={n}>
              {n} cặp/lượt
            </option>
          ))}
        </select>
      </div>
    </>
  );

  const filterUi = (
    <>
      <FilterBar>
        <FilterTrigger
          count={(allLevelsChecked ? 0 : selectedLevels.length) + (allSourcesChecked ? 0 : selectedSources.length)}
          onClick={() => setFilterOpen(true)}
        />
      </FilterBar>

      <ActiveFilters
        chips={[
          ...(allLevelsChecked ? [] : selectedLevels.map((l) => ({ key: `level-${l}`, label: l, onRemove: () => applyLevelSelection(selectedLevels.filter((x) => x !== l)) }))),
          ...(allSourcesChecked ? [] : sourceFilterChips(selectedSources)),
        ]}
      />

      <FilterSheet
        open={filterOpen}
        onClose={() => setFilterOpen(false)}
        title="Bộ lọc từ vựng"
        onReset={() => startFreshGame([...AVAILABLE_LEVELS], [...AVAILABLE_SOURCES], mode, batchSize)}
      >
        <FilterGroup title="Cấp độ">
          <FilterChipOption
            label={`Tất cả cấp độ (${ALL_VOCAB.length})`}
            active={allLevelsChecked}
            onClick={() => applyLevelSelection(allLevelsChecked ? selectedLevels : [...AVAILABLE_LEVELS])}
          />
          {AVAILABLE_LEVELS.map((level) => {
            const checked = selectedLevels.includes(level);
            return (
              <FilterChipOption
                key={level}
                label={`${level} (${countForLevel(level)})`}
                active={checked}
                onClick={() => applyLevelSelection(checked ? selectedLevels.filter((l) => l !== level) : [...new Set([...selectedLevels, level])])}
              />
            );
          })}
        </FilterGroup>
        <FilterGroup title="Nguồn">
          <FilterChipOption
            label={`Tất cả (${ALL_VOCAB.filter((v) => selectedLevels.includes(v.level)).length})`}
            active={allSourcesChecked}
            onClick={() =>
              applySourceSelection(
                allSourcesChecked
                  ? selectedSources
                  : AVAILABLE_SOURCES.filter((source) => ALL_VOCAB.some((v) => v.sources.includes(source) && selectedLevels.includes(v.level))),
              )
            }
          />
          {SOURCE_GROUPS.map((group) => {
            const checked = group.sources.every((s) => selectedSources.includes(s));
            const count = ALL_VOCAB.filter((v) => group.sources.some((s) => v.sources.includes(s)) && selectedLevels.includes(v.level)).length;
            return (
              <FilterChipOption
                key={group.id}
                label={`${group.label} (${count})`}
                active={checked}
                onClick={() => {
                  // Only add members that actually have a word at the
                  // currently selected level(s) -- e.g. narrowing to N3
                  // then tapping "Tango (theo cấp độ)" shouldn't silently
                  // pull in tango-n4/n5 (0 N3 matches) just because they're
                  // part of the group; the "Tất cả" chip above already gets
                  // this right, this mirrors it for a single group.
                  const relevantMembers = group.sources.filter((s) => ALL_VOCAB.some((v) => v.sources.includes(s) && selectedLevels.includes(v.level)));
                  const next = checked ? selectedSources.filter((s) => !group.sources.includes(s)) : [...new Set([...selectedSources, ...relevantMembers])];
                  applySourceSelection(next);
                }}
              />
            );
          })}
        </FilterGroup>
      </FilterSheet>
    </>
  );

  if (pool.length === 0) {
    return (
      <div className="mx-auto max-w-3xl px-2.5 py-2 md:px-8 md:py-6">
        {header}
        {filterUi}
        <p className="mt-6 text-center text-neutral-500">
          Chưa có từ nào phù hợp{mode === "reading" ? " để ghép theo cách đọc" : ""}. Mở <b>Bộ lọc</b> ở trên để chọn thêm cấp độ/nguồn.
        </p>
      </div>
    );
  }

  const totalBatches = Math.ceil(pool.length / batchSize);
  const isLastBatch = batchIndex >= totalBatches - 1;
  const batchDone = batchWords.length > 0 && matchedIds.size === batchWords.length;
  const allDone = batchDone && isLastBatch;

  return (
    <div className="mx-auto max-w-3xl px-2.5 py-2 md:px-8 md:py-6">
      {header}
      {filterUi}

      <p className="mt-3 text-sm text-neutral-400">
        Lượt {batchIndex + 1} / {totalBatches} · Đúng {correctCount} · Sai {wrongCount}
      </p>

      {allDone ? (
        <Card className="mt-4 gap-0 p-6 text-center">
          <div className="mx-auto flex items-center justify-center gap-2 text-4xl font-bold text-rose-600">
            <Sparkles size={32} /> {correctCount} / {correctCount + wrongCount}
          </div>
          <p className="mt-2 text-neutral-500">Đã ghép hết từ trong danh sách hiện tại.</p>
          <Button className="mt-4" onClick={() => startFreshGame(selectedLevels, selectedSources, mode, batchSize)}>
            <Shuffle size={16} /> Chơi lại
          </Button>
        </Card>
      ) : (
        <>
          {/* A single grid (not 2 independent flex columns) so each row's
              height auto-fits its taller cell -- a long wrapped meaning on
              the right no longer leaves that row's left tile floating at
              the wrong height, which is what broke the layout on mobile. */}
          <div className="mt-4 grid grid-cols-2 items-stretch gap-x-3 gap-y-2">
            {leftOrder.map((tile, i) => {
              const rightTile = rightOrder[i];
              const isMatched = matchedIds.has(tile.cardId);
              const isSelected = selectedLeft === tile.cardId;
              const isWrong = wrongFlash?.left === tile.cardId;
              const rIsMatched = matchedIds.has(rightTile.cardId);
              const rIsSelected = selectedRight === rightTile.cardId;
              const rIsWrong = wrongFlash?.right === rightTile.cardId;
              return (
                <Fragment key={tile.cardId}>
                  <button
                    type="button"
                    disabled={isMatched}
                    onClick={() => pickLeft(tile.cardId)}
                    className={`flex min-h-13 items-center rounded-xl border px-3 py-2.5 text-left text-base font-semibold transition-colors ${
                      isMatched
                        ? "border-emerald-200 bg-emerald-50 text-emerald-600"
                        : isWrong
                          ? "border-rose-300 bg-rose-50 text-rose-600"
                          : isSelected
                            ? "border-rose-400 bg-rose-50 text-rose-700"
                            : "border-neutral-200 bg-white text-neutral-800 hover:border-neutral-300"
                    }`}
                  >
                    {isMatched ? <Check size={14} className="mr-1 inline shrink-0" /> : null}
                    {tile.text}
                  </button>
                  <button
                    type="button"
                    disabled={rIsMatched}
                    onClick={() => pickRight(rightTile.cardId)}
                    className={`flex min-h-13 items-center rounded-xl border px-3 py-2.5 text-left text-sm transition-colors ${
                      rIsMatched
                        ? "border-emerald-200 bg-emerald-50 text-emerald-600"
                        : rIsWrong
                          ? "border-rose-300 bg-rose-50 text-rose-600"
                          : rIsSelected
                            ? "border-rose-400 bg-rose-50 text-rose-700"
                            : "border-neutral-200 bg-white text-neutral-700 hover:border-neutral-300"
                    }`}
                  >
                    {rIsMatched ? <Check size={14} className="mr-1 inline shrink-0" /> : null}
                    {rightTile.text}
                  </button>
                </Fragment>
              );
            })}
          </div>

          {batchDone ? (
            <div className="mt-4 flex justify-end">
              <Button onClick={() => setBatchIndex((i) => i + 1)}>Lượt tiếp theo</Button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
