import { useEffect, useState } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";

const UPDATE_CHECK_INTERVAL_MS = 30 * 60 * 1000;
const MIN_CHECK_GAP_MS = 60 * 1000;

export function PwaUpdatePrompt() {
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null);
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_swUrl, registered) {
      setRegistration(registered ?? null);
    },
  });

  useEffect(() => {
    if (!registration) return;

    let lastCheckedAt = 0;
    const checkForUpdate = () => {
      if (!navigator.onLine || document.visibilityState === "hidden") return;

      // A worker may already be waiting when the app opens. Keep the update
      // action available even after the user postponed it earlier.
      if (registration.waiting && navigator.serviceWorker.controller) {
        setNeedRefresh(true);
        return;
      }

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
  }, [registration, setNeedRefresh]);

  if (!needRefresh) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed right-3 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] left-3 z-[35] rounded-2xl border border-rose-200 bg-white p-4 shadow-xl md:right-6 md:bottom-6 md:left-auto md:w-80"
    >
      <p className="text-sm font-bold text-neutral-800">Có phiên bản mới</p>
      <p className="mt-1 text-xs leading-relaxed text-neutral-600">Lưu bài đang làm rồi cập nhật để nhận nội dung mới nhất.</p>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={() => setNeedRefresh(false)}
          className="flex-1 rounded-lg border border-neutral-200 px-3 py-2 text-sm font-medium text-neutral-600"
        >
          Để sau
        </button>
        <button
          type="button"
          onClick={() => void updateServiceWorker(true)}
          className="flex-1 rounded-lg bg-rose-600 px-3 py-2 text-sm font-semibold text-white"
        >
          Cập nhật
        </button>
      </div>
    </div>
  );
}
