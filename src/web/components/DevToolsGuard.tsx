import { useEffect, useRef, useState, type ReactNode } from "react";
import { ShieldAlert } from "lucide-react";

// Deters casual users from opening DevTools to view source / copy quiz
// questions. Modern Chrome does NOT let JS preventDefault() the F12 keydown
// itself (that's handled natively before scripts see it), so this can't
// literally "block the key" -- instead it detects that DevTools is open by
// two independent signals and shows a warning screen while it stays open.
// This is a speed bump for non-technical users, not a real security
// boundary.
//
// Plain window resizing (dragging the edge, snapping to half-screen) does
// NOT trip the size check: outerWidth/innerWidth shrink together since the
// browser chrome they straddle stays a near-constant pixel width, so the
// diff stays flat regardless of window size -- only DevTools actually
// carving out part of the window moves it past the threshold.
const SIZE_THRESHOLD_PX = 160;
const DEBUGGER_PAUSE_THRESHOLD_MS = 100;
const POLL_MS = 500;
const REQUIRED_HITS = 2; // guards the resize check against a single mid-drag animation frame misreporting the diff

function isDevToolsOpenBySize(): boolean {
  return window.outerWidth - window.innerWidth > SIZE_THRESHOLD_PX || window.outerHeight - window.innerHeight > SIZE_THRESHOLD_PX;
}

// Catches DevTools undocked into its own separate window, where the size
// check above sees nothing (the page's own window never changes shape).
// `debugger` only pauses execution while DevTools is attached to this tab,
// docked or not -- if it's open, this call blocks right here until the user
// hits Resume in the Sources panel, so a large elapsed time means DevTools
// is open. The freeze *is* the detection, not a side effect to avoid --
// which is exactly why the whole guard is skipped in dev mode below, so it
// never gets in the way of debugging the app itself locally.
function isDevToolsOpenByPause(): boolean {
  const start = performance.now();
  debugger;
  return performance.now() - start > DEBUGGER_PAUSE_THRESHOLD_MS;
}

export function DevToolsGuard({ children }: { children: ReactNode }) {
  const [blocked, setBlocked] = useState(false);
  const consecutiveHits = useRef(0);

  useEffect(() => {
    // `npm run dev` only -- never true for `vite build` (the LAN preview
    // server and the real GitHub Pages deploy both run the built output),
    // so this only disables the guard for local development, not for the
    // phone-testing LAN server.
    if (import.meta.env.DEV) return;
    const check = () => {
      if (isDevToolsOpenBySize() || isDevToolsOpenByPause()) {
        consecutiveHits.current += 1;
        if (consecutiveHits.current >= REQUIRED_HITS) setBlocked(true);
      } else {
        consecutiveHits.current = 0;
        setBlocked(false);
      }
    };
    check();
    const interval = setInterval(check, POLL_MS);
    window.addEventListener("resize", check);
    return () => {
      clearInterval(interval);
      window.removeEventListener("resize", check);
    };
  }, []);

  if (blocked) return <DevToolsWarning />;
  return <>{children}</>;
}

// No dismiss button on purpose -- the poll in the effect above flips
// `blocked` back to false on its own (within ~1s) once the user actually
// closes DevTools, so this only needs to explain what to do, not offer a
// way out.
function DevToolsWarning() {
  return (
    <div className="fixed inset-0 z-9999 flex flex-col items-center justify-center gap-4 bg-white px-6 text-center">
      <ShieldAlert className="h-14 w-14 text-rose-600" strokeWidth={1.5} />
      <h1 className="text-xl font-bold text-neutral-800">Vui lòng đóng DevTools</h1>
      <p className="max-w-sm text-sm text-neutral-500">
        Công cụ dành cho nhà phát triển (F12 / Inspect) đang mở. Hãy đóng nó lại để tiếp tục sử dụng Nihongo Nin — trang sẽ tự động hiện lại ngay khi bạn đóng.
      </p>
    </div>
  );
}
