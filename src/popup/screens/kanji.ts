import type { Kanji } from "../../types/kanji.ts";
import {
  ALL_KANJI,
  AVAILABLE_LEVELS,
  countForLevel,
  getOrderedList,
  loadViewerState,
  saveViewerState,
  type KanjiViewerState,
} from "../kanjiState.ts";

function meaningLine(k: Kanji): { text: string; isDraft: boolean } {
  if (k.meanings.vi.length > 0) {
    return { text: k.meanings.vi.join(", "), isDraft: false };
  }
  if (k.meanings.viDraft && k.meanings.viDraft.length > 0) {
    return { text: k.meanings.viDraft.join(", "), isDraft: true };
  }
  return { text: "(chưa có nghĩa tiếng Việt)", isDraft: false };
}

export async function renderKanjiScreen(app: HTMLElement, onBack: () => void) {
  const state = await loadViewerState();
  const list = getOrderedList(state);
  state.index = Math.min(state.index, Math.max(list.length - 1, 0));
  await saveViewerState(state);
  paint(app, state, list, onBack);
}

function paint(app: HTMLElement, state: KanjiViewerState, list: Kanji[], onBack: () => void) {
  const k = list[state.index];
  const totalSelected = list.length;

  const levelCheckboxes = AVAILABLE_LEVELS.map((level) => {
    const checked = state.selectedLevels.includes(level);
    return `
      <label class="level-check">
        <input type="checkbox" data-level="${level}" ${checked ? "checked" : ""} />
        ${level} <span class="muted">(${countForLevel(level)})</span>
      </label>
    `;
  }).join("");
  const allChecked = state.selectedLevels.length === AVAILABLE_LEVELS.length;

  app.innerHTML = `
    <header class="toolbar">
      <button id="back" class="icon-btn" title="Về menu">←</button>
      <span class="counter">${list.length > 0 ? state.index + 1 : 0} / ${totalSelected}</span>
    </header>

    <section class="level-selector">
      <label class="level-check level-check-all">
        <input type="checkbox" id="level-all" ${allChecked ? "checked" : ""} />
        Tất cả <span class="muted">(${ALL_KANJI.length})</span>
      </label>
      ${levelCheckboxes}
      <label class="random-toggle">
        <input type="checkbox" id="random-order" ${state.randomOrder ? "checked" : ""} />
        Hiển thị ngẫu nhiên
      </label>
    </section>

    ${
      !k
        ? `<p class="empty">Không có Kanji nào ở bộ lọc này.</p>`
        : `
    <main class="card">
      <div class="level-badge">${k.level}</div>
      <div class="character">${k.character}</div>

      <dl class="details">
        <dt>Hán Việt</dt>
        <dd class="hanviet">${k.hanViet.length > 0 ? k.hanViet.join(", ") : "—"}</dd>

        <dt>Âm On</dt>
        <dd>${k.readings.on.length > 0 ? k.readings.on.join("、") : "—"}</dd>

        <dt>Âm Kun</dt>
        <dd>${k.readings.kun.length > 0 ? k.readings.kun.join("、") : "—"}</dd>

        <dt>Nghĩa</dt>
        <dd>${meaningLine(k).text}${meaningLine(k).isDraft ? '<span class="draft-tag" title="Dịch bằng AI, chưa được kiểm duyệt">nháp AI</span>' : ""}</dd>

        <dt>English</dt>
        <dd class="muted">${k.meanings.en.join(", ") || "—"}</dd>

        <dt>Bộ thủ</dt>
        <dd>${k.radical?.character ? `${k.radical.character}${k.radical.raw ? ` (bộ ${k.radical.raw})` : ""}` : "—"}</dd>

        <dt>Số nét</dt>
        <dd>${k.strokeCount ?? "—"}</dd>
      </dl>

      ${k.mnemonic ? `<p class="mnemonic"><span class="mnemonic-label">Mẹo nhớ:</span> ${k.mnemonic}</p>` : ""}
    </main>
    `
    }

    <footer class="nav">
      <button id="prev" ${state.index === 0 ? "disabled" : ""}>← Trước</button>
      <button id="jump" title="Nhảy tới 1 thẻ bất kỳ">🎲</button>
      <button id="next" ${state.index >= list.length - 1 ? "disabled" : ""}>Tiếp →</button>
    </footer>
  `;

  document.getElementById("back")!.addEventListener("click", onBack);

  async function applyLevelSelection(newLevels: typeof AVAILABLE_LEVELS) {
    if (newLevels.length === 0) {
      // Never allow an empty selection -- just repaint to revert the click.
      paint(app, state, list, onBack);
      return;
    }
    const newState: KanjiViewerState = { ...state, selectedLevels: newLevels, index: 0 };
    await saveViewerState(newState);
    const newList = getOrderedList(newState);
    paint(app, newState, newList, onBack);
  }

  document.getElementById("level-all")!.addEventListener("change", (e) => {
    const checked = (e.target as HTMLInputElement).checked;
    applyLevelSelection(checked ? [...AVAILABLE_LEVELS] : state.selectedLevels);
  });

  app.querySelectorAll<HTMLInputElement>("input[data-level]").forEach((input) => {
    input.addEventListener("change", () => {
      const level = input.dataset.level as (typeof AVAILABLE_LEVELS)[number];
      const next = input.checked
        ? [...new Set([...state.selectedLevels, level])]
        : state.selectedLevels.filter((l) => l !== level);
      applyLevelSelection(next);
    });
  });

  document.getElementById("random-order")!.addEventListener("change", async (e) => {
    const randomOrder = (e.target as HTMLInputElement).checked;
    const newState: KanjiViewerState = {
      ...state,
      randomOrder,
      shuffleSeed: randomOrder ? Date.now() : state.shuffleSeed,
      index: 0,
    };
    await saveViewerState(newState);
    paint(app, newState, getOrderedList(newState), onBack);
  });

  document.getElementById("prev")!.addEventListener("click", async () => {
    if (state.index === 0) return;
    const newState = { ...state, index: state.index - 1 };
    await saveViewerState(newState);
    paint(app, newState, list, onBack);
  });

  document.getElementById("next")!.addEventListener("click", async () => {
    if (state.index >= list.length - 1) return;
    const newState = { ...state, index: state.index + 1 };
    await saveViewerState(newState);
    paint(app, newState, list, onBack);
  });

  document.getElementById("jump")!.addEventListener("click", async () => {
    if (list.length === 0) return;
    const newIndex = Math.floor(Math.random() * list.length);
    const newState = { ...state, index: newIndex };
    await saveViewerState(newState);
    paint(app, newState, list, onBack);
  });
}
