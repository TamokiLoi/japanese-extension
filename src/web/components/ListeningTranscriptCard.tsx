import { BookOpenText, Globe } from "lucide-react";
import type { ListeningTurn } from "../../types/listening.ts";
import { Card } from "./ui/card.tsx";
import { FuriganaText } from "./FuriganaText.tsx";

export function ListeningTranscriptCard({
  turns,
  showFurigana,
  onToggleFurigana,
  showTranslation,
  onToggleTranslation,
  className = "mt-4",
}: {
  turns: ListeningTurn[];
  showFurigana: boolean;
  onToggleFurigana: () => void;
  showTranslation: boolean;
  onToggleTranslation: () => void;
  className?: string;
}) {
  return (
    <Card className={`${className} gap-0 rounded-2xl border-neutral-200 p-5 ring-0`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs font-bold tracking-wide text-neutral-400 uppercase">Transcript</div>
        <div className="flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={onToggleFurigana}
            aria-pressed={showFurigana}
            className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${
              showFurigana ? "border-rose-300 bg-rose-50 text-rose-600" : "border-neutral-200 text-neutral-600 hover:bg-neutral-50"
            }`}
          >
            <BookOpenText size={13} /> {showFurigana ? "Ẩn furigana" : "Hiện furigana"}
          </button>
          <button
            type="button"
            onClick={onToggleTranslation}
            aria-pressed={showTranslation}
            className="flex items-center gap-1.5 rounded-full border border-neutral-200 px-3 py-1 text-xs font-semibold text-neutral-600 hover:bg-neutral-50"
          >
            <Globe size={13} /> {showTranslation ? "Ẩn bản dịch" : "Hiện bản dịch"}
          </button>
        </div>
      </div>
      <div className="mt-3 flex flex-col gap-3.5">
        {turns.map((turn, index) => (
          <div key={index}>
            <div className="text-[14.5px] leading-relaxed text-neutral-800">
              <b className="font-bold text-neutral-400">{turn.speaker}：</b>
              {showFurigana ? <FuriganaText annotations={turn.furigana} text={turn.text} /> : turn.text}
            </div>
            {showTranslation && turn.textVi ? (
              <div className="mt-1 border-l-2 border-neutral-300 pl-3 text-[13px] leading-snug text-neutral-500 italic">{turn.textVi}</div>
            ) : null}
          </div>
        ))}
      </div>
    </Card>
  );
}
