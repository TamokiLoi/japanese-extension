import { useState } from "react";
import { MessageSquarePlus } from "lucide-react";
import {
  loadCorrectionsForEntity,
  type DataCorrectionEntry,
  type StudyCorrectionSnapshot,
} from "../../popup/dataCorrectionState.ts";
import { CorrectionEditorSheet } from "./CorrectionEditorSheet.tsx";

export function StudyFeedbackButton({
  entityId,
  snapshot,
  label = "Góp ý",
}: {
  entityId: string;
  snapshot: StudyCorrectionSnapshot;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [entry, setEntry] = useState<Extract<DataCorrectionEntry, { entityType: "study" }> | null>(null);

  async function openEditor() {
    setLoading(true);
    try {
      const existing = (await loadCorrectionsForEntity(entityId)).find((item) => item.entityType === "study");
      setEntry(existing ?? null);
    } catch (error) {
      console.error("Could not load saved study feedback", error);
      setEntry(null);
    } finally {
      setLoading(false);
      setOpen(true);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => void openEditor()}
        disabled={loading}
        aria-label="Góp ý hoặc ghi chú câu hỏi"
        title="Góp ý đáp án hoặc ghi chú câu hỏi"
        className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors disabled:opacity-60 ${
          entry
            ? "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100"
            : "border-neutral-200 text-neutral-500 hover:border-amber-200 hover:bg-amber-50 hover:text-amber-700"
        }`}
      >
        <MessageSquarePlus size={13} /> {loading ? "Đang mở..." : entry ? "Sửa góp ý" : label}
      </button>
      <CorrectionEditorSheet
        open={open}
        onClose={() => setOpen(false)}
        entityId={entityId}
        entityType="study"
        snapshot={snapshot}
        entry={entry}
        onSaved={(saved) => setEntry(saved.entityType === "study" ? saved : null)}
      />
    </>
  );
}
