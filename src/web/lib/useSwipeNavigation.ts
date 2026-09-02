import { useRef } from "react";

// Left/right swipe -> prev/next, for screens that step through an ordered
// list (Quiz's question play view is the first user; flashcard-style
// screens like Vocab/Kanji could reuse it the same way later). Returns
// touch handlers to spread onto the swipeable container.
//
// Deliberately simple threshold-based detection rather than a gesture
// library: only cares about "was this a mostly-horizontal, reasonably fast
// drag", which a handful of touch coordinates is enough to answer. A slow
// drag or a mostly-vertical one (the user scrolling the page) is ignored so
// it doesn't fight normal scrolling.
const MIN_DISTANCE_PX = 60;
const MAX_VERTICAL_RATIO = 0.5; // vertical drift allowed, relative to horizontal distance
const MAX_DURATION_MS = 700;

// A touch starting this close to the left/right screen edge is left alone
// entirely -- that's the hit zone mobile browsers/OSes (Android Chrome,
// iOS Safari) reserve for their own "swipe from edge to go back/forward"
// gesture, which now also drives real in-app screen navigation (see
// WebApp.tsx's hashchange listener). Without this, swiping near the edge
// to change question could get intercepted as the system gesture instead
// and back out of Quiz entirely.
const EDGE_EXCLUSION_PX = 24;

export function useSwipeNavigation({ onSwipeLeft, onSwipeRight }: { onSwipeLeft: () => void; onSwipeRight: () => void }) {
  const start = useRef<{ x: number; y: number; t: number } | null>(null);

  return {
    onTouchStart(e: React.TouchEvent) {
      const t = e.touches[0];
      if (t.clientX < EDGE_EXCLUSION_PX || t.clientX > window.innerWidth - EDGE_EXCLUSION_PX) {
        start.current = null;
        return;
      }
      start.current = { x: t.clientX, y: t.clientY, t: Date.now() };
    },
    onTouchEnd(e: React.TouchEvent) {
      const begin = start.current;
      start.current = null;
      if (!begin) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - begin.x;
      const dy = t.clientY - begin.y;
      const elapsed = Date.now() - begin.t;
      if (elapsed > MAX_DURATION_MS) return;
      if (Math.abs(dx) < MIN_DISTANCE_PX) return;
      if (Math.abs(dy) > Math.abs(dx) * MAX_VERTICAL_RATIO) return;
      if (dx < 0) onSwipeLeft();
      else onSwipeRight();
    },
  };
}
