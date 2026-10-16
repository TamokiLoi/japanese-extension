import { storageGet, storageSet } from "../platform/storage";
import { recordStudyDay } from "./progressState.ts";
import type { ExamTipsLevel, ExamTipsProgress, ExamTipsSkill } from "../web/data/examTips/types.ts";

export const EXAM_TIPS_PROGRESS_KEY = "examTipsProgressV1";

const EMPTY_PROGRESS: ExamTipsProgress = {
  version: 1,
  level: "N3",
  skill: "reading",
  completedLessonIds: [],
  exerciseChoices: {},
};

let writeQueue: Promise<void> = Promise.resolve();

export async function loadExamTipsProgress(): Promise<ExamTipsProgress> {
  const stored = await storageGet<Partial<ExamTipsProgress>>(EXAM_TIPS_PROGRESS_KEY);
  if (!stored || typeof stored !== "object") return { ...EMPTY_PROGRESS };
  return {
    ...EMPTY_PROGRESS,
    ...stored,
    completedLessonIds: Array.isArray(stored.completedLessonIds) ? stored.completedLessonIds : [],
    exerciseChoices: stored.exerciseChoices && typeof stored.exerciseChoices === "object" ? stored.exerciseChoices : {},
  } as ExamTipsProgress;
}

export async function saveExamTipsPosition(
  level: ExamTipsLevel,
  skill: ExamTipsSkill,
  lessonId: string,
  blockIndex = 0,
): Promise<void> {
  await enqueueWrite(async () => {
    const current = await loadExamTipsProgress();
    await storageSet(EXAM_TIPS_PROGRESS_KEY, {
      ...current,
      level,
      skill,
      lastLessonId: lessonId,
      lastBlockIndex: blockIndex,
    });
  });
}

export async function saveExamTipsExerciseChoice(
  level: ExamTipsLevel,
  skill: ExamTipsSkill,
  lessonId: string,
  blockIndex: number,
  value: number | string,
): Promise<void> {
  await enqueueWrite(async () => {
    const current = await loadExamTipsProgress();
    await storageSet(EXAM_TIPS_PROGRESS_KEY, {
      ...current,
      level,
      skill,
      lastLessonId: lessonId,
      lastBlockIndex: blockIndex,
      exerciseChoices: { ...current.exerciseChoices, [`${lessonId}:${blockIndex}`]: value },
    });
  });
  await recordStudyDay();
}

export async function setExamTipsLessonCompleted(
  level: ExamTipsLevel,
  skill: ExamTipsSkill,
  lessonId: string,
  completed: boolean,
): Promise<ExamTipsProgress> {
  let next = await loadExamTipsProgress();
  await enqueueWrite(async () => {
    const current = await loadExamTipsProgress();
    const completedLessonIds = new Set(current.completedLessonIds);
    if (completed) completedLessonIds.add(lessonId);
    else completedLessonIds.delete(lessonId);
    next = {
      ...current,
      level,
      skill,
      lastLessonId: lessonId,
      completedLessonIds: [...completedLessonIds],
    };
    await storageSet(EXAM_TIPS_PROGRESS_KEY, next);
  });
  if (completed) await recordStudyDay();
  return next;
}

export async function recordExamTipsInteraction(): Promise<void> {
  await recordStudyDay();
}

function enqueueWrite(write: () => Promise<void>): Promise<void> {
  const next = writeQueue.then(write, write);
  writeQueue = next.catch(() => undefined);
  return next;
}
