const TONE = {
  neutral: { border: "border-t-neutral-300", value: "text-neutral-800", ring: "border-neutral-400 ring-2 ring-neutral-400" },
  emerald: { border: "border-t-emerald-300", value: "text-emerald-600", ring: "border-emerald-400 ring-2 ring-emerald-400" },
  amber: { border: "border-t-amber-300", value: "text-amber-700", ring: "border-amber-400 ring-2 ring-amber-400" },
  rose: { border: "border-t-rose-300", value: "text-rose-600", ring: "border-rose-400 ring-2 ring-rose-400" },
} as const;

// 3-up stat card used below the header on list screens (Luyện đề/Luyện đọc/...)
// -- label caption above the number, per the approved mockup (not the older
// number-above-label bucket-stat pattern still used by Kanji's grid overview).
//
// Pass onClick to make it double as a tap-to-filter button instead of a
// dedicated <select>/chip row for the same status categories (Kanji/Vocab/
// Bunpo's progress buckets started this pattern; Reading/Listening/
// Dictation/QuizBook's status stats followed) -- `active` then draws the
// same tone's ring instead of a flat black one, so the highlight reads as
// "this card" rather than an error state.
export function StatCard({
  label,
  value,
  tone = "neutral",
  onClick,
  active,
}: {
  label: string;
  value: React.ReactNode;
  tone?: keyof typeof TONE;
  onClick?: () => void;
  active?: boolean;
}) {
  const t = TONE[tone];
  const className = `rounded-2xl border border-t-4 bg-white p-3 text-left ${onClick ? "transition-colors" : ""} ${t.border} ${
    active ? t.ring : "border-neutral-200"
  }`;
  const content = (
    <>
      <div className="text-[10px] font-bold tracking-wide text-neutral-400 uppercase">{label}</div>
      <div className={`mt-1 text-lg font-extrabold ${t.value}`}>{value}</div>
    </>
  );
  if (onClick) {
    return (
      <button onClick={onClick} className={className}>
        {content}
      </button>
    );
  }
  return <div className={className}>{content}</div>;
}
