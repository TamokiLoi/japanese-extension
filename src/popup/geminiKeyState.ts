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

// A few known-working ids (all seen live in this repo's own Gemini scripts
// today) so the user has a manual escape hatch when Google's "high demand"
// 503 hits whichever one is currently selected -- switching model is a
// different load-balanced endpoint, unlike a quota 429 which retrying
// doesn't fix.
export const GEMINI_MODELS = ["gemini-3.5-flash", "gemini-flash-lite-latest", "gemini-2.5-flash", "gemini-3.1-flash-lite"] as const;
export const DEFAULT_GEMINI_MODEL: (typeof GEMINI_MODELS)[number] = "gemini-3.5-flash";

const MODEL_STORAGE_KEY = "geminiModel";

export async function loadGeminiModel(): Promise<string> {
  return (await storageGet<string>(MODEL_STORAGE_KEY)) ?? DEFAULT_GEMINI_MODEL;
}

export async function saveGeminiModel(model: string): Promise<void> {
  await storageSet(MODEL_STORAGE_KEY, model);
}
