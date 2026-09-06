// Minimal direct-from-browser call to OpenAI's Chat Completions API using a
// key the user pasted in themselves (see openaiKeyState.ts). This is a
// deliberate POC shortcut: OpenAI's API does accept cross-origin browser
// requests, so no backend proxy is needed -- but it also means the key lives
// in this browser's localStorage/chrome.storage in the clear. That's an
// acceptable trade for a single user's own key on their own device (same
// trust boundary as e.g. a browser-saved password), not for a key anyone
// else would ever share.
const MODEL = "gpt-4o-mini";

export class OpenAiChatError extends Error {}

export async function askOpenAi(apiKey: string, prompt: string): Promise<string> {
  let res: Response;
  try {
    res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          {
            role: "system",
            content:
              "Bạn là trợ lý hỗ trợ học tiếng Nhật, trả lời ngắn gọn, rõ ràng bằng tiếng Việt trừ khi người dùng yêu cầu khác.",
          },
          { role: "user", content: prompt },
        ],
        temperature: 0.5,
        max_tokens: 700,
      }),
    });
  } catch {
    throw new OpenAiChatError("Không kết nối được tới OpenAI. Kiểm tra mạng và thử lại.");
  }

  if (res.status === 401) throw new OpenAiChatError("API key không hợp lệ hoặc đã bị thu hồi.");
  if (res.status === 429) throw new OpenAiChatError("Đã vượt hạn mức/tốc độ gọi API. Thử lại sau ít phút.");
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new OpenAiChatError(body?.error?.message || `Lỗi OpenAI (mã ${res.status}).`);
  }

  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content;
  if (!text) throw new OpenAiChatError("OpenAI không trả về nội dung.");
  return text as string;
}
