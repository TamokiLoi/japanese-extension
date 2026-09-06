import { storageGet, storageSet, storageRemove } from "../platform/storage";

// User-supplied Gemini API key for the in-page chat POC (FloatingChatButton),
// alongside openaiKeyState.ts. Same reasoning applies: deliberately NOT in
// backupState.ts's BACKUP_KEYS -- this is a live secret, not portable data.
const STORAGE_KEY = "geminiApiKey";

export async function loadGeminiKey(): Promise<string | undefined> {
  return storageGet<string>(STORAGE_KEY);
}

export async function saveGeminiKey(key: string): Promise<void> {
  await storageSet(STORAGE_KEY, key.trim());
}

export async function clearGeminiKey(): Promise<void> {
  await storageRemove(STORAGE_KEY);
}
