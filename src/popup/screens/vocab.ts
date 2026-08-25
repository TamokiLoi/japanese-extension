import type { VocabCard } from "../vocabState.ts";
import {
  ALL_VOCAB,
  AVAILABLE_SOURCES,
  SOURCE_LABELS,
  countForSource,
  getOrderedList,
  loadViewerState,
  saveViewerState,
  resolveJumpState,
  type VocabSource,
  type VocabViewerState,
} from "../vocabState.ts";
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
import { kanjiIdForChar } from "../kanjiVocabLinks.ts";
import { formatHanViet } from "../../hanVietFormat.ts";

// Renders a word with each character that's a known kanji wrapped in a
// clickable span (data-kanji-id) so it can jump to that kanji's card.
function renderWordWithKanjiLinks(word: string): string {
  return [...word]
    .map((ch) => {
      const kanjiId = kanjiIdForChar(ch);
      return kanjiId ? `<span class="word-kanji-link" data-kanji-id="${kanjiId}">${ch}</span>` : ch;
    })
    .join("");
}

async function getFilteredList(state: VocabViewerState): Promise<VocabCard[]> {
  const map = await loadProgressMap();
  return filterByProgress(getOrderedList(state), map, state.progressFilter);
}

export async function renderVocabScreen(
  app: HTMLElement,
  onBack: () => void,
  onOpenKanji: (kanjiId: string) => void,
  jumpToId?: string,
) {
  let state = await loadViewerState();
  let list: VocabCard[];

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
  await paint(app, state, list, onBack, onOpenKanji);
}

async function paint(
  app: HTMLElement,
  state: VocabViewerState,
  list: VocabCard[],
  onBack: () => void,
  onOpenKanji: (kanjiId: string) => void,
) {
  const v = list[state.index];
  const totalSelected = list.length;
  const progress: ItemProgress | null = v ? await getProgress(v.id) : null;

  const sourceCheckboxes = AVAILABLE_SOURCES.map((source) => {
    const checked = state.selectedSources.includes(source);
    return `
      <label class="level-check">
        <input type="checkbox" data-source="${source}" ${checked ? "checked" : ""} />
        ${SOURCE_LABELS[source]} <span class="muted">(${countForSource(source)})</span>
      </label>
    `;
  }).join("");
  const allChecked = state.selectedSources.length === AVAILABLE_SOURCES.length;
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
        <input type="checkbox" id="source-all" ${allChecked ? "checked" : ""} />
        Tất cả <span class="muted">(${ALL_VOCAB.length})</span>
      </label>
      ${sourceCheckboxes}
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
          ? `<p class="empty">Không có từ vựng nào ở bộ lọc này.</p>`
          : `<div class="reading-tile-grid reading-tile-grid-word">${list
              .map((item, i) => {
                const bucket = bucketFor(gridMap[item.id]);
                return `<button class="reading-tile reading-tile-word ${BUCKET_TILE_CLASS[bucket]}" data-index="${i}" title="${item.word} · ${BUCKET_LABEL[bucket]}">${item.word}</button>`;
              })
              .join("")}</div>`
      }
    </section>
    `
          : ""
        : !v
          ? `<p class="empty">Không có từ vựng nào ở bộ lọc này.</p>`
          : `
    <main class="card card-${bucketFor(progress ?? undefined)}">
      <div class="level-badge" data-level="${v.level}">${v.level}</div>
      <button id="flag" class="flag-btn ${progress?.flagged ? "flagged" : ""}" title="${progress?.flagged ? "Bỏ đánh dấu khó" : "Đánh dấu khó, cần học lại"}">🚩</button>
      <button id="mastered-toggle" class="mastered-badge ${progress?.mastered ? "mastered-on" : ""}" title="${progress?.mastered ? "Bỏ đánh dấu đã thuộc" : "Đánh dấu đã thuộc"}">
        ${progress?.mastered ? "✓ Đã thuộc" : "Đánh dấu đã thuộc"}
      </button>
      <div class="vocab-source-tag">${SOURCE_LABELS[v.source]}</div>
      <div class="vocab-word">${renderWordWithKanjiLinks(v.word)}</div>
      ${v.reading ? `<div class="vocab-reading">${v.reading}</div>` : ""}

      <dl class="details">
        ${
          v.hanViet.length > 0
            ? `<dt>Hán Việt</dt><dd class="hanviet">${formatHanViet(v.hanViet)}</dd>`
            : ""
        }

        <dt>Nghĩa</dt>
        <dd>${v.meaningVi || "—"}</dd>

        ${
          v.synonym
            ? `<dt>Đồng nghĩa</dt><dd>${v.synonym.word}${v.synonym.reading ? ` (${v.synonym.reading})` : ""}</dd>`
            : ""
        }
      </dl>

      ${v.mnemonic.length > 0 ? `<p class="mnemonic"><span class="mnemonic-label">Mẹo nhớ:</span> ${v.mnemonic.join(" / ")}</p>` : ""}

      ${
        v.example
          ? `<p class="example"><span class="example-jp">${v.example}</span>${v.exampleVi ? `<span class="example-vi">${v.exampleVi}</span>` : ""}</p>`
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
  wireExpandToTabButton("vocab");

  app.querySelectorAll<HTMLElement>(".word-kanji-link").forEach((el) => {
    el.addEventListener("click", () => onOpenKanji(el.dataset.kanjiId!));
  });

  async function applySourceSelection(newSources: VocabSource[]) {
    if (newSources.length === 0) {
      // Never allow an empty selection -- just repaint to revert the click.
      await paint(app, state, list, onBack, onOpenKanji);
      return;
    }
    const newState: VocabViewerState = { ...state, selectedSources: newSources, index: 0 };
    await saveViewerState(newState);
    await paint(app, newState, await getFilteredList(newState), onBack, onOpenKanji);
  }

  document.getElementById("source-all")!.addEventListener("change", (e) => {
    const checked = (e.target as HTMLInputElement).checked;
    applySourceSelection(checked ? [...AVAILABLE_SOURCES] : state.selectedSources);
  });

  app.querySelectorAll<HTMLInputElement>("input[data-source]").forEach((input) => {
    input.addEventListener("change", () => {
      const source = input.dataset.source as VocabSource;
      const next = input.checked
        ? [...new Set([...state.selectedSources, source])]
        : state.selectedSources.filter((s) => s !== source);
      applySourceSelection(next);
    });
  });

  document.getElementById("random-order")!.addEventListener("change", async (e) => {
    const randomOrder = (e.target as HTMLInputElement).checked;
    const newState: VocabViewerState = {
      ...state,
      randomOrder,
      shuffleSeed: randomOrder ? Date.now() : state.shuffleSeed,
      index: 0,
    };
    await saveViewerState(newState);
    await paint(app, newState, await getFilteredList(newState), onBack, onOpenKanji);
  });

  document.getElementById("progress-filter")!.addEventListener("change", async (e) => {
    const progressFilter = (e.target as HTMLSelectElement).value as VocabViewerState["progressFilter"];
    const newState: VocabViewerState = { ...state, progressFilter, index: 0 };
    await saveViewerState(newState);
    await paint(app, newState, await getFilteredList(newState), onBack, onOpenKanji);
  });

  document.getElementById("view-toggle")!.addEventListener("click", async () => {
    const newState: VocabViewerState = { ...state, viewMode: isGrid ? "card" : "grid" };
    await saveViewerState(newState);
    await paint(app, newState, list, onBack, onOpenKanji);
  });

  app.querySelectorAll<HTMLButtonElement>(".reading-tile-grid .reading-tile").forEach((tile) => {
    tile.addEventListener("click", async () => {
      const newState: VocabViewerState = { ...state, index: Number(tile.dataset.index), viewMode: "card" };
      await saveViewerState(newState);
      await paint(app, newState, list, onBack, onOpenKanji);
    });
  });

  document.getElementById("prev")?.addEventListener("click", async () => {
    if (state.index === 0) return;
    const newState = { ...state, index: state.index - 1 };
    await saveViewerState(newState);
    await paint(app, newState, list, onBack, onOpenKanji);
  });

  document.getElementById("next")?.addEventListener("click", async () => {
    if (state.index >= list.length - 1) return;
    const newState = { ...state, index: state.index + 1 };
    await saveViewerState(newState);
    await paint(app, newState, list, onBack, onOpenKanji);
  });

  document.getElementById("jump")?.addEventListener("click", async () => {
    if (list.length === 0) return;
    const newIndex = Math.floor(Math.random() * list.length);
    const newState = { ...state, index: newIndex };
    await saveViewerState(newState);
    await paint(app, newState, list, onBack, onOpenKanji);
  });

  document.getElementById("flag")?.addEventListener("click", async () => {
    if (!v) return;
    await toggleFlag(v.id);
    await paint(app, state, list, onBack, onOpenKanji);
  });

  document.getElementById("mastered-toggle")?.addEventListener("click", async () => {
    if (!v) return;
    await toggleMastered(v.id);
    await paint(app, state, list, onBack, onOpenKanji);
  });
}
