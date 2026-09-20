import { useRef, useState } from "react";
import { Cloud, CloudDownload, CloudUpload, DatabaseBackup, Download, Upload, ShieldCheck } from "lucide-react";
import { Card } from "../components/ui/card.tsx";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs.tsx";
import { exportBackupJson, importBackupJson, type ImportResult } from "../../popup/backupState.ts";
import { useConfirm } from "../components/ConfirmDialog.tsx";
import {
  googleDriveBackupErrorMessage,
  isGoogleDriveBackupConfigured,
  loadBackupFromGoogleDrive,
  saveBackupToGoogleDrive,
} from "../lib/googleDriveBackup.ts";

// Local storage remains the source of truth. Manual export/import moves the
// same JSON payload through a user-visible file; the optional Drive actions
// move it through the selected account's private appDataFolder instead. Both
// restore paths deliberately converge on importBackupJson so validation and
// the allowlisted storage keys cannot drift between the two mechanisms.
export function BackupScreen() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const confirm = useConfirm();
  const [busy, setBusy] = useState<"manual-import" | "drive-export" | "drive-import" | null>(null);
  const [exportMessage, setExportMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [importMessage, setImportMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [driveMessage, setDriveMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function handleExport() {
    setExportMessage(null);
    try {
      const json = await exportBackupJson();
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const now = new Date();
      const pad = (n: number) => String(n).padStart(2, "0");
      // Local time (not toISOString's UTC) so the stamp matches the clock the
      // user is looking at, and includes hour+minute so exporting more than
      // once in a day doesn't silently overwrite the previous download.
      const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
      const a = document.createElement("a");
      a.href = url;
      a.download = `nihongo-nin-backup-${stamp}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setExportMessage({ ok: true, text: "Đã xuất file sao lưu -- kiểm tra thư mục Downloads." });
    } catch {
      setExportMessage({ ok: false, text: "Có lỗi xảy ra khi xuất file." });
    }
  }

  async function handleImportFile(file: File) {
    setBusy("manual-import");
    setImportMessage(null);
    try {
      const text = await file.text();
      const result: ImportResult = await importBackupJson(text);
      if (result.ok) {
        setImportMessage({ ok: true, text: `Đã khôi phục ${result.restoredKeys?.length ?? 0} mục dữ liệu. Đang tải lại trang để áp dụng...` });
        setTimeout(() => location.reload(), 1200);
      } else {
        setImportMessage({ ok: false, text: result.error ?? "Có lỗi xảy ra khi nhập dữ liệu." });
      }
    } finally {
      setBusy(null);
    }
  }

  async function handleDriveExport() {
    setBusy("drive-export");
    setDriveMessage(null);
    try {
      const json = await exportBackupJson();
      const file = await saveBackupToGoogleDrive(json);
      const time = file.modifiedTime ? new Date(file.modifiedTime).toLocaleString("vi-VN") : "vừa xong";
      setDriveMessage({ ok: true, text: `Đã sao lưu lên Google Drive lúc ${time}.` });
    } catch (error) {
      setDriveMessage({ ok: false, text: googleDriveBackupErrorMessage(error) });
    } finally {
      setBusy(null);
    }
  }

  async function handleDriveImport() {
    const accepted = await confirm({
      title: "Khôi phục từ Google Drive?",
      message:
        "Dữ liệu trong bản sao lưu sẽ ghi đè các mục tương ứng trên trình duyệt này. Dữ liệu hiện tại không có trong bản sao lưu sẽ được giữ nguyên.",
      confirmLabel: "Khôi phục",
    });
    if (!accepted) return;

    setBusy("drive-import");
    setDriveMessage(null);
    try {
      const { json, file } = await loadBackupFromGoogleDrive();
      const result = await importBackupJson(json);
      if (!result.ok) {
        setDriveMessage({ ok: false, text: result.error ?? "Bản sao lưu trên Drive không hợp lệ." });
        return;
      }
      const time = file.modifiedTime ? new Date(file.modifiedTime).toLocaleString("vi-VN") : "không rõ thời gian";
      setDriveMessage({
        ok: true,
        text: `Đã khôi phục ${result.restoredKeys?.length ?? 0} mục từ bản sao lưu ${time}. Đang tải lại trang...`,
      });
      setTimeout(() => location.reload(), 1200);
    } catch (error) {
      setDriveMessage({ ok: false, text: googleDriveBackupErrorMessage(error) });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-2.5 py-2 md:px-8 md:py-6">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px]" style={{ background: "#ffe4e6" }}>
          <DatabaseBackup size={20} className="text-rose-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-neutral-800">Sao lưu dữ liệu</h1>
          <p className="text-sm text-neutral-500">Chuyển toàn bộ tiến độ học sang máy hoặc trình duyệt khác</p>
        </div>
      </div>

      <Tabs defaultValue="offline" className="mt-5 gap-5">
        <TabsList className="h-11 w-full max-w-md rounded-xl bg-neutral-100 p-1">
          <TabsTrigger value="offline" className="h-full rounded-lg px-4 data-active:bg-white data-active:text-rose-600">
            <Download size={15} /> Offline
          </TabsTrigger>
          <TabsTrigger value="online" className="h-full rounded-lg px-4 data-active:bg-white data-active:text-sky-700">
            <Cloud size={15} /> Online
          </TabsTrigger>
        </TabsList>

        <TabsContent value="offline">
          <div className="mb-4 flex items-start gap-2 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
            <ShieldCheck size={16} className="mt-0.5 shrink-0" />
            <div>
              Đây là cách sao lưu mặc định. Dữ liệu chỉ được xuất thành file JSON trên thiết bị và không gửi đến dịch vụ bên ngoài.
            </div>
          </div>

          <div className="flex flex-col gap-4">
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
              {exportMessage ? (
                <p className={`ml-1 pl-4 text-sm ${exportMessage.ok ? "text-emerald-600" : "text-rose-600"}`}>{exportMessage.text}</p>
              ) : null}
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
                  disabled={busy !== null}
                  className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 px-4 py-2 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
                >
                  <Upload size={14} /> {busy === "manual-import" ? "Đang nhập..." : "Nhập file sao lưu"}
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
              {importMessage ? (
                <p className={`ml-1 pl-4 text-sm ${importMessage.ok ? "text-emerald-600" : "text-rose-600"}`}>{importMessage.text}</p>
              ) : null}
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="online">
          <div className="mb-4 flex items-start gap-2 rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-800">
            <ShieldCheck size={16} className="mt-0.5 shrink-0" />
            <div>
              Tính năng thử nghiệm dành cho tài khoản được cấp quyền. Nihongo Nin không tự đồng bộ nền và không đọc các file Drive khác.
            </div>
          </div>

          <Card className="gap-3 rounded-2xl border-sky-200 bg-sky-50/40 p-5 ring-0">
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sky-100 text-sky-700">
                <Cloud size={17} />
              </span>
              <div>
                <h2 className="font-semibold text-neutral-800">Sao lưu bằng Google Drive</h2>
                <p className="text-xs text-neutral-500">Dùng cùng một tài khoản Google để chuyển tiến độ giữa các thiết bị</p>
              </div>
            </div>
            <p className="ml-1 pl-4 text-sm text-neutral-600">
              Google sẽ yêu cầu chọn tài khoản và cấp quyền quản lý riêng dữ liệu do Nihongo Nin tạo. Bản sao lưu nằm trong vùng ẩn
              của ứng dụng; app không thể xem các file Drive khác.
            </p>
            <div className="ml-1 flex flex-wrap gap-2 pl-4">
              <button
                onClick={() => void handleDriveExport()}
                disabled={busy !== null || !isGoogleDriveBackupConfigured()}
                className="inline-flex items-center gap-1.5 rounded-full bg-sky-600 px-4 py-2 text-xs font-semibold text-white hover:bg-sky-700 disabled:opacity-50"
              >
                <CloudUpload size={14} /> {busy === "drive-export" ? "Đang sao lưu..." : "Sao lưu lên Drive"}
              </button>
              <button
                onClick={() => void handleDriveImport()}
                disabled={busy !== null || !isGoogleDriveBackupConfigured()}
                className="inline-flex items-center gap-1.5 rounded-full border border-sky-200 bg-white px-4 py-2 text-xs font-semibold text-sky-700 hover:bg-sky-50 disabled:opacity-50"
              >
                <CloudDownload size={14} /> {busy === "drive-import" ? "Đang khôi phục..." : "Khôi phục từ Drive"}
              </button>
            </div>
            {!isGoogleDriveBackupConfigured() ? (
              <p className="ml-1 pl-4 text-sm text-amber-700">Bản build này chưa có Google OAuth Client ID.</p>
            ) : null}
            {driveMessage ? (
              <p className={`ml-1 pl-4 text-sm ${driveMessage.ok ? "text-emerald-600" : "text-rose-600"}`}>{driveMessage.text}</p>
            ) : null}
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
