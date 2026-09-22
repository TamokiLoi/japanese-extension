import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Plus, Search } from "lucide-react";
import { isRomaji, toHiragana } from "wanakana";
import { saveDataCorrection, type DataCorrectionEntry } from "../../popup/dataCorrectionState.ts";
import { ALL_VOCAB } from "../../popup/vocabState.ts";
import { useDebouncedValue } from "../../popup/useDebouncedValue.ts";
import { FilterSheet } from "./FilterSheet.tsx";
import { Button } from "./ui/button.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select.tsx";

const LEVELS = ["Chưa xác định", "N5", "N4", "N3", "N2", "N1"];

export function NewVocabCorrectionSheet({
  open,
  onClose,
  entry,
  initialWord,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  entry?: Extract<DataCorrectionEntry, { entityType: "vocab" }> | null;
  initialWord?: string;
  onSaved: (saved: DataCorrectionEntry) => void;
}) {
  const [word, setWord] = useState("");
  const [reading, setReading] = useState("");
  const [level, setLevel] = useState("Chưa xác định");
  const [meaning, setMeaning] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const debouncedWord = useDebouncedValue(word, 150);

  const matches = useMemo(() => {
    const query = debouncedWord.trim().toLowerCase();
    if (!query) return [];
    const kana = isRomaji(query) ? toHiragana(query, { passRomaji: false }) : null;
    return ALL_VOCAB.filter((item) => {
      const itemWord = item.word.toLowerCase();
      const itemReading = (item.reading ?? "").toLowerCase();
      return (
        itemWord.includes(query) ||
        itemReading.includes(query) ||
        (kana !== null && itemReading.includes(kana)) ||
        item.meaningVi.toLowerCase().includes(query)
      );
    })
      .sort((a, b) => {
        const score = (item: (typeof ALL_VOCAB)[number]) => {
          const itemWord = item.word.toLowerCase();
          const itemReading = (item.reading ?? "").toLowerCase();
          if (itemWord === query || itemReading === query || (kana !== null && itemReading === kana)) return 0;
          if (itemWord.startsWith(query) || itemReading.startsWith(query) || (kana !== null && itemReading.startsWith(kana))) return 1;
          return 2;
        };
        return score(a) - score(b);
      })
      .slice(0, 5);
  }, [debouncedWord]);

  const hasExactMatch = useMemo(() => {
    const query = debouncedWord.trim().toLowerCase();
    if (!query) return false;
    const kana = isRomaji(query) ? toHiragana(query, { passRomaji: false }) : null;
    return matches.some(
      (item) => item.word.toLowerCase() === query || (item.reading ?? "").toLowerCase() === query || (kana !== null && item.reading === kana),
    );
  }, [debouncedWord, matches]);

  useEffect(() => {
    if (!open) return;
    setWord(entry?.snapshot.word ?? initialWord ?? "");
    setReading(entry?.snapshot.reading ?? "");
    setLevel(entry?.snapshot.level ?? "Chưa xác định");
    setMeaning(entry?.suggestedValue ?? "");
    setNote(entry?.note ?? "");
  }, [open, entry, initialWord]);

  async function handleSave() {
    if (!word.trim() || !meaning.trim()) return;
    setSaving(true);
    try {
      const normalizedWord = word.trim();
      const normalizedReading = reading.trim();
      const saved = await saveDataCorrection({
        id: entry?.id,
        entityId: entry?.entityId ?? `new-vocab:${normalizedWord}:${normalizedReading || "-"}`,
        snapshot: {
          word: normalizedWord,
          reading: normalizedReading || null,
          level,
          meaningVi: "",
          sources: ["Chưa phân loại nguồn"],
        },
        issueType: "add-new-vocab",
        suggestedValue: meaning,
        note,
      });
      onSaved(saved);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  const fieldClass =
    "h-10 w-full rounded-xl border border-neutral-300 bg-white px-3 text-sm text-neutral-700 outline-none focus:border-rose-400 focus:ring-2 focus:ring-rose-100";

  return (
    <FilterSheet open={open} onClose={onClose} title={entry ? `Sửa từ mới · ${entry.snapshot.word}` : "Đề xuất thêm từ vựng"}>
      <div className="rounded-xl border border-sky-100 bg-sky-50 p-3 text-sm leading-relaxed text-sky-800">
        Từ này được lưu vào danh sách góp ý với type <code className="rounded bg-white/70 px-1 py-0.5 text-xs">add-new-vocab</code>, chưa tự động thêm vào bộ dữ liệu học.
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="block">
          <span className="mb-1.5 flex items-center gap-2 text-xs font-semibold text-neutral-500">
            Từ vựng
            <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[10px] text-rose-600">Bắt buộc</span>
          </span>
          <div className="relative">
            <input value={word} onChange={(event) => setWord(event.target.value)} placeholder="例：見直す" className={`${fieldClass} pr-9`} />
            <Search size={15} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400" />
          </div>

          {debouncedWord.trim() ? (
            <div className={`mt-2 overflow-hidden rounded-xl border ${hasExactMatch ? "border-amber-200 bg-amber-50/60" : "border-neutral-200 bg-neutral-50/70"}`}>
              <div className={`flex items-center gap-2 px-3 py-2 text-xs font-semibold ${hasExactMatch ? "text-amber-800" : "text-neutral-600"}`}>
                {hasExactMatch ? <AlertTriangle size={14} /> : <CheckCircle2 size={14} className="text-emerald-500" />}
                {hasExactMatch
                  ? "Từ này có thể đã tồn tại trong dữ liệu"
                  : matches.length > 0
                    ? `${matches.length} kết quả gần khớp trong dữ liệu`
                    : "Chưa tìm thấy từ trùng trong dữ liệu"}
              </div>
              {matches.length > 0 ? (
                <div className="border-t border-black/5 bg-white">
                  {matches.map((item) => {
                    const query = debouncedWord.trim().toLowerCase();
                    const kana = isRomaji(query) ? toHiragana(query, { passRomaji: false }) : null;
                    const exact =
                      item.word.toLowerCase() === query ||
                      (item.reading ?? "").toLowerCase() === query ||
                      (kana !== null && item.reading === kana);
                    return (
                      <div key={item.id} className="flex items-start justify-between gap-3 border-b border-neutral-100 px-3 py-2.5 last:border-b-0">
                        <div className="min-w-0">
                          <div className="flex items-baseline gap-2">
                            <span className="font-semibold text-neutral-800">{item.word}</span>
                            {item.reading ? <span className="truncate text-xs text-neutral-400">{item.reading}</span> : null}
                          </div>
                          <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-neutral-500">{item.meaningVi}</p>
                        </div>
                        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${exact ? "bg-amber-100 text-amber-700" : "bg-neutral-100 text-neutral-500"}`}>
                          {exact ? "Trùng" : item.level}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        <label className="block">
          <span className="mb-1.5 flex items-center gap-2 text-xs font-semibold text-neutral-500">
            Cách đọc
            <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-medium text-neutral-500">Tùy chọn</span>
          </span>
          <input value={reading} onChange={(event) => setReading(event.target.value)} placeholder="みなおす" className={fieldClass} />
        </label>
      </div>

      <label className="block">
        <span className="mb-1.5 block text-xs font-semibold text-neutral-500">Cấp JLPT</span>
        <Select
          items={LEVELS.map((item) => ({ value: item, label: item }))}
          value={level}
          onValueChange={(value) => value !== null && setLevel(value)}
        >
          <SelectTrigger className="h-10 w-full rounded-xl shadow-none">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {LEVELS.map((item) => (
              <SelectItem key={item} value={item}>
                {item}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </label>

      <label className="block">
        <span className="mb-1.5 flex items-center gap-2 text-xs font-semibold text-neutral-500">
          Nghĩa tiếng Việt
          <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[10px] text-rose-600">Bắt buộc</span>
        </span>
        <textarea
          value={meaning}
          onChange={(event) => setMeaning(event.target.value)}
          rows={3}
          placeholder="Nhập một hoặc nhiều nghĩa cần bổ sung..."
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
          placeholder="Ngữ cảnh đã gặp, link từ điển hoặc ví dụ sử dụng..."
          className="w-full resize-y rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-700 outline-none focus:border-rose-400 focus:ring-2 focus:ring-rose-100"
        />
      </label>

      <Button className="w-full" disabled={!word.trim() || !meaning.trim() || saving} onClick={() => void handleSave()}>
        <Plus size={16} /> {saving ? "Đang lưu..." : entry ? "Lưu thay đổi" : "Lưu từ mới"}
      </Button>
    </FilterSheet>
  );
}
