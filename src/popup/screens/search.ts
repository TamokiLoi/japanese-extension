import { ALL_KANJI } from "../kanjiState.ts";
import { ALL_VOCAB } from "../vocabState.ts";
import { expandToTabButtonHtml, wireExpandToTabButton } from "../tabMode.ts";
import { levelDotHtml } from "../levelColors.ts";
import type { JlptLevel } from "../../types/kanji.ts";

const MAX_RESULTS = 40;

interface SearchResult {
  kind: "kanji" | "vocab";
  id: string;
  level: JlptLevel;
  primary: string;
  secondary: string;
  meaning: string;
}

function searchKanji(q: string): SearchResult[] {
  return ALL_KANJI.filter(
    (k) =>
      q.includes(k.character) ||
      k.hanViet.some((h) => h.toLowerCase().includes(q)) ||
      k.meanings.vi.some((m) => m.toLowerCase().includes(q)) ||
      (k.meanings.viDraft ?? []).some((m) => m.toLowerCase().includes(q)) ||
      k.meanings.en.some((m) => m.toLowerCase().includes(q)) ||
      k.readings.on.some((r) => r.includes(q)) ||
      k.readings.kun.some((r) => r.includes(q)),
  ).map((k) => ({
    kind: "kanji" as const,
    id: k.id,
    level: k.level,
    primary: k.character,
    secondary: k.hanViet.join(", "),
    meaning: k.meanings.vi[0] ?? k.meanings.viDraft?.[0] ?? k.meanings.en[0] ?? "",
  }));
}

function searchVocab(q: string): SearchResult[] {
  return ALL_VOCAB.filter(
    (v) =>
      v.word.toLowerCase().includes(q) ||
      (v.reading ?? "").toLowerCase().includes(q) ||
      v.meaningVi.toLowerCase().includes(q) ||
      v.hanViet.some((h) => h.toLowerCase().includes(q)),
  ).map((v) => ({
    kind: "vocab" as const,
    id: v.id,
    level: v.level,
    primary: v.word,
    secondary: v.reading ?? "",
    meaning: v.meaningVi,
  }));
}

export function renderSearchScreen(
  app: HTMLElement,
  onBack: () => void,
  onOpenKanji: (kanjiId: string) => void,
  onOpenVocab: (vocabId: string) => void,
) {
  paint(app, onBack, onOpenKanji, onOpenVocab, "");
}

function paint(
  app: HTMLElement,
  onBack: () => void,
  onOpenKanji: (kanjiId: string) => void,
  onOpenVocab: (vocabId: string) => void,
  query: string,
) {
  const q = query.trim().toLowerCase();
  const results = q ? [...searchKanji(q), ...searchVocab(q)].slice(0, MAX_RESULTS) : [];

  app.innerHTML = `
    <header class="toolbar">
      <button id="back" class="icon-btn" title="Về menu">←</button>
      <span class="counter">${q ? `${results.length} kết quả` : "Tra cứu"}</span>
      ${expandToTabButtonHtml()}
    </header>

    <section class="jlpt-filter-row">
      <input id="query-input" type="text" placeholder="Nhập chữ Hán, từ, Hán Việt, nghĩa..." value="${query.replace(/"/g, "&quot;")}" />
    </section>

    <main class="jlpt-list">
      ${
        !q
          ? `<p class="empty">Nhập để tìm trong ${ALL_KANJI.length} Kanji và ${ALL_VOCAB.length} từ vựng.</p>`
          : results.length === 0
            ? `<p class="empty">Không tìm thấy gì.</p>`
            : results.map(renderResult).join("")
      }
    </main>
  `;

  document.getElementById("back")!.addEventListener("click", onBack);
  wireExpandToTabButton("search");

  app.querySelectorAll<HTMLElement>(".search-result").forEach((el) => {
    el.addEventListener("click", () => {
      const id = el.dataset.id!;
      if (el.dataset.kind === "kanji") onOpenKanji(id);
      else onOpenVocab(id);
    });
  });

  const queryInput = document.getElementById("query-input") as HTMLInputElement;
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;
  queryInput.addEventListener("input", () => {
    clearTimeout(debounceTimer);
    const value = queryInput.value;
    debounceTimer = setTimeout(() => paint(app, onBack, onOpenKanji, onOpenVocab, value), 150);
  });
  queryInput.focus();
  queryInput.setSelectionRange(queryInput.value.length, queryInput.value.length);
}

function renderResult(r: SearchResult): string {
  const kindLabel = r.kind === "kanji" ? "Kanji" : "Từ vựng";
  const kindClass = r.kind === "kanji" ? "search-tag-kanji" : "search-tag-vocab";
  return `
    <div class="jlpt-entry search-result" data-kind="${r.kind}" data-id="${r.id}">
      <span class="search-tag ${kindClass}">${kindLabel}</span>
      <span class="search-tag-level">${levelDotHtml(r.level)}${r.level}</span>
      <div class="jlpt-entry-word">${r.primary}${r.secondary ? `<span class="muted"> ${r.secondary}</span>` : ""}</div>
      <div class="jlpt-entry-meaning">${r.meaning || "—"}</div>
    </div>
  `;
}
