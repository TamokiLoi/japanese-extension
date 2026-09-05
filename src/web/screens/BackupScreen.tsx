import { useRef, useState } from "react";
import { DatabaseBackup, Download, Upload, ShieldCheck } from "lucide-react";
import { Card } from "../components/ui/card.tsx";
import { exportBackupJson, importBackupJson, type ImportResult } from "../../popup/backupState.ts";

// Data lives only in this browser's local storage -- nothing is synced to
// an account, so switching browser/device/profile (or clearing site data)
// loses progress unless the user manually carries it over. Export bundles
// every known key into one JSON file the user can save anywhere (Drive,
// email to self, USB...); Import restores that same file's keys on another
// device's local storage, effectively a manual cross-device sync. This is
// its own top-level screen (not folded into Hướng dẫn) since it's an action
// a user comes here to *do*, not something they read.
export function BackupScreen() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function handleExport() {
    const json = await exportBackupJson();
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `nihongo-nin-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleImportFile(file: File) {
    setBusy(true);
    setMessage(null);
    try {
      const text = await file.text();
      const result: ImportResult = await importBackupJson(text);
      if (result.ok) {
        setMessage({ ok: true, text: `Đã khôi phục ${result.restoredKeys?.length ?? 0} mục dữ liệu. Đang tải lại trang để áp dụng...` });
        setTimeout(() => location.reload(), 1200);
      } else {
        setMessage({ ok: false, text: result.error ?? "Có lỗi xảy ra khi nhập dữ liệu." });
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl px-2.5 py-2 md:px-8 md:py-6">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px]" style={{ background: "#ffe4e6" }}>
          <DatabaseBackup size={20} className="text-rose-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-neutral-800">Sao lưu dữ liệu</h1>
          <p className="text-sm text-neutral-500">Chuyển toàn bộ tiến độ học sang máy hoặc trình duyệt khác</p>
        </div>
      </div>

      <div className="mt-4 flex items-start gap-2 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
        <ShieldCheck size={16} className="mt-0.5 shrink-0" />
        <div>
          Toàn bộ tiến độ (đã thuộc, cần ôn lại, streak, mục tiêu mỗi ngày, lịch sử đề thi...) chỉ lưu trên trình duyệt này -- mở app
          ở máy khác, trình duyệt khác, hoặc sau khi xóa dữ liệu trình duyệt sẽ không còn thấy. Xuất file ở đây rồi nhập lại ở nơi
          khác để mang tiến độ theo, không cần tài khoản.
        </div>
      </div>

      <div className="mt-6 flex flex-col gap-4">
        <Card className="gap-3 rounded-2xl border-neutral-200 p-5 ring-0">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-rose-50 text-rose-600">
              <Download size={17} />
            </span>
            <h2 className="font-semibold text-neutral-800">Xuất file sao lưu</h2>
          </div>
          <p className="ml-1 pl-4 text-sm text-neutral-600">Tải về 1 file JSON chứa toàn bộ tiến độ của máy/trình duyệt hiện tại.</p>
          <div className="ml-1 pl-4">
            <button
              onClick={handleExport}
              className="inline-flex items-center gap-1.5 rounded-full bg-rose-600 px-4 py-2 text-xs font-semibold text-white hover:bg-rose-700"
            >
              <Download size={14} /> Xuất file sao lưu
            </button>
          </div>
        </Card>

        <Card className="gap-3 rounded-2xl border-neutral-200 p-5 ring-0">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-rose-50 text-rose-600">
              <Upload size={17} />
            </span>
            <h2 className="font-semibold text-neutral-800">Nhập file sao lưu</h2>
          </div>
          <p className="ml-1 pl-4 text-sm text-neutral-600">
            Chọn file JSON đã xuất từ máy/trình duyệt khác để khôi phục tiến độ vào máy/trình duyệt này.
          </p>
          <div className="ml-1 pl-4">
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 px-4 py-2 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
            >
              <Upload size={14} /> Nhập file sao lưu
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) void handleImportFile(file);
              }}
            />
          </div>
          {message ? (
            <p className={`ml-1 pl-4 text-sm ${message.ok ? "text-emerald-600" : "text-rose-600"}`}>{message.text}</p>
          ) : null}
        </Card>
      </div>
    </div>
  );
}
