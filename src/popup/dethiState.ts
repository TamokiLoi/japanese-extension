import dethiCacNamRaw from "../data/dethi-n3-cac-nam.json";
import dethiN1CacNamRaw from "../data/dethi-n1-cac-nam.json";
import type { DeThiDataset, DeThiExam, DeThiPaper } from "../types/dethi.ts";
import type { JlptLevel } from "../types/kanji.ts";
import { storageGet, storageSet, storageRemove } from "../platform/storage";
import { findBunpoForText } from "./bunpoLinks.ts";
import { setFlagged } from "./progressState.ts";

const cacNamDataset = dethiCacNamRaw as unknown as DeThiDataset;
const n1CacNamDataset = dethiN1CacNamRaw as unknown as DeThiDataset;

function examsWithLevel(dataset: DeThiDataset): DeThiExam[] {
  return dataset.exams.map((exam) => ({ ...exam, level: dataset.meta.level }));
}

// "cac-nam" exam ids end in "YYYY-MM" (zero-padded), so a plain string
// compare sorts them newest-first without needing to parse dates.
const cacNamExamsNewestFirst = examsWithLevel(cacNamDataset).sort((a, b) => b.id.localeCompare(a.id));
const n1CacNamExamsNewestFirst = examsWithLevel(n1CacNamDataset).sort((a, b) => b.id.localeCompare(a.id));

// The IMO source data stays in src/data, but the incomplete set is temporarily
// hidden from exam selection until it has listening content.
export const ALL_EXAMS: DeThiExam[] = [...cacNamExamsNewestFirst, ...n1CacNamExamsNewestFirst];
export const AVAILABLE_LEVELS: JlptLevel[] = (["N5", "N4", "N3", "N2", "N1"] as const).filter((level) =>
  ALL_EXAMS.some((exam) => exam.level === level),
);

// Groups ExamListView's grid by DeThiExam.source instead of one flat list.
export const SOURCE_LABELS: Record<string, string> = {
  "cac-nam": "Đề thi thật từng kỳ",
};
const SOURCE_ORDER: string[] = ["cac-nam"];
export function getAvailableSources(level: JlptLevel): string[] {
  return SOURCE_ORDER.filter((source) => ALL_EXAMS.some((exam) => exam.level === level && exam.source === source));
}

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
  // "Ôn tập" attempt (only offered for a 聴解 paper's manual-control audio
  // mode) -- untimed (deadlineAt pushed far out so it never auto-submits)
  // and submitPaper() skips appendHistory for it, so it never touches
  // history/"% cao nhất". Absent/false = a normal timed "Bắt đầu" attempt.
  practiceMode?: boolean;
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

const PRACTICE_DEADLINE_YEARS = 100; // effectively "never" for useCountdown's auto-submit

export function startPaperAttempt(examId: string, paper: DeThiPaper, practiceMode = false): DeThiSession {
  const startedAt = Date.now();
  return {
    examId,
    paperId: paper.id,
    answers: paper.questions.map(() => null),
    currentIndex: 0,
    startedAt,
    deadlineAt: practiceMode ? startedAt + PRACTICE_DEADLINE_YEARS * 365 * 24 * 60 * 60_000 : startedAt + paper.timeMinutes * 60_000,
    ...(practiceMode ? { practiceMode: true } : {}),
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
  // Per-question chosen index, same shape/order as DeThiSession.answers --
  // lets the history list reopen ReviewQuestion for an OLD attempt, not just
  // the one just submitted. Optional only because entries saved before this
  // field existed don't have it (those still show in the list, just without
  // a working "xem lại" for that one attempt).
  answers?: (number | null)[];
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

// Newest-first attempts for one paper, for the "Lịch sử" list -- separate
// from loadDeThiHistory (which returns oldest-first, insertion order) since
// every existing caller of that one only ever aggregates (max/count), so
// changing its order would be a silent behavior change for them.
export async function loadHistoryForPaper(examId: string, paperId: string): Promise<DeThiHistoryEntry[]> {
  const history = await loadDeThiHistory();
  return history.filter((h) => h.examId === examId && h.paperId === paperId).sort((a, b) => b.finishedAt - a.finishedAt);
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

// Pure/sync half of getExamSummary, split out so a caller summarizing every
// exam (ExamListView) can loadDeThiHistory() ONCE and call this per exam,
// instead of each exam separately re-reading+re-scanning the whole (up to
// DETHI_HISTORY_MAX-entry) history array from storage.
export function summarizeExam(exam: DeThiExam | undefined, history: DeThiHistoryEntry[]): Record<string, DeThiPaperSummary> {
  const summary: Record<string, DeThiPaperSummary> = {};
  for (const paper of exam?.papers ?? []) {
    const attempts = history.filter((h) => h.examId === exam!.id && h.paperId === paper.id);
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

export async function getExamSummary(examId: string): Promise<Record<string, DeThiPaperSummary>> {
  const history = await loadDeThiHistory();
  return summarizeExam(findExamById(examId), history);
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
    answers: session.answers,
  };

  if (!session.practiceMode) await appendHistory(entry);
  if (found.exam.level === "N3" && session.paperId === "bunpou-dokkai") await flagWrongGrammar(paper, session.answers);
  await clearDeThiSession();
  return entry;
}

// A wrong 問題1/2 answer (grammar cloze / sentence-reorder -- the two
// problemGroups where the correct option IS a grammar pattern, unlike
// 問題3-7's cloze-paragraph/reading-comprehension questions) auto-flags the
// matching Bunpo card as "cần ôn lại" so it surfaces in Ôn tập, the same way
// 3 wrong Quiz drills in a row would -- except here 1 wrong exam answer is
// enough, since missing it on a real past exam is a stronger signal than a
// single quiz slip. Only acts on an unambiguous single catalog match
// (findBunpoForText) -- a question whose correct-answer text matches 0 or
// 2+ grammar points is silently skipped rather than guessed at.
async function flagWrongGrammar(paper: DeThiPaper, answers: (number | null)[]): Promise<void> {
  const targets: string[] = [];
  paper.questions.forEach((q, i) => {
    if (q.problemGroup !== "問題1" && q.problemGroup !== "問題2") return;
    if (answers[i] === null || answers[i] === q.correctIndex) return;
    // Match against just the correct option's own text, not question+option
    // together -- the surrounding sentence is full of common incidental
    // words (について/と思う/ていく...) that are themselves real (but
    // unrelated) catalog patterns, so including it turns an otherwise clean
    // single match into a multi-match ambiguity almost every time.
    const g = findBunpoForText(q.options[q.correctIndex], "N3");
    if (g) targets.push(g.id);
  });
  for (const id of new Set(targets)) await setFlagged(id, true);
}
