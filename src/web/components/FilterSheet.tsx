import { useEffect } from "react";
import { X } from "lucide-react";

// Mobile: slides up as a bottom sheet. Desktop (sm+): centered dialog.
// Filters apply live (same as the pre-existing chip-row behavior), so
// there's no separate "Apply" step -- only an optional reset.
export function FilterSheet({
  open,
  onClose,
  title,
  children,
  onReset,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  onReset?: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="absolute inset-x-0 bottom-0 max-h-[80vh] overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:top-1/2 sm:left-1/2 sm:inset-x-auto sm:bottom-auto sm:w-full sm:max-w-md sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl">
        <div className="mx-auto mb-3 h-1 w-9 rounded-full bg-neutral-200 sm:hidden" />
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-neutral-800">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Đóng bộ lọc"
            className="rounded-lg p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600"
          >
            <X size={18} />
          </button>
        </div>
        <div className="mt-4 space-y-5">{children}</div>
        {onReset ? (
          <button onClick={onReset} className="mt-5 text-sm font-medium text-rose-600 hover:underline">
            Đặt lại bộ lọc
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function FilterGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-2 text-xs font-semibold tracking-wide text-neutral-400 uppercase">{title}</div>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

export function FilterChipOption({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full border px-3 py-1.5 text-xs font-medium ${
        active ? "border-rose-300 bg-rose-50 text-rose-600" : "border-neutral-200 text-neutral-500 hover:bg-neutral-50"
      }`}
    >
      {label}
    </button>
  );
}
