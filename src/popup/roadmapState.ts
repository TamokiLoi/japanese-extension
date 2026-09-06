import { storageGet, storageSet } from "../platform/storage";

// User-entered exam date drives a 3-phase roadmap (see computeRoadmapStatus).
// `startDate` is pinned the FIRST time an exam date is set (or after a
// reset) so the roadmap's total duration doesn't shrink every time this is
// reloaded with the same examDate -- it's the fixed denominator for
// "% of time elapsed", not "today".
export interface RoadmapSettings {
  examDate: string | null; // "YYYY-MM-DD"
  startDate: string | null; // "YYYY-MM-DD"
}

const STORAGE_KEY = "roadmapSettings";
const EMPTY_SETTINGS: RoadmapSettings = { examDate: null, startDate: null };

export async function loadRoadmapSettings(): Promise<RoadmapSettings> {
  const saved = await storageGet<Partial<RoadmapSettings>>(STORAGE_KEY);
  return { examDate: saved?.examDate ?? EMPTY_SETTINGS.examDate, startDate: saved?.startDate ?? EMPTY_SETTINGS.startDate };
}

export async function saveRoadmapSettings(settings: RoadmapSettings): Promise<void> {
  await storageSet(STORAGE_KEY, settings);
}

export async function setExamDate(examDate: string): Promise<RoadmapSettings> {
  const current = await loadRoadmapSettings();
  const next: RoadmapSettings = { examDate, startDate: current.startDate ?? new Date().toISOString().slice(0, 10) };
  await saveRoadmapSettings(next);
  return next;
}

export async function clearRoadmapSettings(): Promise<void> {
  await saveRoadmapSettings(EMPTY_SETTINGS);
}

export type RoadmapPhase = "foundation" | "practice" | "sprint" | "past-exam";

export interface RoadmapStatus {
  phase: RoadmapPhase;
  daysRemaining: number;
  totalDays: number;
  // 0..1, tỉ lệ thời gian đã trôi qua kể từ startDate tới examDate.
  progressRatio: number;
}

// Hằng số MVP, không cần UI cấu hình riêng -- dễ chỉnh sau nếu cần.
const PRACTICE_THRESHOLD = 0.6;
const SPRINT_THRESHOLD = 0.85;

export function computeRoadmapStatus(settings: RoadmapSettings, now: Date = new Date()): RoadmapStatus | null {
  if (!settings.examDate || !settings.startDate) return null;
  const start = new Date(`${settings.startDate}T00:00:00`).getTime();
  const exam = new Date(`${settings.examDate}T00:00:00`).getTime();
  const today = new Date(`${now.toISOString().slice(0, 10)}T00:00:00`).getTime();
  const totalDays = Math.max(1, Math.round((exam - start) / 86_400_000));
  const daysRemaining = Math.round((exam - today) / 86_400_000);
  if (daysRemaining < 0) return { phase: "past-exam", daysRemaining, totalDays, progressRatio: 1 };
  const elapsedDays = totalDays - daysRemaining;
  const progressRatio = Math.min(1, Math.max(0, elapsedDays / totalDays));
  const phase: RoadmapPhase = progressRatio >= SPRINT_THRESHOLD ? "sprint" : progressRatio >= PRACTICE_THRESHOLD ? "practice" : "foundation";
  return { phase, daysRemaining, totalDays, progressRatio };
}
