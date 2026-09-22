import { useEffect, useState } from "react";
import { Check, DatabaseZap, Download, Pencil, Plus, Settings, Trash2 } from "lucide-react";
import type { Screen } from "../../popup/App.tsx";
import { NAV_ITEMS } from "../navItems.ts";
import { BOTTOM_NAV_CHOICES } from "../lib/bottomNavSettings.ts";
import {
  deleteDataCorrection,
  exportDataCorrectionsJson,
  loadDataCorrections,
  setDataCorrectionStatus,
  type DataCorrectionEntry,
} from "../../popup/dataCorrectionState.ts";
import { CorrectionEditorSheet, CORRECTION_ISSUE_LABELS } from "../components/CorrectionEditorSheet.tsx";
import { NewVocabCorrectionSheet } from "../components/NewVocabCorrectionSheet.tsx";
import { Button } from "../components/ui/button.tsx";
import { useConfirm } from "../components/ConfirmDialog.tsx";

export function SettingsScreen({
  shortcuts,
  onChange,
}: {
  shortcuts: Screen[];
  onChange: (shortcuts: Screen[]) => void;
}) {
  const confirm = useConfirm();
  const [corrections, setCorrections] = useState<DataCorrectionEntry[]>([]);
  const [editing, setEditing] = useState<DataCorrectionEntry | null>(null);
  const [newVocabOpen, setNewVocabOpen] = useState(false);
  const [editingNewVocab, setEditingNewVocab] = useState<Extract<DataCorrectionEntry, { entityType: "vocab" }> | null>(null);

  useEffect(() => {
    void loadDataCorrections().then(setCorrections);
  }, []);

  function changeSlot(index: number, screen: Screen) {
    const next = [...shortcuts];
    next[index] = screen;
    onChange(next);
  }

  async function refreshCorrections() {
    setCorrections(await loadDataCorrections());
  }

  async function handleExport() {
    const json = await exportDataCorrectionsJson();
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `nihongo-nin-data-corrections-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function handleDelete(entry: DataCorrectionEntry) {
    const accepted = await confirm({
      title: "Xoá góp ý dữ liệu?",
      message: `Góp ý cho “${entry.entityType === "grammar" ? entry.snapshot.pattern : entry.snapshot.word}” sẽ bị xoá khỏi trình duyệt này.`,
      confirmLabel: "Xoá",
    });
    if (!accepted) return;
    await deleteDataCorrection(entry.id);
    await refreshCorrections();
  }

  return (
    <div className="mx-auto max-w-3xl px-3 py-3 md:px-8 md:py-6">
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-rose-100 text-rose-600">
          <Settings size={21} />
        </span>
        <div>
          <h1 className="text-2xl font-bold text-neutral-800">Cài đặt</h1>
          <p className="text-sm text-neutral-500">Điều hướng và dữ liệu cá nhân trên trình duyệt</p>
        </div>
      </div>

      <section className="mt-5 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm md:p-5">
        <h2 className="font-semibold text-neutral-800">Ba lối tắt ở giữa</h2>
        <p className="mt-1 text-sm text-neutral-500">
          Trang chủ và Tra cứu luôn được giữ cố định ở hai đầu. Mỗi mục bên dưới phải khác nhau.
        </p>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {shortcuts.map((selected, index) => {
            const selectedItem = NAV_ITEMS.find((item) => item.screen === selected)!;
            const Icon = selectedItem.icon;
            return (
              <label key={index} className="rounded-xl border border-neutral-200 bg-neutral-50 p-3">
                <span className="mb-2 flex items-center gap-2 text-xs font-semibold text-neutral-500">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-rose-100 text-rose-600">
                    <Icon size={16} />
                  </span>
                  Vị trí {index + 1}
                </span>
                <select
                  value={selected}
                  onChange={(event) => changeSlot(index, event.target.value as Screen)}
                  className="h-10 w-full rounded-lg border border-neutral-300 bg-white px-2.5 text-sm font-medium text-neutral-700 outline-none focus:border-rose-400 focus:ring-2 focus:ring-rose-100"
                >
                  {BOTTOM_NAV_CHOICES.map((screen) => {
                    const item = NAV_ITEMS.find((navItem) => navItem.screen === screen)!;
                    return (
                      <option key={screen} value={screen} disabled={screen !== selected && shortcuts.includes(screen)}>
                        {item.label}
                      </option>
                    );
                  })}
                </select>
              </label>
            );
          })}
        </div>

        <div className="mt-4 flex items-center gap-2 text-sm text-emerald-600">
          <Check size={16} />
          Thay đổi được lưu tự động trên trình duyệt này.
        </div>
      </section>

      <section className="mt-5 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm md:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
              <DatabaseZap size={18} />
            </span>
            <div>
              <h2 className="font-semibold text-neutral-800">Góp ý dữ liệu</h2>
              <p className="mt-0.5 text-sm text-neutral-500">
                {corrections.length > 0
                  ? `${corrections.filter((entry) => entry.status === "open").length} chưa xử lý · ${corrections.length} tổng cộng`
                  : "Các nghĩa sai hoặc nghĩa cần bổ sung sẽ xuất hiện tại đây."}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setNewVocabOpen(true)}>
              <Plus size={15} /> Thêm từ mới
            </Button>
            <Button variant="outline" disabled={corrections.length === 0} onClick={() => void handleExport()}>
              <Download size={15} /> Xuất JSON
            </Button>
          </div>
        </div>

        {corrections.length === 0 ? (
          <div className="mt-4 rounded-xl border border-dashed border-neutral-200 bg-neutral-50 px-4 py-6 text-center text-sm text-neutral-400">
            Mở một thẻ Từ vựng hoặc Ngữ pháp và bấm biểu tượng góp ý để ghi nhận dữ liệu cần sửa.
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            {corrections.map((entry) => (
              <article key={entry.id} className={`rounded-xl border p-3 ${entry.status === "applied" ? "border-emerald-200 bg-emerald-50/50" : "border-amber-200 bg-amber-50/50"}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold text-neutral-800">{entry.entityType === "grammar" ? entry.snapshot.pattern : entry.snapshot.word}</span>
                      {entry.entityType === "vocab" && entry.snapshot.reading ? <span className="text-xs text-neutral-500">{entry.snapshot.reading}</span> : null}
                      <span className="rounded-full bg-white/80 px-2 py-0.5 text-[10px] font-semibold text-neutral-500">
                        {entry.entityType === "grammar" ? "Ngữ pháp" : "Từ vựng"}
                      </span>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${entry.status === "applied" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                        {entry.status === "applied" ? "Đã xử lý" : "Chưa xử lý"}
                      </span>
                    </div>
                    <div className="mt-1 text-xs font-semibold text-amber-700">{CORRECTION_ISSUE_LABELS[entry.issueType]}</div>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <button
                      onClick={() => (entry.entityType === "vocab" && entry.issueType === "add-new-vocab" ? setEditingNewVocab(entry) : setEditing(entry))}
                      title="Sửa góp ý"
                      className="rounded-lg p-1.5 text-neutral-400 hover:bg-white hover:text-neutral-700"
                    >
                      <Pencil size={14} />
                    </button>
                    <button onClick={() => void handleDelete(entry)} title="Xoá góp ý" className="rounded-lg p-1.5 text-neutral-400 hover:bg-white hover:text-rose-600">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                <div className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
                  <div className="rounded-lg bg-white/70 p-2.5">
                    <div className="text-[10px] font-semibold tracking-wide text-neutral-400 uppercase">Dữ liệu hiện tại</div>
                    <div className="mt-1 text-neutral-600">
                      {entry.issueType === "add-new-vocab" ? "Chưa có trong dữ liệu" : entry.snapshot.meaningVi || "—"}
                    </div>
                  </div>
                  <div className="rounded-lg bg-white/70 p-2.5">
                    <div className="text-[10px] font-semibold tracking-wide text-neutral-400 uppercase">
                      {entry.issueType === "add-new-vocab" ? "Nghĩa đề xuất" : "Đề xuất"}
                    </div>
                    <div className="mt-1 whitespace-pre-wrap text-neutral-800">{entry.suggestedValue}</div>
                  </div>
                </div>
                {entry.snapshot.level ? <div className="mt-2 text-xs text-neutral-500">Cấp JLPT: {entry.snapshot.level}</div> : null}
                {entry.note ? <div className="mt-2 text-xs text-neutral-500">Ghi chú: {entry.note}</div> : null}
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                  <div className="text-[11px] text-neutral-400">Nguồn: {entry.snapshot.sources.join(" · ")}</div>
                  <button
                    onClick={async () => {
                      await setDataCorrectionStatus(entry.id, entry.status === "open" ? "applied" : "open");
                      await refreshCorrections();
                    }}
                    className="text-xs font-semibold text-emerald-700 hover:underline"
                  >
                    {entry.status === "open" ? "Đánh dấu đã xử lý" : "Mở lại góp ý"}
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {editing ? (
        <CorrectionEditorSheet
          open
          onClose={() => setEditing(null)}
          entityId={editing.entityId}
          snapshot={editing.snapshot}
          entry={editing}
          onSaved={() => void refreshCorrections()}
        />
      ) : null}

      <NewVocabCorrectionSheet
        open={newVocabOpen}
        onClose={() => setNewVocabOpen(false)}
        onSaved={() => void refreshCorrections()}
      />

      {editingNewVocab ? (
        <NewVocabCorrectionSheet
          open
          entry={editingNewVocab}
          onClose={() => setEditingNewVocab(null)}
          onSaved={() => void refreshCorrections()}
        />
      ) : null}
    </div>
  );
}
