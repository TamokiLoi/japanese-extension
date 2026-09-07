// Speaks Japanese text using the browser's built-in Web Speech API
// (SpeechSynthesis) -- no audio files, no API cost, works for any word
// instantly. Quality/availability depends on the device's installed voices
// (Google TTS on Android Chrome, Siri voices on iOS Safari, etc.), so
// callers should check hasJapaneseVoice() before showing a speak button.
let cachedVoices: SpeechSynthesisVoice[] | null = null;

function loadVoices(): SpeechSynthesisVoice[] {
  if (typeof window === "undefined" || !window.speechSynthesis) return [];
  const voices = window.speechSynthesis.getVoices();
  if (voices.length > 0) cachedVoices = voices;
  return voices;
}

// Voice lists load asynchronously on first page load in some browsers, so
// this both returns what's available now and keeps the cache warm for the
// next check via the voiceschanged event.
export function hasJapaneseVoice(): boolean {
  if (typeof window === "undefined" || !window.speechSynthesis) return false;
  const voices = cachedVoices ?? loadVoices();
  return voices.some((v) => v.lang.startsWith("ja"));
}

const changeListeners = new Set<() => void>();

if (typeof window !== "undefined" && window.speechSynthesis) {
  loadVoices();
  window.speechSynthesis.onvoiceschanged = () => {
    loadVoices();
    changeListeners.forEach((cb) => cb());
  };
}

// Voice availability can change after a component has already mounted --
// e.g. the device downloads a Japanese TTS voice pack while the app tab is
// still open, or Chrome only reports the OS voice list a while after
// startup. Callers should re-check hasJapaneseVoice() when this fires
// instead of relying on a single mount-time check.
export function onVoicesChanged(callback: () => void): () => void {
  changeListeners.add(callback);
  return () => changeListeners.delete(callback);
}

export function speakJapanese(text: string): void {
  if (typeof window === "undefined" || !window.speechSynthesis || !text) return;
  window.speechSynthesis.cancel(); // stop any previous utterance before starting a new one
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "ja-JP";
  const voices = cachedVoices ?? loadVoices();
  const jaVoice = voices.find((v) => v.lang === "ja-JP") ?? voices.find((v) => v.lang.startsWith("ja"));
  if (jaVoice) utterance.voice = jaVoice;
  utterance.rate = 0.9;
  window.speechSynthesis.speak(utterance);
}
