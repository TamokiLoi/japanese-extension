// React counterpart to tabMode.ts's expandToTabButtonHtml/wireExpandToTabButton,
// kept separate (not a replacement in place) until every screen that calls
// those has migrated to React -- see the migration plan.
import { assetUrl } from "../platform/assetUrl";

export type TabScreenHash = "kanji" | "vocab" | "jlptHistory" | "search" | "stats" | "reading" | "quizBook" | "bunpo";

export function isTabMode(): boolean {
  return document.body.classList.contains("tab-mode");
}

export function ExpandTabButton({ screenHash }: { screenHash: TabScreenHash }) {
  if (isTabMode()) return null;
  return (
    <button
      className="icon-btn"
      title="Mở ở tab riêng cho thoải mái hơn"
      onClick={() => {
        if (typeof chrome !== "undefined" && chrome.tabs?.create) {
          chrome.tabs.create({ url: assetUrl(`index.html?tab=1#${screenHash}`) });
          window.close();
        }
      }}
    >
      ⤢
    </button>
  );
}
