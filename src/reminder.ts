// Shared between the popup and the background service worker: reminder
// settings storage + alarm scheduling. chrome.alarms enforces a minimum
// period of 1 minute; periods below that are silently clamped by Chrome.
export const REMINDER_ALARM_NAME = "kanjiReminder";
export const REMINDER_STORAGE_KEY = "reminderSettings";

// "both" picks randomly between Kanji and vocab on each reminder.
export type ReminderContentType = "kanji" | "vocab" | "both";

export interface ReminderSettings {
  enabled: boolean;
  intervalMinutes: number;
  contentType: ReminderContentType;
}

export const DEFAULT_REMINDER_SETTINGS: ReminderSettings = {
  enabled: false,
  intervalMinutes: 60,
  contentType: "both",
};

export const INTERVAL_OPTIONS_MINUTES = [1, 3, 5, 10, 15, 30, 60, 120, 240];

// chrome.alarms clamps periodInMinutes below 1 up to 1 for packed/published
// extensions; unpacked dev builds are allowed down to ~0.5. Enforce the
// stricter production limit here so behavior doesn't change after publishing.
export const MIN_INTERVAL_MINUTES = 1;
export const MAX_INTERVAL_MINUTES = 24 * 60;

export async function loadReminderSettings(): Promise<ReminderSettings> {
  const stored = await chrome.storage.local.get(REMINDER_STORAGE_KEY);
  const saved = stored[REMINDER_STORAGE_KEY] as Partial<ReminderSettings> | undefined;
  return { ...DEFAULT_REMINDER_SETTINGS, ...saved };
}

export async function saveReminderSettings(settings: ReminderSettings): Promise<void> {
  await chrome.storage.local.set({ [REMINDER_STORAGE_KEY]: settings });
  await applyReminderAlarm(settings);
}

export async function applyReminderAlarm(settings: ReminderSettings): Promise<void> {
  await chrome.alarms.clear(REMINDER_ALARM_NAME);
  if (settings.enabled) {
    chrome.alarms.create(REMINDER_ALARM_NAME, { periodInMinutes: settings.intervalMinutes });
  }
}

// Separate "go do a quiz" nudge, independent of the card reminder above --
// no card content, just a periodic check-in. Unlike the card reminder it's
// skipped entirely when a quiz tab is already open (see background/index.ts),
// so it never nags while the user is already mid-quiz.
export const QUIZ_REMINDER_ALARM_NAME = "quizReminder";
export const QUIZ_REMINDER_STORAGE_KEY = "quizReminderSettings";

export interface QuizReminderSettings {
  enabled: boolean;
  intervalMinutes: number;
}

export const DEFAULT_QUIZ_REMINDER_SETTINGS: QuizReminderSettings = {
  enabled: false,
  intervalMinutes: 30,
};

export async function loadQuizReminderSettings(): Promise<QuizReminderSettings> {
  const stored = await chrome.storage.local.get(QUIZ_REMINDER_STORAGE_KEY);
  const saved = stored[QUIZ_REMINDER_STORAGE_KEY] as Partial<QuizReminderSettings> | undefined;
  return { ...DEFAULT_QUIZ_REMINDER_SETTINGS, ...saved };
}

export async function saveQuizReminderSettings(settings: QuizReminderSettings): Promise<void> {
  await chrome.storage.local.set({ [QUIZ_REMINDER_STORAGE_KEY]: settings });
  await applyQuizReminderAlarm(settings);
}

export async function applyQuizReminderAlarm(settings: QuizReminderSettings): Promise<void> {
  await chrome.alarms.clear(QUIZ_REMINDER_ALARM_NAME);
  if (settings.enabled) {
    chrome.alarms.create(QUIZ_REMINDER_ALARM_NAME, { periodInMinutes: settings.intervalMinutes });
  }
}
