import type { VerbFormDetail } from "../types/vocab.ts";

interface VocabVerbMetadataProps {
  forms?: VerbFormDetail[];
}

export function VocabVerbMetadata({ forms }: VocabVerbMetadataProps) {
  if (!forms?.length) return null;

  return (
    <div style={{ display: "grid", gap: 3, margin: "7px 0 0", color: "#71717a", fontSize: 11 }}>
      {forms.map((detail) => (
        <div key={`${detail.form}|${detail.reading}`}>
          {detail.form} ({detail.reading}): {detail.verbGroup} · {detail.transitivity}
        </div>
      ))}
    </div>
  );
}
