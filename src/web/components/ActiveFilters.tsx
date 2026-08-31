export interface ActiveFilterChip {
  key: string;
  label: string;
  onRemove: () => void;
}

// Only renders once a filter has actually been narrowed down -- an
// untouched screen shows no chip row at all (content-first).
export function ActiveFilters({ chips }: { chips: ActiveFilterChip[] }) {
  if (chips.length === 0) return null;
  return (
    <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
      {chips.map((c) => (
        <button
          key={c.key}
          onClick={c.onRemove}
          className="flex shrink-0 items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-medium whitespace-nowrap text-rose-600"
        >
          {c.label} <span className="text-rose-400">×</span>
        </button>
      ))}
    </div>
  );
}
