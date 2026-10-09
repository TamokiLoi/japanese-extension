import { storageGet, storageSet } from "../platform/storage";

export type JlptQuestionPracticeStatus = "correct" | "wrong";

export interface JlptQuestionPracticeAttempt {
  status: JlptQuestionPracticeStatus;
  selectedIndex: number;
  answeredAt: number;
}

export type JlptQuestionPracticeProgress = Record<string, JlptQuestionPracticeAttempt>;

const STORAGE_KEY = "jlptQuestionPracticeProgress";
let writeQueue: Promise<unknown> = Promise.resolve();

function updateProgress(update: (progress: JlptQuestionPracticeProgress) => JlptQuestionPracticeProgress): Promise<void> {
  const write = writeQueue.then(async () => {
    const progress = await loadJlptQuestionPracticeProgress();
    await storageSet(STORAGE_KEY, update(progress));
  });
  writeQueue = write.catch(() => undefined);
  return write;
}

export async function loadJlptQuestionPracticeProgress(): Promise<JlptQuestionPracticeProgress> {
  return (await storageGet<JlptQuestionPracticeProgress>(STORAGE_KEY)) ?? {};
}

export async function recordJlptQuestionPracticeAnswer(
  questionId: string,
  selectedIndex: number,
  correctIndex: number,
): Promise<JlptQuestionPracticeAttempt> {
  const attempt: JlptQuestionPracticeAttempt = {
    status: selectedIndex === correctIndex ? "correct" : "wrong",
    selectedIndex,
    answeredAt: Date.now(),
  };
  await updateProgress((progress) => ({ ...progress, [questionId]: attempt }));
  return attempt;
}

export async function clearJlptQuestionPracticeAnswer(questionId: string): Promise<void> {
  await updateProgress((progress) => {
    const { [questionId]: _removed, ...remaining } = progress;
    return remaining;
  });
}
