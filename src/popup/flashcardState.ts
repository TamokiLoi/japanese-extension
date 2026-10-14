import { storageGet, storageSet } from "../platform/storage.ts";

export type FlashcardStatus = "known" | "not-yet";
export type FlashcardProgress = Record<string, FlashcardStatus>;

export const FLASHCARD_PROGRESS_KEY = "flashcardProgressV1";
const LEGACY_FPT_N3_PROGRESS_KEY = "fptN3TangoFlashcardProgress";

function validProgress(value: unknown): FlashcardProgress {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, FlashcardStatus] => entry[1] === "known" || entry[1] === "not-yet"),
  );
}

export async function loadFlashcardProgress(): Promise<FlashcardProgress> {
  const [stored, legacyFpt] = await Promise.all([
    storageGet<unknown>(FLASHCARD_PROGRESS_KEY),
    storageGet<unknown>(LEGACY_FPT_N3_PROGRESS_KEY),
  ]);
  const migratedLegacy = Object.fromEntries(
    Object.entries(validProgress(legacyFpt)).map(([id, status]) => ["vocab:" + id, status]),
  );
  return { ...migratedLegacy, ...validProgress(stored) };
}

export async function saveFlashcardProgress(progress: FlashcardProgress): Promise<void> {
  await storageSet(FLASHCARD_PROGRESS_KEY, progress);
}
