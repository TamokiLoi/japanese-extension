import { storageGet, storageSet } from "../platform/storage";

// Generic "multiple resumable in-progress attempts" store shared by Quiz
// (quizState.ts) and Ghép cặp (matchGameState.ts) -- each `start` gets its
// own slot (never overwrites an older one, unlike a single "current
// session" key), shown as a resume list the user can continue or delete
// individually. Modeled after D:\Work\ai-cert-quiz's SESSIONS map.
export interface SessionSlot<T> {
  id: string;
  savedAt: number;
  title: string;
  subtitle: string;
  data: T;
}

// Oldest slot (by savedAt) is dropped once a feature's slot count would
// exceed this -- mirrors ai-cert-quiz's MAX_SESSIONS = 8.
export const MAX_SLOTS_PER_FEATURE = 8;

// `crypto.randomUUID()` only exists in a secure context (HTTPS or
// localhost) -- testing the web dashboard over plain HTTP on a LAN IP
// (e.g. http://192.168.x.x:5174 for phone testing) is NOT secure, so
// `crypto.randomUUID` is undefined there and would throw. Fall back to a
// timestamp+random id in that case; uniqueness within one browser's storage
// is all that's needed here, not cryptographic randomness.
export function newSlotId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export async function loadSlots<T>(key: string): Promise<SessionSlot<T>[]> {
  const saved = (await storageGet<SessionSlot<T>[]>(key)) ?? [];
  return [...saved].sort((a, b) => b.savedAt - a.savedAt);
}

export async function upsertSlot<T>(key: string, slot: SessionSlot<T>): Promise<void> {
  const current = (await storageGet<SessionSlot<T>[]>(key)) ?? [];
  const next = [...current.filter((s) => s.id !== slot.id), slot].sort((a, b) => b.savedAt - a.savedAt).slice(0, MAX_SLOTS_PER_FEATURE);
  await storageSet(key, next);
}

export async function deleteSlot(key: string, id: string): Promise<void> {
  const current = (await storageGet<SessionSlot<unknown>[]>(key)) ?? [];
  await storageSet(key, current.filter((s) => s.id !== id));
}
