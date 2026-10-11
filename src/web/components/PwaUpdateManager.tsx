import { useEffect, useState } from "react";
import { RefreshCw, WifiOff } from "lucide-react";
import { useRegisterSW } from "virtual:pwa-register/react";

const UPDATE_CHECK_INTERVAL_MS = 30 * 60 * 1000;
const MIN_CHECK_GAP_MS = 60 * 1000;

/**
 * Check for updates while the app is open, but leave activation and reload to
 * the user so an update cannot unexpectedly interrupt a study session.
 */
export function PwaUpdateManager() {
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null);
  const { needRefresh: [needRefresh], updateServiceWorker } = useRegisterSW({
    onRegisteredSW(_swUrl, registered) {
      setRegistration(registered ?? null);
    },
  });
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  const [dismissedUpdate, setDismissedUpdate] = useState(false);
  const [applyingUpdate, setApplyingUpdate] = useState(false);

  useEffect(() => {
    const goOnline = () => setIsOnline(true);
    const goOffline = () => setIsOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  useEffect(() => {
    if (!registration) return;

    let lastCheckedAt = 0;
    const checkForUpdate = () => {
      if (!navigator.onLine || document.visibilityState === "hidden") return;
      const now = Date.now();
      if (now - lastCheckedAt < MIN_CHECK_GAP_MS) return;
      lastCheckedAt = now;
      void registration.update().catch(() => {
        // Offline/network failures should not interrupt a study session.
      });
    };

    checkForUpdate();
    window.addEventListener("focus", checkForUpdate);
    document.addEventListener("visibilitychange", checkForUpdate);
    const intervalId = window.setInterval(checkForUpdate, UPDATE_CHECK_INTERVAL_MS);
    return () => {
      window.removeEventListener("focus", checkForUpdate);
      document.removeEventListener("visibilitychange", checkForUpdate);
      window.clearInterval(intervalId);
    };
  }, [registration]);

  const showUpdate = needRefresh && !dismissedUpdate;
  if (isOnline && !showUpdate) return null;

  return (
    <aside
      aria-live="polite"
      className="fixed inset-x-3 top-[4.5rem] z-[60] mx-auto max-w-md rounded-2xl border border-neutral-200 bg-white p-3 shadow-xl md:inset-x-auto md:top-auto md:right-5 md:bottom-5"
    >
      {!isOnline ? (
        <div className="flex items-start gap-2.5">
          <WifiOff size={17} className="mt-0.5 shrink-0 text-amber-700" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-neutral-800">Đang ngoại tuyến</p>
            <p className="mt-0.5 text-xs leading-relaxed text-neutral-500">
              Phần giao diện đã lưu có thể mở được. Bài học hoặc audio chưa tải trước có thể cần kết nối mạng.
            </p>
          </div>
        </div>
      ) : null}

      {showUpdate ? (
        <div className={`flex items-start gap-2.5 ${!isOnline ? "mt-3 border-t border-neutral-100 pt-3" : ""}`}>
          <RefreshCw size={17} className="mt-0.5 shrink-0 text-rose-600" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-neutral-800">Có bản cập nhật mới</p>
            <p className="mt-0.5 text-xs text-neutral-500">Bạn có thể cập nhật sau khi kết thúc câu hỏi hoặc phiên học.</p>
            <div className="mt-2.5 flex gap-2">
              <button
                type="button"
                disabled={applyingUpdate || !isOnline}
                onClick={async () => {
                  setApplyingUpdate(true);
                  await updateServiceWorker(true);
                }}
                className="rounded-full bg-rose-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-60"
              >
                {applyingUpdate ? "Đang cập nhật…" : "Cập nhật"}
              </button>
              <button type="button" onClick={() => setDismissedUpdate(true)} className="rounded-full border border-neutral-200 px-3.5 py-1.5 text-xs font-semibold text-neutral-600 hover:bg-neutral-50">
                Để sau
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </aside>
  );
}
