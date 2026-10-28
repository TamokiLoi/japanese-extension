export function QuestionExplanationBlock({
  explanation,
  optionExplanations,
  correctIndex,
  showMissing = false,
  className = "mt-3",
}: {
  explanation?: string | null;
  optionExplanations?: readonly (string | null | undefined)[];
  correctIndex?: number | null;
  showMissing?: boolean;
  className?: string;
}) {
  const hasExplanation = Boolean(explanation?.trim());
  const optionEntries = (optionExplanations ?? []).flatMap((text, optionIndex) =>
    text?.trim() ? [{ text, optionIndex }] : [],
  );

  if (!hasExplanation && optionEntries.length === 0 && !showMissing) return null;

  return (
    <div className={`space-y-3 text-sm ${className}`}>
      {hasExplanation ? (
        <section>
          <div className="text-xs font-bold tracking-wide text-neutral-400 uppercase">Giải thích</div>
          <div className="mt-1 whitespace-pre-line leading-relaxed text-neutral-600">{explanation}</div>
        </section>
      ) : null}

      {optionEntries.length > 0 ? (
        <section className={hasExplanation ? "border-t border-neutral-100 pt-3" : ""}>
          <div className="text-xs font-bold tracking-wide text-neutral-400 uppercase">Giải thích từng đáp án</div>
          <div className="mt-2 space-y-2 text-xs leading-relaxed text-neutral-600">
            {optionEntries.map(({ text, optionIndex }) => (
              <div key={optionIndex} className="flex gap-2">
                <span
                  className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                    optionIndex === correctIndex
                      ? "bg-emerald-100 text-emerald-700"
                      : "bg-rose-50 text-rose-600"
                  }`}
                >
                  {optionIndex + 1}
                </span>
                <span>{text}</span>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {!hasExplanation && optionEntries.length === 0 && showMissing ? (
        <p className="text-sm text-neutral-500">Câu này chưa có giải thích riêng.</p>
      ) : null}
    </div>
  );
}
