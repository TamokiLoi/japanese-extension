import { storageGet, storageSet } from "../platform/storage.ts";
import { deleteSlot, loadSlots, upsertSlot, type SessionSlot } from "./sessionSlots.ts";

export type FlashcardStatus = "known" | "not-yet";
export type FlashcardProgress = Record<string, FlashcardStatus>;

export const FLASHCARD_PROGRESS_KEY = "flashcardProgressV1";
const FLASHCARD_SESSION_SLOTS_KEY = "flashcardSessionSlots";
const LEGACY_FPT_N3_PROGRESS_KEY = "fptN3TangoFlashcardProgress";

export interface FlashcardSession {
  id: string;
  categoryId: string;
  collectionId: string;
  deckId: string;
  deckTitle: string;
  cardIds: string[];
  currentIndex: number;
  revealed: boolean;
}

export async function loadFlashcardSessionSlots(): Promise<SessionSlot<FlashcardSession>[]> {
  return (await loadSlots<FlashcardSession>(FLASHCARD_SESSION_SLOTS_KEY)).filter((slot) => (
    Array.isArray(slot.data?.cardIds)
      && slot.data.cardIds.length > 0
      && slot.data.currentIndex >= 0
      && slot.data.currentIndex < slot.data.cardIds.length
  ));
}

export async function saveFlashcardSession(session: FlashcardSession): Promise<SessionSlot<FlashcardSession>> {
  const slot: SessionSlot<FlashcardSession> = {
    id: session.id,
    savedAt: Date.now(),
    title: session.deckTitle,
    subtitle: `${session.currentIndex + 1}/${session.cardIds.length} thẻ`,
    data: session,
  };
  await upsertSlot(FLASHCARD_SESSION_SLOTS_KEY, slot);
  return slot;
}

export async function deleteFlashcardSession(id: string): Promise<void> {
  await deleteSlot(FLASHCARD_SESSION_SLOTS_KEY, id);
}

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
