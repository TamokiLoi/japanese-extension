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

// Escape hatch for when OpenAI's default model is overloaded/deprecated --
// mirrors geminiKeyState.ts's GEMINI_MODELS.
export const OPENAI_MODELS = ["gpt-4o-mini", "gpt-4o", "gpt-4.1-mini", "gpt-4.1"] as const;
export const DEFAULT_OPENAI_MODEL: (typeof OPENAI_MODELS)[number] = "gpt-4o-mini";

const MODEL_STORAGE_KEY = "openaiModel";

export async function loadOpenAiModel(): Promise<string> {
  return (await storageGet<string>(MODEL_STORAGE_KEY)) ?? DEFAULT_OPENAI_MODEL;
}

export async function saveOpenAiModel(model: string): Promise<void> {
  await storageSet(MODEL_STORAGE_KEY, model);
}
