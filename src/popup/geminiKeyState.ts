import { storageGet, storageSet, storageRemove } from "../platform/storage";

// User-supplied Gemini API key(s) for the in-page chat POC
// (FloatingChatButton), alongside openaiKeyState.ts. Same reasoning applies:
// deliberately NOT in backupState.ts's BACKUP_KEYS -- these are live
// secrets, not portable data.
//
// Multiple keys (not just one) because Gemini's free-tier quota is small
// and per-key -- a user with a couple of Google accounts can add each
// account's key and just switch to whichever one still has quota left
// today, the same workaround already used manually for this repo's own
// conversion scripts (see _scratch/.env.gemini's 2 keys).
export interface GeminiKeyEntry {
  id: string;
  key: string;
}

const KEYS_STORAGE_KEY = "geminiApiKeys";
const SELECTED_STORAGE_KEY = "geminiSelectedKeyId";
// Pre-multi-key storage shape -- migrated into the list below the first
// time this loads on a browser that still only has the old single key.
const LEGACY_SINGLE_KEY = "geminiApiKey";

async function migrateLegacyKey(): Promise<GeminiKeyEntry[]> {
  const legacy = await storageGet<string>(LEGACY_SINGLE_KEY);
  if (!legacy) return [];
  const entry: GeminiKeyEntry = { id: `k${Date.now()}`, key: legacy };
  await storageSet(KEYS_STORAGE_KEY, [entry]);
  await storageSet(SELECTED_STORAGE_KEY, entry.id);
  await storageRemove(LEGACY_SINGLE_KEY);
  return [entry];
}

export async function loadGeminiKeys(): Promise<GeminiKeyEntry[]> {
  const saved = await storageGet<GeminiKeyEntry[]>(KEYS_STORAGE_KEY);
  if (saved && saved.length > 0) return saved;
  return migrateLegacyKey();
}

export async function addGeminiKey(key: string): Promise<GeminiKeyEntry[]> {
  const trimmed = key.trim();
  if (!trimmed) return loadGeminiKeys();
  const keys = await loadGeminiKeys();
  const entry: GeminiKeyEntry = { id: `k${Date.now()}`, key: trimmed };
  const next = [...keys, entry];
  await storageSet(KEYS_STORAGE_KEY, next);
  // A key just added is most likely being added BECAUSE the previous one
  // ran out of quota -- switch to it immediately instead of leaving the
  // exhausted one selected.
  await storageSet(SELECTED_STORAGE_KEY, entry.id);
  return next;
}

export async function removeGeminiKey(id: string): Promise<GeminiKeyEntry[]> {
  const keys = await loadGeminiKeys();
  const next = keys.filter((k) => k.id !== id);
  await storageSet(KEYS_STORAGE_KEY, next);
  if ((await loadSelectedGeminiKeyId()) === id) {
    await storageSet(SELECTED_STORAGE_KEY, next[0]?.id ?? "");
  }
  return next;
}

export async function loadSelectedGeminiKeyId(): Promise<string> {
  return (await storageGet<string>(SELECTED_STORAGE_KEY)) ?? "";
}

export async function selectGeminiKey(id: string): Promise<void> {
  await storageSet(SELECTED_STORAGE_KEY, id);
}

// The one key actually used to call the API -- the selected entry, falling
// back to the first saved key if the selection is stale/missing (e.g. that
// key was deleted).
export async function loadActiveGeminiKey(): Promise<string | undefined> {
  const keys = await loadGeminiKeys();
  if (keys.length === 0) return undefined;
  const selectedId = await loadSelectedGeminiKeyId();
  return (keys.find((k) => k.id === selectedId) ?? keys[0]).key;
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
