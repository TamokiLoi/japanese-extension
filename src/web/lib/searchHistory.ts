import type { JlptLevel } from "../../types/kanji.ts";

export type SearchHistoryKind = "kanji" | "vocab" | "bunpo";

export interface SearchHistoryEntry {
  kind: SearchHistoryKind;
  id: string;
  level: JlptLevel;
  primary: string;
  secondary: string;
  meaning: string;
  hanViet?: string;
}

const STORAGE_KEY = "nihongo-nin:search-history:v1";
export const MAX_SEARCH_HISTORY = 10;

const VALID_KINDS = new Set<SearchHistoryKind>(["kanji", "vocab", "bunpo"]);
const VALID_LEVELS = new Set<JlptLevel>(["N1", "N2", "N3", "N4", "N5"]);

function isSearchHistoryEntry(value: unknown): value is SearchHistoryEntry {
  if (!value || typeof value !== "object") return false;
  const entry = value as Partial<SearchHistoryEntry>;
  return Boolean(
    entry.kind && VALID_KINDS.has(entry.kind) &&
    typeof entry.id === "string" &&
    entry.level && VALID_LEVELS.has(entry.level) &&
    typeof entry.primary === "string" &&
    typeof entry.secondary === "string" &&
    typeof entry.meaning === "string" &&
    (entry.hanViet === undefined || typeof entry.hanViet === "string"),
  );
}

export function loadSearchHistory(): SearchHistoryEntry[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isSearchHistoryEntry).slice(0, MAX_SEARCH_HISTORY);
  } catch {
    return [];
  }
}

export function persistSearchHistory(entries: SearchHistoryEntry[]): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(0, MAX_SEARCH_HISTORY)));
  } catch {
    // Keep the in-memory history usable when browser storage is unavailable.
  }
}

export function addSearchHistoryEntry(
  current: SearchHistoryEntry[],
  entry: SearchHistoryEntry,
): SearchHistoryEntry[] {
  if (!entry.meaning.trim()) return current;
  return [entry, ...current.filter((item) => item.kind !== entry.kind || item.id !== entry.id)]
    .slice(0, MAX_SEARCH_HISTORY);
}
