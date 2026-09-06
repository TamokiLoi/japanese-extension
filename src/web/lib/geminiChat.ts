// Direct-from-browser call to Google's Gemini API, mirroring openaiChat.ts's
// trade-offs (key lives in this browser's storage, no backend). The one
// meaningful difference for the user: Gemini's free tier needs no billing
// setup at all (unlike OpenAI's API, which always requires prepaid credit
// even alongside a paid ChatGPT plan) -- see google.dev's key-generation
// page. `model` is user-selectable (see geminiKeyState.ts's GEMINI_MODELS)
// since Google's "high demand" 503 hits one model at a time -- switching
// to a different one is a real fix, unlike retrying the same one. `history`
// carries the whole conversation so far (this call's own reply not yet
// included) so a follow-up question has real multi-turn context -- Gemini's
// "model" role is this app's "assistant".
import type { ChatMessage } from "./chatTypes.ts";

export class GeminiChatError extends Error {}

export async function askGemini(apiKey: string, history: ChatMessage[], model: string): Promise<string> {
  let res: Response;
  try {
    res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: {
          parts: [
            {
              text: "Bạn là trợ lý hỗ trợ học tiếng Nhật, trả lời ngắn gọn, rõ ràng bằng tiếng Việt trừ khi người dùng yêu cầu khác.",
            },
          ],
        },
        contents: history.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.text }] })),
        generationConfig: { temperature: 0.5, maxOutputTokens: 700 },
      }),
    });
  } catch {
    throw new GeminiChatError("Không kết nối được tới Gemini. Kiểm tra mạng và thử lại.");
  }

  if (res.status === 400 || res.status === 403) throw new GeminiChatError("API key không hợp lệ hoặc chưa được cấp quyền.");
  if (res.status === 429) throw new GeminiChatError("Đã vượt hạn mức miễn phí/tốc độ gọi API. Thử lại sau ít phút.");
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new GeminiChatError(body?.error?.message || `Lỗi Gemini (mã ${res.status}).`);
  }

  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("");
  if (!text) throw new GeminiChatError("Gemini không trả về nội dung (có thể do bộ lọc an toàn chặn câu hỏi này).");
  return text as string;
}
