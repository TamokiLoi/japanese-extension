import { useEffect, useState } from "react";
import { ALL_KANJI } from "../kanjiState.ts";
import { ALL_VOCAB } from "../vocabState.ts";
import { ALL_JLPT_HISTORY } from "../jlptHistoryState.ts";
import { ALL_READING } from "../readingState.ts";
import { ALL_QUIZBOOK } from "../quizBookState.ts";
import { ALL_BUNPO } from "../bunpoState.ts";
import { countMastered, getStudyStreak } from "../progressState.ts";
import { exportBackupJson, importBackupJson, type ImportResult } from "../backupState.ts";
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
import { assetUrl } from "../../platform/assetUrl";

// Hidden (not deleted) while "Luyện đọc" takes its slot in the menu -- the
// screen, route, and data behind it are untouched, so flip this back to
// bring it back later.
const SHOW_JLPT_HISTORY_MENU_ITEM = false;

const CONTENT_TYPE_LABELS: Record<ReminderContentType, string> = {
  kanji: "Kanji",
  vocab: "Từ vựng",
  both: "Cả hai",
};

const CUSTOM_OPTION_VALUE = "custom";

// chrome.alarms-based reminders have no web equivalent -- hide the whole
// "Nhắc ôn tập" section outside the extension instead of rendering dead UI.
const HAS_REMINDERS = typeof chrome !== "undefined" && !!chrome.alarms;

export type MenuScreen = "kanji" | "vocab" | "quiz" | "search" | "jlptHistory" | "stats" | "reading" | "quizBook" | "bunpo";

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

interface ReminderFormState {
  enabled: boolean;
  selectValue: string;
  customValue: string;
  contentSpecific: boolean;
  contentType: ReminderContentType;
}

function toReminderForm(settings: ReminderSettings): ReminderFormState {
  const isPreset = INTERVAL_OPTIONS_MINUTES.includes(settings.intervalMinutes);
  return {
    enabled: settings.enabled,
    selectValue: isPreset ? String(settings.intervalMinutes) : CUSTOM_OPTION_VALUE,
    customValue: isPreset ? "" : String(settings.intervalMinutes),
    contentSpecific: settings.contentType !== "both",
    contentType: settings.contentType === "both" ? "kanji" : settings.contentType,
  };
}

interface QuizReminderFormState {
  enabled: boolean;
  selectValue: string;
  customValue: string;
}

function toQuizReminderForm(settings: QuizReminderSettings): QuizReminderFormState {
  const isPreset = INTERVAL_OPTIONS_MINUTES.includes(settings.intervalMinutes);
  return {
    enabled: settings.enabled,
    selectValue: isPreset ? String(settings.intervalMinutes) : CUSTOM_OPTION_VALUE,
    customValue: isPreset ? "" : String(settings.intervalMinutes),
  };
}

function readIntervalMinutes(selectValue: string, customValue: string): number {
  return selectValue === CUSTOM_OPTION_VALUE ? clampIntervalMinutes(Number(customValue)) : Number(selectValue);
}

export function MenuScreen({ onSelect }: { onSelect: (screen: MenuScreen) => void }) {
  const [counts, setCounts] = useState<{ kanjiMastered: number; vocabMastered: number; bunpoMastered: number; streak: number } | null>(
    null,
  );
  const [authorOpen, setAuthorOpen] = useState(false);
  const [backupOpen, setBackupOpen] = useState(false);
  const [backupMessage, setBackupMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [reminderForm, setReminderForm] = useState<ReminderFormState | null>(null);
  const [quizReminderForm, setQuizReminderForm] = useState<QuizReminderFormState | null>(null);
  const [applyMessage, setApplyMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [kanjiMastered, vocabMastered, bunpoMastered, streak] = await Promise.all([
        countMastered(ALL_KANJI.map((k) => k.id)),
        countMastered(ALL_VOCAB.map((v) => v.id)),
        countMastered(ALL_BUNPO.map((g) => g.id)),
        getStudyStreak(),
      ]);
      if (cancelled) return;
      setCounts({ kanjiMastered, vocabMastered, bunpoMastered, streak });
    })();
    if (HAS_REMINDERS) {
      (async () => {
        const [reminderSettings, quizReminderSettings] = await Promise.all([
          loadReminderSettings(),
          loadQuizReminderSettings(),
        ]);
        if (cancelled) return;
        setReminderForm(toReminderForm(reminderSettings));
        setQuizReminderForm(toQuizReminderForm(quizReminderSettings));
      })();
    }
    return () => {
      cancelled = true;
    };
  }, []);

  function handleSelect(screen: MenuScreen) {
    const isTab = document.body.classList.contains("tab-mode");
    // Quiz always runs in its own tab (see main.tsx) so an in-progress
    // session survives the popup closing -- unless we're already in that
    // tab, in which case just navigate in place like any other screen.
    if (screen === "quiz" && !isTab && typeof chrome !== "undefined" && chrome.runtime?.sendMessage) {
      const message: OpenQuizTabMessage = { type: "OPEN_QUIZ_TAB" };
      chrome.runtime.sendMessage(message);
      window.close();
      return;
    }
    onSelect(screen);
  }

  async function handleApplyReminders() {
    if (!reminderForm || !quizReminderForm) return;
    const reminderInterval = readIntervalMinutes(reminderForm.selectValue, reminderForm.customValue);
    const contentType: ReminderContentType = reminderForm.contentSpecific ? reminderForm.contentType : "both";
    const quizInterval = readIntervalMinutes(quizReminderForm.selectValue, quizReminderForm.customValue);

    await Promise.all([
      persistReminderSettings({ enabled: reminderForm.enabled, intervalMinutes: reminderInterval, contentType }),
      persistQuizReminderSettings({ enabled: quizReminderForm.enabled, intervalMinutes: quizInterval }),
    ]);

    // Applying doubles as the old standalone "Thử ngay" button: fire one
    // preview notification right away so the user can see what they just set
    // -- but only for the card reminder, and only when it's actually on, so
    // toggling just the quiz reminder doesn't also pop a Kanji/Từ vựng card.
    if (reminderForm.enabled) {
      const item = await pickReminderItem(contentType);
      const { title, message: notificationMessage } = formatReminderNotification(item);
      chrome.notifications.create({
        type: "basic",
        iconUrl: assetUrl("public/icons/icon128.png"),
        title,
        message: notificationMessage,
        priority: 1,
      });
    }

    setApplyMessage("Đã áp dụng cài đặt nhắc nhở.");
  }

  async function handleExport() {
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
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const result: ImportResult = await importBackupJson(text);
    if (result.ok) {
      setBackupMessage({ ok: true, text: `Đã khôi phục ${result.restoredKeys?.length ?? 0} mục dữ liệu. Vui lòng mở lại extension để áp dụng.` });
    } else {
      setBackupMessage({ ok: false, text: result.error ?? "Có lỗi xảy ra khi nhập dữ liệu." });
    }
    e.target.value = "";
  }

  const streak = counts?.streak ?? 0;

  return (
    <>
      <header className="menu-header">
        <button className="icon-btn menu-info-btn" title="Thông tin tác giả" onClick={() => setAuthorOpen(true)}>
          ℹ
        </button>
        <div className="menu-title-row">
          <img src={assetUrl("public/icons/icon48.png")} className="menu-logo" alt="" />
          <span className="menu-title">
            Nihongo Nin<span className="menu-title-jp">日本語忍</span>
          </span>
        </div>
        <div className="menu-subtitle-quote">
          石の上にも三年
          <span className="menu-subtitle-note">(có công mài sắt, có ngày nên kim)</span>
        </div>
        {streak > 0 ? <div className="streak-badge">🔥 {streak} ngày liên tiếp</div> : null}
      </header>

      <div className="author-info-overlay" style={{ display: authorOpen ? "flex" : "none" }} onClick={(e) => {
        if (e.target === e.currentTarget) setAuthorOpen(false);
      }}>
        <div className="author-info-modal">
          <button className="icon-btn author-info-close" title="Đóng" onClick={() => setAuthorOpen(false)}>
            ✕
          </button>
          <div className="author-info-title">Thông tin tác giả</div>
          <dl className="author-info-list">
            <dt>Tác giả</dt>
            <dd>Tamoki Nguyễn</dd>
            <dt>Ngày tạo</dt>
            <dd>20/08/2026</dd>
            <dt>Liên hệ</dt>
            <dd>
              0938947221 ·{" "}
              <a href="https://github.com/TamokiLoi" target="_blank" rel="noopener">
                Github
              </a>
            </dd>
          </dl>
        </div>
      </div>

      <nav className="menu-list">
        <button className="menu-item" onClick={() => handleSelect("search")}>
          <span className="menu-item-icon">🔍</span>
          <span className="menu-item-body">
            <span className="menu-item-title">Tra cứu</span>
            <span className="menu-item-desc">Tìm nhanh Kanji hoặc từ vựng</span>
          </span>
        </button>

        <button className="menu-item" onClick={() => handleSelect("kanji")}>
          <span className="menu-item-icon">字</span>
          <span className="menu-item-body">
            <span className="menu-item-title">Kanji</span>
            <span className="menu-item-desc">
              {ALL_KANJI.length} chữ Hán, các cấp độ JLPT{counts && counts.kanjiMastered > 0 ? ` · ${counts.kanjiMastered} đã thuộc` : ""}
            </span>
          </span>
        </button>

        <button className="menu-item" onClick={() => handleSelect("vocab")}>
          <span className="menu-item-icon">語</span>
          <span className="menu-item-body">
            <span className="menu-item-title">Goi</span>
            <span className="menu-item-desc">
              {ALL_VOCAB.length} từ, N4-N3{counts && counts.vocabMastered > 0 ? ` · ${counts.vocabMastered} đã thuộc` : ""}
            </span>
          </span>
        </button>

        {SHOW_JLPT_HISTORY_MENU_ITEM ? (
          <button className="menu-item" onClick={() => handleSelect("jlptHistory")}>
            <span className="menu-item-icon">📝</span>
            <span className="menu-item-body">
              <span className="menu-item-title">Goi đã ra trong các kỳ JLPT</span>
              <span className="menu-item-desc">{ALL_JLPT_HISTORY.length} lượt xuất hiện, 2010-2024</span>
            </span>
          </button>
        ) : null}

        <button className="menu-item" onClick={() => handleSelect("reading")}>
          <span className="menu-item-icon">読</span>
          <span className="menu-item-body">
            <span className="menu-item-title">Luyện đọc</span>
            <span className="menu-item-desc">{ALL_READING.length} bài đọc N3</span>
          </span>
        </button>

        <button className="menu-item" onClick={() => handleSelect("quizBook")}>
          <span className="menu-item-icon">解</span>
          <span className="menu-item-body">
            <span className="menu-item-title">Luyện đề</span>
            <span className="menu-item-desc">{ALL_QUIZBOOK.length} câu · theo sách & đề luyện tập</span>
          </span>
        </button>

        <button className="menu-item" onClick={() => handleSelect("bunpo")}>
          <span className="menu-item-icon">文</span>
          <span className="menu-item-body">
            <span className="menu-item-title">Bunpo</span>
            <span className="menu-item-desc">
              {ALL_BUNPO.length} mẫu ngữ pháp N3{counts && counts.bunpoMastered > 0 ? ` · ${counts.bunpoMastered} đã thuộc` : ""}
            </span>
          </span>
        </button>

        <button className="menu-item" onClick={() => handleSelect("quiz")}>
          <span className="menu-item-icon">?</span>
          <span className="menu-item-body">
            <span className="menu-item-title">Quiz</span>
            <span className="menu-item-desc">Trắc nghiệm Kanji & Từ vựng</span>
          </span>
        </button>

        <button className="menu-item" onClick={() => handleSelect("stats")}>
          <span className="menu-item-icon">📊</span>
          <span className="menu-item-body">
            <span className="menu-item-title">Thống kê</span>
            <span className="menu-item-desc">Từ đã thuộc, đang học, cần ôn lại</span>
          </span>
        </button>
      </nav>

      <button className="secondary-action-btn menu-backup-btn" onClick={() => setBackupOpen((v) => !v)}>
        ⚙ Sao lưu / Khôi phục dữ liệu
      </button>
      <div className="backup-panel" style={{ display: backupOpen ? "flex" : "none" }}>
        {backupOpen ? (
          <>
            <button className="secondary-action-btn" onClick={handleExport}>
              Xuất dữ liệu (tải file .json)
            </button>
            <label className="secondary-action-btn backup-import-label">
              Nhập dữ liệu từ file...
              <input type="file" accept="application/json" style={{ display: "none" }} onChange={handleImport} />
            </label>
            <p className="backup-hint">
              Bao gồm: tiến độ đã thuộc/đánh dấu khó, streak học, cài đặt nhắc nhở. Dùng để chuyển sang máy khác hoặc phòng khi cài lại
              trình duyệt.
            </p>
            {backupMessage ? (
              <p className={`backup-message ${backupMessage.ok ? "backup-message-ok" : "backup-message-error"}`}>
                {backupMessage.text}
              </p>
            ) : null}
          </>
        ) : null}
      </div>

      {HAS_REMINDERS && reminderForm ? (
        <section className="reminder">
          <div className="reminder-row reminder-row-main">
            <label className="reminder-toggle">
              <input
                type="checkbox"
                checked={reminderForm.enabled}
                onChange={(e) => setReminderForm({ ...reminderForm, enabled: e.target.checked })}
              />
              Nhắc ôn tập mỗi
            </label>
            <select
              className="reminder-select"
              disabled={!reminderForm.enabled}
              value={reminderForm.selectValue}
              onChange={(e) => setReminderForm({ ...reminderForm, selectValue: e.target.value })}
            >
              {INTERVAL_OPTIONS_MINUTES.map((m) => (
                <option key={m} value={m}>
                  {formatInterval(m)}
                </option>
              ))}
              <option value={CUSTOM_OPTION_VALUE}>Tùy chỉnh...</option>
            </select>
          </div>
          <div className="reminder-row reminder-custom" style={{ display: reminderForm.selectValue === CUSTOM_OPTION_VALUE ? "" : "none" }}>
            <input
              type="number"
              min={MIN_INTERVAL_MINUTES}
              max={MAX_INTERVAL_MINUTES}
              step={1}
              value={reminderForm.customValue}
              placeholder="Số phút"
              disabled={!reminderForm.enabled}
              onChange={(e) => setReminderForm({ ...reminderForm, customValue: e.target.value })}
              onKeyDown={(e) => {
                if (e.key !== "Enter") return;
                setReminderForm({ ...reminderForm, customValue: String(clampIntervalMinutes(Number(reminderForm.customValue))) });
              }}
            />
            <span className="muted">phút (tối thiểu {MIN_INTERVAL_MINUTES})</span>
            <button
              type="button"
              disabled={!reminderForm.enabled}
              onClick={() => setReminderForm({ ...reminderForm, customValue: String(clampIntervalMinutes(Number(reminderForm.customValue))) })}
            >
              Xong
            </button>
          </div>
          <div className="reminder-row reminder-row-main">
            <label className="reminder-toggle">
              <input
                type="checkbox"
                checked={reminderForm.contentSpecific}
                disabled={!reminderForm.enabled}
                onChange={(e) => setReminderForm({ ...reminderForm, contentSpecific: e.target.checked })}
              />
              Nội dung nhắc
            </label>
            <select
              className="reminder-select"
              disabled={!reminderForm.enabled || !reminderForm.contentSpecific}
              value={reminderForm.contentType}
              onChange={(e) => setReminderForm({ ...reminderForm, contentType: e.target.value as ReminderContentType })}
            >
              {(["kanji", "vocab"] as ReminderContentType[]).map((t) => (
                <option key={t} value={t}>
                  {CONTENT_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </div>
        </section>
      ) : null}

      {HAS_REMINDERS && quizReminderForm ? (
        <section className="reminder">
          <div className="reminder-row reminder-row-main">
            <label className="reminder-toggle">
              <input
                type="checkbox"
                checked={quizReminderForm.enabled}
                onChange={(e) => setQuizReminderForm({ ...quizReminderForm, enabled: e.target.checked })}
              />
              Nhắc làm Quiz mỗi
            </label>
            <select
              className="reminder-select"
              disabled={!quizReminderForm.enabled}
              value={quizReminderForm.selectValue}
              onChange={(e) => setQuizReminderForm({ ...quizReminderForm, selectValue: e.target.value })}
            >
              {INTERVAL_OPTIONS_MINUTES.map((m) => (
                <option key={m} value={m}>
                  {formatInterval(m)}
                </option>
              ))}
              <option value={CUSTOM_OPTION_VALUE}>Tùy chỉnh...</option>
            </select>
          </div>
          <div
            className="reminder-row reminder-custom"
            style={{ display: quizReminderForm.selectValue === CUSTOM_OPTION_VALUE ? "" : "none" }}
          >
            <input
              type="number"
              min={MIN_INTERVAL_MINUTES}
              max={MAX_INTERVAL_MINUTES}
              step={1}
              value={quizReminderForm.customValue}
              placeholder="Số phút"
              disabled={!quizReminderForm.enabled}
              onChange={(e) => setQuizReminderForm({ ...quizReminderForm, customValue: e.target.value })}
              onKeyDown={(e) => {
                if (e.key !== "Enter") return;
                setQuizReminderForm({
                  ...quizReminderForm,
                  customValue: String(clampIntervalMinutes(Number(quizReminderForm.customValue))),
                });
              }}
            />
            <span className="muted">phút (tối thiểu {MIN_INTERVAL_MINUTES})</span>
            <button
              type="button"
              disabled={!quizReminderForm.enabled}
              onClick={() =>
                setQuizReminderForm({
                  ...quizReminderForm,
                  customValue: String(clampIntervalMinutes(Number(quizReminderForm.customValue))),
                })
              }
            >
              Xong
            </button>
          </div>
        </section>
      ) : null}

      {HAS_REMINDERS ? (
        <div className="reminder-apply-bar">
          <button className="reminder-apply-btn" onClick={handleApplyReminders}>
            Áp dụng cài đặt nhắc nhở
          </button>
          {applyMessage ? <p className="backup-message backup-message-ok">{applyMessage}</p> : null}
        </div>
      ) : null}
    </>
  );
}
