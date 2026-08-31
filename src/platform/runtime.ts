// Runtime (not build-time) way to tell the Chrome extension apart from the
// GitHub Pages static site -- both builds share the exact same main.tsx,
// so this is what main.tsx checks to decide which app shell to render.
// Mirrors the hasChromeStorage() check in storage.ts, but exported on its
// own since main.tsx needs it before any storage call happens.
export function isExtensionRuntime(): boolean {
  return typeof chrome !== "undefined" && !!chrome.runtime?.id;
}
