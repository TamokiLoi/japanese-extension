import { ALL_JLPT_HISTORY, EXAM_PERIODS } from "../jlptHistoryState.ts";
import { expandToTabButtonHtml, wireExpandToTabButton } from "../tabMode.ts";
import type { JlptHistoryEntry } from "../../types/vocab.ts";

export function renderJlptHistoryScreen(app: HTMLElement, onBack: () => void) {
  paint(app, onBack, "all", "");
}

function paint(app: HTMLElement, onBack: () => void, period: string, query: string) {
  const q = query.trim().toLowerCase();
  const filtered = ALL_JLPT_HISTORY.filter((e) => {
    if (period !== "all" && e.year !== period) return false;
    if (!q) return true;
    return (
      e.word.toLowerCase().includes(q) ||
      e.readingOrSynonym.toLowerCase().includes(q) ||
      (e.meaningVi ?? "").toLowerCase().includes(q)
    );
  });

  app.innerHTML = `
    <header class="toolbar">
      <button id="back" class="icon-btn" title="Về menu">←</button>
      <span class="counter">${filtered.length} / ${ALL_JLPT_HISTORY.length}</span>
      ${expandToTabButtonHtml()}
    </header>

    <section class="jlpt-filter-row">
      <select id="period-filter">
        <option value="all" ${period === "all" ? "selected" : ""}>Tất cả kỳ thi</option>
        ${EXAM_PERIODS.map((p) => `<option value="${p}" ${p === period ? "selected" : ""}>${p}</option>`).join("")}
      </select>
      <input id="query-input" type="text" placeholder="Tìm từ, cách đọc, nghĩa..." value="${query.replace(/"/g, "&quot;")}" />
    </section>

    <main class="jlpt-list">
      ${
        filtered.length === 0
          ? `<p class="empty">Không tìm thấy từ nào.</p>`
          : filtered.map(renderEntry).join("")
      }
    </main>
  `;

  document.getElementById("back")!.addEventListener("click", onBack);
  wireExpandToTabButton("jlptHistory");

  document.getElementById("period-filter")!.addEventListener("change", (e) => {
    paint(app, onBack, (e.target as HTMLSelectElement).value, query);
  });

  const queryInput = document.getElementById("query-input") as HTMLInputElement;
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;
  queryInput.addEventListener("input", () => {
    clearTimeout(debounceTimer);
    const value = queryInput.value;
    debounceTimer = setTimeout(() => paint(app, onBack, period, value), 200);
  });
  // Re-focus + keep the caret at the end after a debounced repaint so
  // typing feels continuous instead of losing focus each keystroke.
  queryInput.focus();
  queryInput.setSelectionRange(queryInput.value.length, queryInput.value.length);
}

function renderEntry(e: JlptHistoryEntry): string {
  const occurrences = e.occurrences.length > 1 ? e.occurrences.join(", ") : "";
  return `
    <div class="jlpt-entry">
      <div class="jlpt-entry-word">${e.word}<span class="muted"> ${e.readingOrSynonym}</span></div>
      <div class="jlpt-entry-meaning">${e.meaningVi ?? "—"}</div>
      ${occurrences ? `<div class="jlpt-entry-occurrences">Xuất hiện: ${occurrences}</div>` : ""}
    </div>
  `;
}
