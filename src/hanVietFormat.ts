// Hán Việt readings are stored lowercase in the data files; display them
// capitalized everywhere in the UI without touching the underlying data.
export function formatHanViet(hanViet: string[], fallback = "—"): string {
  return hanViet.length > 0 ? hanViet.map((h) => h.toLocaleUpperCase("vi")).join(", ") : fallback;
}
