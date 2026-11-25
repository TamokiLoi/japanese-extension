import { useState } from "react";
import { Headphones } from "lucide-react";
import type { DeThiExam, DeThiPaper, DeThiQuestion } from "../../types/dethi.ts";
import { ALL_LISTENING } from "../../popup/listeningState.ts";
import { assetUrl } from "../../platform/assetUrl";
import { AudioPlayer } from "./AudioPlayer.tsx";
import { Card } from "./ui/card.tsx";
import { ListeningTranscriptCard } from "./ListeningTranscriptCard.tsx";

// The annual exam IDs differ from the keys used by listeningState.ts. Keep the
// mapping local so the bank can safely enrich its own source questions.
const EXAM_LISTENING_BOOK: Record<string, string> = {
  "cacnam-n3-2021-07": "dethi-n3-2021-07",
  "cacnam-n3-2022-12": "dethi-n3-2022-12",
  "cacnam-n3-2022-07": "dethi-n3-2022-07",
  "cacnam-n3-2021-12": "dethi-n3-2021-12",
  "cacnam-n3-2020-12": "dethi-n3-2020-12",
  "cacnam-n3-2019-12": "dethi-n3-2019-12",
  "cacnam-n3-2019-07": "dethi-n3-2019-07",
  "cacnam-n3-2024-07": "dethi-n3-2024-07",
  "cacnam-n3-2024-12": "dethi-n3-2024-12",
  "cacnam-n3-2023-07": "dethi-n3-2023-07",
  "cacnam-n3-2023-12": "dethi-n3-2023-12",
  "cacnam-n3-2025-07": "dethi-n3-2025-07",
  "cacnam-n3-2025-12": "dethi-2025-12",
  "cacnam-n3-2026-07": "dethi-n3-2026-07",
};

function normalizeChoice(choice: string): string {
  return choice.trim()
    .replace(/^[\s　]*[①②③④⑤⑥⑦⑧⑨⑩]/u, "")
    .normalize("NFKC")
    .replace(/^\s*[1-4][.、)）]\s*/u, "")
    .replace(/[。！？!?….]+$/u, "")
    .replace(/\s+/gu, "");
}

function expectedOptionCount(question: DeThiQuestion): number {
  return question.optionsImage ? question.optionCount ?? 0 : question.options.length;
}

function optionsMatch(question: DeThiQuestion, source: (typeof ALL_LISTENING)[number]): boolean {
  const count = expectedOptionCount(question);
  if (!count || (source.optionCount && source.optionCount !== count)) return false;
  if (question.optionsImage || source.optionsImage) {
    return question.optionsImage === source.optionsImage
      && (source.optionCount ?? 0) === count
      && question.options.length === 0
      && source.options.length === 0;
  }
  return source.options.length === question.options.length
    && source.options.every((option, index) => normalizeChoice(option) === normalizeChoice(question.options[index] ?? ""));
}

function matchedListeningSource(exam: DeThiExam, paper: DeThiPaper, question: DeThiQuestion) {
  const book = exam.listeningBook ?? EXAM_LISTENING_BOOK[exam.id] ?? (exam.id.startsWith("de-n3-") ? exam.id : undefined);
  const candidates = ALL_LISTENING.filter((item) => item.book === book);
  const source = question.listeningQuestionId
    ? ALL_LISTENING.find((item) => item.id === question.listeningQuestionId)
    : candidates[question.number - 1];
  if (!source || source.level !== exam.level || source.correctIndex !== question.correctIndex || !optionsMatch(question, source)) return null;

  const start = source.audioStartSec ?? question.audioStartSec;
  const end = source.audioEndSec ?? question.audioEndSec;
  // A paper-wide recording is only safe for a per-question bank when both
  // boundaries are known. A distinct source URL is a standalone clip.
  const isStandaloneClip = source.audioUrl !== paper.audioUrl;
  const hasSegment = Number.isFinite(start) && Number.isFinite(end) && start! >= 0 && end! > start!;
  if (!source.audioUrl || (!hasSegment && !isStandaloneClip)) return null;
  return { source, start: hasSegment ? start : undefined, end: hasSegment ? end : undefined };
}

/** Returns an answerable N3 listening question with safely matched audio metadata. */
export function prepareListeningBankQuestion(
  exam: DeThiExam,
  paper: DeThiPaper,
  question: DeThiQuestion,
): DeThiQuestion | null {
  if (exam.level !== "N3" || paper.id !== "choukai") return null;
  const count = expectedOptionCount(question);
  if (!Number.isInteger(question.correctIndex) || question.correctIndex === null || question.correctIndex < 0 || question.correctIndex >= count) return null;
  const matched = matchedListeningSource(exam, paper, question);
  if (!matched) return null;

  const { source, start, end } = matched;
  const turns = source.turns.map((turn) => ({ ...turn }));
  const transcript = turns.map((turn) => turn.speaker ? `${turn.speaker}：${turn.text}` : turn.text).join("\n");
  const transcriptVi = turns.map((turn) => turn.textVi?.trim() ? (turn.speaker ? `${turn.speaker}：${turn.textVi}` : turn.textVi) : "").filter(Boolean).join("\n");
  return {
    ...question,
    listeningQuestionId: source.id,
    listeningAudioUrl: source.audioUrl,
    audioStartSec: start,
    audioEndSec: end,
    listeningPrompt: source.scenario.trim() || question.listeningPrompt,
    listeningPromptVi: source.scenario.trim() ? source.scenarioVi : question.listeningPromptVi,
    listeningPromptFurigana: source.scenarioFurigana,
    questionVi: source.questionVi?.trim() ? source.questionVi : question.questionVi,
    optionsVi: source.optionsVi.length === question.options.length
      && source.optionsVi.some((translation) => translation.trim())
      ? source.optionsVi
      : question.optionsVi,
    transcriptTurns: turns.length ? turns : question.transcriptTurns,
    transcript: transcript || question.transcript,
    transcriptVi: transcriptVi || question.transcriptVi,
    explanation: source.explanation || question.explanation,
    optionExplanations: source.optionExplanations?.length === count ? source.optionExplanations : question.optionExplanations,
  };
}

/** Per-question listening audio, bounded to its clip/segment, with prompt image. */
export function JlptBankListeningAudio({ question, paper }: { question: DeThiQuestion; paper: DeThiPaper }) {
  const src = question.listeningAudioUrl ?? paper.audioUrl;
  if (!src) return null;
  return (
    <div className="mt-3 flex flex-col gap-3">
      {question.questionImage ? (
        <img src={assetUrl(question.questionImage)} alt="Hình tình huống của câu nghe" className="w-full rounded-lg border border-neutral-200" />
      ) : null}
      {question.optionsImage && question.optionsImage !== question.questionImage ? (
        <img src={assetUrl(question.optionsImage)} alt="Hình các lựa chọn của câu nghe" className="w-full rounded-lg border border-neutral-200" />
      ) : null}
      {question.listeningPrompt ? (
        <Card className="gap-0 rounded-2xl border-neutral-200 p-4 ring-0">
          <div className="flex items-start gap-2 text-sm font-semibold text-neutral-700">
            <Headphones size={17} className="mt-0.5 shrink-0 text-neutral-400" />
            <div>
              {question.listeningPrompt}
              {question.listeningPromptVi ? <div className="mt-1 font-normal text-neutral-500">{question.listeningPromptVi}</div> : null}
            </div>
          </div>
        </Card>
      ) : null}
      <Card className="rounded-2xl border-neutral-200 p-4 ring-0">
        <AudioPlayer
          src={assetUrl(src)}
          startAtSeconds={question.audioStartSec}
          endAtSeconds={question.audioEndSec}
        />
      </Card>
    </div>
  );
}

/** Transcript and translation are shown only after the learner answers. */
export function JlptBankListeningReview({ question }: { question: DeThiQuestion }) {
  const [showTranslation, setShowTranslation] = useState(false);
  const [showFurigana, setShowFurigana] = useState(false);
  const turns = question.transcriptTurns?.length
    ? question.transcriptTurns
    : question.transcript?.trim()
      ? [{ speaker: "", text: question.transcript, ...(question.transcriptVi ? { textVi: question.transcriptVi } : {}) }]
      : [];
  if (!turns.length) return null;
  return (
    <ListeningTranscriptCard
      turns={turns}
      showFurigana={showFurigana}
      onToggleFurigana={() => setShowFurigana((visible) => !visible)}
      showTranslation={showTranslation}
      onToggleTranslation={() => setShowTranslation((visible) => !visible)}
      className="mt-3"
    />
  );
}
