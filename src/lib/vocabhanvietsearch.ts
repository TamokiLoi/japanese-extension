import type { Kanji } from "../types/kanji.ts";

export function buildKanjiHanVietReadings(kanji: Kanji[]): Map<string, string[]> {
  return new Map(kanji.map((entry) => [entry.character, entry.hanViet.map((reading) => reading.toLocaleLowerCase("vi"))]));
}

/** Match a complete all-Kanji word without generating every possible Hán Việt combination. */
export function matchesComposedHanViet(word: string, query: string, readings: Map<string, string[]>): boolean {
  const syllables = query.trim().toLocaleLowerCase("vi").split(/\s+/u);
  const characters = [...word];
  if (syllables.length !== characters.length) return false;
  return characters.every((character, index) =>
    readings.get(character)?.includes(syllables[index]) === true,
  );
}
