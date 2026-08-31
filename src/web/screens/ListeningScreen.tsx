import { useState } from "react";
import { Headphones } from "lucide-react";
import { ALL_LISTENING } from "../../popup/listeningState.ts";
import { assetUrl } from "../../platform/assetUrl";
import { Card } from "../components/ui/card.tsx";
import { Button } from "../components/ui/button.tsx";
import { PageHeader } from "../components/PageHeader.tsx";
import { levelBadgeStyle } from "../lib/levelColors.tsx";

const TASK_TYPE_LABELS = {
  kadai: "課題理解 -- nghe hiểu việc cần làm",
  point: "ポイント理解 -- nghe hiểu trọng điểm",
  gaiyou: "概要理解 -- nghe hiểu khái quát",
  sokuji: "発話表現・即時応答 -- phản xạ nhanh",
} as const;

// POC screen for a single demo item -- proves the mechanism (Gemini-scripted
// dialogue -> Gemini TTS audio -> play/answer/reveal flow) before building
// out the full picker/filter/progress-tracking scaffolding Reading/QuizBook
// already have. Intentionally minimal.
export function ListeningScreen() {
  const question = ALL_LISTENING[0];
  const [selected, setSelected] = useState<number | null>(null);
  const [showTranscript, setShowTranscript] = useState(false);

  if (!question) {
    return (
      <div className="mx-auto max-w-3xl px-2.5 py-2 md:px-8 md:py-6">
        <PageHeader title="Luyện nghe (thử nghiệm)" subtitle="Chưa có câu hỏi nào." />
      </div>
    );
  }

  const answered = selected !== null;

  return (
    <div className="mx-auto max-w-3xl px-2.5 py-2 md:px-8 md:py-6">
      <PageHeader
        title="Luyện nghe (thử nghiệm)"
        subtitle="Bản demo POC -- transcript do Gemini tự soạn, audio do Gemini TTS tạo, không phải trích từ sách nào."
      />

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span className="rounded-full px-2.5 py-1 text-xs font-semibold" style={levelBadgeStyle(question.level)}>
          {question.level}
        </span>
        <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-semibold text-neutral-600">
          {TASK_TYPE_LABELS[question.taskType]}
        </span>
      </div>

      <Card className="mt-4 gap-3 p-5">
        <div className="flex items-center gap-2 text-sm font-semibold text-neutral-700">
          <Headphones size={16} /> {question.scenario}
        </div>
        <audio controls className="w-full" src={assetUrl(question.audioUrl)} />
      </Card>

      <Card className="mt-4 gap-0 p-5">
        <div className="font-semibold text-neutral-800">{question.question}</div>
        <div className="mt-1 text-sm text-neutral-500">{question.questionVi}</div>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {question.options.map((opt, oi) => {
            let cls = "border-neutral-200 hover:bg-neutral-50";
            if (answered) {
              if (oi === question.correctIndex) cls = "border-emerald-300 bg-emerald-50 text-emerald-700";
              else if (oi === selected) cls = "border-rose-300 bg-rose-50 text-rose-700";
              else cls = "border-neutral-200 opacity-50";
            }
            return (
              <button
                key={oi}
                disabled={answered}
                onClick={() => setSelected(oi)}
                className={`rounded-lg border px-3 py-2 text-left text-sm ${cls}`}
              >
                {opt}
                <span className="block text-xs text-neutral-400">{question.optionsVi[oi]}</span>
              </button>
            );
          })}
        </div>

        {answered ? (
          <div className="mt-4 space-y-3 border-t border-neutral-100 pt-3 text-sm">
            <div className={selected === question.correctIndex ? "font-semibold text-emerald-700" : "font-semibold text-rose-700"}>
              {selected === question.correctIndex ? "✓ Đúng" : "✗ Sai"}
            </div>
            <div className="text-neutral-600">{question.explanation}</div>
            <button
              onClick={() => setShowTranscript((v) => !v)}
              className="text-xs font-semibold text-neutral-400 hover:text-neutral-600"
            >
              {showTranscript ? "Ẩn transcript" : "Xem transcript"}
            </button>
            {showTranscript ? (
              <div className="rounded-lg bg-neutral-50 p-3">
                {question.turns.map((t, i) => (
                  <div key={i} className="mb-1">
                    <span className="font-semibold text-neutral-500">{t.speaker}: </span>
                    <span className="text-neutral-700">{t.text}</span>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </Card>

      {answered ? (
        <Button
          className="mt-6 w-full"
          onClick={() => {
            setSelected(null);
            setShowTranscript(false);
          }}
        >
          Làm lại
        </Button>
      ) : null}
    </div>
  );
}
