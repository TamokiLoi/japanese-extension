import { useState } from "react";
import { Headphones, Keyboard } from "lucide-react";
import { ListeningScreen } from "./ListeningScreen.tsx";
import { DictationScreen } from "./DictationScreen.tsx";

type Tab = "listening" | "dictation";

// Both tabs are "luyện nghe" at heart (same underlying question pool), just
// two different interaction modes -- pick-the-answer vs. type-what-you-hear
// -- so they live under one sidebar entry with a tab switcher instead of
// two separate nav items. WebApp.tsx routes both the legacy "listening" and
// "dictation" hash values here so old deep links still land on the right tab.
//
// The switcher is passed down as `topBar` and rendered *inside* each
// screen's own top-level wrapper (rather than this component adding a
// second mx-auto max-w-3xl wrapper around them) -- nesting two of those
// would double up the horizontal/vertical padding.
export function ListeningHubScreen({ initialTab = "listening", jumpToId }: { initialTab?: Tab; jumpToId?: string }) {
  const [tab, setTab] = useState<Tab>(initialTab);

  const topBar = (
    <div className="mb-4 flex items-center gap-1 rounded-full border border-neutral-200 p-1">
      <button
        onClick={() => setTab("listening")}
        className={`flex flex-1 items-center justify-center gap-1.5 rounded-full py-1.5 text-sm font-semibold ${
          tab === "listening" ? "bg-rose-50 text-rose-600" : "text-neutral-500 hover:bg-neutral-50"
        }`}
      >
        <Headphones size={15} /> Nghe & chọn đáp án
      </button>
      <button
        onClick={() => setTab("dictation")}
        className={`flex flex-1 items-center justify-center gap-1.5 rounded-full py-1.5 text-sm font-semibold ${
          tab === "dictation" ? "bg-rose-50 text-rose-600" : "text-neutral-500 hover:bg-neutral-50"
        }`}
      >
        <Keyboard size={15} /> Nghe chép chính tả
      </button>
    </div>
  );

  return tab === "listening" ? (
    <ListeningScreen topBar={topBar} jumpToId={tab === initialTab ? jumpToId : undefined} />
  ) : (
    <DictationScreen topBar={topBar} jumpToId={tab === initialTab ? jumpToId : undefined} />
  );
}
