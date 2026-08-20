import { ALL_KANJI } from "../kanjiState.ts";
import {
  INTERVAL_OPTIONS_MINUTES,
  MAX_INTERVAL_MINUTES,
  MIN_INTERVAL_MINUTES,
  loadReminderSettings,
  type ReminderSettings,
} from "../../reminder.ts";
import type { SetReminderMessage } from "../../background/index.ts";

async function persistReminderSettings(settings: ReminderSettings): Promise<void> {
  const message: SetReminderMessage = { type: "SET_REMINDER", settings };
  await chrome.runtime.sendMessage(message);
}

function formatInterval(minutes: number): string {
  if (minutes < 60) return `${minutes} phút`;
  return `${minutes / 60} giờ`;
}

export async function renderMenuScreen(app: HTMLElement, onSelect: (screen: "kanji") => void) {
  app.innerHTML = `
    <header class="menu-header">
      <div class="menu-title">Nihongo Nin</div>
      <div class="menu-subtitle">Kiên trì học tiếng Nhật</div>
    </header>

    <nav class="menu-list">
      <button class="menu-item" data-screen="kanji">
        <span class="menu-item-icon">字</span>
        <span class="menu-item-body">
          <span class="menu-item-title">Kanji</span>
          <span class="menu-item-desc">${ALL_KANJI.length} chữ Hán, các cấp độ JLPT</span>
        </span>
      </button>

      <button class="menu-item" disabled>
        <span class="menu-item-icon">語</span>
        <span class="menu-item-body">
          <span class="menu-item-title">Từ vựng</span>
          <span class="menu-item-desc">Sắp ra mắt</span>
        </span>
      </button>

      <button class="menu-item" disabled>
        <span class="menu-item-icon">文</span>
        <span class="menu-item-body">
          <span class="menu-item-title">Ngữ pháp</span>
          <span class="menu-item-desc">Sắp ra mắt</span>
        </span>
      </button>

      <button class="menu-item" disabled>
        <span class="menu-item-icon">?</span>
        <span class="menu-item-body">
          <span class="menu-item-title">Quiz</span>
          <span class="menu-item-desc">Sắp ra mắt</span>
        </span>
      </button>
    </nav>

    <div id="reminder"></div>
  `;

  document.querySelectorAll<HTMLButtonElement>(".menu-item[data-screen]").forEach((btn) => {
    btn.addEventListener("click", () => onSelect(btn.dataset.screen as "kanji"));
  });

  const reminderSettings = await loadReminderSettings();
  renderReminder(reminderSettings);
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
    </section>
  `;

  const enabledInput = document.getElementById("reminder-enabled") as HTMLInputElement;
  const intervalSelect = document.getElementById("reminder-interval") as HTMLSelectElement;
  const customRow = document.querySelector(".reminder-custom") as HTMLElement;
  const customInput = document.getElementById("reminder-custom-input") as HTMLInputElement;

  function clampInterval(minutes: number): number {
    if (!Number.isFinite(minutes)) return MIN_INTERVAL_MINUTES;
    return Math.min(MAX_INTERVAL_MINUTES, Math.max(MIN_INTERVAL_MINUTES, Math.round(minutes)));
  }

  async function persist(intervalMinutes: number) {
    await persistReminderSettings({ enabled: enabledInput.checked, intervalMinutes });
  }

  enabledInput.addEventListener("change", async () => {
    intervalSelect.disabled = !enabledInput.checked;
    customInput.disabled = !enabledInput.checked;
    (document.getElementById("reminder-custom-apply") as HTMLButtonElement).disabled = !enabledInput.checked;
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

  document.getElementById("reminder-test")!.addEventListener("click", () => {
    const k = ALL_KANJI[Math.floor(Math.random() * ALL_KANJI.length)];
    const meaning =
      k.meanings.vi.join(", ") || k.meanings.viDraft?.join(", ") || k.meanings.en.join(", ") || "";
    chrome.notifications.create({
      type: "basic",
      iconUrl: chrome.runtime.getURL("public/icons/icon128.png"),
      title: `${k.character}  —  ${k.level}`,
      message: `Hán Việt: ${k.hanViet.join(", ") || "—"}\nNghĩa: ${meaning}`,
      priority: 1,
    });
  });
}
