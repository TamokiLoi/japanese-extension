import { createRoot } from "react-dom/client";
import { isExtensionRuntime } from "../platform/runtime.ts";
import { App } from "./App.tsx";

export type { Screen } from "./App.tsx";
export { VALID_SCREENS } from "./App.tsx";

// Quiz (and the "⤢ mở tab" button on Kanji/Vocab) opens in a full browser
// tab instead of the popup -- see MenuScreen.tsx / TabMode.tsx. `?tab=1`
// marks the page as opened that way (widens the layout, see .tab-mode in style.css).
// On the GitHub Pages web build there's no popup to begin with -- every
// page load is already "a full tab" -- so it always gets the wider layout
// instead of the extension's narrow 320px popup style.
const params = new URLSearchParams(location.search);
if (params.get("tab") === "1" || !isExtensionRuntime()) {
  document.body.classList.add("tab-mode");
}

// The GitHub Pages web build gets a completely different app shell (see
// src/web/) -- a responsive dashboard instead of the extension's fixed
// 480px popup. Loaded via dynamic import so its Tailwind-processed CSS
// chunk is never even requested by the extension build. See
// isExtensionRuntime() in src/platform/runtime.ts for why a stub
// `window.chrome` in plain Chromium doesn't false-trigger this branch.
if (__IS_PAGES_BUILD__ && !isExtensionRuntime()) {
  import("../web/WebApp.tsx").then(({ WebApp }) => {
    createRoot(document.getElementById("app")!).render(<WebApp />);
  });
} else {
  createRoot(document.getElementById("app")!).render(<App />);
}
