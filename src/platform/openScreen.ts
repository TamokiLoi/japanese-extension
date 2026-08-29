import { assetUrl } from "./assetUrl";

// Wraps the "open this screen in its own tab" escape hatch used by Quiz
// (so an in-progress session survives the popup closing) and the Kanji/Vocab
// "⤢ expand to tab" button. In the extension, chrome.tabs is available and
// we open a real new tab, then close the popup. On the web there is no
// popup to close and no separate "tab" concept -- every page load is
// already a full tab -- so we just navigate in place instead.
export function openScreenInTab(hash: string, navigate: () => void): void {
  if (typeof chrome !== "undefined" && chrome.tabs?.create) {
    chrome.tabs.create({ url: assetUrl(`index.html?tab=1#${hash}`) });
    window.close();
    return;
  }
  navigate();
}
