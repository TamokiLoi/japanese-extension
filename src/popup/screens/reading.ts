import type { ReadingPassage, ReadingLength, ReadingBook } from "../../types/reading.ts";
import {
  ALL_READING,
  AVAILABLE_LEVELS,
  AVAILABLE_LENGTHS,
  AVAILABLE_BOOKS,
  LENGTH_LABELS,
  BOOK_LABELS,
  BOOK_DIFFICULTY_NOTE,
  pickRandomPassage,
  findReadingById,
  loadViewerState,
  saveViewerState,
  getPassageProgress,
  resetPassageAnswers,
  type ReadingViewerState,
} from "../readingState.ts";
import type { JlptLevel } from "../../types/kanji.ts";
import { levelDotHtml } from "../levelColors.ts";
import { expandToTabButtonHtml, wireExpandToTabButton } from "../tabMode.ts";

export async function renderReadingScreen(app: HTMLElement, onBack: () => void) {
  const state = await loadViewerState();
  const passage = state.currentPassageId ? findReadingById(state.currentPassageId) : undefined;
  if (passage) {
    paintPassage(app, passage, state, onBack);
  } else {
    paintList(app, state, onBack);
  }
}

function matchesFilters(p: ReadingPassage, state: ReadingViewerState): boolean {
  return state.selectedLevels.includes(p.level) && state.selectedLengths.includes(p.length) && state.selectedBooks.includes(p.book);
}

function statusIcon(status: "not-started" | "in-progress" | "done", correct: number, total: number): string {
  if (status === "done") {
    const allCorrect = correct === total;
    return `<span class="reading-status-badge ${allCorrect ? "reading-status-perfect" : "reading-status-done"}">✓ ${correct}/${total}</span>`;
  }
  if (status === "in-progress") {
    return `<span class="reading-status-badge reading-status-progress">⋯ đang làm</span>`;
  }
  return `<span class="reading-status-badge reading-status-todo">chưa làm</span>`;
}

function paintList(app: HTMLElement, state: ReadingViewerState, onBack: () => void, error?: string) {
  // Each checkbox's count reflects the other two filter groups' current
  // selection (but not its own group's -- picking a second option in the
  // same group is a union, not an intersection). So ticking "Speed Master"
  // alone visibly shrinks the length counts to Speed Master's own split,
  // instead of always showing each group's global totals.
  const levelCheckboxes = AVAILABLE_LEVELS.map((level) => {
    const checked = state.selectedLevels.includes(level);
    const count = ALL_READING.filter(
      (p) => p.level === level && state.selectedLengths.includes(p.length) && state.selectedBooks.includes(p.book),
    ).length;
    return `
      <label class="level-check">
        <input type="checkbox" data-level="${level}" ${checked ? "checked" : ""} />
        ${levelDotHtml(level)}${level} <span class="muted">(${count})</span>
      </label>
    `;
  }).join("");

  const lengthCheckboxes = AVAILABLE_LENGTHS.map((length) => {
    const checked = state.selectedLengths.includes(length);
    const count = ALL_READING.filter(
      (p) => p.length === length && state.selectedLevels.includes(p.level) && state.selectedBooks.includes(p.book),
    ).length;
    return `
      <label class="quiz-radio">
        <input type="checkbox" data-length="${length}" ${checked ? "checked" : ""} />
        ${LENGTH_LABELS[length]} <span class="muted">(${count})</span>
      </label>
    `;
  }).join("");

  const bookCheckboxes = AVAILABLE_BOOKS.map((book) => {
    const checked = state.selectedBooks.includes(book);
    const count = ALL_READING.filter(
      (p) => p.book === book && state.selectedLevels.includes(p.level) && state.selectedLengths.includes(p.length),
    ).length;
    return `
      <label class="quiz-radio reading-book-radio">
        <input type="checkbox" data-book="${book}" ${checked ? "checked" : ""} />
        <span class="reading-book-radio-body">
          <span class="reading-book-radio-title">${BOOK_LABELS[book]}</span>
          <span class="reading-book-radio-note">${BOOK_DIFFICULTY_NOTE[book]} · ${count} bài</span>
        </span>
      </label>
    `;
  }).join("");

  const filtered = ALL_READING.filter((p) => matchesFilters(p, state));
  const doneCount = filtered.filter((p) => getPassageProgress(p, state.answers).status === "done").length;

  const statusFilterRow = (["all", "not-started", "done"] as const)
    .map((s) => {
      const labels = { all: "Tất cả", "not-started": "Chưa làm", done: "Đã làm" };
      const active = state.listStatusFilter === s;
      return `<button class="reading-status-filter-btn ${active ? "reading-status-filter-active" : ""}" data-status="${s}">${labels[s]}</button>`;
    })
    .join("");

  const visiblePassages = filtered.filter((p) => {
    if (state.listStatusFilter === "all") return true;
    const progress = getPassageProgress(p, state.answers);
    if (state.listStatusFilter === "done") return progress.status === "done";
    return progress.status !== "done";
  });

  // A grid of icon tiles instead of a tall list -- with ~127 passages, a
  // one-row-per-passage list means a lot of scrolling to see everything.
  // Tiles show status via a colored dot only; the title/book/length text
  // that used to sit inline moves into the detail panel below, shown on
  // hover/focus (see wireTileDetailPanel) so it never has to be truncated.
  const statusDotClass = (status: "not-started" | "in-progress" | "done", correct: number, total: number) => {
    if (status === "done") return correct === total ? "reading-tile-perfect" : "reading-tile-done";
    if (status === "in-progress") return "reading-tile-progress";
    return "reading-tile-todo";
  };

  const tileGrid = visiblePassages
    .map((p) => {
      const progress = getPassageProgress(p, state.answers);
      return `
        <button class="reading-tile ${statusDotClass(progress.status, progress.correct, progress.total)}" data-id="${p.id}">読</button>
      `;
    })
    .join("");

  app.innerHTML = `
    <header class="toolbar">
      <button id="back" class="icon-btn" title="Về menu">←</button>
      <span class="counter">Luyện đọc</span>
      ${expandToTabButtonHtml()}
    </header>

    <section class="quiz-setup">
      ${
        AVAILABLE_LEVELS.length > 1
          ? `<div class="quiz-setup-group">
        <div class="quiz-setup-label">Cấp độ</div>
        <div class="level-selector-inline">${levelCheckboxes}</div>
      </div>`
          : ""
      }

      <div class="quiz-setup-group">
        <div class="quiz-setup-label">Sách</div>
        <div class="reading-book-radio-row">${bookCheckboxes}</div>
      </div>

      <div class="quiz-setup-group">
        <div class="quiz-setup-label">Độ dài bài đọc</div>
        <div class="quiz-radio-row">${lengthCheckboxes}</div>
      </div>

      ${error ? `<p class="quiz-error">${error}</p>` : ""}

      <button id="start" class="primary-action-btn">🎲 Random bài đọc</button>
    </section>

    <section class="reading-list-section">
      <div class="reading-list-summary">
        <span>Đã hoàn thành <strong>${doneCount}/${filtered.length}</strong> bài</span>
        <div class="reading-status-filter-row">${statusFilterRow}</div>
      </div>
      <div class="reading-detail" id="reading-detail">
        <span class="reading-detail-empty">Di chuột vào một bài để xem chi tiết, bấm để mở</span>
      </div>
      ${
        visiblePassages.length === 0
          ? `<p class="quiz-error reading-empty">Không có bài đọc nào khớp bộ lọc này.</p>`
          : `<div class="reading-tile-grid">${tileGrid}</div>`
      }
    </section>
  `;

  document.getElementById("back")!.addEventListener("click", onBack);
  wireExpandToTabButton("reading");

  app.querySelectorAll<HTMLInputElement>("input[data-level]").forEach((input) => {
    input.addEventListener("change", async () => {
      const level = input.dataset.level as JlptLevel;
      const next = input.checked
        ? [...new Set([...state.selectedLevels, level])]
        : state.selectedLevels.filter((l) => l !== level);
      if (next.length === 0) {
        paintList(app, state, onBack);
        return;
      }
      const newState = { ...state, selectedLevels: next };
      await saveViewerState(newState);
      paintList(app, newState, onBack);
    });
  });

  app.querySelectorAll<HTMLInputElement>("input[data-length]").forEach((input) => {
    input.addEventListener("change", async () => {
      const length = input.dataset.length as ReadingLength;
      const next = input.checked
        ? [...new Set([...state.selectedLengths, length])]
        : state.selectedLengths.filter((l) => l !== length);
      if (next.length === 0) {
        paintList(app, state, onBack);
        return;
      }
      const newState = { ...state, selectedLengths: next };
      await saveViewerState(newState);
      paintList(app, newState, onBack);
    });
  });

  app.querySelectorAll<HTMLInputElement>("input[data-book]").forEach((input) => {
    input.addEventListener("change", async () => {
      const book = input.dataset.book as ReadingBook;
      const next = input.checked
        ? [...new Set([...state.selectedBooks, book])]
        : state.selectedBooks.filter((b) => b !== book);
      if (next.length === 0) {
        paintList(app, state, onBack);
        return;
      }
      const newState = { ...state, selectedBooks: next };
      await saveViewerState(newState);
      paintList(app, newState, onBack);
    });
  });

  app.querySelectorAll<HTMLButtonElement>(".reading-status-filter-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const status = btn.dataset.status as ReadingViewerState["listStatusFilter"];
      const newState = { ...state, listStatusFilter: status };
      await saveViewerState(newState);
      paintList(app, newState, onBack);
    });
  });

  document.getElementById("start")!.addEventListener("click", async () => {
    const passage = pickRandomPassage(state.selectedLevels, state.selectedLengths, state.selectedBooks);
    if (!passage) {
      paintList(app, state, onBack, "Không có bài đọc nào khớp bộ lọc này.");
      return;
    }
    const newState: ReadingViewerState = {
      ...state,
      currentPassageId: passage.id,
      answers: { ...state.answers, [passage.id]: state.answers[passage.id] ?? passage.questions.map(() => null) },
    };
    await saveViewerState(newState);
    paintPassage(app, passage, newState, onBack);
  });

  app.querySelectorAll<HTMLButtonElement>(".reading-tile").forEach((tile) => {
    tile.addEventListener("click", async () => {
      const passage = findReadingById(tile.dataset.id!);
      if (!passage) return;
      const newState: ReadingViewerState = {
        ...state,
        currentPassageId: passage.id,
        answers: { ...state.answers, [passage.id]: state.answers[passage.id] ?? passage.questions.map(() => null) },
      };
      await saveViewerState(newState);
      paintPassage(app, passage, newState, onBack);
    });
  });

  wireTileDetailPanel(app, state, onBack);
}

// Hovering (or tab-focusing, for keyboard users) a tile fills this panel
// with the passage's title/meta/status instead of a per-tile tooltip --
// tooltips risk clipping against the 320px popup's edges, a fixed panel
// never does. The panel stays showing the last-hovered tile even after the
// mouse leaves it, so its "Làm lại" button stays reachable on the way down.
function wireTileDetailPanel(app: HTMLElement, state: ReadingViewerState, onBack: () => void) {
  const panel = document.getElementById("reading-detail")!;

  const showDetail = (id: string) => {
    const passage = findReadingById(id);
    if (!passage) return;
    const progress = getPassageProgress(passage, state.answers);
    panel.innerHTML = `
      <div class="reading-detail-title">${passage.title}</div>
      <div class="reading-detail-meta">
        ${BOOK_LABELS[passage.book]} · ${LENGTH_LABELS[passage.length]}${AVAILABLE_LEVELS.length > 1 ? ` · ${passage.level}` : ""} · ${timelineLabel(passage)}
      </div>
      <div class="reading-detail-footer">
        ${statusIcon(progress.status, progress.correct, progress.total)}
        ${
          progress.status !== "not-started"
            ? `<button class="reading-reset-btn" id="reading-detail-reset" data-reset-id="${id}">↺ Làm lại</button>`
            : ""
        }
      </div>
    `;
    document.getElementById("reading-detail-reset")?.addEventListener("click", async () => {
      if (!confirm(`Làm lại "${passage.title}" từ đầu? Kết quả đã trả lời sẽ bị xoá.`)) return;
      const newState = resetPassageAnswers(state, id);
      await saveViewerState(newState);
      paintList(app, newState, onBack);
    });
  };

  app.querySelectorAll<HTMLButtonElement>(".reading-tile").forEach((tile) => {
    tile.addEventListener("mouseenter", () => showDetail(tile.dataset.id!));
    tile.addEventListener("focus", () => showDetail(tile.dataset.id!));
  });
}

// Minutes shown as a small range around the stored estimate, so it reads
// like "~3-4 phút" instead of implying false precision.
function timelineLabel(passage: ReadingPassage): string {
  const min = passage.estimatedMinutes;
  const max = min + (passage.length === "long" ? 3 : passage.length === "medium" ? 2 : 1);
  return `${LENGTH_LABELS[passage.length]} · ~${min}-${max} phút`;
}

function renderBody(passage: ReadingPassage, showFurigana: boolean): string {
  return passage.body
    .map((seg) => {
      if (showFurigana && seg.furigana) {
        return `<ruby>${seg.text}<rt>${seg.furigana}</rt></ruby>`;
      }
      return seg.text.replace(/\n/g, "<br>");
    })
    .join("");
}

function paintPassage(app: HTMLElement, passage: ReadingPassage, state: ReadingViewerState, onBack: () => void) {
  const answers = state.answers[passage.id] ?? passage.questions.map(() => null);
  const answeredCount = answers.filter((a) => a !== null).length;
  const total = passage.questions.length;
  const allAnswered = answeredCount >= total;
  const correctCount = passage.questions.filter((q, qi) => answers[qi] === q.correctIndex).length;

  const backToList = async () => {
    const newState = { ...state, currentPassageId: null };
    await saveViewerState(newState);
    paintList(app, newState, onBack);
  };

  app.innerHTML = `
    <header class="toolbar">
      <button id="back" class="icon-btn" title="Về menu">←</button>
      <span class="counter">Luyện đọc</span>
      ${expandToTabButtonHtml()}
    </header>

    <main class="reading-card">
      <div class="reading-meta">
        <span class="level-badge" data-level="${passage.level}">${passage.level}</span>
        <span class="reading-book-badge">${BOOK_LABELS[passage.book]}</span>
        <span class="reading-timeline">${timelineLabel(passage)}</span>
        <button id="change-filter" class="reading-change-filter" title="Về danh sách bài đọc">☰ Danh sách</button>
      </div>
      <h2 class="reading-title">${passage.title}</h2>

      <div class="reading-progress-row">
        <div class="reading-progress-bar"><div class="reading-progress-bar-fill" style="width:${total ? (answeredCount / total) * 100 : 0}%"></div></div>
        <span class="reading-progress-label">${answeredCount}/${total} câu</span>
        ${answeredCount > 0 ? `<button id="reset-passage" class="reading-reset-btn" title="Làm lại từ đầu">↺ Làm lại</button>` : ""}
      </div>

      ${
        allAnswered && total > 0
          ? `<div class="reading-score-banner ${correctCount === total ? "reading-score-perfect" : ""}">
              ${correctCount === total ? "🎉" : "📊"} Đúng ${correctCount}/${total} câu (${Math.round((correctCount / total) * 100)}%)
            </div>`
          : ""
      }

      <div class="reading-toolbar-row">
        <button id="toggle-furigana" class="secondary-action-btn reading-toggle-btn ${state.showFurigana ? "reading-toggle-on" : ""}">
          ${state.showFurigana ? "Ẩn furigana" : "Hiện furigana"}
        </button>
        <button id="toggle-translation" class="secondary-action-btn reading-toggle-btn ${state.showTranslation ? "reading-toggle-on" : ""}">
          ${state.showTranslation ? "Ẩn bản dịch" : "Xem bản dịch"}
        </button>
        ${
          passage.studyNote
            ? `<button id="toggle-study-note" class="secondary-action-btn reading-toggle-btn ${state.showStudyNote ? "reading-toggle-on" : ""}">
                ${state.showStudyNote ? "Ẩn ghi chú" : "Xem ghi chú"}
              </button>`
            : ""
        }
      </div>

      <div class="reading-body">${renderBody(passage, state.showFurigana)}</div>

      ${
        state.showTranslation
          ? `<div class="reading-translation">${passage.translationVi.replace(/\n/g, "<br>")}</div>`
          : ""
      }

      ${
        state.showStudyNote && passage.studyNote
          ? `<div class="reading-study-note">${passage.studyNote.replace(/\n/g, "<br>")}</div>`
          : ""
      }

      <div class="reading-questions">
        ${passage.questions
          .map((q, qi) => {
            const answered = answers[qi];
            return `
          <div class="reading-question">
            <div class="reading-question-prompt">Câu ${qi + 1}: ${q.question}</div>
            <div class="quiz-choices">
              ${q.options
                .map((opt, oi) => {
                  const classes = ["quiz-choice"];
                  if (answered !== null) {
                    if (oi === q.correctIndex) classes.push("quiz-choice-correct");
                    else if (oi === answered) classes.push("quiz-choice-wrong");
                  }
                  return `<button class="${classes.join(" ")}" data-qi="${qi}" data-oi="${oi}" ${answered !== null ? "disabled" : ""}>${opt}</button>`;
                })
                .join("")}
            </div>
            ${answered !== null ? `<div class="reading-question-vi">${q.questionVi}</div><div class="reading-explanation">${q.explanation}</div>` : ""}
          </div>
        `;
          })
          .join("")}
      </div>

      <button id="another" class="primary-action-btn reading-another-btn">🎲 Bài khác</button>
    </main>
  `;

  document.getElementById("back")!.addEventListener("click", onBack);
  wireExpandToTabButton("reading");

  document.getElementById("change-filter")!.addEventListener("click", backToList);

  document.getElementById("reset-passage")?.addEventListener("click", async () => {
    if (!confirm(`Làm lại "${passage.title}" từ đầu? Kết quả đã trả lời sẽ bị xoá.`)) return;
    const newState = resetPassageAnswers(state, passage.id);
    await saveViewerState(newState);
    paintPassage(app, passage, newState, onBack);
  });

  document.getElementById("toggle-furigana")!.addEventListener("click", async () => {
    const newState = { ...state, showFurigana: !state.showFurigana };
    await saveViewerState(newState);
    paintPassage(app, passage, newState, onBack);
  });

  document.getElementById("toggle-translation")!.addEventListener("click", async () => {
    const newState = { ...state, showTranslation: !state.showTranslation };
    await saveViewerState(newState);
    paintPassage(app, passage, newState, onBack);
  });

  document.getElementById("toggle-study-note")?.addEventListener("click", async () => {
    const newState = { ...state, showStudyNote: !state.showStudyNote };
    await saveViewerState(newState);
    paintPassage(app, passage, newState, onBack);
  });

  app.querySelectorAll<HTMLButtonElement>(".reading-questions .quiz-choice").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const qi = Number(btn.dataset.qi);
      const oi = Number(btn.dataset.oi);
      const newAnswers = [...answers];
      newAnswers[qi] = oi;
      const newState = { ...state, answers: { ...state.answers, [passage.id]: newAnswers } };
      await saveViewerState(newState);
      paintPassage(app, passage, newState, onBack);
    });
  });

  document.getElementById("another")!.addEventListener("click", async () => {
    const next = pickRandomPassage(state.selectedLevels, state.selectedLengths, state.selectedBooks, passage.id);
    if (!next) {
      const newState = { ...state, currentPassageId: null };
      await saveViewerState(newState);
      paintList(app, newState, onBack, "Không có bài đọc nào khớp bộ lọc này.");
      return;
    }
    const newState: ReadingViewerState = {
      ...state,
      currentPassageId: next.id,
      answers: { ...state.answers, [next.id]: state.answers[next.id] ?? next.questions.map(() => null) },
    };
    await saveViewerState(newState);
    paintPassage(app, next, newState, onBack);
  });
}
