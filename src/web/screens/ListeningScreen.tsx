import { useState } from "react";
import { Headphones, List as ListIcon, Shuffle } from "lucide-react";
import { ALL_LISTENING, findListeningById, TASK_TYPE_LABELS } from "../../popup/listeningState.ts";
import type { ListeningQuestion, ListeningTaskType } from "../../types/listening.ts";
import { assetUrl } from "../../platform/assetUrl";
import { Card } from "../components/ui/card.tsx";
import { Button } from "../components/ui/button.tsx";
import { PageHeader } from "../components/PageHeader.tsx";
import { levelBadgeStyle } from "../lib/levelColors.tsx";

const TASK_TYPE_ORDER: ListeningTaskType[] = ["kadai", "point", "gaiyou", "sokuji"];

// First real slice of the Listening feature: a flat list + play/answer/reveal
// flow, same shape as QuizBook's simplest mode. No progress tracking or
// filters yet -- those follow once this content shape has settled (still
// missing 課題理解 coverage since this book prints picture-based options for
// that type, which text extraction can't capture).
export function ListeningScreen() {
  const [currentId, setCurrentId] = useState<string | null>(null);
  const current = currentId ? findListeningById(currentId) : undefined;

  if (current) {
    return <QuestionView key={current.id} question={current} onBack={() => setCurrentId(null)} onOpen={setCurrentId} />;
  }
  return <ListView onOpen={setCurrentId} />;
}

function ListView({ onOpen }: { onOpen: (id: string) => void }) {
  return (
    <div className="mx-auto max-w-3xl px-2.5 py-2 md:px-8 md:py-6">
      <PageHeader
        title="Luyện nghe"
        subtitle={`${ALL_LISTENING.length} câu -- transcript/đáp án trích từ sách Nihongo Sou Matome N3 Choukai, audio là bản ghi thật từ CD gốc.`}
      />
      <div className="mt-4 flex flex-col gap-2">
        {ALL_LISTENING.map((q, i) => (
          <button
            key={q.id}
            onClick={() => onOpen(q.id)}
            className="flex items-center gap-3 rounded-xl border border-neutral-200 bg-white px-4 py-3 text-left hover:border-rose-200 hover:bg-rose-50/40"
          >
            <span className="w-6 shrink-0 text-xs font-semibold text-neutral-300">{String(i + 1).padStart(2, "0")}</span>
            <div className="min-w-0 flex-1">
              <div className="truncate font-semibold text-neutral-800">{q.scenario || q.question}</div>
              <div className="truncate text-xs text-neutral-500">{TASK_TYPE_LABELS[q.taskType]}</div>
            </div>
            <span className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold" style={levelBadgeStyle(q.level)}>
              {q.level}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function QuestionView({
  question,
  onBack,
  onOpen,
}: {
  question: ListeningQuestion;
  onBack: () => void;
  onOpen: (id: string) => void;
}) {
  const [selected, setSelected] = useState<number | null>(null);
  const [showTranscript, setShowTranscript] = useState(false);
  const answered = selected !== null;
  const index = ALL_LISTENING.findIndex((q) => q.id === question.id);
  const nextId = ALL_LISTENING[index + 1]?.id;

  return (
    <div className="mx-auto max-w-3xl px-2.5 py-2 md:px-8 md:py-6">
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={onBack} className="flex items-center gap-1 text-sm font-medium text-neutral-500 hover:text-neutral-700">
          <ListIcon size={15} /> Danh sách
        </button>
        <span className="rounded-full px-2.5 py-1 text-xs font-semibold" style={levelBadgeStyle(question.level)}>
          {question.level}
        </span>
        <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-semibold text-neutral-600">
          {TASK_TYPE_LABELS[question.taskType]}
        </span>
      </div>

      <Card className="mt-4 gap-3 p-5">
        <div className="flex items-center gap-2 text-sm font-semibold text-neutral-700">
          <Headphones size={16} /> {question.scenario || question.question}
        </div>
        <audio controls className="w-full" src={assetUrl(question.audioUrl)} />
      </Card>

      <Card className="mt-4 gap-0 p-5">
        <div className="font-semibold text-neutral-800">{question.question}</div>
        {answered ? <div className="mt-1 text-sm text-neutral-500">{question.questionVi}</div> : null}

        {question.optionsImage ? (
          <>
            <img
              src={assetUrl(question.optionsImage)}
              alt="Đáp án minh hoạ"
              className="mt-4 w-full rounded-lg border border-neutral-200"
            />
            <div className="mt-3 grid grid-cols-4 gap-2">
              {Array.from({ length: question.optionCount ?? 4 }, (_, oi) => {
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
                    className={`rounded-lg border py-2 text-center text-sm font-semibold ${cls}`}
                  >
                    {oi + 1}
                  </button>
                );
              })}
            </div>
          </>
        ) : (
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
                  {answered ? <span className="block text-xs text-neutral-400">{question.optionsVi[oi]}</span> : null}
                </button>
              );
            })}
          </div>
        )}

        {answered ? (
          <div className="mt-4 space-y-3 border-t border-neutral-100 pt-3 text-sm">
            <div className={selected === question.correctIndex ? "font-semibold text-emerald-700" : "font-semibold text-rose-700"}>
              {selected === question.correctIndex ? "✓ Đúng" : "✗ Sai"}
            </div>
            {question.explanation ? <div className="text-neutral-600">{question.explanation}</div> : null}
            {question.notes ? <div className="rounded-lg bg-amber-50 p-2 text-xs text-amber-700">{question.notes}</div> : null}
            {question.turns.length > 0 ? (
              <button onClick={() => setShowTranscript((v) => !v)} className="text-xs font-semibold text-neutral-400 hover:text-neutral-600">
                {showTranscript ? "Ẩn transcript" : "Xem transcript"}
              </button>
            ) : null}
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
        <div className="mt-6 flex gap-2">
          <Button
            variant="outline"
            onClick={() => {
              setSelected(null);
              setShowTranscript(false);
            }}
          >
            Làm lại
          </Button>
          {nextId ? (
            <Button className="flex-1" onClick={() => onOpen(nextId)}>
              <Shuffle size={16} /> Câu tiếp theo
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
