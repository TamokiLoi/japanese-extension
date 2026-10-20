/**
 * Some source cards use the middle dot to list more than one kana reading
 * (for example 角: かど・すみ). Keep alternative spellings written in kana
 * as a single label; only split labels attached to a kanji word.
 */
export function getVocabReadingLabels(word: string, reading: string | null | undefined): string[] {
  if (!reading) return [];
  if (!/[\u3400-\u9fff々〆ヶ]/u.test(word) || !/[・･]/u.test(reading)) return [reading];

  const labels = reading.split(/[・･]/u).map((label) => label.trim()).filter(Boolean);
  if (labels.length < 2 || labels.some((label) => !/^[\u3041-\u3096\u30a1-\u30faー]+$/u.test(label))) {
    return [reading];
  }
  return [...new Set(labels)];
}

export function defaultVocabReading(word: string, reading: string | null | undefined): string {
  return getVocabReadingLabels(word, reading)[0] ?? "";
}

/** Stable progress ID for a reading present in JMdict but not in app cards. */
export function vocabReadingProgressId(word: string, reading: string): string {
  return `vocab-reading:${encodeURIComponent(word)}:${encodeURIComponent(reading)}`;
}
