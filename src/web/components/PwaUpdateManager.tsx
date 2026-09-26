import { useEffect, useState } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";

const UPDATE_CHECK_INTERVAL_MS = 30 * 60 * 1000;
const MIN_CHECK_GAP_MS = 60 * 1000;

/**
 * Keep checking while the app is open. The generated worker auto-activates;
 * pwa-update-migration.js reloads existing app tabs after an actual update.
 * This hook's reload callback is intentionally a no-op so there is only one
 * reload path, owned by the worker and available even to old cached shells.
 */
export function PwaUpdateManager() {
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null);

  useRegisterSW({
    onNeedReload() {
      // The service worker navigates clients after activation, including tabs
      // whose cached app code predates this component.
    },
    onRegisteredSW(_swUrl, registered) {
      setRegistration(registered ?? null);
    },
  });

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

  return null;
}
