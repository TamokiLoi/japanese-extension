// Thin storage abstraction so the rest of the app (all *State.ts modules)
// never touches chrome.storage.local directly. In the Chrome extension
// build, chrome.storage.local is available and used as before. In the
// GitHub Pages static-site build there is no `chrome` global at all, so we
// fall back to localStorage -- wrapped in Promise.resolve() to keep the
// exact same async interface both call sites already expect.
function hasChromeStorage(): boolean {
  return typeof chrome !== "undefined" && !!chrome.storage?.local;
}

export async function storageGet<T = unknown>(key: string): Promise<T | undefined> {
  if (hasChromeStorage()) {
    const stored = await chrome.storage.local.get(key);
    return stored[key] as T | undefined;
  }
  const raw = localStorage.getItem(key);
  if (raw === null) return undefined;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return undefined;
  }
}

export async function storageSet(key: string, value: unknown): Promise<void> {
  if (hasChromeStorage()) {
    await chrome.storage.local.set({ [key]: value });
    return;
  }
  localStorage.setItem(key, JSON.stringify(value));
}

export async function storageRemove(key: string): Promise<void> {
  if (hasChromeStorage()) {
    await chrome.storage.local.remove(key);
    return;
  }
  localStorage.removeItem(key);
}

// backupState.ts exports/imports "every known key at once" as one JSON blob
// -- it needs the raw multi-key get chrome.storage.local.get() supports.
// localStorage has no multi-key get, so we just read each key in turn.
export async function storageGetMany(keys: string[]): Promise<Record<string, unknown>> {
  if (hasChromeStorage()) {
    return chrome.storage.local.get(keys);
  }
  const result: Record<string, unknown> = {};
  for (const key of keys) {
    const value = await storageGet(key);
    if (value !== undefined) result[key] = value;
  }
  return result;
}

export async function storageSetMany(entries: Record<string, unknown>): Promise<void> {
  if (hasChromeStorage()) {
    await chrome.storage.local.set(entries);
    return;
  }
  for (const [key, value] of Object.entries(entries)) {
    localStorage.setItem(key, JSON.stringify(value));
  }
}
