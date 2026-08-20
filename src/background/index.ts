import kanjiAllRaw from "../data/kanji-all.json";
import type { Kanji, KanjiDataset } from "../types/kanji.ts";
import {
  REMINDER_ALARM_NAME,
  applyReminderAlarm,
  loadReminderSettings,
  saveReminderSettings,
  type ReminderSettings,
} from "../reminder.ts";

const dataset = kanjiAllRaw as unknown as KanjiDataset;
const ALL_KANJI: Kanji[] = dataset.kanji;

const REMINDER_NOTIFICATION_ID = "kanjiReminderNotification";

function pickRandomKanji(): Kanji {
  return ALL_KANJI[Math.floor(Math.random() * ALL_KANJI.length)];
}

function meaningFor(k: Kanji): string {
  if (k.meanings.vi.length > 0) return k.meanings.vi.join(", ");
  if (k.meanings.viDraft && k.meanings.viDraft.length > 0) return k.meanings.viDraft.join(", ");
  return k.meanings.en.join(", ") || "";
}

function showReminderNotification() {
  const k = pickRandomKanji();
  chrome.notifications.create(REMINDER_NOTIFICATION_ID, {
    type: "basic",
    iconUrl: chrome.runtime.getURL("public/icons/icon128.png"),
    title: `${k.character}  —  ${k.level}`,
    message: `Hán Việt: ${k.hanViet.join(", ") || "—"}\nNghĩa: ${meaningFor(k)}`,
    priority: 1,
  });
}

// Re-arm the alarm on browser startup / extension update in case Chrome
// dropped it (alarms otherwise persist across restarts on their own).
chrome.runtime.onStartup.addListener(async () => {
  await applyReminderAlarm(await loadReminderSettings());
});
chrome.runtime.onInstalled.addListener(async () => {
  await applyReminderAlarm(await loadReminderSettings());
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === REMINDER_ALARM_NAME) showReminderNotification();
});

chrome.notifications.onClicked.addListener((notificationId) => {
  if (notificationId !== REMINDER_NOTIFICATION_ID) return;
  chrome.tabs.create({ url: chrome.runtime.getURL("index.html") });
  chrome.notifications.clear(notificationId);
});

// Popups get torn down as soon as they lose focus, which can cut off an
// in-flight chrome.storage.set / chrome.alarms.create if it runs directly in
// the popup script. Routing the actual save through the (longer-lived)
// background worker avoids that race.
export interface SetReminderMessage {
  type: "SET_REMINDER";
  settings: ReminderSettings;
}

chrome.runtime.onMessage.addListener((message: SetReminderMessage, _sender, sendResponse) => {
  if (message?.type !== "SET_REMINDER") return;
  saveReminderSettings(message.settings)
    .then(() => sendResponse({ ok: true }))
    .catch((err) => sendResponse({ ok: false, error: String(err) }));
  return true; // keep the message channel open for the async sendResponse
});
