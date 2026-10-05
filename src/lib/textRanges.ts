export interface TextRange {
  start: number;
  end: number;
}

/** Find exact phrases that occur only once in the source text. */
export function findUniqueTextRanges(text: string, phrases: readonly string[] = [], explicitRanges: readonly TextRange[] = []): TextRange[] {
  const ranges: TextRange[] = [];
  for (const range of explicitRanges) {
    if (Number.isInteger(range.start) && Number.isInteger(range.end) && range.start >= 0 && range.end > range.start && range.end <= text.length) {
      ranges.push({ start: range.start, end: range.end });
    }
  }
  for (const phrase of new Set(phrases.filter(Boolean))) {
    const start = text.indexOf(phrase);
    if (start >= 0 && start === text.lastIndexOf(phrase)) ranges.push({ start, end: start + phrase.length });
  }
  const unique = new Map(ranges.map((range) => [`${range.start}:${range.end}`, range]));
  return [...unique.values()].sort((left, right) => left.start - right.start);
}
