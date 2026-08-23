import { pickReminderItem, formatReminderNotification } from "../reminderContent.ts";
import { getStudyStreak } from "../popup/progressState.ts";
import {
  REMINDER_ALARM_NAME,
  QUIZ_REMINDER_ALARM_NAME,
  applyReminderAlarm,
  applyQuizReminderAlarm,
  loadReminderSettings,
  saveReminderSettings,
  loadQuizReminderSettings,
  saveQuizReminderSettings,
  type ReminderSettings,
  type QuizReminderSettings,
} from "../reminder.ts";

const REMINDER_NOTIFICATION_ID = "kanjiReminderNotification";
const QUIZ_REMINDER_NOTIFICATION_ID = "quizReminderNotification";

// Quiz always opens as a standalone tab (not the popup) -- an in-progress
// quiz only lives in memory, and the popup gets torn down the moment it
// loses focus, silently wiping any answers so far. A tab survives that.
const QUIZ_TAB_URL = chrome.runtime.getURL("index.html?tab=1#quiz");

// Which tab (if any) is "the" quiz tab, persisted rather than a plain
// module variable because this is an MV3 service worker: it unloads after
// ~30s idle and a plain `let` would silently reset to undefined on the next
// event, forgetting an already-open tab. main.ts also strips the #quiz
// hash right after load (so a plain reload lands on Menu, not back on
// Quiz), so the URL alone can no longer identify this tab either --
// tracking the id directly is more robust than URL matching either way.
const QUIZ_TAB_ID_KEY = "quizTabId";

async function getQuizTabId(): Promise<number | undefined> {
  const stored = await chrome.storage.local.get(QUIZ_TAB_ID_KEY);
  return stored[QUIZ_TAB_ID_KEY];
}

async function setQuizTabId(id: number | undefined): Promise<void> {
  if (id === undefined) await chrome.storage.local.remove(QUIZ_TAB_ID_KEY);
  else await chrome.storage.local.set({ [QUIZ_TAB_ID_KEY]: id });
}

// Resolves the tracked quiz tab id to a still-open tab, clearing the
// tracked id (and returning undefined) if that tab was closed.
async function findOpenQuizTab(): Promise<chrome.tabs.Tab | undefined> {
  const id = await getQuizTabId();
  if (id === undefined) return undefined;
  try {
    return await chrome.tabs.get(id);
  } catch {
    await setQuizTabId(undefined);
    return undefined;
  }
}

chrome.tabs.onRemoved.addListener(async (tabId) => {
  if (tabId === (await getQuizTabId())) await setQuizTabId(undefined);
});

// Remembers which screen the last reminder notification's card came from
// (Kanji or vocab), so clicking the notification can jump straight there
// instead of dropping the user on the blank Menu screen.
const LAST_REMINDER_KIND_KEY = "lastReminderKind";

async function showReminderNotification() {
  const settings = await loadReminderSettings();
  const item = await pickReminderItem(settings.contentType);
  const { title, message } = formatReminderNotification(item);
  await chrome.storage.local.set({ [LAST_REMINDER_KIND_KEY]: item.kind });
  chrome.notifications.create(REMINDER_NOTIFICATION_ID, {
    type: "basic",
    iconUrl: chrome.runtime.getURL("public/icons/icon128.png"),
    title,
    message,
    priority: 1,
  });
}

// No card content here on purpose -- just a nudge to go do a quiz. Skipped
// entirely if a quiz tab is already open, so it never nags mid-quiz.
async function showQuizNudgeIfNeeded() {
  if (await findOpenQuizTab()) return;

  chrome.notifications.create(QUIZ_REMINDER_NOTIFICATION_ID, {
    type: "basic",
    iconUrl: chrome.runtime.getURL("public/icons/icon128.png"),
    title: "Đến giờ làm Quiz rồi!",
    message: "Ôn nhanh vài câu trắc nghiệm Kanji/Từ vựng nào.",
    priority: 1,
  });
}

// Small always-visible nudge on the toolbar icon: current daily study
// streak, so it's visible without opening the popup at all. Recomputed on
// startup/install and whenever studyLog changes (i.e. right after any Quiz
// answer) via the storage listener below.
async function updateBadge() {
  const streak = await getStudyStreak();
  if (streak > 0) {
    await chrome.action.setBadgeText({ text: String(streak) });
    await chrome.action.setBadgeBackgroundColor({ color: "#b5340a" });
  } else {
    await chrome.action.setBadgeText({ text: "" });
  }
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.studyLog) updateBadge();
});

async function openOrFocusQuizTab() {
  const existing = await findOpenQuizTab();
  if (existing?.id !== undefined) {
    await chrome.tabs.update(existing.id, { active: true });
    if (existing.windowId !== undefined) await chrome.windows.update(existing.windowId, { focused: true });
    return;
  }
  const tab = await chrome.tabs.create({ url: QUIZ_TAB_URL });
  await setQuizTabId(tab.id);
}

// Re-arm alarms on browser startup / extension update in case Chrome
// dropped them (alarms otherwise persist across restarts on their own).
chrome.runtime.onStartup.addListener(async () => {
  await applyReminderAlarm(await loadReminderSettings());
  await applyQuizReminderAlarm(await loadQuizReminderSettings());
  await updateBadge();
});
chrome.runtime.onInstalled.addListener(async () => {
  await applyReminderAlarm(await loadReminderSettings());
  await applyQuizReminderAlarm(await loadQuizReminderSettings());
  await updateBadge();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === REMINDER_ALARM_NAME) showReminderNotification();
  else if (alarm.name === QUIZ_REMINDER_ALARM_NAME) showQuizNudgeIfNeeded();
  // Piggyback a badge refresh on whichever alarm fires so a stale
  // yesterday's streak doesn't linger past midnight for an idle user.
  updateBadge();
});

chrome.notifications.onClicked.addListener(async (notificationId) => {
  if (notificationId === REMINDER_NOTIFICATION_ID) {
    const stored = await chrome.storage.local.get(LAST_REMINDER_KIND_KEY);
    const kind = stored[LAST_REMINDER_KIND_KEY] === "vocab" ? "vocab" : "kanji";
    chrome.tabs.create({ url: chrome.runtime.getURL(`index.html?tab=1#${kind}`) });
    chrome.notifications.clear(notificationId);
  } else if (notificationId === QUIZ_REMINDER_NOTIFICATION_ID) {
    openOrFocusQuizTab();
    chrome.notifications.clear(notificationId);
  }
});

// Popups get torn down as soon as they lose focus, which can cut off an
// in-flight chrome.storage.set / chrome.alarms.create if it runs directly in
// the popup script. Routing the actual save through the (longer-lived)
// background worker avoids that race.
export interface SetReminderMessage {
  type: "SET_REMINDER";
  settings: ReminderSettings;
}

export interface SetQuizReminderMessage {
  type: "SET_QUIZ_REMINDER";
  settings: QuizReminderSettings;
}

export interface OpenQuizTabMessage {
  type: "OPEN_QUIZ_TAB";
}

type BackgroundMessage = SetReminderMessage | SetQuizReminderMessage | OpenQuizTabMessage;

chrome.runtime.onMessage.addListener((message: BackgroundMessage, _sender, sendResponse) => {
  if (message?.type === "SET_REMINDER") {
    saveReminderSettings(message.settings)
      .then(() => sendResponse({ ok: true }))
      .catch((err) => sendResponse({ ok: false, error: String(err) }));
    return true; // keep the message channel open for the async sendResponse
  }
  if (message?.type === "SET_QUIZ_REMINDER") {
    saveQuizReminderSettings(message.settings)
      .then(() => sendResponse({ ok: true }))
      .catch((err) => sendResponse({ ok: false, error: String(err) }));
    return true;
  }
  if (message?.type === "OPEN_QUIZ_TAB") {
    openOrFocusQuizTab()
      .then(() => sendResponse({ ok: true }))
      .catch((err) => sendResponse({ ok: false, error: String(err) }));
    return true;
  }
});
