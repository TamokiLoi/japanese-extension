const POS_COLORS: Record<string, { background: string; border: string; color: string }> = {
  "Danh từ": { background: "#e0f2fe", border: "#bae6fd", color: "#0369a1" },
  "Động từ": { background: "#dcfce7", border: "#bbf7d0", color: "#15803d" },
  "Tính từ": { background: "#fef3c7", border: "#fde68a", color: "#b45309" },
  "Tính từ đuôi い": { background: "#fef3c7", border: "#fde68a", color: "#b45309" },
  "Tính từ đuôi な": { background: "#ffedd5", border: "#fed7aa", color: "#c2410c" },
  "Trạng từ": { background: "#ede9fe", border: "#ddd6fe", color: "#6d28d9" },
  "Trợ từ": { background: "#f1f5f9", border: "#cbd5e1", color: "#475569" },
  "Liên từ": { background: "#ccfbf1", border: "#99f6e4", color: "#0f766e" },
  "Đại từ": { background: "#e0e7ff", border: "#c7d2fe", color: "#4338ca" },
  "Thán từ": { background: "#fce7f3", border: "#fbcfe8", color: "#be185d" },
  "Tiếp đầu ngữ": { background: "#ffedd5", border: "#fed7aa", color: "#c2410c" },
  "Hậu tố": { background: "#fae8ff", border: "#f5d0fe", color: "#a21caf" },
  "Cụm từ": { background: "#f3f4f6", border: "#e5e7eb", color: "#4b5563" },
};

export function VocabPartOfSpeechTag({ partOfSpeech }: { partOfSpeech?: string }) {
  if (!partOfSpeech || partOfSpeech === "Khác") return null;

  const colors = POS_COLORS[partOfSpeech] ?? { background: "#f3f4f6", border: "#e5e7eb", color: "#4b5563" };
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        border: `1px solid ${colors.border}`,
        borderRadius: 9999,
        backgroundColor: colors.background,
        color: colors.color,
        fontSize: 12,
        fontWeight: 600,
        lineHeight: "18px",
        padding: "1px 9px",
        whiteSpace: "nowrap",
      }}
    >
      {partOfSpeech}
    </span>
  );
}
