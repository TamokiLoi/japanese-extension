import type { QuizBookQuestion, QuizBookCategory } from "../../types/quizBook.ts";
import {
  ALL_QUIZBOOK,
  AVAILABLE_CATEGORIES,
  AVAILABLE_GROUPS,
  GROUP_LABELS,
  BOOK_GROUP,
  booksInGroup,
  CATEGORY_LABELS,
  BOOK_LABELS,
  BOOK_LEVELS,
  QUESTION_COUNT_OPTIONS,
  ALL_QUESTIONS_SENTINEL,
  pickRandomQuestion,
  findQuizBookById,
  loadViewerState,
  saveViewerState,
  getQuestionProgress,
  resetQuestionAnswer,
  recordAnswer,
  buildSession,
  type QuizBookGroup,
  type QuizBookViewerState,
} from "../quizBookState.ts";
import { levelDotHtml } from "../levelColors.ts";
import { expandToTabButtonHtml, wireExpandToTabButton } from "../tabMode.ts";

export async function renderQuizBookScreen(app: HTMLElement, onBack: () => void) {
  const state = await loadViewerState();
  const question = state.currentQuestionId ? findQuizBookById(state.currentQuestionId) : undefined;
  if (question) {
    paintQuestion(app, question, state, onBack);
  } else {
    paintList(app, state, onBack);
  }
}

function matchesFilters(q: QuizBookQuestion, state: QuizBookViewerState): boolean {
  return state.selectedCategories.includes(q.category) && state.selectedBooks.includes(q.book);
}

function statusIcon(status: "not-started" | "done" | "known", correct: boolean): string {
  if (status === "known") {
    return `<span class="reading-status-badge reading-status-known">★ đã biết</span>`;
  }
  if (status === "done") {
    return `<span class="reading-status-badge ${correct ? "reading-status-perfect" : "reading-status-done"}">${correct ? "✓ đúng" : "✗ sai"}</span>`;
  }
  return `<span class="reading-status-badge reading-status-todo">chưa làm</span>`;
}

function paintList(app: HTMLElement, state: QuizBookViewerState, onBack: () => void, error?: string) {
  const categoryCheckboxes = AVAILABLE_CATEGORIES.map((category) => {
    const checked = state.selectedCategories.includes(category);
    const count = ALL_QUIZBOOK.filter((q) => q.category === category && state.selectedBooks.includes(q.book)).length;
    return `
      <label class="quiz-radio">
        <input type="checkbox" data-category="${category}" ${checked ? "checked" : ""} />
        ${CATEGORY_LABELS[category]} <span class="muted">(${count})</span>
      </label>
    `;
  }).join("");

  const groupTabs = AVAILABLE_GROUPS.map((group) => {
    const active = state.selectedGroup === group;
    const count = ALL_QUIZBOOK.filter((q) => BOOK_GROUP[q.book] === group).length;
    return `
      <label class="quiz-radio">
        <input type="radio" name="group" value="${group}" ${active ? "checked" : ""} />
        ${GROUP_LABELS[group]} <span class="muted">(${count})</span>
      </label>
    `;
  }).join("");

  const bookCheckboxes = booksInGroup(state.selectedGroup).map((book) => {
    const checked = state.selectedBooks.includes(book);
    const count = ALL_QUIZBOOK.filter((q) => q.book === book && state.selectedCategories.includes(q.category)).length;
    return `
      <label class="quiz-radio reading-book-radio">
        <input type="checkbox" data-book="${book}" ${checked ? "checked" : ""} />
        <span class="reading-book-radio-body">
          <span class="reading-book-radio-title">${levelDotHtml(BOOK_LEVELS[book])}${BOOK_LABELS[book]}</span>
          <span class="reading-book-radio-note">${count} câu</span>
        </span>
      </label>
    `;
  }).join("");

  const filtered = ALL_QUIZBOOK.filter((q) => matchesFilters(q, state));
  const progressOf = (q: QuizBookQuestion) => getQuestionProgress(q.id, state.answers, state.correctStreaks);
  const doneCount = filtered.filter((q) => progressOf(q).status !== "not-started").length;
  const knownCount = filtered.filter((q) => progressOf(q).status === "known").length;
  const correctCount = filtered.filter((q) => progressOf(q).correct).length;

  const statusFilterRow = (["all", "not-started", "done", "known"] as const)
    .map((s) => {
      const labels = { all: "Tất cả", "not-started": "Chưa làm", done: "Đã làm", known: "Đã biết" };
      const active = state.listStatusFilter === s;
      return `<button class="reading-status-filter-btn ${active ? "reading-status-filter-active" : ""}" data-status="${s}">${labels[s]}</button>`;
    })
    .join("");

  const visibleQuestions = filtered.filter((q) => {
    if (state.listStatusFilter === "all") return true;
    const status = progressOf(q).status;
    if (state.listStatusFilter === "done") return status === "done" || status === "known";
    return status === state.listStatusFilter;
  });

  const CATEGORY_ICON: Record<QuizBookCategory, string> = { moji: "字", goi: "語", bunpou: "文" };
  const tileGrid = visibleQuestions
    .map((q) => {
      const progress = progressOf(q);
      const cls =
        progress.status === "known"
          ? "reading-tile-known"
          : progress.status === "done"
            ? progress.correct
              ? "reading-tile-perfect"
              : "reading-tile-done reading-tile-wrong"
            : "reading-tile-todo";
      return `<button class="reading-tile ${cls}" data-id="${q.id}">${CATEGORY_ICON[q.category]}</button>`;
    })
    .join("");

  const quizPoolSize = filtered.length;
  const defaultCount = Math.min(state.questionCount, quizPoolSize) || quizPoolSize;
  const countOptions = [...QUESTION_COUNT_OPTIONS.filter((n) => n <= quizPoolSize), ALL_QUESTIONS_SENTINEL];
  const selectedCount =
    state.questionCount >= quizPoolSize
      ? ALL_QUESTIONS_SENTINEL
      : countOptions.reduce((closest, n) => (Math.abs(n - defaultCount) < Math.abs(closest - defaultCount) ? n : closest));
  const effectiveCount = Math.min(selectedCount, quizPoolSize);

  app.innerHTML = `
    <header class="toolbar">
      <button id="back" class="icon-btn" title="Về menu">←</button>
      <span class="counter">Luyện đề</span>
      ${expandToTabButtonHtml()}
    </header>

    <section class="quiz-setup">
      ${
        AVAILABLE_GROUPS.length > 1
          ? `<div class="quiz-setup-group">
        <div class="quiz-setup-label">Nguồn</div>
        <div class="quiz-radio-row">${groupTabs}</div>
      </div>`
          : ""
      }

      <div class="quiz-setup-group">
        <div class="quiz-setup-label">${GROUP_LABELS[state.selectedGroup]}</div>
        <div class="reading-book-radio-row">${bookCheckboxes}</div>
      </div>

      <div class="quiz-setup-group">
        <div class="quiz-setup-label">Dạng câu hỏi</div>
        <div class="quiz-radio-row">${categoryCheckboxes}</div>
      </div>

      <div class="quiz-setup-group">
        <div class="quiz-setup-label">Số câu (trong ${quizPoolSize} câu khớp bộ lọc)</div>
        <div class="quiz-count-row">
          <select id="question-count">
            ${countOptions
              .map(
                (n) =>
                  `<option value="${n}" ${n === selectedCount ? "selected" : ""}>${n === ALL_QUESTIONS_SENTINEL ? "Tất cả" : `${n} câu`}</option>`,
              )
              .join("")}
          </select>
        </div>
      </div>

      ${error ? `<p class="quiz-error">${error}</p>` : ""}

      <button id="start" class="primary-action-btn">🎲 Bắt đầu (${effectiveCount} câu)</button>
    </section>

    <section class="reading-list-section">
      <div class="reading-list-summary">
        <span>Đã làm <strong>${doneCount}/${filtered.length}</strong> câu · đúng <strong>${correctCount}/${doneCount || 0}</strong> · đã biết <strong>${knownCount}</strong></span>
        <div class="reading-status-filter-row">${statusFilterRow}</div>
      </div>
      <div class="reading-detail" id="quizbook-detail">
        <span class="reading-detail-empty">Di chuột vào một câu để xem chi tiết, bấm để mở</span>
      </div>
      ${
        visibleQuestions.length === 0
          ? `<p class="quiz-error reading-empty">Không có câu hỏi nào khớp bộ lọc này.</p>`
          : `<div class="reading-tile-grid">${tileGrid}</div>`
      }
    </section>
  `;

  document.getElementById("back")!.addEventListener("click", onBack);
  wireExpandToTabButton("quizBook");

  app.querySelectorAll<HTMLInputElement>('input[name="group"]').forEach((input) => {
    input.addEventListener("change", async () => {
      const group = input.value as QuizBookGroup;
      if (group === state.selectedGroup) return;
      const newState: QuizBookViewerState = { ...state, selectedGroup: group, selectedBooks: booksInGroup(group) };
      await saveViewerState(newState);
      paintList(app, newState, onBack);
    });
  });

  app.querySelectorAll<HTMLInputElement>("input[data-category]").forEach((input) => {
    input.addEventListener("change", async () => {
      const category = input.dataset.category as QuizBookCategory;
      const next = input.checked
        ? [...new Set([...state.selectedCategories, category])]
        : state.selectedCategories.filter((c) => c !== category);
      if (next.length === 0) return paintList(app, state, onBack);
      const newState = { ...state, selectedCategories: next };
      await saveViewerState(newState);
      paintList(app, newState, onBack);
    });
  });

  app.querySelectorAll<HTMLInputElement>("input[data-book]").forEach((input) => {
    input.addEventListener("change", async () => {
      const book = input.dataset.book!;
      const next = input.checked ? [...new Set([...state.selectedBooks, book])] : state.selectedBooks.filter((b) => b !== book);
      if (next.length === 0) return paintList(app, state, onBack);
      const newState = { ...state, selectedBooks: next };
      await saveViewerState(newState);
      paintList(app, newState, onBack);
    });
  });

  app.querySelectorAll<HTMLButtonElement>(".reading-status-filter-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const status = btn.dataset.status as QuizBookViewerState["listStatusFilter"];
      const newState = { ...state, listStatusFilter: status };
      await saveViewerState(newState);
      paintList(app, newState, onBack);
    });
  });

  const countSelect = document.getElementById("question-count") as HTMLSelectElement;
  countSelect.addEventListener("change", async () => {
    const newState = { ...state, questionCount: Number(countSelect.value) };
    await saveViewerState(newState);
    paintList(app, newState, onBack);
  });

  document.getElementById("start")!.addEventListener("click", async () => {
    if (filtered.length === 0) return paintList(app, state, onBack, "Không có câu hỏi nào khớp bộ lọc này.");
    const sessionIds = buildSession(filtered, state.questionCount);
    const first = findQuizBookById(sessionIds[0])!;
    const newState: QuizBookViewerState = { ...state, currentQuestionId: first.id, sessionIds, sessionIndex: 0 };
    await saveViewerState(newState);
    paintQuestion(app, first, newState, onBack);
  });

  app.querySelectorAll<HTMLButtonElement>(".reading-tile").forEach((tile) => {
    tile.addEventListener("click", async () => {
      const q = findQuizBookById(tile.dataset.id!);
      if (!q) return;
      const newState: QuizBookViewerState = { ...state, currentQuestionId: q.id, sessionIds: null, sessionIndex: 0 };
      await saveViewerState(newState);
      paintQuestion(app, q, newState, onBack);
    });
  });

  wireDetailPanel(app, state, onBack);
}

function wireDetailPanel(app: HTMLElement, state: QuizBookViewerState, onBack: () => void) {
  const panel = document.getElementById("quizbook-detail")!;
  const showDetail = (id: string) => {
    const q = findQuizBookById(id);
    if (!q) return;
    const progress = getQuestionProgress(id, state.answers, state.correctStreaks);
    panel.innerHTML = `
      <div class="reading-detail-title">${q.question}</div>
      <div class="reading-detail-meta">${BOOK_LABELS[q.book]} · ${CATEGORY_LABELS[q.category]} · ${q.level}</div>
      <div class="reading-detail-footer">
        ${statusIcon(progress.status, progress.correct)}
        ${
          progress.status !== "not-started"
            ? `<button class="reading-reset-btn" id="quizbook-detail-reset" data-reset-id="${id}">↺ Làm lại</button>`
            : ""
        }
      </div>
    `;
    document.getElementById("quizbook-detail-reset")?.addEventListener("click", async () => {
      if (!confirm(`Làm lại câu này từ đầu? Kết quả đã trả lời sẽ bị xoá.`)) return;
      const newState = resetQuestionAnswer(state, id);
      await saveViewerState(newState);
      paintList(app, newState, onBack);
    });
  };
  app.querySelectorAll<HTMLButtonElement>(".reading-tile").forEach((tile) => {
    tile.addEventListener("mouseenter", () => showDetail(tile.dataset.id!));
    tile.addEventListener("focus", () => showDetail(tile.dataset.id!));
  });
}

function paintQuestion(app: HTMLElement, q: QuizBookQuestion, state: QuizBookViewerState, onBack: () => void) {
  const answered = state.answers[q.id] ?? null;
  const session = state.sessionIds;
  const sessionPos = session ? session.indexOf(q.id) : -1;
  const isLastInSession = session !== null && sessionPos === session.length - 1;

  const backToList = async () => {
    const newState = { ...state, currentQuestionId: null };
    await saveViewerState(newState);
    paintList(app, newState, onBack);
  };

  app.innerHTML = `
    <header class="toolbar">
      <button id="back" class="icon-btn" title="Về menu">←</button>
      <span class="counter">Luyện đề</span>
      ${expandToTabButtonHtml()}
    </header>

    <main class="reading-card">
      <div class="reading-meta">
        <span class="level-badge" data-level="${q.level}">${q.level}</span>
        <span class="reading-book-badge">${BOOK_LABELS[q.book]}</span>
        <span class="reading-timeline">${CATEGORY_LABELS[q.category]}</span>
        ${session ? `<span class="reading-book-badge">Câu ${sessionPos + 1}/${session.length}</span>` : ""}
        <button id="change-filter" class="reading-change-filter" title="Về danh sách câu hỏi">☰ Danh sách</button>
      </div>

      <div class="reading-question">
        <div class="reading-question-prompt">${q.question}</div>
        <div class="quiz-choices">
          ${q.options
            .map((opt, oi) => {
              const classes = ["quiz-choice"];
              if (answered !== null) {
                if (oi === q.correctIndex) classes.push("quiz-choice-correct");
                else if (oi === answered) classes.push("quiz-choice-wrong");
              }
              return `<button class="${classes.join(" ")}" data-oi="${oi}" ${answered !== null ? "disabled" : ""}>${opt}</button>`;
            })
            .join("")}
        </div>
      </div>

      ${
        answered !== null
          ? `${q.explanation ? `<div class="reading-question-vi">${q.explanation}</div>` : ""}
             ${q.notes.length ? `<div class="reading-explanation">${q.notes.join(" · ")}</div>` : ""}
             <button id="reset-question" class="reading-reset-btn" title="Làm lại từ đầu">↺ Làm lại câu này</button>`
          : ""
      }

      <button id="another" class="primary-action-btn reading-another-btn">${
        session ? (isLastInSession ? "🏁 Hoàn thành" : "➜ Câu tiếp theo") : "🎲 Câu khác"
      }</button>
    </main>
  `;

  document.getElementById("back")!.addEventListener("click", onBack);
  wireExpandToTabButton("quizBook");
  document.getElementById("change-filter")!.addEventListener("click", backToList);

  app.querySelectorAll<HTMLButtonElement>(".quiz-choices .quiz-choice").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const oi = Number(btn.dataset.oi);
      const newState = recordAnswer(state, q.id, oi);
      await saveViewerState(newState);
      paintQuestion(app, q, newState, onBack);
    });
  });

  document.getElementById("reset-question")?.addEventListener("click", async () => {
    if (!confirm(`Làm lại câu này từ đầu? Kết quả đã trả lời sẽ bị xoá.`)) return;
    const newState = resetQuestionAnswer(state, q.id);
    await saveViewerState(newState);
    paintQuestion(app, q, newState, onBack);
  });

  document.getElementById("another")!.addEventListener("click", async () => {
    if (session) {
      if (isLastInSession) {
        const newState: QuizBookViewerState = { ...state, currentQuestionId: null, sessionIds: null, sessionIndex: 0 };
        await saveViewerState(newState);
        return paintList(app, newState, onBack);
      }
      const next = findQuizBookById(session[sessionPos + 1])!;
      const newState: QuizBookViewerState = { ...state, currentQuestionId: next.id, sessionIndex: sessionPos + 1 };
      await saveViewerState(newState);
      return paintQuestion(app, next, newState, onBack);
    }

    const next = pickRandomQuestion(state.selectedCategories, state.selectedBooks, q.id);
    if (!next) {
      const newState = { ...state, currentQuestionId: null };
      await saveViewerState(newState);
      return paintList(app, newState, onBack, "Không có câu hỏi nào khớp bộ lọc này.");
    }
    const newState: QuizBookViewerState = { ...state, currentQuestionId: next.id };
    await saveViewerState(newState);
    paintQuestion(app, next, newState, onBack);
  });
}
