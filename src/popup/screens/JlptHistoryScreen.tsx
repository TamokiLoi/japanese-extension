import { useMemo, useState } from "react";
import { ALL_JLPT_HISTORY, EXAM_PERIODS } from "../jlptHistoryState.ts";
import { ExpandTabButton } from "../TabMode.tsx";
import { useDebouncedValue } from "../useDebouncedValue.ts";
import type { JlptHistoryEntry } from "../../types/vocab.ts";

export function JlptHistoryScreen({ onBack }: { onBack: () => void }) {
  const [period, setPeriod] = useState("all");
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebouncedValue(query, 200);

  const q = debouncedQuery.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      ALL_JLPT_HISTORY.filter((e) => {
        if (period !== "all" && e.year !== period) return false;
        if (!q) return true;
        return (
          e.word.toLowerCase().includes(q) ||
          e.readingOrSynonym.toLowerCase().includes(q) ||
          (e.meaningVi ?? "").toLowerCase().includes(q)
        );
      }),
    [period, q],
  );

  return (
    <>
      <header className="toolbar">
        <button className="icon-btn" title="Về menu" onClick={onBack}>
          ←
        </button>
        <span className="counter">
          {filtered.length} / {ALL_JLPT_HISTORY.length}
        </span>
        <ExpandTabButton screenHash="jlptHistory" />
      </header>

      <section className="jlpt-filter-row">
        <select value={period} onChange={(e) => setPeriod(e.target.value)}>
          <option value="all">Tất cả kỳ thi</option>
          {EXAM_PERIODS.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <input
          type="text"
          placeholder="Tìm từ, cách đọc, nghĩa..."
          value={query}
          autoFocus
          onChange={(e) => setQuery(e.target.value)}
        />
      </section>

      <main className="jlpt-list">
        {filtered.length === 0 ? (
          <p className="empty">Không tìm thấy từ nào.</p>
        ) : (
          filtered.map((e, i) => <JlptHistoryRow key={`${e.word}-${i}`} e={e} />)
        )}
      </main>
    </>
  );
}

function JlptHistoryRow({ e }: { e: JlptHistoryEntry }) {
  const occurrences = e.occurrences.length > 1 ? e.occurrences.join(", ") : "";
  return (
    <div className="jlpt-entry">
      <div className="jlpt-entry-word">
        {e.word}
        <span className="muted"> {e.readingOrSynonym}</span>
      </div>
      <div className="jlpt-entry-meaning">{e.meaningVi ?? "—"}</div>
      {occurrences ? <div className="jlpt-entry-occurrences">Xuất hiện: {occurrences}</div> : null}
    </div>
  );
}
