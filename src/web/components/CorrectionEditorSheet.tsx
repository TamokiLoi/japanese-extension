import { useEffect, useState } from "react";
import { Save } from "lucide-react";
import {
  saveDataCorrection,
  type CorrectionIssueType,
  type DataCorrectionEntry,
  type VocabCorrectionSnapshot,
} from "../../popup/dataCorrectionState.ts";
import { FilterSheet } from "./FilterSheet.tsx";
import { Button } from "./ui/button.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select.tsx";

const ISSUE_OPTIONS: { value: CorrectionIssueType; label: string; description: string }[] = [
  { value: "wrong-meaning", label: "Nghĩa hiện tại bị sai", description: "Thay nghĩa đang có bằng nội dung chính xác hơn" },
  { value: "additional-meaning", label: "Bổ sung nghĩa khác", description: "Giữ nghĩa hiện tại và thêm một nghĩa còn thiếu" },
  { value: "wrong-reading", label: "Sai cách đọc", description: "Cách đọc kana của từ chưa chính xác" },
  { value: "wrong-example", label: "Sai ví dụ", description: "Câu ví dụ hoặc bản dịch ví dụ cần chỉnh lại" },
  { value: "other", label: "Ghi chú khác", description: "Một vấn đề dữ liệu không thuộc các nhóm trên" },
];

export const CORRECTION_ISSUE_LABELS: Record<CorrectionIssueType, string> = {
  "add-new-vocab": "Thêm từ vựng mới",
  ...Object.fromEntries(ISSUE_OPTIONS.map((item) => [item.value, item.label])),
} as Record<CorrectionIssueType, string>;

export function CorrectionEditorSheet({
  open,
  onClose,
  entityId,
  snapshot,
  entry,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  entityId: string;
  snapshot: VocabCorrectionSnapshot;
  entry?: DataCorrectionEntry | null;
  onSaved: (saved: DataCorrectionEntry) => void;
}) {
  const [issueType, setIssueType] = useState<CorrectionIssueType>("wrong-meaning");
  const [suggestedValue, setSuggestedValue] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setIssueType(entry?.issueType ?? "wrong-meaning");
    setSuggestedValue(entry?.suggestedValue ?? "");
    setNote(entry?.note ?? "");
  }, [open, entry]);

  async function handleSave() {
    if (!suggestedValue.trim()) return;
    setSaving(true);
    try {
      const saved = await saveDataCorrection({
        id: entry?.id,
        entityId,
        snapshot,
        issueType,
        suggestedValue,
        note,
      });
      onSaved(saved);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <FilterSheet open={open} onClose={onClose} title={entry ? `Sửa góp ý · ${snapshot.word}` : `Góp ý dữ liệu · ${snapshot.word}`}>
      <div className="rounded-xl bg-neutral-50 p-3 text-sm">
        <div className="font-semibold text-neutral-800">
          {snapshot.word}{snapshot.reading ? `（${snapshot.reading}）` : ""}
        </div>
        <div className="mt-1 text-neutral-500">Nghĩa hiện tại: {snapshot.meaningVi || "—"}</div>
        <div className="mt-1 text-xs text-neutral-400">Nguồn: {snapshot.sources.join(" · ")}</div>
      </div>

      <div>
        <span className="mb-1.5 block text-xs font-semibold text-neutral-500">Loại góp ý</span>
        <Select
          items={ISSUE_OPTIONS.map((option) => ({ value: option.value, label: option.label }))}
          value={issueType}
          onValueChange={(value) => value !== null && setIssueType(value)}
        >
          <SelectTrigger className="h-11 w-full rounded-xl px-3 text-left shadow-none">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="p-1.5">
            {ISSUE_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value} className="items-start py-2.5 pr-2 pl-3">
                <span className="block min-w-0 pr-2">
                  <span className="block font-medium text-neutral-800">{option.label}</span>
                  <span className="mt-0.5 block text-xs leading-snug font-normal text-neutral-400">{option.description}</span>
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <label className="block">
        <span className="mb-1.5 flex items-center gap-2 text-xs font-semibold text-neutral-500">
          Nội dung đề xuất
          <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-semibold text-rose-600">Bắt buộc</span>
        </span>
        <textarea
          value={suggestedValue}
          onChange={(event) => setSuggestedValue(event.target.value)}
          rows={4}
          placeholder="Nhập nghĩa đúng, nghĩa bổ sung hoặc nội dung cần sửa..."
          className="w-full resize-y rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-700 outline-none focus:border-rose-400 focus:ring-2 focus:ring-rose-100"
        />
      </label>

      <label className="block">
        <span className="mb-1.5 flex items-center gap-2 text-xs font-semibold text-neutral-500">
          Ghi chú hoặc nguồn tham khảo
          <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-medium text-neutral-500">Tùy chọn</span>
        </span>
        <textarea
          value={note}
          onChange={(event) => setNote(event.target.value)}
          rows={2}
          placeholder="Ví dụ: Jisho, từ điển Nhật–Việt, ngữ cảnh đã gặp..."
          className="w-full resize-y rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-700 outline-none focus:border-rose-400 focus:ring-2 focus:ring-rose-100"
        />
      </label>

      <p className="text-xs leading-relaxed text-neutral-400">
        Góp ý chỉ được lưu trên trình duyệt và không tự sửa dữ liệu gốc. Bạn có thể xem hoặc xuất JSON trong Cài đặt.
      </p>

      <Button className="w-full" disabled={!suggestedValue.trim() || saving} onClick={() => void handleSave()}>
        <Save size={16} /> {saving ? "Đang lưu..." : entry ? "Lưu thay đổi" : "Lưu góp ý"}
      </Button>
    </FilterSheet>
  );
}
