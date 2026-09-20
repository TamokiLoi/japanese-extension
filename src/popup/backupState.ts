import { storageGetMany, storageSetMany } from "../platform/storage";

// Export/import all of this extension's chrome.storage.local state as one
// JSON file, so progress (mastery, flags, streak) and settings survive a
// browser reinstall / profile switch instead of being stuck to one Chrome
// profile forever. Key names are duplicated here as literals rather than
// importing each module's private STORAGE_KEY const, to avoid churning
// every state module just to export a constant that otherwise has no
// reason to be public.
const BACKUP_KEYS = [
  "kanjiViewer",
  "vocabViewer",
  "bunpoViewer",
  "quizBookViewer",
  "readingViewer",
  "listeningViewer",
  "dictationViewer",
  "itBookViewer",
  "itemProgress",
  "studyLog",
  "listeningProgress",
  "dictationProgress",
  "dethiHistory",
  "dailyGoals",
  "roadmapSettings",
  "lastActiveScreen",
  "quizSettings",
  "quizSessionSlots",
  "matchGameSessionSlots",
  "reviewSession",
  "dethiSession",
  "reminderSettings",
  "quizReminderSettings",
  "lastReminderKind",
  "podcastViewer",
  "podcastProgress",
  "podcastFavorites",
  "bottomNavShortcuts",
] as const;
// NOTE: "quizSessionSlots" was previously (wrongly) listed as "quizSession"
// -- a key nothing ever actually wrote to, so Quiz's in-progress sessions
// were silently never backed up. "matchGameSessionSlots" and the 3 podcast
// keys (podcastState.ts) were missing entirely. Verify against each state
// module's own STORAGE_KEY/*_KEY const when adding a new feature here --
// see the comment above BACKUP_KEYS.

const BACKUP_VERSION = 1;

interface BackupPayload {
  version: number;
  exportedAt: string;
  data: Record<string, unknown>;
}

export async function exportBackupJson(): Promise<string> {
  const stored = await storageGetMany([...BACKUP_KEYS]);
  const payload: BackupPayload = {
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    data: stored,
  };
  return JSON.stringify(payload, null, 2);
}

export interface ImportResult {
  ok: boolean;
  error?: string;
  restoredKeys?: string[];
}

export async function importBackupJson(json: string): Promise<ImportResult> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return { ok: false, error: "File không phải JSON hợp lệ." };
  }

  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !("data" in parsed) ||
    typeof (parsed as Record<string, unknown>).data !== "object" ||
    (parsed as Record<string, unknown>).data === null
  ) {
    return { ok: false, error: "Định dạng file sao lưu không đúng." };
  }

  const data = (parsed as BackupPayload).data;
  const toRestore: Record<string, unknown> = {};
  const restoredKeys: string[] = [];
  for (const key of BACKUP_KEYS) {
    if (key in data) {
      toRestore[key] = data[key];
      restoredKeys.push(key);
    }
  }

  if (restoredKeys.length === 0) {
    return { ok: false, error: "File sao lưu không chứa dữ liệu nào nhận diện được." };
  }

  try {
    await storageSetMany(toRestore);
  } catch (e) {
    // On the web build this falls back to per-key localStorage.setItem
    // (platform/storage.ts), which throws synchronously (e.g.
    // QuotaExceededError) once a large restored backup exceeds the origin's
    // storage quota -- without this catch, that rejection propagated as an
    // unhandled promise rejection and the caller (BackupScreen.tsx's
    // `finally`-only try block) showed no error at all, just a busy state
    // quietly clearing with the restore silently incomplete.
    const message = e instanceof Error ? e.message : String(e);
    return { ok: false, error: `Không thể ghi dữ liệu khôi phục: ${message}` };
  }
  return { ok: true, restoredKeys };
}
