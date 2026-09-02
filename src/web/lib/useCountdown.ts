import { useEffect, useRef, useState } from "react";

// Ticks once a second toward an absolute deadline (not a "seconds
// remaining" counter someone could pause by backgrounding the tab) --
// resuming after a reload still counts down from the real deadline.
// Calls onExpire() exactly once when the deadline passes.
export function useCountdown(deadlineAt: number, onExpire: () => void) {
  const [remainingMs, setRemainingMs] = useState(() => Math.max(0, deadlineAt - Date.now()));
  const expiredRef = useRef(false);
  const onExpireRef = useRef(onExpire);
  onExpireRef.current = onExpire;

  useEffect(() => {
    expiredRef.current = false;

    function tick() {
      const remaining = Math.max(0, deadlineAt - Date.now());
      setRemainingMs(remaining);
      if (remaining <= 0 && !expiredRef.current) {
        expiredRef.current = true;
        onExpireRef.current();
      }
    }

    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [deadlineAt]);

  const totalSeconds = Math.floor(remainingMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const label = `${minutes}:${String(seconds).padStart(2, "0")}`;

  return { remainingMs, totalSeconds, label, isLow: totalSeconds <= 300 };
}
