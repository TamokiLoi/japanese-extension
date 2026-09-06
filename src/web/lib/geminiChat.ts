// Direct-from-browser call to Google's Gemini API, mirroring openaiChat.ts's
// trade-offs (key lives in this browser's storage, no backend). The one
// meaningful difference for the user: Gemini's free tier needs no billing
// setup at all (unlike OpenAI's API, which always requires prepaid credit
// even alongside a paid ChatGPT plan) -- see google.dev's key-generation
// page. Model id "gemini-3.5-flash" matches what the rest of this repo's
// tooling already uses successfully with a Gemini key (see
// _scratch/translate_reading_log.txt).
const MODEL = "gemini-3.5-flash";

export class GeminiChatError extends Error {}

export async function askGemini(apiKey: string, prompt: string): Promise<string> {
  let res: Response;
  try {
    res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`, {
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
        contents: [{ role: "user", parts: [{ text: prompt }] }],
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
