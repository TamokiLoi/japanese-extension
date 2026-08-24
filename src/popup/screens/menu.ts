import { ALL_KANJI } from "../kanjiState.ts";
import { ALL_VOCAB } from "../vocabState.ts";
import { ALL_JLPT_HISTORY } from "../jlptHistoryState.ts";
import { ALL_READING } from "../readingState.ts";
import { ALL_QUIZBOOK } from "../quizBookState.ts";
import { countMastered, getStudyStreak } from "../progressState.ts";
import { exportBackupJson, importBackupJson } from "../backupState.ts";
import {
  INTERVAL_OPTIONS_MINUTES,
  MAX_INTERVAL_MINUTES,
  MIN_INTERVAL_MINUTES,
  loadReminderSettings,
  loadQuizReminderSettings,
  type ReminderContentType,
  type ReminderSettings,
  type QuizReminderSettings,
} from "../../reminder.ts";
import { pickReminderItem, formatReminderNotification } from "../../reminderContent.ts";
import type { SetReminderMessage, SetQuizReminderMessage, OpenQuizTabMessage } from "../../background/index.ts";

// Hidden (not deleted) while "Luyện đọc" takes its slot in the menu -- the
// screen, route, and data behind it are untouched, so flip this back to
// bring it back later.
const SHOW_JLPT_HISTORY_MENU_ITEM = false;

const CONTENT_TYPE_LABELS: Record<ReminderContentType, string> = {
  kanji: "Kanji",
  vocab: "Từ vựng",
  both: "Cả hai",
};

async function persistReminderSettings(settings: ReminderSettings): Promise<void> {
  const message: SetReminderMessage = { type: "SET_REMINDER", settings };
  await chrome.runtime.sendMessage(message);
}

async function persistQuizReminderSettings(settings: QuizReminderSettings): Promise<void> {
  const message: SetQuizReminderMessage = { type: "SET_QUIZ_REMINDER", settings };
  await chrome.runtime.sendMessage(message);
}

function formatInterval(minutes: number): string {
  if (minutes < 60) return `${minutes} phút`;
  return `${minutes / 60} giờ`;
}

function clampIntervalMinutes(minutes: number): number {
  if (!Number.isFinite(minutes)) return MIN_INTERVAL_MINUTES;
  return Math.min(MAX_INTERVAL_MINUTES, Math.max(MIN_INTERVAL_MINUTES, Math.round(minutes)));
}

// Reads the interval currently selected in one reminder row (preset select,
// or the custom number input when "Tùy chỉnh..." is picked) without
// persisting anything -- used both while editing a row and by the single
// bottom "Áp dụng" button that saves every row at once.
function readRowIntervalMinutes(intervalSelect: HTMLSelectElement, customInput: HTMLInputElement): number {
  return intervalSelect.value === CUSTOM_OPTION_VALUE
    ? clampIntervalMinutes(Number(customInput.value))
    : Number(intervalSelect.value);
}

type MenuScreen = "kanji" | "vocab" | "quiz" | "search" | "jlptHistory" | "stats" | "reading" | "quizBook";

export async function renderMenuScreen(app: HTMLElement, onSelect: (screen: MenuScreen) => void) {
  const [kanjiMastered, vocabMastered, streak] = await Promise.all([
    countMastered(ALL_KANJI.map((k) => k.id)),
    countMastered(ALL_VOCAB.map((v) => v.id)),
    getStudyStreak(),
  ]);

  app.innerHTML = `
    <header class="menu-header">
      <button id="author-info-btn" class="icon-btn menu-info-btn" title="Thông tin tác giả">ℹ</button>
      <div class="menu-title-row">
        <img src="${chrome.runtime.getURL("public/icons/icon48.png")}" class="menu-logo" alt="" />
        <span class="menu-title">Nihongo Nin<span class="menu-title-jp">日本語忍</span></span>
      </div>
      <div class="menu-subtitle-quote">
        石の上にも三年
        <span class="menu-subtitle-note">(có công mài sắt, có ngày nên kim)</span>
      </div>
      ${streak > 0 ? `<div class="streak-badge">🔥 ${streak} ngày liên tiếp</div>` : ""}
    </header>

    <div id="author-info-overlay" class="author-info-overlay" style="display:none">
      <div class="author-info-modal">
        <button id="author-info-close" class="icon-btn author-info-close" title="Đóng">✕</button>
        <div class="author-info-title">Thông tin tác giả</div>
        <dl class="author-info-list">
          <dt>Tác giả</dt>
          <dd>Tamoki Nguyễn</dd>
          <dt>Ngày tạo</dt>
          <dd>20/08/2026</dd>
          <dt>Liên hệ</dt>
          <dd>0938947221 · <a href="https://github.com/TamokiLoi" target="_blank" rel="noopener">Github</a></dd>
        </dl>
      </div>
    </div>

    <nav class="menu-list">
      <button class="menu-item" data-screen="search">
        <span class="menu-item-icon">🔍</span>
        <span class="menu-item-body">
          <span class="menu-item-title">Tra cứu</span>
          <span class="menu-item-desc">Tìm nhanh Kanji hoặc từ vựng</span>
        </span>
      </button>

      <button class="menu-item" data-screen="kanji">
        <span class="menu-item-icon">字</span>
        <span class="menu-item-body">
          <span class="menu-item-title">Kanji</span>
          <span class="menu-item-desc">${ALL_KANJI.length} chữ Hán, các cấp độ JLPT${kanjiMastered > 0 ? ` · ${kanjiMastered} đã thuộc` : ""}</span>
        </span>
      </button>

      <button class="menu-item" data-screen="vocab">
        <span class="menu-item-icon">語</span>
        <span class="menu-item-body">
          <span class="menu-item-title">Goi</span>
          <span class="menu-item-desc">${ALL_VOCAB.length} từ, N4-N3${vocabMastered > 0 ? ` · ${vocabMastered} đã thuộc` : ""}</span>
        </span>
      </button>

      ${
        SHOW_JLPT_HISTORY_MENU_ITEM
          ? `
      <button class="menu-item" data-screen="jlptHistory">
        <span class="menu-item-icon">📝</span>
        <span class="menu-item-body">
          <span class="menu-item-title">Goi đã ra trong các kỳ JLPT</span>
          <span class="menu-item-desc">${ALL_JLPT_HISTORY.length} lượt xuất hiện, 2010-2024</span>
        </span>
      </button>
      `
          : ""
      }

      <button class="menu-item" data-screen="reading">
        <span class="menu-item-icon">読</span>
        <span class="menu-item-body">
          <span class="menu-item-title">Luyện đọc</span>
          <span class="menu-item-desc">${ALL_READING.length} bài đọc N3</span>
        </span>
      </button>

      <button class="menu-item" data-screen="quizBook">
        <span class="menu-item-icon">解</span>
        <span class="menu-item-body">
          <span class="menu-item-title">Luyện đề</span>
          <span class="menu-item-desc">${ALL_QUIZBOOK.length} câu N3 (theo sách, có giải thích)</span>
        </span>
      </button>

      <button class="menu-item" disabled>
        <span class="menu-item-icon">文</span>
        <span class="menu-item-body">
          <span class="menu-item-title">Bunpo</span>
          <span class="menu-item-desc">Sắp ra mắt</span>
        </span>
      </button>

      <button class="menu-item" data-screen="quiz">
        <span class="menu-item-icon">?</span>
        <span class="menu-item-body">
          <span class="menu-item-title">Quiz</span>
          <span class="menu-item-desc">Trắc nghiệm Kanji & Từ vựng</span>
        </span>
      </button>

      <button class="menu-item" data-screen="stats">
        <span class="menu-item-icon">📊</span>
        <span class="menu-item-body">
          <span class="menu-item-title">Thống kê</span>
          <span class="menu-item-desc">Từ đã thuộc, đang học, cần ôn lại</span>
        </span>
      </button>
    </nav>

    <button id="backup-toggle" class="secondary-action-btn menu-backup-btn">⚙ Sao lưu / Khôi phục dữ liệu</button>
    <div id="backup-panel" class="backup-panel" style="display:none"></div>

    <div id="reminder"></div>
    <div id="quiz-reminder"></div>
    <div class="reminder-apply-bar">
      <button id="reminder-apply" type="button" class="reminder-apply-btn">Áp dụng cài đặt nhắc nhở</button>
      <p id="reminder-apply-message" class="backup-message" style="display:none"></p>
    </div>
  `;

  const authorOverlay = document.getElementById("author-info-overlay")!;
  document.getElementById("author-info-btn")!.addEventListener("click", () => {
    authorOverlay.style.display = "flex";
  });
  document.getElementById("author-info-close")!.addEventListener("click", () => {
    authorOverlay.style.display = "none";
  });
  authorOverlay.addEventListener("click", (e) => {
    if (e.target === authorOverlay) authorOverlay.style.display = "none";
  });

  const isTab = document.body.classList.contains("tab-mode");
  document.querySelectorAll<HTMLButtonElement>(".menu-item[data-screen]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const screen = btn.dataset.screen as MenuScreen;
      // Quiz always runs in its own tab (see main.ts) so an in-progress
      // session survives the popup closing -- unless we're already in that
      // tab, in which case just navigate in place like any other screen.
      if (screen === "quiz" && !isTab) {
        const message: OpenQuizTabMessage = { type: "OPEN_QUIZ_TAB" };
        chrome.runtime.sendMessage(message);
        window.close();
        return;
      }
      onSelect(screen);
    });
  });

  renderBackupPanel();

  const [reminderSettings, quizReminderSettings] = await Promise.all([
    loadReminderSettings(),
    loadQuizReminderSettings(),
  ]);
  renderReminder(reminderSettings);
  renderQuizReminder(quizReminderSettings);
  wireReminderApplyBar();
}

const CUSTOM_OPTION_VALUE = "custom";

function renderReminder(settings: ReminderSettings) {
  const isPreset = INTERVAL_OPTIONS_MINUTES.includes(settings.intervalMinutes);
  const el = document.getElementById("reminder")!;
  el.innerHTML = `
    <section class="reminder">
      <div class="reminder-row reminder-row-main">
        <label class="reminder-toggle">
          <input type="checkbox" id="reminder-enabled" ${settings.enabled ? "checked" : ""} />
          Nhắc ôn tập mỗi
        </label>
        <select id="reminder-interval" class="reminder-select" ${settings.enabled ? "" : "disabled"}>
          ${INTERVAL_OPTIONS_MINUTES.map(
            (m) => `<option value="${m}" ${isPreset && m === settings.intervalMinutes ? "selected" : ""}>${formatInterval(m)}</option>`,
          ).join("")}
          <option value="${CUSTOM_OPTION_VALUE}" ${isPreset ? "" : "selected"}>Tùy chỉnh...</option>
        </select>
      </div>
      <div class="reminder-row reminder-custom" style="${isPreset ? "display:none" : ""}">
        <input
          type="number"
          id="reminder-custom-input"
          min="${MIN_INTERVAL_MINUTES}"
          max="${MAX_INTERVAL_MINUTES}"
          step="1"
          value="${isPreset ? "" : settings.intervalMinutes}"
          placeholder="Số phút"
          ${settings.enabled ? "" : "disabled"}
        />
        <span class="muted">phút (tối thiểu ${MIN_INTERVAL_MINUTES})</span>
        <button id="reminder-custom-apply" type="button" ${settings.enabled ? "" : "disabled"}>Xong</button>
      </div>
      <div class="reminder-row reminder-row-main">
        <label class="reminder-toggle">
          <input
            type="checkbox"
            id="reminder-content-specific"
            ${settings.contentType !== "both" ? "checked" : ""}
            ${settings.enabled ? "" : "disabled"}
          />
          Nội dung nhắc
        </label>
        <select
          id="reminder-content-type"
          class="reminder-select"
          ${settings.enabled && settings.contentType !== "both" ? "" : "disabled"}
        >
          ${(["kanji", "vocab"] as ReminderContentType[])
            .map(
              (t) =>
                `<option value="${t}" ${t === settings.contentType ? "selected" : ""}>${CONTENT_TYPE_LABELS[t]}</option>`,
            )
            .join("")}
        </select>
      </div>
    </section>
  `;

  const enabledInput = document.getElementById("reminder-enabled") as HTMLInputElement;
  const intervalSelect = document.getElementById("reminder-interval") as HTMLSelectElement;
  const customRow = document.querySelector(".reminder-custom") as HTMLElement;
  const customInput = document.getElementById("reminder-custom-input") as HTMLInputElement;
  const contentSpecificCheckbox = document.getElementById("reminder-content-specific") as HTMLInputElement;
  const contentTypeSelect = document.getElementById("reminder-content-type") as HTMLSelectElement;
  const customApply = document.getElementById("reminder-custom-apply") as HTMLButtonElement;

  // Rows only update their own enabled/visible state here -- nothing is
  // persisted until the user presses the single "Áp dụng" button at the
  // bottom of the menu screen (see wireReminderApplyBar), so every field
  // across both reminder sections is saved together in one shot.
  enabledInput.addEventListener("change", () => {
    intervalSelect.disabled = !enabledInput.checked;
    customInput.disabled = !enabledInput.checked;
    customApply.disabled = !enabledInput.checked;
    contentSpecificCheckbox.disabled = !enabledInput.checked;
    contentTypeSelect.disabled = !enabledInput.checked || !contentSpecificCheckbox.checked;
  });

  // Unchecked = remind with a mix of both kanji and vocab ("both"); checked
  // reveals the select so the user can pin the reminder to just one of them.
  contentSpecificCheckbox.addEventListener("change", () => {
    contentTypeSelect.disabled = !contentSpecificCheckbox.checked;
  });

  intervalSelect.addEventListener("change", () => {
    if (intervalSelect.value === CUSTOM_OPTION_VALUE) {
      customRow.style.display = "";
      customInput.focus();
      return;
    }
    customRow.style.display = "none";
  });

  customApply.addEventListener("click", () => {
    customInput.value = String(clampIntervalMinutes(Number(customInput.value)));
  });

  customInput.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    customInput.value = String(clampIntervalMinutes(Number(customInput.value)));
  });
}

// Separate, simpler block: just "nhắc làm quiz mỗi X phút" -- no card
// content, and (unlike the reminder above) it's automatically skipped by
// the background worker whenever a quiz tab is already open, so this only
// ever fires when the user genuinely isn't already doing one.
function renderQuizReminder(settings: QuizReminderSettings) {
  const isPreset = INTERVAL_OPTIONS_MINUTES.includes(settings.intervalMinutes);
  const el = document.getElementById("quiz-reminder")!;
  el.innerHTML = `
    <section class="reminder">
      <div class="reminder-row reminder-row-main">
        <label class="reminder-toggle">
          <input type="checkbox" id="quiz-reminder-enabled" ${settings.enabled ? "checked" : ""} />
          Nhắc làm Quiz mỗi
        </label>
        <select id="quiz-reminder-interval" class="reminder-select" ${settings.enabled ? "" : "disabled"}>
          ${INTERVAL_OPTIONS_MINUTES.map(
            (m) => `<option value="${m}" ${isPreset && m === settings.intervalMinutes ? "selected" : ""}>${formatInterval(m)}</option>`,
          ).join("")}
          <option value="${CUSTOM_OPTION_VALUE}" ${isPreset ? "" : "selected"}>Tùy chỉnh...</option>
        </select>
      </div>
      <div class="reminder-row reminder-custom" style="${isPreset ? "display:none" : ""}">
        <input
          type="number"
          id="quiz-reminder-custom-input"
          min="${MIN_INTERVAL_MINUTES}"
          max="${MAX_INTERVAL_MINUTES}"
          step="1"
          value="${isPreset ? "" : settings.intervalMinutes}"
          placeholder="Số phút"
          ${settings.enabled ? "" : "disabled"}
        />
        <span class="muted">phút (tối thiểu ${MIN_INTERVAL_MINUTES})</span>
        <button id="quiz-reminder-custom-apply" type="button" ${settings.enabled ? "" : "disabled"}>Xong</button>
      </div>
    </section>
  `;

  const enabledInput = document.getElementById("quiz-reminder-enabled") as HTMLInputElement;
  const intervalSelect = document.getElementById("quiz-reminder-interval") as HTMLSelectElement;
  const customRow = el.querySelector(".reminder-custom") as HTMLElement;
  const customInput = document.getElementById("quiz-reminder-custom-input") as HTMLInputElement;
  const customApply = document.getElementById("quiz-reminder-custom-apply") as HTMLButtonElement;

  // Same deferred-save pattern as renderReminder: only local UI state
  // changes here, the bottom "Áp dụng" button persists both sections at once.
  enabledInput.addEventListener("change", () => {
    intervalSelect.disabled = !enabledInput.checked;
    customInput.disabled = !enabledInput.checked;
    customApply.disabled = !enabledInput.checked;
  });

  intervalSelect.addEventListener("change", () => {
    if (intervalSelect.value === CUSTOM_OPTION_VALUE) {
      customRow.style.display = "";
      customInput.focus();
      return;
    }
    customRow.style.display = "none";
  });

  customApply.addEventListener("click", () => {
    customInput.value = String(clampIntervalMinutes(Number(customInput.value)));
  });

  customInput.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    customInput.value = String(clampIntervalMinutes(Number(customInput.value)));
  });
}

function wireReminderApplyBar() {
  const applyBtn = document.getElementById("reminder-apply") as HTMLButtonElement;
  const message = document.getElementById("reminder-apply-message")!;

  applyBtn.addEventListener("click", async () => {
    const reminderEnabled = (document.getElementById("reminder-enabled") as HTMLInputElement).checked;
    const reminderInterval = readRowIntervalMinutes(
      document.getElementById("reminder-interval") as HTMLSelectElement,
      document.getElementById("reminder-custom-input") as HTMLInputElement,
    );
    const contentSpecific = (document.getElementById("reminder-content-specific") as HTMLInputElement).checked;
    const contentType: ReminderContentType = contentSpecific
      ? ((document.getElementById("reminder-content-type") as HTMLSelectElement).value as ReminderContentType)
      : "both";

    const quizEnabled = (document.getElementById("quiz-reminder-enabled") as HTMLInputElement).checked;
    const quizInterval = readRowIntervalMinutes(
      document.getElementById("quiz-reminder-interval") as HTMLSelectElement,
      document.getElementById("quiz-reminder-custom-input") as HTMLInputElement,
    );

    await Promise.all([
      persistReminderSettings({ enabled: reminderEnabled, intervalMinutes: reminderInterval, contentType }),
      persistQuizReminderSettings({ enabled: quizEnabled, intervalMinutes: quizInterval }),
    ]);

    // Applying doubles as the old standalone "Thử ngay" button: fire one
    // preview notification right away so the user can see what they just set
    // -- but only for the card reminder, and only when it's actually on, so
    // toggling just the quiz reminder doesn't also pop a Kanji/Từ vựng card.
    if (reminderEnabled) {
      const item = await pickReminderItem(contentType);
      const { title, message: notificationMessage } = formatReminderNotification(item);
      chrome.notifications.create({
        type: "basic",
        iconUrl: chrome.runtime.getURL("public/icons/icon128.png"),
        title,
        message: notificationMessage,
        priority: 1,
      });
    }

    message.style.display = "block";
    message.className = "backup-message backup-message-ok";
    message.textContent = "Đã áp dụng cài đặt nhắc nhở.";
  });
}

function renderBackupPanel() {
  const toggleBtn = document.getElementById("backup-toggle") as HTMLButtonElement;
  const panel = document.getElementById("backup-panel")!;
  let open = false;

  toggleBtn.addEventListener("click", () => {
    open = !open;
    panel.style.display = open ? "flex" : "none";
    if (open) paintPanel();
  });

  function paintPanel() {
    panel.innerHTML = `
      <button id="backup-export" class="secondary-action-btn">Xuất dữ liệu (tải file .json)</button>
      <label class="secondary-action-btn backup-import-label">
        Nhập dữ liệu từ file...
        <input id="backup-import-input" type="file" accept="application/json" style="display:none" />
      </label>
      <p class="backup-hint">Bao gồm: tiến độ đã thuộc/đánh dấu khó, streak học, cài đặt nhắc nhở. Dùng để chuyển sang máy khác hoặc phòng khi cài lại trình duyệt.</p>
      <p id="backup-message" class="backup-message" style="display:none"></p>
    `;

    document.getElementById("backup-export")!.addEventListener("click", async () => {
      const json = await exportBackupJson();
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `nihongo-nin-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    });

    const importInput = document.getElementById("backup-import-input") as HTMLInputElement;
    importInput.addEventListener("change", async () => {
      const file = importInput.files?.[0];
      if (!file) return;
      const text = await file.text();
      const result = await importBackupJson(text);
      const messageEl = document.getElementById("backup-message")!;
      messageEl.style.display = "block";
      if (result.ok) {
        messageEl.className = "backup-message backup-message-ok";
        messageEl.textContent = `Đã khôi phục ${result.restoredKeys?.length ?? 0} mục dữ liệu. Vui lòng mở lại extension để áp dụng.`;
      } else {
        messageEl.className = "backup-message backup-message-error";
        messageEl.textContent = result.error ?? "Có lỗi xảy ra khi nhập dữ liệu.";
      }
      importInput.value = "";
    });
  }
}
