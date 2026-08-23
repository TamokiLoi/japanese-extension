// Shared between the popup ("Thu ngay" test button) and the background
// service worker (the real periodic alarm) so both pick/format reminder
// content the exact same way for either Kanji or vocab.
import type { Kanji } from "./types/kanji.ts";
import type { VocabCard } from "./popup/vocabState.ts";
import { pickReminderKanji } from "./popup/kanjiState.ts";
import { pickReminderVocab } from "./popup/vocabState.ts";
import type { ReminderContentType } from "./reminder.ts";
import { formatHanViet } from "./hanVietFormat.ts";

export type ReminderItem = { kind: "kanji"; data: Kanji } | { kind: "vocab"; data: VocabCard };

export async function pickReminderItem(contentType: ReminderContentType): Promise<ReminderItem> {
  const kind = contentType === "both" ? (Math.random() < 0.5 ? "kanji" : "vocab") : contentType;
  if (kind === "kanji") return { kind: "kanji", data: await pickReminderKanji() };
  return { kind: "vocab", data: await pickReminderVocab() };
}

function meaningForKanji(k: Kanji): string {
  if (k.meanings.vi.length > 0) return k.meanings.vi.join(", ");
  if (k.meanings.viDraft && k.meanings.viDraft.length > 0) return k.meanings.viDraft.join(", ");
  return k.meanings.en.join(", ") || "";
}

export function formatReminderNotification(item: ReminderItem): { title: string; message: string } {
  if (item.kind === "kanji") {
    const k = item.data;
    return {
      title: `${k.character}  —  ${k.level}`,
      message: `Hán Việt: ${formatHanViet(k.hanViet)}\nNghĩa: ${meaningForKanji(k)}`,
    };
  }
  const v = item.data;
  const showReading = v.reading && v.reading !== v.word;
  return {
    title: `${v.word}${showReading ? `　${v.reading}` : ""}  —  ${v.level}`,
    message: `${v.hanViet.length > 0 ? `Hán Việt: ${formatHanViet(v.hanViet)}\n` : ""}Nghĩa: ${v.meaningVi || "—"}`,
  };
}
