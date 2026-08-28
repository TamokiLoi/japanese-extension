// Shared by the Kanji and Vocab screens: an optional "open in a full tab"
// escape hatch for comfortable reading, on top of their normal (and
// default) popup behavior -- unlike Quiz, these screens persist their
// viewer position to storage on every navigation, so there's no data-loss
// reason to force a tab, just a convenience one.
export function isTabMode(): boolean {
  return document.body.classList.contains("tab-mode");
}

export function expandToTabButtonHtml(): string {
  if (isTabMode()) return "";
  return `<button id="expand-tab" class="icon-btn" title="Mở ở tab riêng cho thoải mái hơn">⤢</button>`;
}

export function wireExpandToTabButton(
  screenHash: "kanji" | "vocab" | "jlptHistory" | "search" | "stats" | "reading" | "quizBook" | "bunpo",
): void {
  document.getElementById("expand-tab")?.addEventListener("click", () => {
    chrome.tabs.create({ url: chrome.runtime.getURL(`index.html?tab=1#${screenHash}`) });
    window.close();
  });
}
