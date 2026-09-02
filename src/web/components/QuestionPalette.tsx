import { useState } from "react";
import { ChevronDown } from "lucide-react";

// "answered" is for an in-progress attempt where correctness isn't known
// yet (a timed exam shouldn't leak right/wrong before it's submitted) --
// distinct from "correct"/"wrong", which stay for post-submission review.
export type PaletteStatus = "current" | "correct" | "wrong" | "unanswered" | "answered";

export interface PaletteItem {
  id: string;
  status: PaletteStatus;
  /** e.g. already-mastered-but-unanswered-this-round -- a lighter tint than a plain unanswered cell. */
  highlighted?: boolean;
  title?: string;
}

function cellColor(item: PaletteItem): string {
  if (item.status === "current") return "border-rose-400 bg-rose-500 text-white";
  if (item.status === "unanswered") {
    return item.highlighted
      ? "border-emerald-200 bg-emerald-50 text-emerald-600"
      : "border-neutral-200 text-neutral-500 hover:bg-neutral-50";
  }
  if (item.status === "answered") return "border-neutral-300 bg-neutral-200 text-neutral-700";
  return item.status === "correct"
    ? "border-emerald-300 bg-emerald-100 text-emerald-700"
    : "border-rose-300 bg-rose-100 text-rose-700";
}

// Collapsed by default (content-first: the current question, not the palette,
// should own the viewport) -- expand on demand to jump around or see results.
// The Result screen passes defaultOpen since reviewing answers *is* that
// screen's content, not a distraction from it.
export function QuestionPalette({
  items,
  summary,
  onJump,
  defaultOpen = false,
}: {
  items: PaletteItem[];
  summary: string;
  onJump: (index: number) => void;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="mt-4">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between rounded-xl border border-neutral-200 bg-white px-4 py-2.5 text-left text-sm font-medium text-neutral-600 hover:bg-neutral-50"
      >
        <span>{summary}</span>
        <ChevronDown size={16} className={`shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open ? (
        <div className="mt-2 grid grid-cols-8 gap-1.5 sm:grid-cols-10">
          {items.map((item, i) => (
            <button
              key={item.id}
              title={item.title}
              onClick={() => onJump(i)}
              className={`rounded-lg border py-1.5 text-xs font-semibold ${cellColor(item)}`}
            >
              {i + 1}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
