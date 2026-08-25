import type { Kanji } from "../../types/kanji.ts";
import {
  ALL_KANJI,
  AVAILABLE_LEVELS,
  countForLevel,
  getOrderedList,
  loadViewerState,
  saveViewerState,
  resolveJumpState,
  type KanjiViewerState,
} from "../kanjiState.ts";
import {
  getProgress,
  loadProgressMap,
  toggleFlag,
  toggleMastered,
  filterByProgress,
  bucketFor,
  countBuckets,
  BUCKET_TILE_CLASS,
  BUCKET_LABEL,
  type ItemProgress,
} from "../progressState.ts";
import { expandToTabButtonHtml, wireExpandToTabButton } from "../tabMode.ts";
import { vocabForKanjiChar } from "../kanjiVocabLinks.ts";
import { levelDotHtml } from "../levelColors.ts";
import { formatHanViet } from "../../hanVietFormat.ts";

function meaningLine(k: Kanji): { text: string; isDraft: boolean } {
  if (k.meanings.vi.length > 0) {
    return { text: k.meanings.vi.join(", "), isDraft: false };
  }
  if (k.meanings.viDraft && k.meanings.viDraft.length > 0) {
    return { text: k.meanings.viDraft.join(", "), isDraft: true };
  }
  return { text: "(chưa có nghĩa tiếng Việt)", isDraft: false };
}

async function getFilteredList(state: KanjiViewerState): Promise<Kanji[]> {
  const map = await loadProgressMap();
  return filterByProgress(getOrderedList(state), map, state.progressFilter);
}

export async function renderKanjiScreen(
  app: HTMLElement,
  onBack: () => void,
  onOpenVocab: (vocabId: string) => void,
  jumpToId?: string,
) {
  let state = await loadViewerState();
  let list: Kanji[];

  if (jumpToId) {
    const jumped = resolveJumpState(state, jumpToId);
    if (jumped) {
      state = jumped;
      list = getOrderedList(state);
    } else {
      list = await getFilteredList(state);
      state.index = Math.min(state.index, Math.max(list.length - 1, 0));
    }
  } else {
    list = await getFilteredList(state);
    state.index = Math.min(state.index, Math.max(list.length - 1, 0));
  }

  await saveViewerState(state);
  await paint(app, state, list, onBack, onOpenVocab);
}

async function paint(
  app: HTMLElement,
  state: KanjiViewerState,
  list: Kanji[],
  onBack: () => void,
  onOpenVocab: (vocabId: string) => void,
) {
  const k = list[state.index];
  const totalSelected = list.length;
  const progress: ItemProgress | null = k ? await getProgress(k.id) : null;
  const related = k ? vocabForKanjiChar(k.character) : null;

  const levelCheckboxes = AVAILABLE_LEVELS.map((level) => {
    const checked = state.selectedLevels.includes(level);
    return `
      <label class="level-check">
        <input type="checkbox" data-level="${level}" ${checked ? "checked" : ""} />
        ${levelDotHtml(level)}${level} <span class="muted">(${countForLevel(level)})</span>
      </label>
    `;
  }).join("");
  const allChecked = state.selectedLevels.length === AVAILABLE_LEVELS.length;
  const isGrid = state.viewMode === "grid";
  const gridMap = isGrid ? await loadProgressMap() : null;
  const bucketCounts = gridMap ? countBuckets(list, gridMap) : null;

  app.innerHTML = `
    <header class="toolbar">
      <button id="back" class="icon-btn" title="Về menu">←</button>
      <span class="counter">${isGrid ? `${list.length} thẻ` : `${list.length > 0 ? state.index + 1 : 0} / ${totalSelected}`}</span>
      <button id="view-toggle" class="icon-btn" title="${isGrid ? "Xem từng thẻ" : "Xem lưới tổng quan (đã thuộc / chưa thuộc)"}">${isGrid ? "📇" : "⊞"}</button>
      ${expandToTabButtonHtml()}
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

    <section class="progress-filter-row">
      <select id="progress-filter">
        <option value="all" ${state.progressFilter === "all" ? "selected" : ""}>Tất cả thẻ</option>
        <option value="unmastered" ${state.progressFilter === "unmastered" ? "selected" : ""}>Chưa thuộc</option>
        <option value="flagged" ${state.progressFilter === "flagged" ? "selected" : ""}>Đã đánh dấu khó</option>
      </select>
    </section>

    ${
      isGrid
        ? bucketCounts && gridMap
          ? `
    <section class="reading-list-section">
      <div class="reading-list-summary">
        <span>Đã thuộc <strong>${bucketCounts.mastered}</strong> · Cần ôn lại <strong>${bucketCounts.flagged}</strong> · Đang học <strong>${bucketCounts.learning}</strong> · Chưa học <strong>${bucketCounts.new}</strong></span>
      </div>
      ${
        list.length === 0
          ? `<p class="empty">Không có Kanji nào ở bộ lọc này.</p>`
          : `<div class="reading-tile-grid">${list
              .map((item, i) => {
                const bucket = bucketFor(gridMap[item.id]);
                return `<button class="reading-tile ${BUCKET_TILE_CLASS[bucket]}" data-index="${i}" title="${item.character} · ${BUCKET_LABEL[bucket]}">${item.character}</button>`;
              })
              .join("")}</div>`
      }
    </section>
    `
          : ""
        : !k
          ? `<p class="empty">Không có Kanji nào ở bộ lọc này.</p>`
          : `
    <main class="card card-${bucketFor(progress ?? undefined)}">
      <div class="level-badge" data-level="${k.level}">${k.level}</div>
      <button id="flag" class="flag-btn ${progress?.flagged ? "flagged" : ""}" title="${progress?.flagged ? "Bỏ đánh dấu khó" : "Đánh dấu khó, cần học lại"}">🚩</button>
      <button id="mastered-toggle" class="mastered-badge ${progress?.mastered ? "mastered-on" : ""}" title="${progress?.mastered ? "Bỏ đánh dấu đã thuộc" : "Đánh dấu đã thuộc"}">
        ${progress?.mastered ? "✓ Đã thuộc" : "Đánh dấu đã thuộc"}
      </button>
      <div class="character">${k.character}</div>

      <dl class="details">
        <dt>Hán Việt</dt>
        <dd class="hanviet">${formatHanViet(k.hanViet)}</dd>

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

      ${
        related && related.shown.length > 0
          ? `
      <div class="related-vocab">
        <div class="related-vocab-label">Từ vựng chứa chữ này${related.total > related.shown.length ? ` (${related.total})` : ""}</div>
        <div class="related-vocab-list">
          ${related.shown
            .map(
              (v) =>
                `<button class="related-vocab-item" data-vocab-id="${v.id}">${v.word}${v.reading ? `<span class="muted"> ${v.reading}</span>` : ""}</button>`,
            )
            .join("")}
        </div>
      </div>
      `
          : ""
      }
    </main>
    `
    }

    ${
      isGrid
        ? ""
        : `
    <footer class="nav">
      <button id="prev" ${state.index === 0 ? "disabled" : ""}>← Trước</button>
      <button id="jump" title="Nhảy tới 1 thẻ bất kỳ">🎲</button>
      <button id="next" ${state.index >= list.length - 1 ? "disabled" : ""}>Tiếp →</button>
    </footer>
    `
    }
  `;

  document.getElementById("back")!.addEventListener("click", onBack);
  wireExpandToTabButton("kanji");

  app.querySelectorAll<HTMLButtonElement>(".related-vocab-item").forEach((btn) => {
    btn.addEventListener("click", () => onOpenVocab(btn.dataset.vocabId!));
  });

  async function applyLevelSelection(newLevels: typeof AVAILABLE_LEVELS) {
    if (newLevels.length === 0) {
      // Never allow an empty selection -- just repaint to revert the click.
      await paint(app, state, list, onBack, onOpenVocab);
      return;
    }
    const newState: KanjiViewerState = { ...state, selectedLevels: newLevels, index: 0 };
    await saveViewerState(newState);
    await paint(app, newState, await getFilteredList(newState), onBack, onOpenVocab);
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
    await paint(app, newState, await getFilteredList(newState), onBack, onOpenVocab);
  });

  document.getElementById("progress-filter")!.addEventListener("change", async (e) => {
    const progressFilter = (e.target as HTMLSelectElement).value as KanjiViewerState["progressFilter"];
    const newState: KanjiViewerState = { ...state, progressFilter, index: 0 };
    await saveViewerState(newState);
    await paint(app, newState, await getFilteredList(newState), onBack, onOpenVocab);
  });

  document.getElementById("view-toggle")!.addEventListener("click", async () => {
    const newState: KanjiViewerState = { ...state, viewMode: isGrid ? "card" : "grid" };
    await saveViewerState(newState);
    await paint(app, newState, list, onBack, onOpenVocab);
  });

  app.querySelectorAll<HTMLButtonElement>(".reading-tile-grid .reading-tile").forEach((tile) => {
    tile.addEventListener("click", async () => {
      const newState: KanjiViewerState = { ...state, index: Number(tile.dataset.index), viewMode: "card" };
      await saveViewerState(newState);
      await paint(app, newState, list, onBack, onOpenVocab);
    });
  });

  document.getElementById("prev")?.addEventListener("click", async () => {
    if (state.index === 0) return;
    const newState = { ...state, index: state.index - 1 };
    await saveViewerState(newState);
    await paint(app, newState, list, onBack, onOpenVocab);
  });

  document.getElementById("next")?.addEventListener("click", async () => {
    if (state.index >= list.length - 1) return;
    const newState = { ...state, index: state.index + 1 };
    await saveViewerState(newState);
    await paint(app, newState, list, onBack, onOpenVocab);
  });

  document.getElementById("jump")?.addEventListener("click", async () => {
    if (list.length === 0) return;
    const newIndex = Math.floor(Math.random() * list.length);
    const newState = { ...state, index: newIndex };
    await saveViewerState(newState);
    await paint(app, newState, list, onBack, onOpenVocab);
  });

  document.getElementById("flag")?.addEventListener("click", async () => {
    if (!k) return;
    await toggleFlag(k.id);
    await paint(app, state, list, onBack, onOpenVocab);
  });

  document.getElementById("mastered-toggle")?.addEventListener("click", async () => {
    if (!k) return;
    await toggleMastered(k.id);
    await paint(app, state, list, onBack, onOpenVocab);
  });
}
