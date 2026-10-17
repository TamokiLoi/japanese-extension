import { useState } from "react";
import { Headphones, Keyboard, Lightbulb } from "lucide-react";
import { ListeningScreen } from "./ListeningScreen.tsx";
import { DictationScreen } from "./DictationScreen.tsx";
import { Button } from "../components/ui/button.tsx";

type Tab = "listening" | "dictation";

// Both tabs are "luyện nghe" at heart (same underlying question pool), just
// two different interaction modes -- pick-the-answer vs. type-what-you-hear
// -- so they live under one sidebar entry with a tab switcher instead of
// two separate nav items. WebApp.tsx routes both the legacy "listening" and
// "dictation" hash values here so old deep links still land on the right tab.
//
// The switcher and title action are passed into each screen so the page can
// keep its title first, then the mode switcher, in the same content column.
export function ListeningHubScreen({
  initialTab = "listening",
  jumpToId,
  onCurrentItemChange,
  onOpenExamTips,
}: {
  initialTab?: Tab;
  jumpToId?: string;
  onCurrentItemChange?: (id: string | undefined) => void;
  onOpenExamTips?: () => void;
}) {
  const [tab, setTab] = useState<Tab>(initialTab);

  const tabs = (
    <div className="flex items-center gap-1 rounded-full border border-neutral-200 p-1">
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
  const headerAction = onOpenExamTips ? (
    <Button size="sm" variant="outline" onClick={onOpenExamTips}>
      <Lightbulb size={14} /> Mẹo nghe N3
    </Button>
  ) : undefined;

  return tab === "listening" ? (
    <ListeningScreen tabs={tabs} headerAction={headerAction} jumpToId={tab === initialTab ? jumpToId : undefined} onCurrentItemChange={onCurrentItemChange} />
  ) : (
    <DictationScreen tabs={tabs} headerAction={headerAction} jumpToId={tab === initialTab ? jumpToId : undefined} onCurrentItemChange={onCurrentItemChange} />
  );
}
