import { ALL_KANJI } from "../kanjiState.ts";
import { ALL_VOCAB } from "../vocabState.ts";
import { ALL_JLPT_HISTORY } from "../jlptHistoryState.ts";
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

type MenuScreen = "kanji" | "vocab" | "quiz" | "search" | "jlptHistory";

export async function renderMenuScreen(app: HTMLElement, onSelect: (screen: MenuScreen) => void) {
  const [kanjiMastered, vocabMastered, streak] = await Promise.all([
    countMastered(ALL_KANJI.map((k) => k.id)),
    countMastered(ALL_VOCAB.map((v) => v.id)),
    getStudyStreak(),
  ]);

  app.innerHTML = `
    <header class="menu-header">
      <div class="menu-title">Nihongo Nin</div>
      <div class="menu-subtitle">Kiên trì học tiếng Nhật</div>
      ${streak > 0 ? `<div class="streak-badge">🔥 ${streak} ngày liên tiếp</div>` : ""}
    </header>

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
          <span class="menu-item-title">Từ vựng</span>
          <span class="menu-item-desc">${ALL_VOCAB.length} từ, N4-N3${vocabMastered > 0 ? ` · ${vocabMastered} đã thuộc` : ""}</span>
        </span>
      </button>

      <button class="menu-item" data-screen="jlptHistory">
        <span class="menu-item-icon">📝</span>
        <span class="menu-item-body">
          <span class="menu-item-title">Từ đã thi JLPT</span>
          <span class="menu-item-desc">${ALL_JLPT_HISTORY.length} lượt xuất hiện, 2010-2024</span>
        </span>
      </button>

      <button class="menu-item" disabled>
        <span class="menu-item-icon">文</span>
        <span class="menu-item-body">
          <span class="menu-item-title">Ngữ pháp</span>
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
    </nav>

    <button id="backup-toggle" class="secondary-action-btn menu-backup-btn">⚙ Sao lưu / Khôi phục dữ liệu</button>
    <div id="backup-panel" class="backup-panel" style="display:none"></div>

    <div id="reminder"></div>
    <div id="quiz-reminder"></div>
  `;

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
}

const CUSTOM_OPTION_VALUE = "custom";

function renderReminder(settings: ReminderSettings) {
  const isPreset = INTERVAL_OPTIONS_MINUTES.includes(settings.intervalMinutes);
  const el = document.getElementById("reminder")!;
  el.innerHTML = `
    <section class="reminder">
      <div class="reminder-row">
        <label class="reminder-toggle">
          <input type="checkbox" id="reminder-enabled" ${settings.enabled ? "checked" : ""} />
          Nhắc ôn tập mỗi
        </label>
        <select id="reminder-interval" ${settings.enabled ? "" : "disabled"}>
          ${INTERVAL_OPTIONS_MINUTES.map(
            (m) => `<option value="${m}" ${isPreset && m === settings.intervalMinutes ? "selected" : ""}>${formatInterval(m)}</option>`,
          ).join("")}
          <option value="${CUSTOM_OPTION_VALUE}" ${isPreset ? "" : "selected"}>Tùy chỉnh...</option>
        </select>
        <button id="reminder-test" type="button" title="Gửi thử một thông báo ngay">Thử ngay</button>
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
        <button id="reminder-custom-apply" type="button" ${settings.enabled ? "" : "disabled"}>Áp dụng</button>
      </div>
      <div class="reminder-row">
        <label class="reminder-toggle" for="reminder-content-type">Nội dung nhắc</label>
        <select id="reminder-content-type" ${settings.enabled ? "" : "disabled"}>
          ${(Object.keys(CONTENT_TYPE_LABELS) as ReminderContentType[])
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
  const contentTypeSelect = document.getElementById("reminder-content-type") as HTMLSelectElement;

  function clampInterval(minutes: number): number {
    if (!Number.isFinite(minutes)) return MIN_INTERVAL_MINUTES;
    return Math.min(MAX_INTERVAL_MINUTES, Math.max(MIN_INTERVAL_MINUTES, Math.round(minutes)));
  }

  async function persist(intervalMinutes: number) {
    await persistReminderSettings({
      enabled: enabledInput.checked,
      intervalMinutes,
      contentType: contentTypeSelect.value as ReminderContentType,
    });
  }

  enabledInput.addEventListener("change", async () => {
    intervalSelect.disabled = !enabledInput.checked;
    customInput.disabled = !enabledInput.checked;
    contentTypeSelect.disabled = !enabledInput.checked;
    (document.getElementById("reminder-custom-apply") as HTMLButtonElement).disabled = !enabledInput.checked;
    const current =
      intervalSelect.value === CUSTOM_OPTION_VALUE
        ? clampInterval(Number(customInput.value))
        : Number(intervalSelect.value);
    await persist(current);
  });

  contentTypeSelect.addEventListener("change", async () => {
    const current =
      intervalSelect.value === CUSTOM_OPTION_VALUE
        ? clampInterval(Number(customInput.value))
        : Number(intervalSelect.value);
    await persist(current);
  });

  intervalSelect.addEventListener("change", async () => {
    if (intervalSelect.value === CUSTOM_OPTION_VALUE) {
      customRow.style.display = "";
      customInput.focus();
      return;
    }
    customRow.style.display = "none";
    await persist(Number(intervalSelect.value));
  });

  document.getElementById("reminder-custom-apply")!.addEventListener("click", async () => {
    const minutes = clampInterval(Number(customInput.value));
    customInput.value = String(minutes);
    await persist(minutes);
  });

  customInput.addEventListener("keydown", async (e) => {
    if (e.key !== "Enter") return;
    const minutes = clampInterval(Number(customInput.value));
    customInput.value = String(minutes);
    await persist(minutes);
  });

  document.getElementById("reminder-test")!.addEventListener("click", async () => {
    const item = await pickReminderItem(contentTypeSelect.value as ReminderContentType);
    const { title, message } = formatReminderNotification(item);
    chrome.notifications.create({
      type: "basic",
      iconUrl: chrome.runtime.getURL("public/icons/icon128.png"),
      title,
      message,
      priority: 1,
    });
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
      <div class="reminder-row">
        <label class="reminder-toggle">
          <input type="checkbox" id="quiz-reminder-enabled" ${settings.enabled ? "checked" : ""} />
          Nhắc làm Quiz mỗi
        </label>
        <select id="quiz-reminder-interval" ${settings.enabled ? "" : "disabled"}>
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
        <button id="quiz-reminder-custom-apply" type="button" ${settings.enabled ? "" : "disabled"}>Áp dụng</button>
      </div>
    </section>
  `;

  const enabledInput = document.getElementById("quiz-reminder-enabled") as HTMLInputElement;
  const intervalSelect = document.getElementById("quiz-reminder-interval") as HTMLSelectElement;
  const customRow = el.querySelector(".reminder-custom") as HTMLElement;
  const customInput = document.getElementById("quiz-reminder-custom-input") as HTMLInputElement;
  const customApply = document.getElementById("quiz-reminder-custom-apply") as HTMLButtonElement;

  function clampInterval(minutes: number): number {
    if (!Number.isFinite(minutes)) return MIN_INTERVAL_MINUTES;
    return Math.min(MAX_INTERVAL_MINUTES, Math.max(MIN_INTERVAL_MINUTES, Math.round(minutes)));
  }

  async function persist(intervalMinutes: number) {
    await persistQuizReminderSettings({ enabled: enabledInput.checked, intervalMinutes });
  }

  enabledInput.addEventListener("change", async () => {
    intervalSelect.disabled = !enabledInput.checked;
    customInput.disabled = !enabledInput.checked;
    customApply.disabled = !enabledInput.checked;
    const current =
      intervalSelect.value === CUSTOM_OPTION_VALUE
        ? clampInterval(Number(customInput.value))
        : Number(intervalSelect.value);
    await persist(current);
  });

  intervalSelect.addEventListener("change", async () => {
    if (intervalSelect.value === CUSTOM_OPTION_VALUE) {
      customRow.style.display = "";
      customInput.focus();
      return;
    }
    customRow.style.display = "none";
    await persist(Number(intervalSelect.value));
  });

  customApply.addEventListener("click", async () => {
    const minutes = clampInterval(Number(customInput.value));
    customInput.value = String(minutes);
    await persist(minutes);
  });

  customInput.addEventListener("keydown", async (e) => {
    if (e.key !== "Enter") return;
    const minutes = clampInterval(Number(customInput.value));
    customInput.value = String(minutes);
    await persist(minutes);
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
