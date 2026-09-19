import type { JlptLevel } from "../types/kanji.ts";
import { SOURCE_LABELS, SOURCE_GROUPS, type VocabSource } from "./vocabState.ts";
import { loadSlots, upsertSlot, deleteSlot, type SessionSlot } from "./sessionSlots.ts";

export interface MatchGameTile {
  cardId: string;
  text: string;
}

// A "Ghép cặp" game in progress, one slot per start (never overwrites an
// earlier unfinished game) -- mirrors quizState.ts's QuizSession/slot split.
// `poolIds` freezes the shuffle order from when the game started, so resume
// doesn't need to (and shouldn't) re-shuffle; `leftOrder`/`rightOrder`
// capture the current batch's on-screen arrangement so a resumed batch
// looks exactly as it did when the user left, not re-shuffled.
export interface MatchGameSessionData {
  selectedLevels: JlptLevel[];
  selectedSources: VocabSource[];
  mode: "meaning" | "reading";
  batchSize: number;
  poolIds: string[];
  batchIndex: number;
  leftOrder: MatchGameTile[];
  rightOrder: MatchGameTile[];
  matchedIds: string[];
  correctCount: number;
  wrongCount: number;
}

const MATCHGAME_SLOTS_KEY = "matchGameSessionSlots";

function levelLabel(levels: JlptLevel[]): string {
  return levels.length === 1 ? levels[0] : `${levels.length} cấp độ`;
}

function sourceLabel(sources: VocabSource[]): string {
  const fullGroup = SOURCE_GROUPS.find((g) => g.sources.length === sources.length && g.sources.every((s) => sources.includes(s)));
  if (fullGroup) return fullGroup.label;
  if (sources.length === 1) return SOURCE_LABELS[sources[0]];
  return `${sources.length} nguồn`;
}

export async function loadMatchGameSlots(): Promise<SessionSlot<MatchGameSessionData>[]> {
  return loadSlots<MatchGameSessionData>(MATCHGAME_SLOTS_KEY);
}

export async function saveMatchGameSlot(id: string, data: MatchGameSessionData): Promise<void> {
  const totalBatches = Math.ceil(data.poolIds.length / data.batchSize);
  await upsertSlot(MATCHGAME_SLOTS_KEY, {
    id,
    savedAt: Date.now(),
    title: `Ghép cặp · ${levelLabel(data.selectedLevels)} · ${sourceLabel(data.selectedSources)}`,
    subtitle: `Lượt ${data.batchIndex + 1}/${totalBatches} · Đúng ${data.correctCount} · Sai ${data.wrongCount}`,
    data,
  });
}

export async function deleteMatchGameSlot(id: string): Promise<void> {
  await deleteSlot(MATCHGAME_SLOTS_KEY, id);
}
