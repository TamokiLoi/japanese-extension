// Hán Việt readings are stored lowercase in the data files; display them
// capitalized everywhere in the UI without touching the underlying data.
export function formatHanViet(hanViet: string[], fallback = "—"): string {
  const uniqueReadings = new Map<string, string>();
  for (const reading of hanViet) {
    const trimmed = reading.trim();
    if (!trimmed) continue;
    const key = trimmed.normalize("NFC").toLocaleLowerCase("vi");
    if (!uniqueReadings.has(key)) uniqueReadings.set(key, trimmed);
  }

  return uniqueReadings.size > 0
    ? [...uniqueReadings.values()].map((reading) => reading.toLocaleUpperCase("vi")).join(", ")
    : fallback;
}
