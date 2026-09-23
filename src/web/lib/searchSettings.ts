import { storageGet, storageSet } from "../../platform/storage.ts";

export type SearchDisplayMode = "page" | "popup";

const STORAGE_KEY = "searchDisplayMode";

export const DEFAULT_SEARCH_DISPLAY_MODE: SearchDisplayMode = "page";

function isSearchDisplayMode(value: unknown): value is SearchDisplayMode {
  return value === "page" || value === "popup";
}

export async function loadSearchDisplayMode(): Promise<SearchDisplayMode> {
  const stored = await storageGet<unknown>(STORAGE_KEY);
  return isSearchDisplayMode(stored) ? stored : DEFAULT_SEARCH_DISPLAY_MODE;
}

export async function saveSearchDisplayMode(mode: SearchDisplayMode): Promise<void> {
  if (!isSearchDisplayMode(mode)) throw new Error("Chế độ tra cứu không hợp lệ.");
  await storageSet(STORAGE_KEY, mode);
}
