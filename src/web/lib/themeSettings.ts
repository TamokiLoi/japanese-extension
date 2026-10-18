export type ThemeMode = "system" | "light" | "dark";

export const THEME_MODE_STORAGE_KEY = "nihongo-theme-mode";

export function isThemeMode(value: unknown): value is ThemeMode {
  return value === "system" || value === "light" || value === "dark";
}

export function readThemeMode(): ThemeMode {
  try {
    const stored = localStorage.getItem(THEME_MODE_STORAGE_KEY);
    return isThemeMode(stored) ? stored : "system";
  } catch {
    return "system";
  }
}

export function saveThemeMode(mode: ThemeMode): void {
  try {
    localStorage.setItem(THEME_MODE_STORAGE_KEY, mode);
  } catch {
    // The in-memory selection still works when browser storage is unavailable.
  }
}

export function applyThemeMode(mode: ThemeMode): void {
  const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
  const isDark = mode === "dark" || (mode === "system" && prefersDark);
  const root = document.documentElement;

  root.classList.toggle("dark", isDark);
  root.dataset.themeMode = mode;
  root.style.colorScheme = isDark ? "dark" : "light";

  const themeColor = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (themeColor) themeColor.content = isDark ? "#111827" : "#fafafa";
}
