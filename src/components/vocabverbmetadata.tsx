import type { CSSProperties } from "react";
import type { VerbFormDetail } from "../types/vocab.ts";

interface VocabVerbMetadataProps {
  verbGroup?: string | null;
  transitivity?: string | null;
  forms?: VerbFormDetail[];
}

const tagStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  border: "1px solid transparent",
  borderRadius: 9999,
  background: "#29975b",
  color: "#fff",
  fontSize: 12,
  fontWeight: 600,
  lineHeight: "18px",
  padding: "1px 9px",
  whiteSpace: "nowrap",
};

export function VocabVerbMetadata({ verbGroup, transitivity, forms }: VocabVerbMetadataProps) {
  if (!verbGroup && !transitivity && !forms?.length) return null;

  return (
    <div style={{ margin: "8px 0 0", textAlign: "left" }}>
      {verbGroup || transitivity ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {verbGroup ? <span style={tagStyle}>{verbGroup}</span> : null}
          {transitivity ? <span style={{ ...tagStyle, background: "#3d4fbd" }}>{transitivity}</span> : null}
        </div>
      ) : null}
      {forms?.length ? (
        <div style={{ display: "grid", gap: 3, marginTop: 5, color: "#71717a", fontSize: 11 }}>
          {forms.map((detail) => (
            <div key={`${detail.form}|${detail.reading}`}>
              {detail.form} ({detail.reading}): {detail.verbGroup} · {detail.transitivity}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
