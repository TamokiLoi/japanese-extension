import { useEffect, useState } from "react";
import { MessageCircleQuestion, X, Send, Sparkles, Settings, Loader2, ExternalLink, KeyRound } from "lucide-react";
import { loadOpenAiKey, saveOpenAiKey, clearOpenAiKey } from "../../popup/openaiKeyState.ts";
import { loadGeminiKey, saveGeminiKey, clearGeminiKey } from "../../popup/geminiKeyState.ts";
import { askOpenAi, OpenAiChatError } from "../lib/openaiChat.ts";
import { askGemini, GeminiChatError } from "../lib/geminiChat.ts";
import { storageGet, storageSet } from "../../platform/storage";

type Provider = "chatgpt" | "gemini";

const PROVIDER_LABEL: Record<Provider, string> = { chatgpt: "ChatGPT", gemini: "Gemini" };
// ChatGPT's chatgpt.com/?q=<text> reliably prefills its composer -- a normal
// https link, so it also hands off to the ChatGPT app on mobile (universal
// link). Gemini has no equivalent documented param (confirmed via search --
// only 3rd-party browser extensions add that, which most users won't have),
// so the external-tab fallback there can only copy to clipboard and open the
// plain app, not prefill it.
const EXTERNAL_URL: Record<Provider, (text: string) => string> = {
  chatgpt: (text) => `https://chatgpt.com/?q=${encodeURIComponent(text)}`,
  gemini: () => "https://gemini.google.com/app",
};
const LAST_PROVIDER_KEY = "chatFloatingProvider";

// Floating "hỏi AI" bubble, present on every web-dashboard screen (mounted
// once in WebAppShell.tsx). User picks ChatGPT or Gemini; each provider
// works the same way independently:
//   - No key for that provider (default): the popup only *composes* the
//     question, then hands off to that provider's own web/app via an
//     external link -- this app has no backend to safely hold a shared key,
//     so this stays the default path and costs nothing.
//   - Key set for that provider: answers render right here via a direct
//     browser->API call (openaiChat.ts / geminiChat.ts) -- a POC trade-off,
//     see those files' comments. Each provider's key is stored and toggled
//     independently (openaiKeyState.ts / geminiKeyState.ts).
export function FloatingChatButton({ getContext }: { getContext: () => string }) {
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [context, setContext] = useState("");
  const [provider, setProvider] = useState<Provider>("chatgpt");
  const [openaiKey, setOpenaiKey] = useState<string | undefined>(undefined);
  const [geminiKey, setGeminiKey] = useState<string | undefined>(undefined);
  const [showSettings, setShowSettings] = useState(false);
  const [keyInput, setKeyInput] = useState("");
  const [sending, setSending] = useState(false);
  const [answer, setAnswer] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    void loadOpenAiKey().then(setOpenaiKey);
    void loadGeminiKey().then(setGeminiKey);
    void storageGet<Provider>(LAST_PROVIDER_KEY).then((p) => {
      if (p === "chatgpt" || p === "gemini") setProvider(p);
    });
  }, []);

  useEffect(() => {
    if (open) {
      setContext(getContext());
      setAnswer("");
      setError("");
      setShowSettings(false);
      setKeyInput("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const currentKey = provider === "chatgpt" ? openaiKey : geminiKey;

  function switchProvider(next: Provider) {
    setProvider(next);
    setAnswer("");
    setError("");
    setShowSettings(false);
    setKeyInput("");
    void storageSet(LAST_PROVIDER_KEY, next);
  }

  function openExternal() {
    const combined = [context, question].filter(Boolean).join("\n\n").trim();
    if (!combined) return;
    // A URL this long can also hit some servers'/proxies' query-length
    // limits (ChatGPT's case) -- clipboard is a silent, always-working
    // fallback either way, and it's the *only* hand-off for Gemini.
    navigator.clipboard?.writeText(combined).catch(() => {});
    window.open(EXTERNAL_URL[provider](combined), "_blank", "noopener,noreferrer");
    setOpen(false);
    setQuestion("");
  }

  async function sendWithKey() {
    const combined = [context, question].filter(Boolean).join("\n\n").trim();
    if (!combined || !currentKey) return;
    setSending(true);
    setError("");
    setAnswer("");
    try {
      const text = provider === "chatgpt" ? await askOpenAi(currentKey, combined) : await askGemini(currentKey, combined);
      setAnswer(text);
    } catch (e) {
      const known = e instanceof OpenAiChatError || e instanceof GeminiChatError;
      setError(known ? (e as Error).message : "Có lỗi xảy ra, thử lại sau.");
    } finally {
      setSending(false);
    }
  }

  async function handleSaveKey() {
    if (!keyInput.trim()) return;
    if (provider === "chatgpt") {
      await saveOpenAiKey(keyInput.trim());
      setOpenaiKey(keyInput.trim());
    } else {
      await saveGeminiKey(keyInput.trim());
      setGeminiKey(keyInput.trim());
    }
    setKeyInput("");
    setShowSettings(false);
  }

  async function handleClearKey() {
    if (provider === "chatgpt") {
      await clearOpenAiKey();
      setOpenaiKey(undefined);
    } else {
      await clearGeminiKey();
      setGeminiKey(undefined);
    }
    setShowSettings(false);
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Hỏi ChatGPT"
        title="Hỏi ChatGPT/Gemini"
        className="fixed bottom-20 left-4 z-20 flex h-11 w-11 items-center justify-center rounded-full bg-neutral-900 text-white shadow-lg active:bg-neutral-700 md:right-6 md:bottom-20 md:left-auto"
      >
        <MessageCircleQuestion size={20} />
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center md:items-center" onClick={() => setOpen(false)}>
          <div className="absolute inset-0 bg-black/30" />
          <div
            className="relative w-full max-w-md rounded-t-2xl bg-white p-5 shadow-xl md:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-sm font-bold text-neutral-800">
                <Sparkles size={16} className="text-neutral-500" /> Hỏi AI
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setShowSettings((s) => !s)}
                  aria-label="Cài đặt API key"
                  title="Cài đặt API key riêng"
                  className={`rounded-lg p-1 hover:bg-neutral-100 ${showSettings ? "text-rose-600" : "text-neutral-400"}`}
                >
                  <Settings size={16} />
                </button>
                <button onClick={() => setOpen(false)} className="rounded-lg p-1 text-neutral-400 hover:bg-neutral-100">
                  <X size={18} />
                </button>
              </div>
            </div>

            <div className="mt-3 flex gap-1 rounded-xl bg-neutral-100 p-1">
              {(["chatgpt", "gemini"] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => switchProvider(p)}
                  className={`flex-1 rounded-lg py-1.5 text-xs font-semibold ${
                    provider === p ? "bg-white text-neutral-800 shadow-sm" : "text-neutral-500 hover:text-neutral-700"
                  }`}
                >
                  {PROVIDER_LABEL[p]}
                </button>
              ))}
            </div>

            {showSettings ? (
              <div className="mt-3 rounded-xl border border-neutral-200 bg-neutral-50 p-3">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-neutral-600">
                  <KeyRound size={13} /> API key {PROVIDER_LABEL[provider]} riêng của bạn
                </div>
                <p className="mt-1 text-[11px] text-neutral-400">
                  Key chỉ lưu trên máy này, dùng để chat trả lời ngay tại đây thay vì mở tab {PROVIDER_LABEL[provider]}. Bạn tự
                  chịu phí sử dụng theo tài khoản {PROVIDER_LABEL[provider]} của mình.
                </p>
                {currentKey ? (
                  <div className="mt-2 flex items-center justify-between rounded-lg bg-white px-3 py-2 text-xs text-neutral-500 ring-1 ring-neutral-200">
                    <span>Đã lưu key: ••••{currentKey.slice(-4)}</span>
                    <button onClick={handleClearKey} className="font-semibold text-rose-600 hover:underline">
                      Xóa
                    </button>
                  </div>
                ) : (
                  <div className="mt-2 flex gap-1.5">
                    <input
                      type="password"
                      value={keyInput}
                      onChange={(e) => setKeyInput(e.target.value)}
                      placeholder={provider === "chatgpt" ? "sk-..." : "AIza..."}
                      className="min-w-0 flex-1 rounded-lg border border-neutral-200 px-2.5 py-1.5 text-xs outline-none focus:border-rose-300"
                    />
                    <button
                      onClick={handleSaveKey}
                      disabled={!keyInput.trim()}
                      className="shrink-0 rounded-lg bg-neutral-900 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
                    >
                      Lưu
                    </button>
                  </div>
                )}
              </div>
            ) : null}

            {context ? (
              <div className="mt-3 max-h-28 overflow-y-auto rounded-xl bg-neutral-50 p-3 text-xs whitespace-pre-wrap text-neutral-500">{context}</div>
            ) : null}

            <textarea
              autoFocus
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder={context ? "Muốn hỏi thêm gì về nội dung trên?" : "Nhập câu hỏi của bạn..."}
              rows={3}
              className="mt-3 w-full resize-none rounded-xl border border-neutral-200 p-3 text-sm outline-none focus:border-rose-300"
            />

            {!currentKey && provider === "gemini" ? (
              <p className="mt-1.5 text-[11px] text-neutral-400">
                Gemini web chưa hỗ trợ điền sẵn câu hỏi -- nội dung sẽ được copy, bạn dán (Ctrl+V) vào ô chat Gemini.
              </p>
            ) : null}

            {error ? <div className="mt-2 text-xs font-medium text-rose-600">{error}</div> : null}

            {answer ? (
              <div className="mt-3 max-h-56 overflow-y-auto rounded-xl bg-rose-50/60 p-3 text-sm whitespace-pre-wrap text-neutral-700">{answer}</div>
            ) : null}

            {currentKey ? (
              <>
                <button
                  onClick={sendWithKey}
                  disabled={sending || (!context && !question.trim())}
                  className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-full bg-rose-600 py-2.5 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-40"
                >
                  {sending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
                  {sending ? "Đang hỏi..." : "Gửi"}
                </button>
                <button
                  onClick={openExternal}
                  disabled={!context && !question.trim()}
                  className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-full py-1.5 text-xs font-medium text-neutral-400 hover:text-neutral-600 disabled:opacity-40"
                >
                  <ExternalLink size={12} /> Hoặc mở trong tab {PROVIDER_LABEL[provider]}
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={openExternal}
                  disabled={!context && !question.trim()}
                  className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-full bg-rose-600 py-2.5 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-40"
                >
                  <Send size={15} /> Hỏi {PROVIDER_LABEL[provider]}
                </button>
                <button
                  onClick={() => setShowSettings(true)}
                  className="mt-2 flex w-full items-center justify-center gap-1.5 text-xs font-medium text-neutral-400 hover:text-neutral-600"
                >
                  <KeyRound size={12} /> Dùng API key riêng để chat ngay tại đây
                </button>
              </>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
