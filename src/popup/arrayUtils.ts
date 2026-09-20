// Fisher-Yates shuffle -- was duplicated byte-for-byte across quizState.ts,
// quizBookState.ts (as `shuffled`), and reviewState.ts; kept here as the one
// shared copy so a future fix/tuning only has to happen in one place.
export function shuffle<T>(items: T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
