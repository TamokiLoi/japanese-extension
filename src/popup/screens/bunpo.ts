import type { BunpoGrammarPoint, BunpoSource } from "../../types/bunpo.ts";
import type { JlptLevel } from "../../types/kanji.ts";
import {
  ALL_BUNPO,
  AVAILABLE_LEVELS,
  AVAILABLE_SOURCES,
  AVAILABLE_CHAPTERS,
  SOURCE_LABELS,
  countForLevel,
  findBunpoById,
  findChapterTitle,
  getFilteredList,
  loadViewerState,
  saveViewerState,
  type BunpoViewerState,
} from "../bunpoState.ts";
import { levelDotHtml } from "../levelColors.ts";
import { expandToTabButtonHtml, wireExpandToTabButton } from "../tabMode.ts";
import {
  getProgress,
  loadProgressMap,
  toggleFlag,
  toggleMastered,
  filterByProgress,
  bucketFor,
  type ItemProgress,
  type ProgressFilter,
} from "../progressState.ts";
import { findMatchingReadingPassages, findMatchingQuizBookQuestions } from "../bunpoLinks.ts";
import { saveViewerState as saveReadingViewerState, loadViewerState as loadReadingViewerState } from "../readingState.ts";
import { saveViewerState as saveQuizBookViewerState, loadViewerState as loadQuizBookViewerState } from "../quizBookState.ts";

export async function renderBunpoScreen(
  app: HTMLElement,
  onBack: () => void,
  onOpenReading: () => void,
  onOpenQuizBook: () => void,
  targetId?: string,
) {
  let state = await loadViewerState();
  if (targetId && findBunpoById(targetId)) {
    state = { ...state, currentGrammarId: targetId };
    await saveViewerState(state);
  }
  const current = state.currentGrammarId ? findBunpoById(state.currentGrammarId) : undefined;
  if (current) {
    paintDetail(app, current, state, onBack, onOpenReading, onOpenQuizBook);
  } else {
    paintList(app, state, onBack, onOpenReading, onOpenQuizBook);
  }
}

function matchesQuery(g: BunpoGrammarPoint, q: string): boolean {
  if (!q) return true;
  return g.pattern.toLowerCase().includes(q) || g.meaningVi.toLowerCase().includes(q);
}

// Same list, same order, the list screen and the detail screen's prev/next
// buttons both use -- so stepping through with prev/next walks exactly the
// set of cards currently visible in the list (filters/search/progress
// filter all still apply).
async function getVisibleList(state: BunpoViewerState): Promise<BunpoGrammarPoint[]> {
  const q = state.listSearchQuery.trim().toLowerCase();
  const progressMap = await loadProgressMap();
  return filterByProgress(getFilteredList(state).filter((g) => matchesQuery(g, q)), progressMap, state.progressFilter);
}

async function paintList(
  app: HTMLElement,
  state: BunpoViewerState,
  onBack: () => void,
  onOpenReading: () => void,
  onOpenQuizBook: () => void,
) {
  const levelCheckboxes = AVAILABLE_LEVELS.map((level) => {
    const checked = state.selectedLevels.includes(level);
    return `
      <label class="level-check">
        <input type="checkbox" data-level="${level}" ${checked ? "checked" : ""} />
        ${levelDotHtml(level)}${level} <span class="muted">(${countForLevel(level)})</span>
      </label>
    `;
  }).join("");
  const allLevelsChecked = state.selectedLevels.length === AVAILABLE_LEVELS.length;

  const sourceCheckboxes = AVAILABLE_SOURCES.map((source) => {
    const checked = state.selectedSources.includes(source);
    const count = ALL_BUNPO.filter((g) => g.source === source).length;
    return `
      <label class="level-check">
        <input type="checkbox" data-source="${source}" ${checked ? "checked" : ""} />
        ${SOURCE_LABELS[source]} <span class="muted">(${count})</span>
      </label>
    `;
  }).join("");

  const showChapterFilter = state.selectedSources.includes("theo-chuong") && AVAILABLE_CHAPTERS.length > 0;
  const allChaptersSelected = state.selectedChapters.length === AVAILABLE_CHAPTERS.length;
  const singleSelectedChapter = state.selectedChapters.length === 1 ? state.selectedChapters[0] : null;
  const chapterSelectOptions = [
    `<option value="all" ${allChaptersSelected ? "selected" : ""}>Tất cả các chương</option>`,
    ...AVAILABLE_CHAPTERS.map((c) => {
      const title = findChapterTitle(c);
      const selected = !allChaptersSelected && singleSelectedChapter === c;
      return `<option value="${c}" ${selected ? "selected" : ""}>Chương ${c}${title ? `: ${title}` : ""}</option>`;
    }),
  ].join("");

  const progressMap = await loadProgressMap();
  const filtered = await getVisibleList(state);

  const rows = filtered
    .map((g) => {
      const bucket = bucketFor(progressMap[g.id]);
      const bucketMark = bucket === "mastered" ? "✓ " : bucket === "flagged" ? "🚩 " : "";
      return `
    <div class="jlpt-entry bunpo-entry" data-id="${g.id}">
      <span class="search-tag-level">${levelDotHtml(g.level)}${g.level}</span>
      <div class="jlpt-entry-word">${bucketMark}${g.pattern}${g.chapter !== undefined ? `<span class="muted"> · Chương ${g.chapter}</span>` : ""}</div>
      <div class="jlpt-entry-meaning">${g.meaningVi}</div>
    </div>
  `;
    })
    .join("");

  app.innerHTML = `
    <header class="toolbar">
      <button id="back" class="icon-btn" title="Về menu">←</button>
      <span class="counter">${filtered.length} mẫu ngữ pháp</span>
      ${expandToTabButtonHtml()}
    </header>

    <section class="level-selector">
      <label class="level-check level-check-all">
        <input type="checkbox" id="level-all" ${allLevelsChecked ? "checked" : ""} />
        Tất cả <span class="muted">(${ALL_BUNPO.length})</span>
      </label>
      ${levelCheckboxes}
    </section>

    <section class="quiz-setup">
      <div class="quiz-setup-group">
        <div class="quiz-setup-label">Nguồn</div>
        <div class="level-selector-inline">${sourceCheckboxes}</div>
      </div>
      ${
        showChapterFilter
          ? `<div class="quiz-setup-group">
        <div class="quiz-setup-label">Chương</div>
        <div class="quiz-count-row"><select id="chapter-select">${chapterSelectOptions}</select></div>
      </div>`
          : ""
      }

      <div class="quiz-setup-group">
        <div class="quiz-setup-label">Tiến độ</div>
        <div class="quiz-count-row">
          <select id="progress-filter">
            <option value="all" ${state.progressFilter === "all" ? "selected" : ""}>Tất cả mẫu</option>
            <option value="unmastered" ${state.progressFilter === "unmastered" ? "selected" : ""}>Chưa thuộc</option>
            <option value="flagged" ${state.progressFilter === "flagged" ? "selected" : ""}>Đã đánh dấu khó</option>
          </select>
        </div>
      </div>
    </section>

    <section class="jlpt-filter-row">
      <input id="query-input" type="text" placeholder="Tìm theo mẫu ngữ pháp hoặc nghĩa..." value="${state.listSearchQuery.replace(/"/g, "&quot;")}" />
    </section>

    <main class="jlpt-list">
      ${filtered.length === 0 ? `<p class="empty">Không có mẫu ngữ pháp nào khớp bộ lọc này.</p>` : rows}
    </main>
  `;

  document.getElementById("back")!.addEventListener("click", onBack);
  wireExpandToTabButton("bunpo");

  async function applyLevelSelection(newLevels: JlptLevel[]) {
    if (newLevels.length === 0) {
      paintList(app, state, onBack, onOpenReading, onOpenQuizBook);
      return;
    }
    const newState = { ...state, selectedLevels: newLevels };
    await saveViewerState(newState);
    paintList(app, newState, onBack, onOpenReading, onOpenQuizBook);
  }

  document.getElementById("level-all")!.addEventListener("change", (e) => {
    const checked = (e.target as HTMLInputElement).checked;
    applyLevelSelection(checked ? [...AVAILABLE_LEVELS] : state.selectedLevels);
  });

  app.querySelectorAll<HTMLInputElement>("input[data-level]").forEach((input) => {
    input.addEventListener("change", () => {
      const level = input.dataset.level as JlptLevel;
      const next = input.checked
        ? [...new Set([...state.selectedLevels, level])]
        : state.selectedLevels.filter((l) => l !== level);
      applyLevelSelection(next);
    });
  });

  app.querySelectorAll<HTMLInputElement>("input[data-source]").forEach((input) => {
    input.addEventListener("change", async () => {
      const source = input.dataset.source as BunpoSource;
      const next = input.checked
        ? [...new Set([...state.selectedSources, source])]
        : state.selectedSources.filter((s) => s !== source);
      if (next.length === 0) {
        paintList(app, state, onBack, onOpenReading, onOpenQuizBook);
        return;
      }
      const newState = { ...state, selectedSources: next };
      await saveViewerState(newState);
      paintList(app, newState, onBack, onOpenReading, onOpenQuizBook);
    });
  });

  document.getElementById("chapter-select")?.addEventListener("change", async (e) => {
    const value = (e.target as HTMLSelectElement).value;
    const next = value === "all" ? [...AVAILABLE_CHAPTERS] : [Number(value)];
    const newState = { ...state, selectedChapters: next };
    await saveViewerState(newState);
    paintList(app, newState, onBack, onOpenReading, onOpenQuizBook);
  });

  document.getElementById("progress-filter")!.addEventListener("change", async (e) => {
    const progressFilter = (e.target as HTMLSelectElement).value as ProgressFilter;
    const newState = { ...state, progressFilter };
    await saveViewerState(newState);
    paintList(app, newState, onBack, onOpenReading, onOpenQuizBook);
  });

  const queryInput = document.getElementById("query-input") as HTMLInputElement;
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;
  queryInput.addEventListener("input", () => {
    clearTimeout(debounceTimer);
    const value = queryInput.value;
    debounceTimer = setTimeout(async () => {
      const newState = { ...state, listSearchQuery: value };
      await saveViewerState(newState);
      paintList(app, newState, onBack, onOpenReading, onOpenQuizBook);
    }, 150);
  });

  app.querySelectorAll<HTMLElement>(".bunpo-entry").forEach((el) => {
    el.addEventListener("click", async () => {
      const newState = { ...state, currentGrammarId: el.dataset.id! };
      await saveViewerState(newState);
      const g = findBunpoById(el.dataset.id!)!;
      paintDetail(app, g, newState, onBack, onOpenReading, onOpenQuizBook);
    });
  });
}

async function paintDetail(
  app: HTMLElement,
  g: BunpoGrammarPoint,
  state: BunpoViewerState,
  onBack: () => void,
  onOpenReading: () => void,
  onOpenQuizBook: () => void,
) {
  const backToList = async () => {
    const newState = { ...state, currentGrammarId: null };
    await saveViewerState(newState);
    paintList(app, newState, onBack, onOpenReading, onOpenQuizBook);
  };

  const progress: ItemProgress = await getProgress(g.id);
  const readingMatches = findMatchingReadingPassages(g);
  const quizBookMatches = findMatchingQuizBookQuestions(g);

  const visibleList = await getVisibleList(state);
  const currentIndex = visibleList.findIndex((item) => item.id === g.id);
  const prevItem = currentIndex > 0 ? visibleList[currentIndex - 1] : null;
  const nextItem = currentIndex >= 0 && currentIndex < visibleList.length - 1 ? visibleList[currentIndex + 1] : null;

  const goToItem = async (item: BunpoGrammarPoint) => {
    const newState = { ...state, currentGrammarId: item.id };
    await saveViewerState(newState);
    paintDetail(app, item, newState, onBack, onOpenReading, onOpenQuizBook);
  };

  app.innerHTML = `
    <header class="toolbar">
      <button id="back" class="icon-btn" title="Về menu">←</button>
      <span class="counter">${currentIndex >= 0 ? `${currentIndex + 1} / ${visibleList.length}` : "Ngữ pháp"}</span>
      ${expandToTabButtonHtml()}
    </header>

    <main class="card card-${bucketFor(progress)}">
      <div class="reading-meta">
        <span class="level-badge" data-level="${g.level}">${g.level}</span>
        <span class="reading-book-badge">${SOURCE_LABELS[g.source]}${g.chapter !== undefined ? ` · Chương ${g.chapter}` : ""}</span>
        <button id="change-filter" class="reading-change-filter" title="Về danh sách ngữ pháp">☰ Danh sách</button>
      </div>
      ${g.chapterTitle ? `<div class="reading-timeline">${g.chapterTitle}</div>` : ""}

      <div class="reading-toolbar-row">
        <button id="flag" class="secondary-action-btn reading-toggle-btn ${progress.flagged ? "reading-toggle-on" : ""}">
          ${progress.flagged ? "🚩 Bỏ đánh dấu khó" : "🚩 Đánh dấu khó"}
        </button>
        <button id="mastered-toggle" class="secondary-action-btn reading-toggle-btn ${progress.mastered ? "reading-toggle-on" : ""}">
          ${progress.mastered ? "✓ Đã thuộc" : "Đánh dấu đã thuộc"}
        </button>
      </div>

      <div class="vocab-word">${g.pattern}</div>

      <dl class="details">
        <dt>Nghĩa</dt>
        <dd>${g.meaningVi}</dd>
        ${g.usage ? `<dt>Cách dùng</dt><dd>${g.usage}</dd>` : ""}
        ${g.examTip ? `<dt>Key JLPT</dt><dd>${g.examTip}</dd>` : ""}
      </dl>

      <p class="example"><span class="example-jp">${g.example}</span><span class="example-vi">${g.exampleVi}</span></p>

      ${
        readingMatches.length > 0
          ? `<div class="related-vocab">
        <div class="related-vocab-label">📖 Xuất hiện trong bài đọc</div>
        <div class="related-vocab-list">
          ${readingMatches.map((p) => `<button class="related-vocab-item" data-open-reading="${p.id}">${p.title}</button>`).join("")}
        </div>
      </div>`
          : ""
      }

      ${
        quizBookMatches.length > 0
          ? `<div class="related-vocab">
        <div class="related-vocab-label">📝 Xuất hiện trong luyện đề</div>
        <div class="related-vocab-list">
          ${quizBookMatches.map((qq) => `<button class="related-vocab-item" data-open-quizbook="${qq.id}">${qq.question.slice(0, 24)}${qq.question.length > 24 ? "…" : ""}</button>`).join("")}
        </div>
      </div>`
          : ""
      }
    </main>

    <footer class="nav">
      <button id="prev" ${prevItem ? "" : "disabled"}>← Mẫu trước</button>
      <button id="next" ${nextItem ? "" : "disabled"}>Mẫu sau →</button>
    </footer>
  `;

  document.getElementById("back")!.addEventListener("click", onBack);
  wireExpandToTabButton("bunpo");
  document.getElementById("change-filter")!.addEventListener("click", backToList);

  document.getElementById("prev")?.addEventListener("click", () => {
    if (prevItem) goToItem(prevItem);
  });

  document.getElementById("next")?.addEventListener("click", () => {
    if (nextItem) goToItem(nextItem);
  });

  document.getElementById("flag")!.addEventListener("click", async () => {
    await toggleFlag(g.id);
    paintDetail(app, g, state, onBack, onOpenReading, onOpenQuizBook);
  });

  document.getElementById("mastered-toggle")!.addEventListener("click", async () => {
    await toggleMastered(g.id);
    paintDetail(app, g, state, onBack, onOpenReading, onOpenQuizBook);
  });

  app.querySelectorAll<HTMLButtonElement>("[data-open-reading]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const readingState = await loadReadingViewerState();
      await saveReadingViewerState({ ...readingState, currentPassageId: btn.dataset.openReading! });
      onOpenReading();
    });
  });

  app.querySelectorAll<HTMLButtonElement>("[data-open-quizbook]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const qbState = await loadQuizBookViewerState();
      await saveQuizBookViewerState({ ...qbState, currentQuestionId: btn.dataset.openQuizbook! });
      onOpenQuizBook();
    });
  });
}
