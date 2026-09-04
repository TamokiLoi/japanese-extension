const TONE = {
  neutral: { border: "border-t-neutral-300", value: "text-neutral-800" },
  emerald: { border: "border-t-emerald-300", value: "text-emerald-600" },
  amber: { border: "border-t-amber-300", value: "text-amber-700" },
  rose: { border: "border-t-rose-300", value: "text-rose-600" },
} as const;

// 3-up stat card used below the header on list screens (Luyện đề/Luyện đọc/...)
// -- label caption above the number, per the approved mockup (not the older
// number-above-label bucket-stat pattern still used by Kanji's grid overview).
export function StatCard({ label, value, tone = "neutral" }: { label: string; value: React.ReactNode; tone?: keyof typeof TONE }) {
  const t = TONE[tone];
  return (
    <div className={`rounded-2xl border border-t-4 border-neutral-200 bg-white p-3 ${t.border}`}>
      <div className="text-[10px] font-bold tracking-wide text-neutral-400 uppercase">{label}</div>
      <div className={`mt-1 text-lg font-extrabold ${t.value}`}>{value}</div>
    </div>
  );
}
