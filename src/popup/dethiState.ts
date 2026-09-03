import dethiRaw from "../data/dethi-n3-imo-26bo.json";
import type { DeThiDataset, DeThiExam, DeThiPaper } from "../types/dethi.ts";
import { storageGet, storageSet, storageRemove } from "../platform/storage";

const dataset = dethiRaw as unknown as DeThiDataset;

export const ALL_EXAMS: DeThiExam[] = dataset.exams;

export function findExamById(examId: string): DeThiExam | undefined {
  return ALL_EXAMS.find((e) => e.id === examId);
}

export function findPaper(examId: string, paperId: string): { exam: DeThiExam; paper: DeThiPaper } | undefined {
  const exam = findExamById(examId);
  if (!exam) return undefined;
  const paper = exam.papers.find((p) => p.id === paperId);
  if (!paper) return undefined;
  return { exam, paper };
}

// One attempt in progress. `deadlineAt` is an ABSOLUTE timestamp
// (startedAt + timeMinutes*60000), not a "seconds remaining" counter --
// resuming after a reload/closed tab must still count down from the real
// deadline, not restart a fresh countdown from whatever was last saved.
export interface DeThiSession {
  examId: string;
  paperId: string;
  answers: (number | null)[];
  currentIndex: number;
  startedAt: number;
  deadlineAt: number;
}

const DETHI_SESSION_KEY = "dethiSession";

export async function loadDeThiSession(): Promise<DeThiSession | null> {
  return (await storageGet<DeThiSession>(DETHI_SESSION_KEY)) ?? null;
}

export async function saveDeThiSession(session: DeThiSession): Promise<void> {
  await storageSet(DETHI_SESSION_KEY, session);
}

export async function clearDeThiSession(): Promise<void> {
  await storageRemove(DETHI_SESSION_KEY);
}

// Mirrors quizState.ts's isSessionUnfinished -- a session with every
// question answered is still resumable (the user hasn't submitted yet),
// this only flags whether there's unanswered work left.
export function isDeThiSessionUnfinished(session: DeThiSession): boolean {
  return session.answers.some((a) => a === null);
}

export function startPaperAttempt(examId: string, paper: DeThiPaper): DeThiSession {
  const startedAt = Date.now();
  return {
    examId,
    paperId: paper.id,
    answers: paper.questions.map(() => null),
    currentIndex: 0,
    startedAt,
    deadlineAt: startedAt + paper.timeMinutes * 60_000,
  };
}

// One finished attempt, kept as a flat history array (same shape as
// progressState.ts's studyLog) rather than a map keyed by exam+paper --
// multiple attempts at the same paper are all worth keeping, not just the
// latest.
export interface DeThiHistoryEntry {
  examId: string;
  paperId: string;
  correctPoints: number;
  totalPoints: number;
  percent: number;
  correctCount: number;
  totalQuestions: number;
  durationSec: number;
  finishedAt: number;
}

const DETHI_HISTORY_KEY = "dethiHistory";
const DETHI_HISTORY_MAX = 500;

export async function loadDeThiHistory(): Promise<DeThiHistoryEntry[]> {
  return (await storageGet<DeThiHistoryEntry[]>(DETHI_HISTORY_KEY)) ?? [];
}

// Lets a paper's card go back to "Chưa làm" -- e.g. after a throwaway test
// attempt, or to clear a bad run without it permanently skewing "% cao
// nhất". Only clears the finished-attempt history, never touches an
// in-progress session.
export async function clearHistoryForPaper(examId: string, paperId: string): Promise<void> {
  const history = await loadDeThiHistory();
  const next = history.filter((h) => !(h.examId === examId && h.paperId === paperId));
  await storageSet(DETHI_HISTORY_KEY, next);
}

async function appendHistory(entry: DeThiHistoryEntry): Promise<void> {
  const history = await loadDeThiHistory();
  const next = [...history, entry].slice(-DETHI_HISTORY_MAX);
  await storageSet(DETHI_HISTORY_KEY, next);
}

export async function getBestForPaper(examId: string, paperId: string): Promise<number | null> {
  const history = await loadDeThiHistory();
  const attempts = history.filter((h) => h.examId === examId && h.paperId === paperId);
  if (attempts.length === 0) return null;
  return Math.max(...attempts.map((h) => h.percent));
}

export interface DeThiPaperSummary {
  attempts: number;
  bestPercent: number | null;
  lastFinishedAt: number | null;
}

export async function getExamSummary(examId: string): Promise<Record<string, DeThiPaperSummary>> {
  const history = await loadDeThiHistory();
  const exam = findExamById(examId);
  const summary: Record<string, DeThiPaperSummary> = {};
  for (const paper of exam?.papers ?? []) {
    const attempts = history.filter((h) => h.examId === examId && h.paperId === paper.id);
    summary[paper.id] =
      attempts.length === 0
        ? { attempts: 0, bestPercent: null, lastFinishedAt: null }
        : {
            attempts: attempts.length,
            bestPercent: Math.max(...attempts.map((h) => h.percent)),
            lastFinishedAt: Math.max(...attempts.map((h) => h.finishedAt)),
          };
  }
  return summary;
}

// Chấm điểm bằng barem thật (question.points), không phải đếm số câu đúng
// đơn thuần -- 1 câu 3 điểm sai lệch điểm số nhiều hơn 1 câu 1 điểm.
export async function submitPaper(session: DeThiSession): Promise<DeThiHistoryEntry> {
  const found = findPaper(session.examId, session.paperId);
  if (!found) throw new Error(`submitPaper: unknown exam/paper ${session.examId}/${session.paperId}`);
  const { paper } = found;

  let correctPoints = 0;
  let correctCount = 0;
  paper.questions.forEach((q, i) => {
    if (session.answers[i] === q.correctIndex) {
      correctPoints += q.points;
      correctCount++;
    }
  });

  const entry: DeThiHistoryEntry = {
    examId: session.examId,
    paperId: session.paperId,
    correctPoints,
    totalPoints: paper.totalPoints,
    percent: Math.round((correctPoints / paper.totalPoints) * 100),
    correctCount,
    totalQuestions: paper.questions.length,
    durationSec: Math.round((Date.now() - session.startedAt) / 1000),
    finishedAt: Date.now(),
  };

  await appendHistory(entry);
  await clearDeThiSession();
  return entry;
}
