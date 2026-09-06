import { useEffect, useRef, useState } from "react";
import { MessageCircleQuestion, X, Send, Sparkles, Settings, Loader2, ExternalLink, KeyRound, RotateCcw } from "lucide-react";
import {
  loadOpenAiKey,
  saveOpenAiKey,
  clearOpenAiKey,
  loadOpenAiModel,
  saveOpenAiModel,
  OPENAI_MODELS,
  DEFAULT_OPENAI_MODEL,
} from "../../popup/openaiKeyState.ts";
import {
  loadGeminiKey,
  saveGeminiKey,
  clearGeminiKey,
  loadGeminiModel,
  saveGeminiModel,
  GEMINI_MODELS,
  DEFAULT_GEMINI_MODEL,
} from "../../popup/geminiKeyState.ts";
import { askOpenAi, OpenAiChatError } from "../lib/openaiChat.ts";
import { askGemini, GeminiChatError } from "../lib/geminiChat.ts";
import type { ChatMessage } from "../lib/chatTypes.ts";
import { MiniMarkdown } from "../lib/miniMarkdown.tsx";
import { storageGet, storageSet } from "../../platform/storage";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "./ui/select.tsx";

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

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap ${
          isUser ? "rounded-br-sm bg-rose-600 text-white" : "rounded-bl-sm bg-neutral-100 text-neutral-800"
        }`}
      >
        {isUser ? message.text : <MiniMarkdown text={message.text} />}
      </div>
    </div>
  );
}

// Floating "hỏi AI" bubble, present on every web-dashboard screen (mounted
// once in WebAppShell.tsx, so it never unmounts on navigation -- only a full
// page reload resets its state). User picks ChatGPT or Gemini; each
// provider works the same way independently, with its OWN conversation
// thread (messagesByProvider) that survives closing/reopening the popup:
//   - No key for that provider (default): the popup only *composes* the
//     question, then hands off to that provider's own web/app via an
//     external link -- this app has no backend to safely hold a shared key,
//     so this stays the default path and costs nothing.
//   - Key set for that provider: a real back-and-forth chat renders right
//     here via a direct browser->API call (openaiChat.ts / geminiChat.ts),
//     sending the whole conversation so far on every turn for real
//     multi-turn context -- a POC trade-off, see those files' comments.
export function FloatingChatButton({ getContext }: { getContext: () => string }) {
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [context, setContext] = useState("");
  const [provider, setProvider] = useState<Provider>("gemini");
  const [openaiKey, setOpenaiKey] = useState<string | undefined>(undefined);
  const [geminiKey, setGeminiKey] = useState<string | undefined>(undefined);
  const [openaiModel, setOpenaiModel] = useState(DEFAULT_OPENAI_MODEL as string);
  const [geminiModel, setGeminiModel] = useState(DEFAULT_GEMINI_MODEL as string);
  const [showSettings, setShowSettings] = useState(false);
  const [keyInput, setKeyInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [messagesByProvider, setMessagesByProvider] = useState<Record<Provider, ChatMessage[]>>({ chatgpt: [], gemini: [] });
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void loadOpenAiKey().then(setOpenaiKey);
    void loadGeminiKey().then(setGeminiKey);
    void loadOpenAiModel().then(setOpenaiModel);
    void loadGeminiModel().then(setGeminiModel);
    void storageGet<Provider>(LAST_PROVIDER_KEY).then((p) => {
      if (p === "chatgpt" || p === "gemini") setProvider(p);
    });
  }, []);

  // Refreshes context (the current card, if any) every time the popup is
  // reopened -- deliberately does NOT touch messagesByProvider, so closing
  // and reopening the popup keeps the conversation instead of wiping it.
  useEffect(() => {
    if (open) {
      setContext(getContext());
      setError("");
      setShowSettings(false);
      setKeyInput("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messagesByProvider, provider, sending]);

  const currentKey = provider === "chatgpt" ? openaiKey : geminiKey;
  const currentModel = provider === "chatgpt" ? openaiModel : geminiModel;
  const currentModels: readonly string[] = provider === "chatgpt" ? OPENAI_MODELS : GEMINI_MODELS;
  const messages = messagesByProvider[provider];

  async function handleModelChange(model: string) {
    if (provider === "chatgpt") {
      setOpenaiModel(model);
      await saveOpenAiModel(model);
    } else {
      setGeminiModel(model);
      await saveGeminiModel(model);
    }
  }

  function switchProvider(next: Provider) {
    setProvider(next);
    setError("");
    setShowSettings(false);
    setKeyInput("");
    void storageSet(LAST_PROVIDER_KEY, next);
  }

  function newChat() {
    setMessagesByProvider((prev) => ({ ...prev, [provider]: [] }));
    setError("");
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
    const trimmed = question.trim();
    if (!trimmed && !context) return;
    if (!currentKey) return;
    // Only the very first turn of a fresh conversation carries the card
    // context -- once it's in the history, every later turn already has it.
    const userText = messages.length === 0 ? [context, trimmed].filter(Boolean).join("\n\n") : trimmed;
    if (!userText) return;
    const nextHistory: ChatMessage[] = [...messages, { role: "user", text: userText }];
    setMessagesByProvider((prev) => ({ ...prev, [provider]: nextHistory }));
    setQuestion("");
    setSending(true);
    setError("");
    try {
      const text = provider === "chatgpt" ? await askOpenAi(currentKey, nextHistory, currentModel) : await askGemini(currentKey, nextHistory, currentModel);
      setMessagesByProvider((prev) => ({ ...prev, [provider]: [...prev[provider], { role: "assistant", text }] }));
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
            className="relative flex max-h-[88vh] w-full max-w-md flex-col rounded-t-2xl bg-white shadow-xl md:max-h-[80vh] md:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 pt-5">
              <div className="flex items-center gap-1.5 text-sm font-bold text-neutral-800">
                <Sparkles size={16} className="text-neutral-500" /> Hỏi AI
              </div>
              <div className="flex items-center gap-1">
                {messages.length > 0 ? (
                  <button
                    onClick={newChat}
                    aria-label="Cuộc trò chuyện mới"
                    title="Cuộc trò chuyện mới"
                    className="rounded-lg p-1 text-neutral-400 hover:bg-neutral-100"
                  >
                    <RotateCcw size={16} />
                  </button>
                ) : null}
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

            <div className="px-5">
              <div className="mt-3 flex gap-1 rounded-xl bg-neutral-100 p-1">
                {(["gemini", "chatgpt"] as const).map((p) => (
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
                <div className="mt-3 max-h-20 overflow-y-auto rounded-xl bg-neutral-50 p-2.5 text-xs whitespace-pre-wrap text-neutral-500">{context}</div>
              ) : null}
            </div>

            {currentKey ? (
              <div ref={scrollRef} className="mt-3 min-h-0 flex-1 overflow-y-auto px-5">
                <div className="flex flex-col gap-2.5 pb-2">
                  {messages.map((m, i) => (
                    <MessageBubble key={i} message={m} />
                  ))}
                  {sending ? (
                    <div className="flex justify-start">
                      <div className="flex items-center gap-1.5 rounded-2xl rounded-bl-sm bg-neutral-100 px-3 py-2 text-sm text-neutral-400">
                        <Loader2 size={13} className="animate-spin" /> Đang trả lời...
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            ) : (
              <div className="flex-1" />
            )}

            <div className="px-5 pb-5">
              {!currentKey && provider === "gemini" ? (
                <p className="mb-1.5 text-[11px] text-neutral-400">
                  Gemini web chưa hỗ trợ điền sẵn câu hỏi -- nội dung sẽ được copy, bạn dán (Ctrl+V) vào ô chat Gemini.
                </p>
              ) : null}

              {error ? <div className="mb-2 text-xs font-medium text-rose-600">{error}</div> : null}

              <textarea
                autoFocus
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={(e) => {
                  if (currentKey && e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    if (!sending) void sendWithKey();
                  }
                }}
                placeholder={context && messages.length === 0 ? "Muốn hỏi thêm gì về nội dung trên?" : "Nhập câu hỏi của bạn..."}
                rows={2}
                className="w-full resize-none rounded-xl border border-neutral-200 p-3 text-sm outline-none focus:border-rose-300"
              />

              {currentKey ? (
                <div className="mt-1.5 flex items-center justify-between gap-2">
                  <span className="text-[11px] text-neutral-400">Model (đổi nếu bị "quá tải")</span>
                  <Select items={currentModels.map((m) => ({ value: m, label: m }))} value={currentModel} onValueChange={(v) => v !== null && handleModelChange(v)}>
                    <SelectTrigger className="h-auto py-1 text-xs shadow-none">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {currentModels.map((m) => (
                        <SelectItem key={m} value={m}>
                          {m}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}

              {currentKey ? (
                <>
                  <button
                    onClick={sendWithKey}
                    disabled={sending || (!context && !question.trim()) || (messages.length > 0 && !question.trim())}
                    className="mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-full bg-rose-600 py-2.5 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-40"
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
        </div>
      ) : null}
    </>
  );
}
