import kanjiAllRaw from "../data/kanji-all.json";
import type { Kanji, KanjiDataset, JlptLevel } from "../types/kanji.ts";

const dataset = kanjiAllRaw as unknown as KanjiDataset;
const ALL_KANJI: Kanji[] = dataset.kanji;

type LevelFilter = "ALL" | JlptLevel;

const STORAGE_KEY = "kanjiViewer";

interface ViewerState {
  filter: LevelFilter;
  index: number;
}

function getFilteredList(filter: LevelFilter): Kanji[] {
  if (filter === "ALL") return ALL_KANJI;
  return ALL_KANJI.filter((k) => k.level === filter);
}

async function loadState(): Promise<ViewerState> {
  const stored = await chrome.storage.local.get(STORAGE_KEY);
  const saved = stored[STORAGE_KEY] as Partial<ViewerState> | undefined;
  return { filter: saved?.filter ?? "ALL", index: saved?.index ?? 0 };
}

async function saveState(state: ViewerState): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: state });
}

function meaningLine(k: Kanji): { text: string; isDraft: boolean } {
  if (k.meanings.vi.length > 0) {
    return { text: k.meanings.vi.join(", "), isDraft: false };
  }
  if (k.meanings.viDraft && k.meanings.viDraft.length > 0) {
    return { text: k.meanings.viDraft.join(", "), isDraft: true };
  }
  return { text: "(chưa có nghĩa tiếng Việt)", isDraft: false };
}

function render(state: ViewerState, list: Kanji[]) {
  const app = document.getElementById("app")!;
  const k = list[state.index];

  if (!k) {
    app.innerHTML = `<p class="empty">Không có Kanji nào ở bộ lọc này.</p>`;
    return;
  }

  const meaning = meaningLine(k);
  const hanViet = k.hanViet.length > 0 ? k.hanViet.join(", ") : "—";
  const on = k.readings.on.length > 0 ? k.readings.on.join("、") : "—";
  const kun = k.readings.kun.length > 0 ? k.readings.kun.join("、") : "—";
  const radical = k.radical?.character
    ? `${k.radical.character}${k.radical.raw ? ` (bộ ${k.radical.raw})` : ""}`
    : "—";

  app.innerHTML = `
    <header class="toolbar">
      <select id="filter">
        <option value="ALL" ${state.filter === "ALL" ? "selected" : ""}>Tất cả (${ALL_KANJI.length})</option>
        <option value="N4" ${state.filter === "N4" ? "selected" : ""}>N4</option>
        <option value="N3" ${state.filter === "N3" ? "selected" : ""}>N3</option>
      </select>
      <span class="counter">${state.index + 1} / ${list.length}</span>
    </header>

    <main class="card">
      <div class="level-badge">${k.level}</div>
      <div class="character">${k.character}</div>

      <dl class="details">
        <dt>Hán Việt</dt>
        <dd class="hanviet">${hanViet}</dd>

        <dt>Âm On</dt>
        <dd>${on}</dd>

        <dt>Âm Kun</dt>
        <dd>${kun}</dd>

        <dt>Nghĩa</dt>
        <dd>${meaning.text}${meaning.isDraft ? '<span class="draft-tag" title="Dịch bằng AI, chưa được kiểm duyệt">nháp AI</span>' : ""}</dd>

        <dt>English</dt>
        <dd class="muted">${k.meanings.en.join(", ") || "—"}</dd>

        <dt>Bộ thủ</dt>
        <dd>${radical}</dd>

        <dt>Số nét</dt>
        <dd>${k.strokeCount ?? "—"}</dd>
      </dl>
    </main>

    <footer class="nav">
      <button id="prev" ${state.index === 0 ? "disabled" : ""}>← Trước</button>
      <button id="shuffle">🔀 Ngẫu nhiên</button>
      <button id="next" ${state.index >= list.length - 1 ? "disabled" : ""}>Tiếp →</button>
    </footer>
  `;

  document.getElementById("filter")!.addEventListener("change", async (e) => {
    const newFilter = (e.target as HTMLSelectElement).value as LevelFilter;
    const newState: ViewerState = { filter: newFilter, index: 0 };
    await saveState(newState);
    render(newState, getFilteredList(newFilter));
  });

  document.getElementById("prev")!.addEventListener("click", async () => {
    if (state.index === 0) return;
    const newState = { ...state, index: state.index - 1 };
    await saveState(newState);
    render(newState, list);
  });

  document.getElementById("next")!.addEventListener("click", async () => {
    if (state.index >= list.length - 1) return;
    const newState = { ...state, index: state.index + 1 };
    await saveState(newState);
    render(newState, list);
  });

  document.getElementById("shuffle")!.addEventListener("click", async () => {
    const newIndex = Math.floor(Math.random() * list.length);
    const newState = { ...state, index: newIndex };
    await saveState(newState);
    render(newState, list);
  });
}

async function main() {
  const state = await loadState();
  const list = getFilteredList(state.filter);
  const clampedState = { ...state, index: Math.min(state.index, Math.max(list.length - 1, 0)) };
  render(clampedState, list);
}

main();
