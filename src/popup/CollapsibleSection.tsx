import { useState } from "react";

// Wraps a filter section (level-selector, quiz-setup, progress-filter-row)
// so it can be collapsed to save vertical space -- state is local and
// resets on remount (no persistence to *ViewerState/storage; this is pure
// UI chrome, not app state).
export function CollapsibleSection({
  title,
  summary,
  defaultOpen = false,
  className,
  children,
}: {
  title: string;
  summary?: React.ReactNode;
  defaultOpen?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="collapsible-section">
      <button type="button" className="collapsible-header" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span className="collapsible-chevron">{open ? "▾" : "▸"}</span>
        <span className="collapsible-title">{title}</span>
        {!open && summary ? <span className="collapsible-summary">{summary}</span> : null}
      </button>
      {open ? <div className={className}>{children}</div> : null}
    </section>
  );
}
