// Shared by every screen with cross-gated filter groups (e.g. Ngữ pháp's
// cấp độ -> nguồn, Luyện đọc's cấp độ/sách/độ dài, Luyện nghe's sách/dạng
// câu): toggling one group can make some currently-selected options in
// another group match zero items. Without pruning, those options stay
// visually checked (and still narrow the result list) even though their
// own count reads "(0)" -- confusing and effectively an invisible filter.
//
// `hasData` should already account for whatever *other* selections are
// still in effect (e.g. "does this source have any item at the newly
// chosen levels"). Falls back to "everything with data" rather than an
// empty selection so a filter group is never left with nothing checked.
export function pruneToggle<T>(current: T[], available: readonly T[], hasData: (option: T) => boolean): T[] {
  const pruned = current.filter(hasData);
  if (pruned.length > 0) return pruned;
  const fallback = available.filter(hasData);
  return fallback.length > 0 ? fallback : current;
}
