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
  "itemProgress",
  "studyLog",
  "reminderSettings",
  "quizReminderSettings",
  "quizSettings",
  "lastReminderKind",
] as const;

const BACKUP_VERSION = 1;

interface BackupPayload {
  version: number;
  exportedAt: string;
  data: Record<string, unknown>;
}

export async function exportBackupJson(): Promise<string> {
  const stored = await chrome.storage.local.get([...BACKUP_KEYS]);
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

  await chrome.storage.local.set(toRestore);
  return { ok: true, restoredKeys };
}
