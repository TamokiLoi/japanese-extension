// Reuses the same spinner-ring + app logo look as index.html's static
// #splash screen (shown before React/Tailwind are even available, see the
// comments there) -- this is the equivalent for in-app loading, once a
// screen has already mounted but is still waiting on its own async
// storage/data read to resolve. One shared component instead of every
// screen re-typing a plain "Đang tải..." text guard, so the two loading
// moments (before mount, after mount) read as one continuous loading
// experience instead of a spinner-then-plain-text swap.
//
// Only meant for a screen's own top-level "nothing to render yet" guard
// (the `if (!state) return ...` pattern) -- a small inline loading note
// inside an already-rendered section (e.g. one card's data still
// streaming in) should stay plain text, a full logo spinner there would
// be oversized for what it's indicating.
export function LoadingScreen() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 p-6">
      <div className="relative flex h-14 w-14 items-center justify-center">
        <span className="absolute inset-0 animate-spin rounded-full border-[3px] border-rose-100 border-t-rose-600" />
        <span className="block h-9 w-9 overflow-hidden rounded-[10px]">
          <img src={`${import.meta.env.BASE_URL}icons/icon128.png`} alt="" className="block h-full w-full" />
        </span>
      </div>
      <p className="text-sm text-neutral-400">Đang tải...</p>
    </div>
  );
}
