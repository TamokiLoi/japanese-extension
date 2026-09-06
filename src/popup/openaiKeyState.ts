import { storageGet, storageSet, storageRemove } from "../platform/storage";

// User-supplied OpenAI API key for the in-page chat POC (FloatingChatButton).
// Deliberately NOT added to backupState.ts's BACKUP_KEYS -- a backup file is
// meant to be shareable/portable between the user's own devices, and this
// value is a live secret that pays real money on whoever's account it
// belongs to. Keeping it out of the export means a shared/leaked backup
// file never carries the key with it.
const STORAGE_KEY = "openaiApiKey";

export async function loadOpenAiKey(): Promise<string | undefined> {
  return storageGet<string>(STORAGE_KEY);
}

export async function saveOpenAiKey(key: string): Promise<void> {
  await storageSet(STORAGE_KEY, key.trim());
}

export async function clearOpenAiKey(): Promise<void> {
  await storageRemove(STORAGE_KEY);
}
