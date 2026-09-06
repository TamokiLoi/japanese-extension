import type { Screen } from "../../popup/App.tsx";
import { findKanjiById } from "../../popup/kanjiState.ts";
import { findVocabById } from "../../popup/vocabState.ts";
import { findBunpoById } from "../../popup/bunpoState.ts";
import { findReadingById } from "../../popup/readingState.ts";
import { findQuizBookById } from "../../popup/quizBookState.ts";
import { findListeningById } from "../../popup/listeningState.ts";
import { findItBookVocabById } from "../../popup/itBookState.ts";
import { formatHanViet } from "../../hanVietFormat.ts";

// Best-effort "what is the user looking at right now" summary for the
// floating ChatGPT button (FloatingChatButton.tsx) -- fed into chatgpt.com's
// `?q=` prefill as context ahead of whatever the user actually types.
// Screens without a single "current item" concept (menu, search, settings,
// quiz session, stats...) fall through to "" -- the popup still opens, just
// with no auto-filled context, which is the agreed behavior for this first
// pass rather than leaving the button hidden there.
export function resolveChatContext(screen: Screen, itemId: string | undefined): string {
  if (!itemId) return "";
  try {
    if (screen === "kanji") {
      const k = findKanjiById(itemId);
      if (!k) return "";
      const meaning = k.meanings.vi.join(", ") || k.meanings.viDraft?.join(", ") || k.meanings.en.join(", ") || "?";
      const readings = [...k.readings.on, ...k.readings.kun].join("、");
      return `Chữ Hán tiếng Nhật "${k.character}" (Hán Việt: ${formatHanViet(k.hanViet)}, nghĩa: ${meaning}${readings ? `, âm đọc: ${readings}` : ""})`;
    }
    if (screen === "vocab") {
      const v = findVocabById(itemId);
      if (!v) return "";
      return `Từ vựng tiếng Nhật "${v.word}"${v.reading ? ` (${v.reading})` : ""} - nghĩa: ${v.meaningVi || "?"}`;
    }
    if (screen === "bunpo") {
      const g = findBunpoById(itemId);
      if (!g) return "";
      return `Mẫu ngữ pháp tiếng Nhật "${g.pattern}" - nghĩa: ${g.meaningVi}${g.example ? `\nVí dụ: ${g.example}` : ""}`;
    }
    if (screen === "reading") {
      const p = findReadingById(itemId);
      if (!p) return "";
      const text = p.body.map((s) => s.text).join("");
      return `Đoạn văn tiếng Nhật (${p.title}):\n${text}`;
    }
    if (screen === "quizBook") {
      const q = findQuizBookById(itemId);
      if (!q) return "";
      return `Câu hỏi luyện đề tiếng Nhật: ${q.question}${q.options.length ? `\nLựa chọn: ${q.options.join(" / ")}` : ""}`;
    }
    if (screen === "listening" || screen === "dictation") {
      const q = findListeningById(itemId);
      if (!q) return "";
      const lines = q.turns.length > 0 ? q.turns.map((t) => `${t.speaker}: ${t.text}`).join("\n") : q.scenario;
      return `Đoạn hội thoại/câu nghe tiếng Nhật:\n${lines}\nCâu hỏi: ${q.question}`;
    }
    if (screen === "itBookVocab") {
      const w = findItBookVocabById(itemId);
      if (!w) return "";
      return `Từ vựng tiếng Nhật (IT) "${w.word}"${w.reading && w.reading !== w.word ? ` (${w.reading})` : ""} - nghĩa: ${w.meaningVi}`;
    }
  } catch {
    return "";
  }
  return "";
}
