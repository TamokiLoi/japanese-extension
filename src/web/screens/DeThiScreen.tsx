import { useEffect, useMemo, useRef, useState } from "react";
import { Clock, FileText, BookOpenText, PenSquare, Headphones, ChevronLeft, ChevronRight, Check, Flag, RotateCcw, History, Play, Trophy, ArrowUpDown, Languages, Library } from "lucide-react";
import type { DeThiExam, DeThiPaper, DeThiQuestion } from "../../types/dethi.ts";
import type { JlptLevel } from "../../types/kanji.ts";
import {
  ALL_EXAMS,
  SOURCE_LABELS,
  AVAILABLE_LEVELS,
  getAvailableSources,
  findExamById,
  findPaper,
  loadDeThiSession,
  saveDeThiSession,
  clearDeThiSession,
  startPaperAttempt,
  submitPaper,
  getExamSummary,
  summarizeExam,
  loadDeThiHistory,
  clearHistoryForPaper,
  loadHistoryForPaper,
  type DeThiSession,
  type DeThiHistoryEntry,
  type DeThiPaperSummary,
} from "../../popup/dethiState.ts";
import { ALL_LISTENING } from "../../popup/listeningState.ts";
import { Card } from "../components/ui/card.tsx";
import { Button } from "../components/ui/button.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select.tsx";
import { PageHeader } from "../components/PageHeader.tsx";
import { levelBadgeStyle } from "../lib/levelColors.tsx";
import { QuestionPalette, type PaletteStatus } from "../components/QuestionPalette.tsx";
import { useConfirm } from "../components/ConfirmDialog.tsx";
import { AudioPlayer } from "../components/AudioPlayer.tsx";
import { FuriganaText } from "../components/FuriganaText.tsx";
import { ListeningTranscriptCard } from "../components/ListeningTranscriptCard.tsx";
import { assetUrl } from "../../platform/assetUrl";
import { useFloatingNav } from "../WebAppShell.tsx";
import { LoadingScreen } from "../components/LoadingScreen.tsx";
import { useSwipeNavigation } from "../lib/useSwipeNavigation.ts";
import { useCountdown } from "../lib/useCountdown.ts";
import { readingPassageUnderlineRange, readingPassageUnderlineRanges, readingQuestionUnderline } from "../../lib/jlptReadingAnnotations.ts";
import { splitBodyIntoSentences, translatedReadingUnits } from "../../lib/readingSentences.ts";
import { stableHash } from "../../lib/jlptReading.ts";
import { splitPassageParagraphs } from "../../lib/passageParagraphs.ts";
import { findMarkdownPipeTables } from "../../lib/markdownpipetable.ts";
import { MarkdownTableText } from "../../components/markdowntabletext.tsx";
import { getJlptListeningMondaiLabel, getJlptPointQuestionPrompt } from "../../lib/listeningMondai.ts";
import type { Screen } from "../../popup/screens.ts";

type Step =
  | { name: "examList" }
  | { name: "examDetail"; examId: string }
  | { name: "taking"; session: DeThiSession }
  // "answers" instead of the full DeThiSession -- this same step now serves
  // two entry points: just-finished (session.answers, already in memory)
  // and reopened from Lịch sử (a past DeThiHistoryEntry.answers, loaded from
  // storage) -- neither needs the rest of DeThiSession (deadlineAt etc).
  // backTo picks where the top-left back arrow and "về..." button return to.
  | { name: "result"; entry: DeThiHistoryEntry; answers: (number | null)[]; backTo: "examDetail" | "history"; practiceMode?: boolean; reviewIndex?: number | null }
  | { name: "history"; examId: string; paperId: string };

const REVIEW_RETURN_TARGET = "__dethi-review-return__";
const REVIEW_RETURN_STORAGE_KEY = "jlpt-dethi-review-return";

// The vocabulary-usage question is 問題4 in N1, but 問題5 in N3. N3 問題4 is
// a synonym question, so also check the printed usage-question prompt before
// applying option underlines. Inflected variants can be supplied by the data.
function usageWordInOption(question: string, forms: string[] | undefined, opt: string): string | undefined {
  // Prefer the longest declared source span when two exact variants share a prefix.
  return forms?.filter((f) => opt.includes(f)).sort((a, b) => b.length - a.length)[0]
    ?? (opt.includes(question) ? question : undefined);
}

function optionUnderline(group: string, question: string, forms: string[] | undefined, opt: string): string | undefined {
  if (group !== "問題4" && group !== "問題5") return undefined;
  // Converted sets can store the target word alone (without the generic prompt).
  // An explicitly empty list means this option must remain unmarked, as with N3
  // 問題4 synonym questions. Only use prompt-based fallback for legacy records.
  if (forms?.length) return usageWordInOption(question, forms, opt);
  if (forms) return undefined;
  const isUsageQuestion = /次の(?:言葉|語)の(?:使い方|用法)として/u.test(question);
  return isUsageQuestion ? usageWordInOption(question, forms, opt) : undefined;
}

// Dialogue items sometimes have the next speaker attached directly after the
// previous closing quote. Insert a real line break at that boundary so turns
// remain readable even when source conversion omitted one. This is independent
// of ★: several older ordering prompts are missing the marker in source data.
const ORDERING_SPEAKER_LABEL = String.raw`(?:[一-龯々〆ヶヵぁ-んァ-ン]{1,8}(?:さん|くん|ちゃん|先生|氏)?|[A-ZＡ-Ｚ]|男性|女性|男|女|店員|客|母|父|兄|姉)`;

function formatExamQuestion(text: string, problemGroup: string): string {
  const isOrderingGroup = ["問題2", "問題6", "問題Ⅱ"].includes(problemGroup);
  if (!isOrderingGroup) return text;
  return text.replace(new RegExp(`」[\\t 　]*(${ORDERING_SPEAKER_LABEL}「)`, "gu"), "」\n$1");
}

function reconstructOrderingQuestion(question: DeThiQuestion): { sentence: string; order: number[] } | null {
  const correctIndex = question.correctIndex;
  if (correctIndex === null) return null;
  const order = question.orderingOrder;
  if (!order || order.length !== 4 || question.options.length !== 4 || new Set(order).size !== 4 || order.some((index) => index < 0 || index >= 4)) {
    return null;
  }

  const slotPattern = /(?:[（(][ \t　]*(?:★[ \t　]*)?[）)]|[＿_]{2,}|★)/gu;
  const slots = [...question.question.matchAll(slotPattern)];
  const starredSlots = slots.filter((slot) => slot[0].includes("★"));
  if (slots.length === 4 && starredSlots.length === 1) {
    const starSlot = slots.indexOf(starredSlots[0]);
    if (order[starSlot] !== correctIndex) return null;
    let slotIndex = 0;
    const sentence = question.question.replace(slotPattern, () => {
      const optionIndex = order[slotIndex];
      return `${slotIndex++ === starSlot ? "★" : ""}${question.options[optionIndex]}`;
    });
    return { sentence, order };
  }

  if (slots.length === 1 && slots[0][0] === "★") {
    const sentence = question.question.replace("★", order.map((optionIndex) => `${optionIndex === correctIndex ? "★" : ""}${question.options[optionIndex]}`).join(""));
    return { sentence, order };
  }

  if (slots.length > 1 && starredSlots.length === 1 && slots.every((slot, index) =>
    index === 0 || /^\s*$/u.test(question.question.slice(slots[index - 1].index + slots[index - 1][0].length, slot.index))
  )) {
    const firstSlot = slots[0];
    const lastSlot = slots.at(-1)!;
    const orderedFragments = order.map((optionIndex) => `${optionIndex === correctIndex ? "★" : ""}${question.options[optionIndex]}`).join("");
    const sentence = question.question.slice(0, firstSlot.index)
      + orderedFragments
      + question.question.slice(lastSlot.index + lastSlot[0].length);
    return { sentence, order };
  }
  return null;
}

function formatQuestionTranslation(question: string, translation: string): string {
  const sourceLines = question.split(/\r?\n/u);
  if (sourceLines.length < 2 || /[\r\n]/u.test(translation)) return translation;

  const insertions = new Set<number>();
  const firstLineIsContext = /^\s*[（(].*[）)]\s*$/u.test(sourceLines[0]);
  const translatedContext = /^\s*(?:\([^)]*\)|（[^）]*）)[ \t]*/u.exec(translation);
  if (firstLineIsContext && translatedContext && translatedContext[0].length < translation.length) {
    insertions.add(translatedContext[0].length);
  }

  const sourceTurnCounts = sourceLines.map((line) => (line.match(/「/gu) ?? []).length);
  const sourceTurnCount = sourceTurnCounts.reduce((total, count) => total + count, 0);
  const translatedTurns = [...translation.matchAll(/[^「」]*「[^「」]*」/gu)];
  const sourceQuoteCount = (question.match(/」/gu) ?? []).length;
  const translatedQuoteCount = (translation.match(/「/gu) ?? []).length;
  if (sourceTurnCount === 0 || sourceTurnCount !== sourceQuoteCount || sourceTurnCount !== translatedQuoteCount || sourceTurnCount !== translatedTurns.length) {
    return addQuestionTranslationLineBreaks(translation, insertions);
  }

  let turnsBeforeLineBreak = 0;
  for (let lineIndex = 0; lineIndex < sourceLines.length - 1; lineIndex++) {
    turnsBeforeLineBreak += sourceTurnCounts[lineIndex];
    if (turnsBeforeLineBreak <= 0 || turnsBeforeLineBreak >= sourceTurnCount) continue;
    const previousTurn = translatedTurns[turnsBeforeLineBreak - 1];
    insertions.add((previousTurn.index ?? 0) + previousTurn[0].length);
  }

  return addQuestionTranslationLineBreaks(translation, insertions);
}

function addQuestionTranslationLineBreaks(translation: string, insertions: Set<number>): string {
  let formatted = translation;
  for (const position of [...insertions].sort((left, right) => right - left)) {
    const before = formatted.slice(0, position).replace(/[ \t]+$/u, "");
    const after = formatted.slice(position).replace(/^[ \t]+/u, "");
    formatted = `${before}\n${after}`;
  }
  return formatted;
}

function formatExamFurigana(
  segments: ({ text: string; furigana: string | null } | null)[] | undefined,
  problemGroup: string,
): { text: string; furigana: string | null }[] | undefined {
  if (!segments) return undefined;
  const isOrderingGroup = ["問題2", "問題6", "問題Ⅱ"].includes(problemGroup);
  let previousText = "";
  return segments.flatMap((segment) => {
    if (!segment) return [];
    let text = segment.text;
    if (isOrderingGroup) {
      text = text.replace(new RegExp(`」[\\t 　]*(${ORDERING_SPEAKER_LABEL}「)`, "gu"), "」\n$1");
      if (/」[\\t 　]*$/.test(previousText) && new RegExp(`^${ORDERING_SPEAKER_LABEL}「`, "u").test(text)) {
        text = `\n${text}`;
      }
    }
    previousText += segment.text;
    return [{ ...segment, text }];
  });
}

// Some converted reading questions share one passage and store a shorthand
// instead of repeating it. Resolve that shorthand in both taking and review;
// otherwise later questions show only "（上記と同じ）" and are not answerable.
const SAME_PASSAGE_MARKERS = new Set(["（上記と同じ）", "（同上）"]);

function isSamePassageMarker(passage: string | null | undefined): boolean {
  return !!passage && SAME_PASSAGE_MARKERS.has(passage);
}

function passageForQuestion(paper: DeThiPaper, index: number): string | null {
  const current = paper.questions[index];
  if (!current?.passage) return null;
  if (!isSamePassageMarker(current.passage)) return current.passage;
  for (let i = index - 1; i >= 0; i--) {
    const earlier = paper.questions[i];
    if (earlier.problemGroup !== current.problemGroup) break;
    if (earlier.passage && !isSamePassageMarker(earlier.passage)) return earlier.passage;
  }
  return current.passage;
}

function questionDisplayGroup(paper: DeThiPaper, index: number): { start: number; end: number; passage: string | null } {
  const question = paper.questions[index];
  const passage = passageForQuestion(paper, index);
  if (!question || !passage || isSamePassageMarker(passage)) return { start: index, end: index + 1, passage: null };
  let start = index;
  let end = index + 1;
  while (start > 0 && paper.questions[start - 1].problemGroup === question.problemGroup && passageForQuestion(paper, start - 1) === passage) start--;
  while (end < paper.questions.length && paper.questions[end].problemGroup === question.problemGroup && passageForQuestion(paper, end) === passage) end++;
  return { start, end, passage };
}

function passageTranslationForQuestion(paper: DeThiPaper, index: number): string | null {
  const current = paper.questions[index];
  const passage = passageForQuestion(paper, index);
  if (!current || !passage || isSamePassageMarker(passage)) return null;
  const presentation = currentReadingPresentationForQuestion(paper, index);
  if (presentation?.translationVi?.trim()) return presentation.translationVi;

  for (let i = 0; i < paper.questions.length; i++) {
    const candidate = paper.questions[i];
    if (candidate.problemGroup !== current.problemGroup) continue;
    if (passageForQuestion(paper, i) !== passage) continue;
    const translation = candidate.passageVi;
    if (translation) return translation;
  }
  return null;
}

function passageSentenceTranslationsForQuestion(paper: DeThiPaper, index: number): string[] | null {
  const current = paper.questions[index];
  const passage = passageForQuestion(paper, index);
  if (!current || !passage || isSamePassageMarker(passage)) return null;
  const presentation = currentReadingPresentationForQuestion(paper, index);
  if (presentation) return presentation.sentencesVi?.length ? presentation.sentencesVi : null;
  let hasStalePresentation = false;
  for (let i = 0; i < paper.questions.length; i++) {
    const candidate = paper.questions[i];
    if (candidate.problemGroup !== current.problemGroup || passageForQuestion(paper, i) !== passage) continue;
    if (candidate.readingPresentation) hasStalePresentation = true;
  }
  if (hasStalePresentation) return null;
  for (let i = 0; i < paper.questions.length; i++) {
    const candidate = paper.questions[i];
    if (candidate.problemGroup === current.problemGroup && passageForQuestion(paper, i) === passage && candidate.passageSentencesVi?.length) {
      return candidate.passageSentencesVi;
    }
  }
  return null;
}

function currentReadingPresentationForQuestion(paper: DeThiPaper, index: number): DeThiQuestion["readingPresentation"] | null {
  const current = paper.questions[index];
  const passage = passageForQuestion(paper, index);
  if (!current || !passage || isSamePassageMarker(passage)) return null;
  const furigana = passageFuriganaForQuestion(paper, index);
  const body = furigana?.map((segment) => segment.text).join("") === passage
    ? furigana!
    : [{ text: passage, furigana: null }];
  const bodySignature = stableHash(JSON.stringify(body));
  for (let i = 0; i < paper.questions.length; i++) {
    const candidate = paper.questions[i];
    if (candidate.problemGroup !== current.problemGroup || passageForQuestion(paper, i) !== passage) continue;
    if (candidate.readingPresentation?.bodySignature === bodySignature && candidate.readingPresentation.sentencesVi?.length) {
      return candidate.readingPresentation;
    }
  }
  return null;
}

function passageFuriganaForQuestion(paper: DeThiPaper, index: number) {
  const current = paper.questions[index];
  const passage = passageForQuestion(paper, index);
  if (!current || !passage || isSamePassageMarker(passage)) return null;
  for (let i = 0; i < paper.questions.length; i++) {
    const candidate = paper.questions[i];
    if (candidate.problemGroup === current.problemGroup && passageForQuestion(paper, i) === passage && candidate.passageFurigana?.length) {
      return candidate.passageFurigana;
    }
  }
  return null;
}

function questionTranslationForQuestion(paper: DeThiPaper, index: number): string | null {
  const question = paper.questions[index];
  if (!question?.questionVi) return null;
  const formattedQuestion = formatExamQuestion(question.question, question.problemGroup);
  return formatQuestionTranslation(formattedQuestion, question.questionVi);
}

const LISTENING_REVIEW_BOOK_BY_EXAM: Record<string, string> = {
  "cacnam-n3-2024-07": "dethi-n3-2024-07",
  "cacnam-n3-2024-12": "dethi-n3-2024-12",
  "cacnam-n3-2025-07": "dethi-n3-2025-07",
  "cacnam-n3-2025-12": "dethi-2025-12",
  "cacnam-n1-2026-07": "dethi-n1-2026-07",
  "cacnam-n3-2026-07": "dethi-n3-2026-07",
};

function listeningFuriganaSegments(
  text: string,
  annotations: { word: string; reading: string }[] | undefined,
): { text: string; furigana: string | null }[] | undefined {
  if (!annotations?.length || !text) return undefined;
  const segments: { text: string; furigana: string | null }[] = [];
  let cursor = 0;
  for (const annotation of annotations) {
    const index = text.indexOf(annotation.word, cursor);
    if (index < cursor || index < 0) return undefined;
    if (index > cursor) segments.push({ text: text.slice(cursor, index), furigana: null });
    segments.push({ text: annotation.word, furigana: annotation.reading });
    cursor = index + annotation.word.length;
  }
  if (cursor < text.length) segments.push({ text: text.slice(cursor), furigana: null });
  return segments;
}

function withListeningContent(examId: string, paperId: string, question: DeThiQuestion): DeThiQuestion {
  const book = LISTENING_REVIEW_BOOK_BY_EXAM[examId];
  if (paperId !== "choukai" || !book) return question;

  // Some converted JLPT datasets use Mondai-local IDs after the first two
  // groups (for example `m3-1` instead of `q13`). The exam paper numbers are
  // continuous, so align by source order rather than assuming every ID ends
  // in a global question number.
  const bookQuestions = ALL_LISTENING.filter((item) => item.book === book);
  const source = bookQuestions[question.number - 1];
  if (!source) return question;

  const expectedOptionCount = question.optionsImage ? question.optionCount ?? 0 : question.options.length;
  if (source.correctIndex !== question.correctIndex || source.optionCount && source.optionCount !== expectedOptionCount) return question;
  const normalizeChoice = (choice: string) => choice.trim()
    .replace(/^[\s　]*[①②③④⑤⑥⑦⑧⑨⑩]/u, "")
    .replace(/[。！？!?…]+$/u, "");
  const imageOptionsMatch = !question.optionsImage && !source.optionsImage
    || question.optionsImage === source.optionsImage && (source.optionCount ?? 0) === expectedOptionCount;
  const optionsMatch = imageOptionsMatch && source.options.length === question.options.length && source.options.every(
    (option, index) => normalizeChoice(option) === normalizeChoice(question.options[index] ?? ""),
  );

  const transcriptTurns = source.turns.map((turn) => ({ ...turn }));
  const transcript = transcriptTurns.map((turn) => `${turn.speaker}：${turn.text}`).join("\n");
  const transcriptVi = transcriptTurns.map((turn) => turn.textVi ? `${turn.speaker}：${turn.textVi}` : "").filter(Boolean).join("\n");
  const pointQuestionPrompt = getJlptPointQuestionPrompt(source);
  const hasQuestionSentence = source.question.trim() && !/^\d+番$/u.test(source.question.trim());
  const listeningPrompt = source.scenario.trim();
  const enrichedQuestion = pointQuestionPrompt
    ? `${source.question.trim()}\n${pointQuestionPrompt.text}`
    : source.question.trim()
      ? hasQuestionSentence ? source.question.trim() : question.question
      : source.taskType === "sokuji" ? "" : question.question;
  const spokenQuestionVi = pointQuestionPrompt
    ? source.questionPromptVi || (/^\d+番$/u.test(source.question.trim()) ? source.turns.at(-1)?.textVi : undefined)
    : undefined;
  const questionFurigana = listeningFuriganaSegments(enrichedQuestion, pointQuestionPrompt?.furigana ?? source.questionFurigana);
  const hasOptionFurigana = source.optionFurigana?.some((annotations) => annotations.length);
  const optionsFurigana = optionsMatch && hasOptionFurigana
    ? source.options.map((option, index) => listeningFuriganaSegments(option, source.optionFurigana?.[index]))
    : undefined;

  return {
    ...question,
    question: enrichedQuestion,
    questionVi: spokenQuestionVi || source.questionVi || question.questionVi,
    questionFurigana: questionFurigana ?? question.questionFurigana,
    optionsVi: optionsMatch && source.optionsVi.length === question.options.length ? source.optionsVi : question.optionsVi,
    optionsFurigana: optionsMatch && optionsFurigana?.every((segments) => !!segments)
      ? optionsFurigana as NonNullable<DeThiQuestion["optionsFurigana"]>
      : question.optionsFurigana,
    explanation: source.explanation || question.explanation,
    optionExplanations: optionsMatch && source.optionExplanations?.length === expectedOptionCount
      ? source.optionExplanations
      : question.optionExplanations,
    listeningAudioUrl: source.audioUrl,
    audioStartSec: source.audioStartSec ?? question.audioStartSec,
    audioEndSec: source.audioEndSec ?? question.audioEndSec,
    listeningPrompt: listeningPrompt || question.listeningPrompt,
    listeningPromptVi: listeningPrompt ? source.scenarioVi : question.listeningPromptVi,
    listeningPromptFurigana: source.scenarioFurigana,
    transcriptTurns: transcriptTurns.length ? transcriptTurns : question.transcriptTurns,
    transcript: transcript || question.transcript,
    transcriptVi: transcriptVi || question.transcriptVi,
    answerSourceNote: source.notes || question.answerSourceNote,
  };
}

function PassageText({ text, questionNumber }: { text: string; questionNumber: number }) {
  const marker = new RegExp(`([（(]\\s*${questionNumber}\\s*[）)])`, "gu");
  return text.split(marker).map((part, index) =>
    index % 2 === 1 ? (
      <strong key={index} className="rounded bg-rose-100 px-1 font-extrabold text-rose-700">{part}</strong>
    ) : part,
  );
}

function sliceFuriganaForText(
  source: string,
  segments: { text: string; furigana: string | null }[] | null,
  text: string,
  searchFrom = 0,
): { text: string; furigana: string | null }[] | null {
  if (!segments?.length || !text) return null;
  const start = source.indexOf(text, searchFrom);
  if (start < 0) return null;
  const end = start + text.length;
  let offset = 0;
  const sliced: { text: string; furigana: string | null }[] = [];
  for (const segment of segments) {
    const segmentStart = offset;
    const segmentEnd = offset + segment.text.length;
    offset = segmentEnd;
    const overlapStart = Math.max(start, segmentStart);
    const overlapEnd = Math.min(end, segmentEnd);
    if (overlapStart >= overlapEnd) continue;
    sliced.push({
      text: segment.text.slice(overlapStart - segmentStart, overlapEnd - segmentStart),
      furigana: overlapStart === segmentStart && overlapEnd === segmentEnd ? segment.furigana : null,
    });
  }
  return sliced.map((segment) => segment.text).join("") === text ? sliced : null;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function examGrammarChunks(pattern: string): string[] {
  return pattern.replace(/（[^）]*）/gu, "").split("〜").map((part) => part.trim()).filter((part) => part.length >= 3);
}

function PassageTextWithReferences({
  text,
  questionNumber,
  referenceTerms,
  highlightReferences,
  furigana,
  showFurigana,
  underlineRange,
  underlineRanges,
}: {
  text: string;
  questionNumber: number;
  referenceTerms: string[];
  highlightReferences: boolean;
  furigana?: { text: string; furigana: string | null }[] | null;
  showFurigana?: boolean;
  underlineRange?: { start: number; end: number };
  underlineRanges?: { start: number; end: number }[];
}) {
  const terms = highlightReferences
    ? [...new Set(referenceTerms.filter((term) => term.length >= 2))].sort((a, b) => b.length - a.length)
    : [];
  const pattern = terms.length > 0 ? new RegExp(`(${terms.map(escapeRegExp).join("|")})`, "gu") : null;
  const paragraphRanges = splitPassageParagraphs(text);

  const renderHighlightedText = (value: string, sourceOffset: number) => {
    const referenceRanges: { start: number; end: number }[] = [];
    if (pattern) {
      for (const match of value.matchAll(pattern)) {
        const start = match.index ?? 0;
        referenceRanges.push({ start, end: start + match[0].length });
      }
    }
    const localUnderlineRange = (underlineRanges ?? (underlineRange ? [underlineRange] : [])).map((range) => ({
      start: Math.max(0, range.start - sourceOffset),
      end: Math.min(value.length, range.end - sourceOffset),
    })).filter((range) => range.start < range.end);
    if (!referenceRanges.length && !localUnderlineRange.length) return <PassageText text={value} questionNumber={questionNumber} />;
    const boundaries = new Set([0, value.length]);
    for (const range of [...referenceRanges, ...localUnderlineRange]) {
      boundaries.add(range.start);
      boundaries.add(range.end);
    }
    const points = [...boundaries].sort((left, right) => left - right);
    return points.slice(0, -1).map((start, index) => {
      const end = points[index + 1];
      const part = value.slice(start, end);
      const isReference = referenceRanges.some((range) => start >= range.start && end <= range.end);
      const isUnderlined = localUnderlineRange.some((range) => start >= range.start && end <= range.end);
      const content = <PassageText text={part} questionNumber={questionNumber} />;
      return isReference || isUnderlined ? (
        <strong key={index} className={isReference
          ? "font-extrabold text-rose-700 underline decoration-rose-200 decoration-2 underline-offset-2"
          : "font-bold underline decoration-2 underline-offset-2"}>{content}</strong>
      ) : <span key={index}>{content}</span>;
    });
  };

  const furiganaMatchesText = furigana?.map((segment) => segment.text).join("") === text;
  const renderFuriganaRange = (start: number, end: number) => {
    if (!showFurigana || !furiganaMatchesText || !furigana?.length) return renderHighlightedText(text.slice(start, end), start);
    let offset = 0;
    const rendered: React.ReactNode[] = [];
    for (const [index, segment] of furigana.entries()) {
      const segmentStart = offset;
      const segmentEnd = offset + segment.text.length;
      offset = segmentEnd;
      const overlapStart = Math.max(start, segmentStart);
      const overlapEnd = Math.min(end, segmentEnd);
      if (overlapStart >= overlapEnd) continue;
      const segmentText = segment.text.slice(overlapStart - segmentStart, overlapEnd - segmentStart);
      // Annotation segments are word-sized; if a review slice ever cuts one,
      // keep the text rather than applying a reading to a partial word.
      const reading = overlapStart === segmentStart && overlapEnd === segmentEnd ? segment.furigana : null;
      const content = renderHighlightedText(segmentText, overlapStart);
      rendered.push(reading ? (
        <ruby key={index}>{content}<rt className="text-[10px] text-neutral-400">{reading}</rt></ruby>
      ) : <span key={index}>{content}</span>);
    }
    return rendered;
  };

  const markdownTables = findMarkdownPipeTables(text);
  if (markdownTables.length > 0) {
    const blocks: React.ReactNode[] = [];
    let cursor = 0;
    const addProse = (end: number, key: string) => {
      let start = cursor;
      while (start < end && /\s/u.test(text[start])) start++;
      while (end > start && /\s/u.test(text[end - 1])) end--;
      if (start < end) blocks.push(<p key={key} className="whitespace-pre-line">{renderFuriganaRange(start, end)}</p>);
    };
    const renderTableCell = (start: number, end: number) => {
      const cellText = text.slice(start, end);
      let offset = 0;
      return cellText.split(/(<br\s*\/?>)/giu).map((part, index) => {
        const partStart = offset;
        offset += part.length;
        return /^<br\s*\/?>$/iu.test(part)
          ? <br key={index} />
          : <span key={index}>{renderFuriganaRange(start + partStart, start + offset)}</span>;
      });
    };
    markdownTables.forEach((table, tableIndex) => {
      addProse(table.start, `before-${tableIndex}`);
      const columnCount = table.header?.length ?? Math.max(...table.rows.map((row) => row.reduce((count, cell) => count + (cell.colSpan ?? 1), 0)));
      blocks.push(
        <div key={`table-${tableIndex}`} className="reading-markdown-table-scroll">
          <table className="reading-markdown-table" style={{ minWidth: `${Math.max(620, columnCount * 140)}px` }}>
            {table.header ? <thead><tr>{table.header.map((cell, cellIndex) => (
              <th key={cellIndex} colSpan={cell.colSpan ?? 1} scope="col">{renderTableCell(cell.start, cell.end)}</th>
            ))}</tr></thead> : null}
            <tbody>{table.rows.map((row, rowIndex) => (
              <tr key={rowIndex}>{row.map((cell, cellIndex) => (
                <td key={cellIndex} colSpan={cell.colSpan ?? 1}>{renderTableCell(cell.start, cell.end)}</td>
              ))}</tr>
            ))}</tbody>
          </table>
        </div>,
      );
      cursor = table.end;
    });
    addProse(text.length, "after-table");
    return <div className="space-y-4">{blocks}</div>;
  }

  return <div className="space-y-4">{paragraphRanges.map((paragraph, index) => (
    <p key={index} className="whitespace-pre-line">{renderFuriganaRange(paragraph.start, paragraph.end)}</p>
  ))}</div>;
}

function splitTextIntoSentenceUnits(text: string, japanese: boolean): string[] {
  const units: string[] = [];
  let buffer = "";
  const endings = japanese ? new Set(["。", "！", "？"]) : new Set([".", "!", "?"]);
  const closing = new Set(["」", "』", "）", ")", "\"", "’", "”"]);
  const push = () => {
    const value = buffer.trim();
    if (value) units.push(value);
    buffer = "";
  };

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === "\n") {
      push();
      continue;
    }
    buffer += char;
    if (endings.has(char)) {
      while (i + 1 < text.length && closing.has(text[i + 1])) buffer += text[++i];
      push();
    }
  }
  push();
  return units;
}

function translatedPassageUnits(
  passage: string,
  translation: string,
  explicitSentences?: string[],
  furigana?: { text: string; furigana: string | null }[] | null,
): { japanese: string; vietnamese: string; furigana?: { text: string; furigana: string | null }[] }[] {
  const body = furigana?.map((segment) => segment.text).join("") === passage
    ? furigana!
    : [{ text: passage, furigana: null }];
  const sentenceGroups = splitBodyIntoSentences(body);
  if (explicitSentences?.length === sentenceGroups.length) {
    return translatedReadingUnits(body, explicitSentences).map(({ segments, translation }) => ({
      japanese: segments.map((segment) => segment.text).join(""),
      vietnamese: translation,
      furigana: segments,
    }));
  }
  const japaneseUnits = splitTextIntoSentenceUnits(passage, true);
  if (explicitSentences?.length === japaneseUnits.length) {
    return japaneseUnits.map((japanese, index) => ({ japanese, vietnamese: explicitSentences[index] }));
  }

  const japaneseParagraphs = passage.split(/\n\s*\n/u).map((part) => part.trim()).filter(Boolean);
  const vietnameseParagraphs = translation.split(/\n\s*\n/u).map((part) => part.trim()).filter(Boolean);
  if (japaneseParagraphs.length === vietnameseParagraphs.length && japaneseParagraphs.length > 0) {
    return japaneseParagraphs.flatMap((japaneseParagraph, paragraphIndex) => {
      const japaneseParts = splitTextIntoSentenceUnits(japaneseParagraph, true);
      const vietnameseParts = splitTextIntoSentenceUnits(vietnameseParagraphs[paragraphIndex], false);
      if (japaneseParts.length === vietnameseParts.length) {
        return japaneseParts.map((japanese, sentenceIndex) => ({ japanese, vietnamese: vietnameseParts[sentenceIndex] }));
      }
      return [{ japanese: japaneseParagraph, vietnamese: vietnameseParagraphs[paragraphIndex] }];
    });
  }

  const vietnameseUnits = splitTextIntoSentenceUnits(translation, false);
  if (japaneseUnits.length === vietnameseUnits.length && japaneseUnits.length > 1) {
    return japaneseUnits.map((japanese, index) => ({ japanese, vietnamese: vietnameseUnits[index] }));
  }
  return [{ japanese: passage, vietnamese: translation }];
}

// `furigana`/`showFurigana` are optional -- when a segment list is present
// (see DeThiQuestion.questionFurigana) AND the review screen's furigana
// toggle is on, renders each segment as <ruby> instead of the plain-text
// underline path below. A segment's `text` is expected to exactly match
// `underline` when both are set (see the field's doc comment in
// types/dethi.ts) so the tested word still gets bolded+underlined on top of
// its ruby reading.
function QuestionText({
  text,
  underline,
  furigana,
  showFurigana,
  keepUnderlineTogether,
}: {
  text: string;
  underline?: string;
  furigana?: { text: string; furigana: string | null }[];
  showFurigana?: boolean;
  keepUnderlineTogether?: boolean;
}) {
  const underlineClass = `font-bold underline decoration-2 underline-offset-2${keepUnderlineTogether ? " whitespace-nowrap" : ""}`;
  if (showFurigana && furigana && furigana.length > 0) {
    const furiganaText = furigana.map((segment) => segment.text).join("");
    const underlineStart = furiganaText === text && underline ? text.indexOf(underline) : -1;
    let offset = 0;
    return (
      <>
        {furigana.map((seg, i) => {
          const segmentStart = offset;
          const segmentEnd = offset + seg.text.length;
          offset = segmentEnd;
          const markedStart = Math.max(0, underlineStart - segmentStart);
          const markedEnd = Math.min(seg.text.length, underlineStart + (underline?.length ?? 0) - segmentStart);
          const content = underlineStart >= 0 && markedStart < markedEnd
            ? <>
                {seg.text.slice(0, markedStart)}
                <span className={underlineClass}>{seg.text.slice(markedStart, markedEnd)}</span>
                {seg.text.slice(markedEnd)}
              </>
            : seg.text;
          return <span key={i}>{seg.furigana ? <ruby>{content}<rt className="text-[10px] text-neutral-400">{seg.furigana}</rt></ruby> : content}</span>;
        })}
      </>
    );
  }
  if (!underline) return <>{text}</>;
  const i = text.indexOf(underline);
  if (i === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, i)}
      <span className={underlineClass}>{underline}</span>
      {text.slice(i + underline.length)}
    </>
  );
}

function paperIcon(paperId: string) {
  if (paperId.includes("moji") || paperId.includes("goi")) return BookOpenText;
  if (paperId.includes("choukai") || paperId.includes("listening")) return Headphones;
  return PenSquare;
}

function formatAudioTime(s: number): string {
  if (!Number.isFinite(s)) return "0:00";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec < 10 ? "0" : ""}${sec}`;
}

// "Thi thật": audio bắt buộc tự phát ngay khi vào bài (cùng lúc đồng hồ bắt
// đầu đếm) và chạy 1 lần xuyên suốt, không cho dừng/tua -- chỉ 1 timeline
// đọc (div progress bar, KHÔNG phải <input type=range>) để người học biết
// đang ở đâu, không có nút play/pause/tốc độ/lặp lại nào. Khác hẳn
// AudioPlayer.tsx (dùng cho chế độ "Ôn tập" bên cạnh) vốn cho điều khiển
// tay đầy đủ.
function ExamAudioTimeline({ src }: { src: string }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [needsPlay, setNeedsPlay] = useState(false);

  const play = () => {
    audioRef.current?.play().then(() => setNeedsPlay(false)).catch(() => setNeedsPlay(true));
  };

  useEffect(() => {
    play();
  }, []);

  const pct = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="space-y-2">
      <audio
        ref={audioRef}
        src={src}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
        onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
        onError={() => setNeedsPlay(true)}
      />
      <div className="flex items-center gap-3">
        <span className="w-9 text-right text-xs tabular-nums text-neutral-400">{formatAudioTime(currentTime)}</span>
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-neutral-200">
          <div className="h-full rounded-full bg-rose-600 transition-[width]" style={{ width: `${pct}%` }} />
        </div>
        <span className="w-9 text-xs tabular-nums text-neutral-400">{formatAudioTime(duration)}</span>
      </div>
      {needsPlay ? (
        <button type="button" onClick={play} className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-medium text-rose-700">
          <Play size={13} /> Âm thanh chưa phát — bấm để thử lại
        </button>
      ) : null}
    </div>
  );
}

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m} phút ${s > 0 ? `${s} giây` : ""}`.trim() : `${s} giây`;
}

export function DeThiScreen({
  targetId,
  onNavigate,
  onCurrentItemChange,
}: { targetId?: string; onNavigate?: (screen: Screen, id?: string) => void; onCurrentItemChange?: (id?: string) => void } = {}) {
  const [step, setStep] = useState<Step | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (targetId === REVIEW_RETURN_TARGET && typeof window !== "undefined") {
        try {
          const saved = window.sessionStorage.getItem(REVIEW_RETURN_STORAGE_KEY);
          if (saved) {
            const review = JSON.parse(saved) as {
              entry?: DeThiHistoryEntry;
              answers?: (number | null)[];
              backTo?: "examDetail" | "history";
              practiceMode?: boolean;
              reviewIndex?: number | null;
            };
            if (review.entry && Array.isArray(review.answers) && review.backTo) {
              if (!cancelled) setStep({
                name: "result",
                entry: review.entry,
                answers: review.answers,
                backTo: review.backTo,
                practiceMode: review.practiceMode,
                reviewIndex: review.reviewIndex,
              });
              return;
            }
          }
        } catch {
          // Fall back to the exam list if a temporary review snapshot is invalid.
        }
      }
      const session = await loadDeThiSession();
      if (session) {
        const found = findPaper(session.examId, session.paperId);
        if (found && Date.now() < session.deadlineAt) {
          if (!cancelled) setStep({ name: "taking", session });
          return;
        }
        // Deadline already passed while the tab was closed/backgrounded --
        // auto-submit instead of silently discarding the attempt.
        if (found) {
          const entry = await submitPaper(session);
          if (!cancelled) setStep({ name: "result", entry, answers: session.answers, backTo: "examDetail" });
          return;
        }
        await clearDeThiSession();
      }
      if (targetId && findExamById(targetId)) {
        if (!cancelled) setStep({ name: "examDetail", examId: targetId });
        return;
      }
      if (!cancelled) setStep({ name: "examList" });
    })();
    return () => {
      cancelled = true;
    };
  }, [targetId]);

  if (!step) return <LoadingScreen />;

  if (step.name === "examList") {
    return <ExamListView onOpen={(examId) => setStep({ name: "examDetail", examId })} />;
  }
  if (step.name === "examDetail") {
    const exam = findExamById(step.examId);
    if (!exam) return <ExamListView onOpen={(examId) => setStep({ name: "examDetail", examId })} />;
    return (
      <ExamDetailView
        exam={exam}
        onBack={() => setStep({ name: "examList" })}
        onStart={(paper, practiceMode) => setStep({ name: "taking", session: startPaperAttempt(exam.id, paper, practiceMode) })}
        onOpenHistory={(paper) => setStep({ name: "history", examId: exam.id, paperId: paper.id })}
        onNavigate={onNavigate}
      />
    );
  }
  if (step.name === "taking") {
    return (
      <TakingView
        session={step.session}
        onSessionChange={(session) => setStep({ name: "taking", session })}
        onFinish={(entry, finishedSession) => setStep({ name: "result", entry, answers: finishedSession.answers, backTo: "examDetail", practiceMode: finishedSession.practiceMode })}
        onBack={() => setStep({ name: "examDetail", examId: step.session.examId })}
      />
    );
  }
  if (step.name === "history") {
    return (
      <HistoryListView
        examId={step.examId}
        paperId={step.paperId}
        onBack={() => setStep({ name: "examDetail", examId: step.examId })}
        onOpenAttempt={(entry) => setStep({ name: "result", entry, answers: entry.answers ?? [], backTo: "history" })}
      />
    );
  }
  return (
    <ResultView
      entry={step.entry}
      answers={step.answers}
      practiceMode={step.practiceMode}
      backTo={step.backTo}
      initialReviewIndex={step.reviewIndex}
      onNavigate={onNavigate}
      onCurrentItemChange={onCurrentItemChange}
      onBack={() =>
        step.backTo === "history"
          ? setStep({ name: "history", examId: step.entry.examId, paperId: step.entry.paperId })
          : setStep({ name: "examDetail", examId: step.entry.examId })
      }
      backLabel={step.backTo === "history" ? "Về lịch sử" : "Về danh sách đề"}
      onRetry={() => {
        const found = findPaper(step.entry.examId, step.entry.paperId);
        if (!found) {
          setStep({ name: "examList" });
          return;
        }
        setStep({ name: "taking", session: startPaperAttempt(found.exam.id, found.paper, step.practiceMode) });
      }}
    />
  );
}

function ExamListView({ onOpen }: { onOpen: (examId: string) => void }) {
  const [summaries, setSummaries] = useState<Record<string, Record<string, DeThiPaperSummary>>>({});
  const [history, setHistory] = useState<DeThiHistoryEntry[]>([]);
  const [expandedSources, setExpandedSources] = useState<string[]>([]);
  const [sortMode, setSortMode] = useState<"newest" | "oldest" | "started" | "unstarted">("newest");
  const [selectedLevel, setSelectedLevel] = useState<JlptLevel>("N3");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // One shared history read instead of getExamSummary(e.id) per exam --
      // each of those separately re-reads+re-scans the whole history array
      // from storage, ~38x redundant work for the same data.
      const history = await loadDeThiHistory();
      const entries = ALL_EXAMS.map((e) => [e.id, summarizeExam(e, history)] as const);
      if (!cancelled) {
        setSummaries(Object.fromEntries(entries));
        setHistory(history);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const levelExams = ALL_EXAMS.filter((exam) => exam.level === selectedLevel);
  const levelExamIds = new Set(levelExams.map((exam) => exam.id));
  const levelHistory = history.filter((entry) => levelExamIds.has(entry.examId));
  const startedExamCount = levelExams.filter((exam) => summary(exam, summaries[exam.id]).some((paper) => paper.attempts > 0)).length;
  const bestResult = levelHistory.length > 0 ? Math.max(...levelHistory.map((entry) => entry.percent)) : null;
  const lockedLevels = (["N5", "N4", "N3", "N2", "N1"] as const).filter((level) => !AVAILABLE_LEVELS.includes(level));
  const availableSources = getAvailableSources(selectedLevel);

  function toggleSource(source: string) {
    setExpandedSources((current) =>
      current.includes(source) ? current.filter((item) => item !== source) : [...current, source],
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-2.5 py-2 md:px-8 md:py-6">
      <div className="mb-1 text-xs font-medium text-neutral-400">Luyện thi JLPT</div>
      <PageHeader title="Đề mô phỏng" icon={{ img: "icon-jlpt.png", bg: "#fef3c7" }} />

      <div className="mt-4 flex gap-2 overflow-x-auto">
        {(["N5", "N4", "N3", "N2", "N1"] as const).map((level) =>
          AVAILABLE_LEVELS.includes(level) ? (
            <button
              key={level}
              onClick={() => setSelectedLevel(level)}
              aria-pressed={selectedLevel === level}
              style={levelBadgeStyle(level)}
              className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-bold transition-opacity ${selectedLevel === level ? "opacity-100" : "opacity-55 hover:opacity-100"}`}
            >
              {level}
            </button>
          ) : (
            <span
              key={level}
              title="Sắp có — chưa có bộ đề thật cho level này"
              className="flex shrink-0 items-center gap-1 rounded-full border border-neutral-200 bg-neutral-50 px-3.5 py-1.5 text-xs font-bold text-neutral-300"
            >
              🔒 {level}
            </span>
          ),
        )}
      </div>
      {lockedLevels.length > 0 ? <div className="mt-1.5 text-[11px] text-neutral-400">🔒 {lockedLevels.join("/")} khoá -- chưa có bộ đề cho level này.</div> : null}

      <div className="mt-5 grid grid-cols-3 gap-2 sm:gap-3">
        <div className="rounded-2xl border border-sky-100 bg-sky-50 p-3 sm:p-4">
          <div className="text-xl font-bold text-sky-700 sm:text-2xl">{startedExamCount}</div>
          <div className="mt-0.5 text-[11px] font-medium text-sky-700/70 sm:text-xs">Đề đã bắt đầu</div>
        </div>
        <div className="rounded-2xl border border-violet-100 bg-violet-50 p-3 sm:p-4">
          <div className="text-xl font-bold text-violet-700 sm:text-2xl">{levelHistory.length}</div>
          <div className="mt-0.5 text-[11px] font-medium text-violet-700/70 sm:text-xs">Lượt làm</div>
        </div>
        <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-3 sm:p-4">
          <div className="text-xl font-bold text-emerald-700 sm:text-2xl">{bestResult === null ? "—" : `${bestResult}%`}</div>
          <div className="mt-0.5 text-[11px] font-medium text-emerald-700/70 sm:text-xs">Kết quả cao nhất</div>
        </div>
      </div>

      <div className="mt-5 flex items-center justify-end gap-2">
        <span className="hidden items-center gap-1.5 text-xs font-medium text-neutral-500 sm:flex">
          <ArrowUpDown size={14} /> Sắp xếp
        </span>
        <Select
          items={[
            { value: "newest", label: "Mới nhất" },
            { value: "oldest", label: "Cũ nhất" },
            { value: "started", label: "Đã làm trước" },
            { value: "unstarted", label: "Chưa làm trước" },
          ]}
          value={sortMode}
          onValueChange={(value) => value !== null && setSortMode(value as typeof sortMode)}
        >
          <SelectTrigger aria-label="Sắp xếp danh sách đề" className="h-9 w-[168px] rounded-xl bg-white shadow-none">
            <ArrowUpDown size={14} className="text-neutral-400 sm:hidden" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="newest">Mới nhất</SelectItem>
            <SelectItem value="oldest">Cũ nhất</SelectItem>
            <SelectItem value="started">Đã làm trước</SelectItem>
            <SelectItem value="unstarted">Chưa làm trước</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {availableSources.map((source) => {
        const sourceExams = levelExams.filter((exam) => exam.source === source);
        const orderedExams = [...sourceExams].sort((a, b) => {
          const aStarted = summary(a, summaries[a.id]).some((paper) => paper.attempts > 0);
          const bStarted = summary(b, summaries[b.id]).some((paper) => paper.attempts > 0);
          if (sortMode === "started" && aStarted !== bStarted) return aStarted ? -1 : 1;
          if (sortMode === "unstarted" && aStarted !== bStarted) return aStarted ? 1 : -1;
          const defaultOrder = sourceExams.indexOf(a) - sourceExams.indexOf(b);
          return sortMode === "oldest" ? -defaultOrder : defaultOrder;
        });
        const initialLimit = source === "cac-nam" ? 5 : 6;
        const expanded = expandedSources.includes(source);
        const visibleExams = expanded ? orderedExams : orderedExams.slice(0, initialLimit);

        return (
        <section key={source} className="mt-7">
          <div className="flex items-end justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-neutral-800">{SOURCE_LABELS[source] ?? source}</h2>
              <p className="mt-0.5 text-xs text-neutral-400">{sourceExams.length} đề · Chọn một đề để xem các phần thi</p>
            </div>
            {sourceExams.length > initialLimit ? (
              <button onClick={() => toggleSource(source)} className="shrink-0 text-xs font-semibold text-rose-600 hover:text-rose-700">
                {expanded ? "Thu gọn" : `Xem tất cả (${sourceExams.length})`}
              </button>
            ) : null}
          </div>
          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            {visibleExams.map((exam) => {
              const paperSummaries = summary(exam, summaries[exam.id]);
              const doneCount = paperSummaries.filter((s) => s.attempts > 0).length;
              const attemptCount = paperSummaries.reduce((total, item) => total + item.attempts, 0);
              const best = paperSummaries.some((s) => s.bestPercent !== null)
                ? Math.round(
                    paperSummaries.reduce((sum, s) => sum + (s.bestPercent ?? 0), 0) /
                      paperSummaries.filter((s) => s.bestPercent !== null).length,
                  )
                : null;
              const progressPercent = Math.round((doneCount / exam.papers.length) * 100);
              const isStarted = doneCount > 0;
              return (
                <button
                  key={exam.id}
                  onClick={() => onOpen(exam.id)}
                  className="group rounded-2xl border border-neutral-200 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-rose-200 hover:shadow-md sm:p-5"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-base font-bold text-neutral-800">{exam.examLabel}</span>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${source === "cac-nam" ? "bg-amber-50 text-amber-700" : "bg-sky-50 text-sky-700"}`}>
                          {source === "cac-nam" ? "Đề thật" : "Mô phỏng"}
                        </span>
                      </div>
                      <div className="mt-1 text-xs text-neutral-400">{exam.level} · {exam.papers.length} phần thi</div>
                    </div>
                    <span className="flex shrink-0 items-center gap-1 text-xs font-bold text-rose-600">
                      {isStarted ? "Luyện tiếp" : "Bắt đầu"} <ChevronRight size={14} className="transition group-hover:translate-x-0.5" />
                    </span>
                  </div>

                  <div className="mt-4 h-2 overflow-hidden rounded-full bg-neutral-100">
                    <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${progressPercent}%` }} />
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-2 text-xs">
                    <span className="font-medium text-neutral-500">Đã làm {doneCount}/{exam.papers.length} phần</span>
                    <span className="text-neutral-400">
                      {attemptCount > 0 ? `${attemptCount} lượt` : "Chưa có kết quả"}
                    </span>
                  </div>

                  <div className="mt-3 flex items-center gap-4 border-t border-neutral-100 pt-3 text-xs text-neutral-500">
                    <span className="flex items-center gap-1.5">
                      <Trophy size={13} className={best === null ? "text-neutral-300" : "text-amber-500"} />
                      Tỷ lệ TB <strong className="text-neutral-700">{best === null ? "—" : `${best}%`}</strong>
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Play size={12} className={isStarted ? "text-emerald-500" : "text-neutral-300"} />
                      {isStarted ? "Đang học" : "Sẵn sàng"}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      )})}
    </div>
  );
}

function summary(exam: DeThiExam, byPaper: Record<string, DeThiPaperSummary> | undefined): DeThiPaperSummary[] {
  return exam.papers.map((p) => byPaper?.[p.id] ?? { attempts: 0, bestPercent: null, lastFinishedAt: null });
}

function ExamDetailView({
  exam,
  onBack,
  onStart,
  onOpenHistory,
  onNavigate,
}: {
  exam: DeThiExam;
  onBack: () => void;
  onStart: (paper: DeThiPaper, practiceMode?: boolean) => void;
  onOpenHistory: (paper: DeThiPaper) => void;
  onNavigate?: (screen: Screen, id?: string) => void;
}) {
  const confirm = useConfirm();
  const [summaries, setSummaries] = useState<Record<string, DeThiPaperSummary> | null>(null);

  // A native 聴解 paper already renders in the normal papers.map grid below,
  // even when its audio has not been published/attached yet. Only show the
  // separate Luyện nghe fallback when the exam has no native listening paper.
  const hasNativeListeningPaper = exam.papers.some((p) => p.id === "choukai" || p.audioUrl);
  const firstListeningQuestion =
    !hasNativeListeningPaper && exam.listeningBook ? ALL_LISTENING.find((q) => q.book === exam.listeningBook) : undefined;
  const listeningCount =
    !hasNativeListeningPaper && exam.listeningBook ? ALL_LISTENING.filter((q) => q.book === exam.listeningBook).length : 0;
  const sectionCardCount = exam.papers.length + Number(!hasNativeListeningPaper);

  useEffect(() => {
    let cancelled = false;
    getExamSummary(exam.id).then((s) => {
      if (!cancelled) setSummaries(s);
    });
    return () => {
      cancelled = true;
    };
  }, [exam.id]);

  const totalMinutes = exam.papers.reduce((sum, p) => sum + p.timeMinutes, 0);
  const totalQuestions = exam.papers.reduce((sum, p) => sum + p.questions.length, 0);
  const doneCount = exam.papers.filter((p) => (summaries?.[p.id]?.attempts ?? 0) > 0).length;
  const bestOverall =
    summaries && Object.values(summaries).some((s) => s.bestPercent !== null)
      ? Math.round(
          Object.values(summaries).reduce((sum, s) => sum + (s.bestPercent ?? 0), 0) /
            Object.values(summaries).filter((s) => s.bestPercent !== null).length,
        )
      : null;
  const lastFinishedAt = summaries
    ? Object.values(summaries).reduce<number | null>((max, s) => (s.lastFinishedAt && (!max || s.lastFinishedAt > max) ? s.lastFinishedAt : max), null)
    : null;

  return (
    <div className="mx-auto max-w-6xl px-2.5 py-2 md:px-8 md:py-6">
      <button onClick={onBack} className="mb-2 flex items-center gap-1 text-sm font-medium text-neutral-500 hover:text-neutral-700">
        <ChevronLeft size={15} /> Luyện thi JLPT
      </button>
      <PageHeader title={`Đề ${exam.examLabel}`} icon={{ img: "icon-jlpt.png", bg: "#fef3c7" }} />

      <div className="mt-4 flex flex-wrap gap-2">
        <span className="flex items-center gap-1.5 rounded-full border border-neutral-200 bg-white px-3 py-1.5 text-xs font-medium text-neutral-600">
          <Clock size={13} className="text-neutral-400" /> Tổng {totalMinutes} phút
        </span>
        <span className="flex items-center gap-1.5 rounded-full border border-neutral-200 bg-white px-3 py-1.5 text-xs font-medium text-neutral-600">
          <FileText size={13} className="text-neutral-400" /> {totalQuestions} câu
        </span>
        <span className="flex items-center gap-1.5 rounded-full border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-600">
          <Flag size={13} /> Đã làm {doneCount}/{exam.papers.length} phần
        </span>
      </div>

      <div className={`mt-5 grid gap-3 ${sectionCardCount <= 2 ? "xl:grid-cols-2" : "xl:grid-cols-3"}`}>
        {exam.papers.map((paper) => {
          const Icon = paperIcon(paper.id);
          const s = summaries?.[paper.id];
          return (
            <Card key={paper.id} className="gap-3 rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm ring-0">
              <div className="flex items-center justify-between">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-neutral-100">
                  <Icon size={19} className="text-neutral-600" />
                </div>
                <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-[11px] font-semibold text-neutral-500">
                  {s && s.attempts > 0 ? `Đã làm ${s.attempts} lần` : "Chưa làm"}
                </span>
              </div>
              <div>
                <div className="text-base font-bold text-neutral-800">{paper.label}</div>
                {paper.gradingAvailable === false ? (
                  <p className="mt-1 text-xs leading-relaxed text-amber-700">Chưa có MP3 và đáp án; hiện chỉ xem câu hỏi, không chấm điểm.</p>
                ) : null}
              </div>
              <div className="flex items-center gap-3 text-xs font-medium text-neutral-500">
                <span className="flex items-center gap-1">
                  <Clock size={12} className="text-neutral-400" /> {paper.timeMinutes} phút
                </span>
                <span className="flex items-center gap-1">
                  <FileText size={12} className="text-neutral-400" /> {paper.questions.length} câu
                </span>
                {s && s.bestPercent !== null ? <span className="font-semibold text-emerald-600">{s.bestPercent}%</span> : null}
              </div>
              <div className="mt-1 flex gap-2">
                <Button className="flex-1" onClick={() => onStart(paper, paper.gradingAvailable === false)}>
                  {paper.gradingAvailable === false ? "Xem câu hỏi" : "Bắt đầu"} <ChevronRight size={15} />
                </Button>
                {paper.gradingAvailable !== false ? (
                  <Button
                    variant="outline"
                    size="icon"
                    aria-label={`Ôn tập ${paper.label}`}
                    title={
                      paper.audioUrl
                        ? "Ôn tập không tính giờ; có thể dừng, tua, lặp lại và đổi tốc độ audio"
                        : "Ôn tập không tính giờ và không lưu vào lịch sử"
                    }
                    onClick={() => onStart(paper, true)}
                  >
                    <BookOpenText size={16} />
                  </Button>
                ) : null}
                {s && s.attempts > 0 ? (
                  <button
                    title="Xem lịch sử làm bài, xem lại từng câu của mỗi lần làm"
                    onClick={() => onOpenHistory(paper)}
                    className="flex w-10 shrink-0 items-center justify-center rounded-lg border border-neutral-200 text-neutral-500 hover:bg-neutral-50 hover:text-rose-600"
                  >
                    <History size={15} />
                  </button>
                ) : null}
                {s && s.attempts > 0 ? (
                  <button
                    title="Xoá lịch sử làm bài, đặt lại trạng thái Chưa làm"
                    onClick={async () => {
                      if (!(await confirm(`Xoá lịch sử ${s.attempts} lần làm "${paper.label}"? Không ảnh hưởng đến các phần khác.`))) return;
                      await clearHistoryForPaper(exam.id, paper.id);
                      setSummaries(await getExamSummary(exam.id));
                    }}
                    className="flex w-10 shrink-0 items-center justify-center rounded-lg border border-neutral-200 text-neutral-500 hover:bg-neutral-50 hover:text-rose-600"
                  >
                    <RotateCcw size={15} />
                  </button>
                ) : null}
              </div>
            </Card>
          );
        })}

        {hasNativeListeningPaper ? null : firstListeningQuestion ? (
          <Card className="gap-3 rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm ring-0">
            <div className="flex items-center justify-between">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-neutral-100">
                <Headphones size={19} className="text-neutral-600" />
              </div>
              <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-[11px] font-semibold text-neutral-500">
                {listeningCount} câu
              </span>
            </div>
            <div>
              <div className="text-base font-bold text-neutral-800">Nghe hiểu</div>
            </div>
            <p className="text-xs font-medium text-neutral-500">
              Phần 聴解 của đề này -- làm trong màn Luyện nghe (chấm riêng, không tính giờ chung với 2 phần trên).
            </p>
            <Button className="mt-1 w-full" onClick={() => onNavigate?.("listening", firstListeningQuestion.id)}>
              Bắt đầu <ChevronRight size={15} />
            </Button>
          </Card>
        ) : (
          <Card className="gap-3 rounded-2xl border border-dashed border-neutral-200 bg-neutral-50/60 p-5 shadow-sm ring-0">
            <div className="flex items-center justify-between">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-neutral-100">
                <Headphones size={19} className="text-neutral-400" />
              </div>
              <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700">Sắp có</span>
            </div>
            <div>
              <div className="text-base font-bold text-neutral-400">Nghe hiểu</div>
            </div>
            <p className="text-xs font-medium text-neutral-400">Bộ đề gốc chưa có phần nghe — sẽ cập nhật khi có dữ liệu.</p>
            <Button className="mt-1 w-full" variant="outline" disabled>
              Chưa mở
            </Button>
          </Card>
        )}
      </div>

      <div className="mt-6 grid grid-cols-2 divide-x divide-neutral-100 overflow-hidden rounded-2xl border border-neutral-200 bg-white sm:grid-cols-4">
        <div className="p-4">
          <div className="text-[10px] font-bold tracking-wide text-neutral-400 uppercase">Tổng thời gian</div>
          <div className="mt-1 text-lg font-bold text-neutral-800">{totalMinutes} phút</div>
        </div>
        <div className="p-4">
          <div className="text-[10px] font-bold tracking-wide text-neutral-400 uppercase">Tổng số câu</div>
          <div className="mt-1 text-lg font-bold text-neutral-800">{totalQuestions} câu</div>
        </div>
        <div className="p-4">
          <div className="text-[10px] font-bold tracking-wide text-neutral-400 uppercase">% cao nhất</div>
          <div className={`mt-1 text-lg font-bold ${bestOverall !== null ? "text-neutral-800" : "text-neutral-300"}`}>
            {bestOverall !== null ? `${bestOverall}%` : "—"}
          </div>
        </div>
        <div className="p-4">
          <div className="text-[10px] font-bold tracking-wide text-neutral-400 uppercase">Trạng thái</div>
          <div className="mt-1 text-sm font-bold text-neutral-600">
            {lastFinishedAt ? new Date(lastFinishedAt).toLocaleDateString("vi-VN") : "Chưa bắt đầu"}
          </div>
        </div>
      </div>
    </div>
  );
}

function TakingView({
  session,
  onSessionChange,
  onFinish,
  onBack,
}: {
  session: DeThiSession;
  onSessionChange: (session: DeThiSession) => void;
  onFinish: (entry: DeThiHistoryEntry, session: DeThiSession) => void;
  onBack: () => void;
}) {
  const confirm = useConfirm();
  const found = findPaper(session.examId, session.paperId);

  async function finish() {
    const entry = await submitPaper(session);
    onFinish(entry, session);
  }

  const { label: timeLabel, isLow } = useCountdown(
    session.deadlineAt,
    () => {
      finish();
    },
    !session.practiceMode,
  );

  const floatingNavBottom = useFloatingNav(true);

  if (!found) return <div className="p-6 text-neutral-400">Không tìm thấy đề này.</div>;
  const { exam, paper } = found;

  const idx = session.currentIndex;
  const group = questionDisplayGroup(paper, idx);
  const questions = paper.questions.slice(group.start, group.end)
    .map((question) => withListeningContent(exam.id, paper.id, question));
  const firstQuestion = questions[0];
  const listeningMondaiLabel = paper.id === "choukai" || paper.audioUrl
    ? getJlptListeningMondaiLabel(firstQuestion.problemGroup)
    : undefined;
  const passage = group.passage;
  const isGroupedReading = !!passage && questions.length > 1;
  const allAnswered = session.answers.every((a) => a !== null);
  const isLast = group.end === paper.questions.length;
  const previousIndex = group.start - 1;

  async function goTo(newIndex: number) {
    const staysInGroup = newIndex >= group.start && newIndex < group.end;
    const next = { ...session, currentIndex: newIndex };
    await saveDeThiSession(next);
    onSessionChange(next);
    requestAnimationFrame(() => {
      if (staysInGroup) document.getElementById(`exam-taking-question-${newIndex}`)?.scrollIntoView({ block: "start" });
      else window.scrollTo({ top: 0, behavior: "auto" });
    });
  }

  async function selectAnswer(questionIndex: number, optionIndex: number) {
    const answers = [...session.answers];
    answers[questionIndex] = optionIndex;
    const next = { ...session, answers, currentIndex: questionIndex };
    await saveDeThiSession(next);
    onSessionChange(next);
  }

  function goNext() {
    if (isLast) return;
    goTo(group.end);
  }

  const swipe = useSwipeNavigation({
    onSwipeLeft: goNext,
    onSwipeRight: () => {
      if (previousIndex >= 0) goTo(previousIndex);
    },
  });

  return (
    <div className="mx-auto max-w-6xl px-2.5 py-2 pb-28 md:px-8 md:py-6 md:pb-6" {...swipe}>
      <button onClick={onBack} className="flex items-center gap-1 text-sm font-medium text-neutral-500 hover:text-neutral-700">
        <ChevronLeft size={15} /> {exam.examLabel}
      </button>

      <div className="mt-1.5 flex items-center justify-between">
        <div>
          <div className="text-xs font-semibold text-neutral-400">{paper.label}</div>
          <h1 className="text-lg font-bold text-neutral-800">
            {isGroupedReading ? `Câu ${group.start + 1}–${group.end} / ${paper.questions.length}` : `Câu ${idx + 1} / ${paper.questions.length}`}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          {session.practiceMode ? (
            <span className="flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-sm font-bold text-amber-700">
              Ôn tập
            </span>
          ) : (
            <span
              className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-bold tabular-nums ${
                isLow ? "border-rose-300 bg-rose-50 text-rose-600" : "border-neutral-200 bg-white text-neutral-700"
              }`}
            >
              <Clock size={14} /> {timeLabel}
            </span>
          )}
          <button
            title="Nộp bài, xem kết quả"
            onClick={async () => {
              if (!allAnswered && !(await confirm(`Còn ${session.answers.filter((a) => a === null).length} câu chưa trả lời. Vẫn nộp bài?`))) return;
              finish();
            }}
            className="flex items-center gap-1 rounded-full bg-emerald-50 px-3 py-1.5 text-sm font-semibold text-emerald-600"
          >
            <Check size={15} /> Nộp bài
          </button>
        </div>
      </div>

      {paper.audioUrl ? (
        // Đặt ở vị trí cố định ngoài Card câu hỏi để React không unmount lại
        // audio mỗi khi đổi câu (idx thay đổi), giữ nguyên tiến trình phát.
        <Card className="mt-4 gap-2 rounded-2xl border-neutral-200 p-4 ring-0">
          {session.practiceMode ? (
            <>
              <div className="text-xs font-semibold text-neutral-400">
                Chế độ ôn tập -- không tính giờ, không lưu vào lịch sử. Tự do dừng/tua/lặp lại/đổi tốc độ.
              </div>
              <AudioPlayer src={assetUrl(paper.audioUrl)} />
            </>
          ) : (
            <>
              <div className="text-xs font-semibold text-neutral-400">
                Audio tự phát 1 lần xuyên suốt cả bài, đúng như thi thật -- không dừng/tua được. Tự do chuyển câu bên dưới trong lúc nghe.
              </div>
              <ExamAudioTimeline src={assetUrl(paper.audioUrl)} />
            </>
          )}
        </Card>
      ) : null}

      <QuestionPalette
        summary={`${isGroupedReading ? `Câu ${group.start + 1}–${group.end}` : `Câu ${idx + 1}`}/${paper.questions.length} · đã trả lời ${session.answers.filter((a) => a !== null).length}`}
        onJump={goTo}
        items={paper.questions.map((question, i) => {
          const a = session.answers[i];
          const status: PaletteStatus = i === idx ? "current" : a === null ? "unanswered" : "answered";
          // Use the paper position as the React key: a scanned source can
          // repeat a printed number, and the palette still maps by index.
          return { id: String(i), status };
        })}
      />

      <Card className="mt-4 gap-0 rounded-2xl border-neutral-200 p-6 ring-0">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs font-semibold text-neutral-400 uppercase">
            <span style={levelBadgeStyle(exam.level)} className="rounded-full px-2 py-0.5 text-[10px] font-bold normal-case">
              {exam.level}
            </span>
            {listeningMondaiLabel ? `${listeningMondaiLabel} · ` : ""}{firstQuestion.problemGroup}
          </div>
        </div>

        {passage ? (
          <div className="mt-3 rounded-lg bg-neutral-50 p-4 text-sm leading-relaxed text-neutral-700">
            <PassageTextWithReferences text={passage} questionNumber={firstQuestion.number} referenceTerms={[]} highlightReferences={false} underlineRanges={readingPassageUnderlineRanges(questions, passage)} />
          </div>
        ) : null}
        {questions.map((question, offset) => {
          const questionIndex = group.start + offset;
          const answered = session.answers[questionIndex];
          return (
            <section id={`exam-taking-question-${questionIndex}`} key={questionIndex} className={offset > 0 ? "mt-6 border-t border-neutral-200 pt-5" : undefined}>
              <div className="mt-4 flex items-start gap-2 whitespace-pre-line text-lg leading-relaxed font-semibold text-neutral-800">
                <span className="mt-0.5 shrink-0 rounded-md bg-neutral-100 px-2 py-0.5 text-sm font-bold text-neutral-600">{question.number}.</span>
                <div className="min-w-0 flex-1">
                  <QuestionText text={formatExamQuestion(question.question, question.problemGroup)} underline={readingQuestionUnderline(question.question, question.underline, passage)} />
                </div>
              </div>
              {question.questionImage ? (
                <img src={assetUrl(question.questionImage)} alt="Hình tình huống của câu nghe" className="mt-4 w-full rounded-lg border border-neutral-200" />
              ) : null}
              {question.optionsImage ? (
                <>
                  <img src={assetUrl(question.optionsImage)} alt="Lựa chọn minh hoạ" className="mt-4 w-full rounded-lg border border-neutral-200" />
                  <div className="mt-3 grid grid-cols-4 gap-2">
                    {Array.from({ length: question.optionCount ?? 4 }, (_, oi) => (
                      <button
                        key={oi}
                        onClick={() => selectAnswer(questionIndex, oi)}
                        className={`rounded-lg border py-2 text-center text-sm font-bold ${
                          answered === oi ? "border-rose-300 bg-rose-50 text-rose-700" : "border-neutral-200 hover:bg-neutral-50"
                        }`}
                      >
                        {oi + 1}
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <div className="mt-5 grid gap-2 md:grid-cols-2">
                  {question.options.map((opt, oi) => (
                    <button
                      key={oi}
                      onClick={() => selectAnswer(questionIndex, oi)}
                      className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-left text-sm ${
                        answered === oi ? "border-rose-300 bg-rose-50 text-rose-700" : "border-neutral-200 hover:bg-neutral-50"
                      }`}
                    >
                      <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-bold ${
                        answered === oi ? "border-rose-300 text-rose-600" : "border-neutral-300 text-neutral-400"
                      }`}>{oi + 1}</span>
                      <span className="min-w-0 flex-1 whitespace-normal">
                        <QuestionText
                          text={opt}
                          underline={optionUnderline(question.problemGroup, question.question, question.underlineForms, opt)}
                          keepUnderlineTogether
                        />
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </section>
          );
        })}
      </Card>

      {/* Desktop-only inline row -- on mobile, see the floating buttons below.
          Full-width on mobile it would put "Câu sau" right at the screen edge,
          the same edge-swipe-back trap fixed in QuizScreen (see useSwipeNavigation.ts). */}
      <div className="mt-4 hidden items-center gap-2 md:flex">
        <Button variant="outline" disabled={previousIndex < 0} onClick={() => goTo(previousIndex)}>
          <ChevronLeft size={16} /> {isGroupedReading ? "Bài trước" : "Câu trước"}
        </Button>
        <Button className="ml-auto" disabled={isLast} onClick={goNext}>
          {isGroupedReading ? "Bài sau" : "Câu sau"} <ChevronRight size={16} />
        </Button>
      </div>

      {previousIndex >= 0 ? (
        <button
          onClick={() => goTo(previousIndex)}
          aria-label={isGroupedReading ? "Bài trước" : "Câu trước"}
          className={`fixed ${floatingNavBottom} left-4 z-20 floating-action-button bg-white text-neutral-600 shadow-lg ring-1 ring-neutral-200 active:bg-neutral-50 md:hidden`}
        >
          <ChevronLeft size={18} />
        </button>
      ) : null}
      {!isLast ? (
        <button
          onClick={goNext}
          aria-label={isGroupedReading ? "Bài sau" : "Câu sau"}
          className={`fixed right-4 ${floatingNavBottom} z-20 floating-action-button bg-rose-600 text-white shadow-lg active:bg-rose-700 md:hidden`}
        >
          <ChevronRight size={18} />
        </button>
      ) : (
        // Ở câu cuối cùng không còn nút "Câu sau" -- thay bằng nút nộp bài nổi
        // ở đúng vị trí đó, vì nút nộp bài ở header thường đã cuộn khỏi màn hình.
        <button
          onClick={async () => {
            if (!allAnswered && !(await confirm(`Còn ${session.answers.filter((a) => a === null).length} câu chưa trả lời. Vẫn nộp bài?`))) return;
            finish();
          }}
          aria-label="Nộp bài"
          className={`fixed right-4 ${floatingNavBottom} z-20 flex h-10 items-center gap-1.5 rounded-full bg-emerald-600 px-4 text-sm font-semibold text-white shadow-lg active:bg-emerald-700 md:hidden`}
        >
          <Check size={16} /> Nộp bài
        </button>
      )}
    </div>
  );
}

function ResultView({
  entry,
  answers,
  practiceMode = false,
  backTo,
  initialReviewIndex,
  onNavigate,
  onCurrentItemChange,
  onBack,
  backLabel,
  onRetry,
}: {
  entry: DeThiHistoryEntry;
  answers: (number | null)[];
  practiceMode?: boolean;
  backTo: "examDetail" | "history";
  initialReviewIndex?: number | null;
  onNavigate?: (screen: Screen, id?: string) => void;
  onCurrentItemChange?: (id?: string) => void;
  onBack: () => void;
  backLabel: string;
  onRetry: () => void;
}) {
  const found = findPaper(entry.examId, entry.paperId);
  const [reviewIndex, setReviewIndex] = useState<number | null>(initialReviewIndex ?? null);
  const reviewGroup = found && reviewIndex !== null ? questionDisplayGroup(found.paper, reviewIndex) : null;
  const [showFurigana, setShowFurigana] = useState(false);
  // Entries saved before DeThiHistoryEntry.answers existed have none -- the
  // score summary above still renders fine, just skip the per-question
  // palette/review instead of showing it against an empty array.
  const hasAnswers = answers.length > 0;
  const gradingAvailable = !!found && found.paper.gradingAvailable !== false && found.paper.questions.every((question) => question.correctIndex !== null);
  const actions = (
    <div className="mt-8 flex gap-2">
      <Button variant="outline" className="flex-1" onClick={onBack}>
        {backLabel}
      </Button>
      <Button className="flex-1" onClick={onRetry}>
        Làm lại
      </Button>
    </div>
  );

  function openReference(screen: Screen, id: string | undefined, questionIndex: number) {
    if (!onNavigate || !id) return;
    try {
      window.sessionStorage.setItem(REVIEW_RETURN_STORAGE_KEY, JSON.stringify({
        entry,
        answers,
        backTo,
        practiceMode,
        reviewIndex: practiceMode ? null : questionIndex,
      }));
    } catch {
      // Vocabulary/grammar navigation still works if session storage is unavailable.
    }
    onCurrentItemChange?.(REVIEW_RETURN_TARGET);
    onNavigate(screen, id);
  }

  function jumpToReview(index: number, showPassage = false) {
    setReviewIndex(index);
    const target = showPassage && found ? questionDisplayGroup(found.paper, index).start : index;
    requestAnimationFrame(() => document.getElementById(`exam-review-question-${target}`)?.scrollIntoView({ block: "start" }));
  }

  return (
    <div className={`mx-auto px-2.5 py-2 text-center md:px-8 md:py-6 ${practiceMode ? "max-w-3xl" : "max-w-2xl"}`}>
      <h1 className="text-2xl font-bold text-neutral-800">{practiceMode ? "Kết quả ôn tập" : "Kết quả"}</h1>
      <p className="mt-1 text-sm text-neutral-500">
        {found ? `${found.exam.examLabel} · ${found.paper.label}` : ""}
      </p>

      <div className="mt-6 flex flex-col items-center">
        {gradingAvailable ? (
          <>
            <div className="text-5xl font-extrabold text-rose-600">{entry.percent}%</div>
            <div className="mt-1 text-sm font-medium text-neutral-500">
              {entry.correctPoints}/{entry.totalPoints} điểm · {entry.correctCount}/{entry.totalQuestions} câu đúng
            </div>
          </>
        ) : (
          <p className="max-w-lg rounded-xl bg-amber-50 p-3 text-sm font-medium text-amber-800">
            Phần này chưa chấm điểm vì chưa có MP3 và đáp án. Câu trả lời của bạn không được lưu vào lịch sử.
          </p>
        )}
      {practiceMode && gradingAvailable ? (
          <div className="mt-1 text-xs text-neutral-500">Lượt ôn tập này không lưu vào lịch sử. Hãy xem đáp án trước khi rời trang.</div>
        ) : gradingAvailable ? (
          <div className="mt-1 text-xs text-neutral-400">Thời gian làm bài: {formatDuration(entry.durationSec)}</div>
        ) : null}
      </div>

      {!practiceMode ? actions : null}

      {practiceMode && found && hasAnswers ? (
        <div className="mt-8 text-left">
          <h2 className="text-lg font-bold text-neutral-800">{gradingAvailable ? "Đáp án và giải thích" : "Câu hỏi và lựa chọn"}</h2>
          <p className="mt-1 text-xs text-neutral-500">{gradingAvailable ? "Đáp án đúng màu xanh, câu trả lời sai màu đỏ." : "Phần nghe chờ MP3; lựa chọn chưa được chấm."}</p>
          {found.paper.questions.map((question, i) => (
            <ReviewQuestion
              key={i}
              question={withListeningContent(found.exam.id, found.paper.id, question)}
              level={found.exam.level}
              passage={passageForQuestion(found.paper, i)}
              passageFurigana={passageFuriganaForQuestion(found.paper, i)}
              passageVi={passageTranslationForQuestion(found.paper, i)}
              passageSentencesVi={passageSentenceTranslationsForQuestion(found.paper, i)}
              questionVi={questionTranslationForQuestion(found.paper, i)}
              chosenIndex={answers[i]}
              showFurigana={showFurigana}
              showListeningAudio={false}
              onToggleFurigana={() => setShowFurigana((visible) => !visible)}
              onNavigate={(screen, id) => openReference(screen, id, i)}
              showPassage={questionDisplayGroup(found.paper, i).start === i}
              passageQuestions={found.paper.questions.slice(questionDisplayGroup(found.paper, i).start, questionDisplayGroup(found.paper, i).end)}
            />
          ))}
        </div>
      ) : found && hasAnswers ? (
        <div className="mt-8 text-left">
          <QuestionPalette
            defaultOpen
            summary={gradingAvailable
              ? `${entry.correctCount} đúng · ${entry.totalQuestions - entry.correctCount - answers.filter((a) => a === null).length} sai${
                answers.some((a) => a === null) ? ` · ${answers.filter((a) => a === null).length} chưa làm` : ""
              } — bấm 1 câu để xem lại`
              : `${answers.filter((answer) => answer !== null).length} lựa chọn đã chọn · chưa chấm — bấm 1 câu để xem lại`}
            onJump={(i) => jumpToReview(i)}
            items={found.paper.questions.map((q, i) => {
              const a = answers[i];
              const status: PaletteStatus = a === null ? "unanswered" : q.correctIndex === null ? "answered" : a === q.correctIndex ? "correct" : "wrong";
              return { id: String(q.number), status };
            })}
          />
          {reviewGroup ? (
            <>
              {Array.from({ length: reviewGroup.end - reviewGroup.start }, (_, offset) => reviewGroup.start + offset).map((i) => (
                <div id={`exam-review-question-${i}`} key={i}>
                  <ReviewQuestion
                    question={withListeningContent(found.exam.id, found.paper.id, found.paper.questions[i])}
                    level={found.exam.level}
                    passage={passageForQuestion(found.paper, i)}
                    passageFurigana={passageFuriganaForQuestion(found.paper, i)}
                    passageVi={passageTranslationForQuestion(found.paper, i)}
                    passageSentencesVi={passageSentenceTranslationsForQuestion(found.paper, i)}
                    questionVi={questionTranslationForQuestion(found.paper, i)}
                    chosenIndex={answers[i]}
                    showFurigana={showFurigana}
                    showPassage={i === reviewGroup.start}
                    passageQuestions={found.paper.questions.slice(reviewGroup.start, reviewGroup.end)}
                    onToggleFurigana={() => setShowFurigana((visible) => !visible)}
                    onNavigate={(screen, id) => openReference(screen, id, i)}
                  />
                </div>
              ))}
              <div className="mt-3 flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => jumpToReview(reviewGroup.start - 1, true)}
                  disabled={reviewGroup.start === 0}
                  className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-neutral-200 px-3 py-2 text-sm font-medium text-neutral-600 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-40"
                  aria-label={reviewGroup.end - reviewGroup.start > 1 ? "Bài trước" : "Câu trước"}
                >
                  <ChevronLeft size={16} /> {reviewGroup.end - reviewGroup.start > 1 ? "Bài trước" : "Câu trước"}
                </button>
                <span className="shrink-0 text-xs font-medium text-neutral-400">
                  {reviewGroup.end - reviewGroup.start > 1
                    ? `Câu ${found.paper.questions[reviewGroup.start].number}–${found.paper.questions[reviewGroup.end - 1].number}`
                    : `Câu ${found.paper.questions[reviewGroup.start].number}`}
                </span>
                <button
                  type="button"
                  onClick={() => jumpToReview(reviewGroup.end, true)}
                  disabled={reviewGroup.end === found.paper.questions.length}
                  className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-neutral-200 px-3 py-2 text-sm font-medium text-neutral-600 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-40"
                  aria-label={reviewGroup.end - reviewGroup.start > 1 ? "Bài sau" : "Câu sau"}
                >
                  {reviewGroup.end - reviewGroup.start > 1 ? "Bài sau" : "Câu sau"} <ChevronRight size={16} />
                </button>
              </div>
            </>
          ) : null}
        </div>
      ) : found ? (
        <p className="mt-8 text-sm text-neutral-400">Lần làm này không có dữ liệu chi tiết từng câu để xem lại.</p>
      ) : null}
      {practiceMode ? actions : null}
    </div>
  );
}

function HistoryListView({
  examId,
  paperId,
  onBack,
  onOpenAttempt,
}: {
  examId: string;
  paperId: string;
  onBack: () => void;
  onOpenAttempt: (entry: DeThiHistoryEntry) => void;
}) {
  const found = findPaper(examId, paperId);
  const [attempts, setAttempts] = useState<DeThiHistoryEntry[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadHistoryForPaper(examId, paperId).then((h) => {
      if (!cancelled) setAttempts(h);
    });
    return () => {
      cancelled = true;
    };
  }, [examId, paperId]);

  if (!found) return <div className="p-6 text-neutral-400">Không tìm thấy đề này.</div>;

  return (
    <div className="mx-auto max-w-2xl px-2.5 py-2 md:px-8 md:py-6">
      <button onClick={onBack} className="flex items-center gap-1 text-sm font-medium text-neutral-500 hover:text-neutral-700">
        <ChevronLeft size={15} /> {found.exam.examLabel}
      </button>
      <h1 className="mt-1.5 text-lg font-bold text-neutral-800">Lịch sử · {found.paper.label}</h1>

      {attempts === null ? (
        <LoadingScreen />
      ) : attempts.length === 0 ? (
        <p className="mt-6 text-sm text-neutral-400">Chưa có lần làm nào.</p>
      ) : (
        <div className="mt-4 flex flex-col gap-2">
          {attempts.map((a, i) => (
            <button
              key={a.finishedAt}
              onClick={() => onOpenAttempt(a)}
              className="flex items-center justify-between gap-3 rounded-xl border border-neutral-200 bg-white px-4 py-3 text-left hover:bg-neutral-50"
            >
              <div>
                <div className="text-sm font-semibold text-neutral-800">
                  Lần {attempts.length - i} · {new Date(a.finishedAt).toLocaleString("vi-VN")}
                </div>
                <div className="mt-0.5 text-xs text-neutral-500">
                  {a.correctCount}/{a.totalQuestions} câu đúng · {formatDuration(a.durationSec)}
                  {!a.answers ? " · không có dữ liệu xem lại" : ""}
                </div>
              </div>
              <div className={`text-xl font-extrabold ${a.percent >= 80 ? "text-emerald-600" : a.percent >= 50 ? "text-amber-600" : "text-rose-600"}`}>
                {a.percent}%
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ReviewQuestion({
  question,
  level,
  passage,
  passageFurigana,
  passageVi,
  passageSentencesVi,
  questionVi,
  chosenIndex,
  showFurigana,
  onToggleFurigana,
  onNavigate,
  showListeningAudio = true,
  showPassage = true,
  passageQuestions,
}: {
  question: DeThiPaper["questions"][number];
  level: JlptLevel;
  passage: string | null;
  passageFurigana: { text: string; furigana: string | null }[] | null;
  passageVi: string | null;
  passageSentencesVi: string[] | null;
  questionVi: string | null;
  chosenIndex: number | null;
  showFurigana?: boolean;
  onToggleFurigana: () => void;
  onNavigate?: (screen: Screen, id?: string) => void;
  showListeningAudio?: boolean;
  showPassage?: boolean;
  passageQuestions?: readonly DeThiQuestion[];
}) {
  const orderingReconstruction = reconstructOrderingQuestion(question);
  const sourceUnderline = readingQuestionUnderline(question.question, question.underline, passage);
  const sourcePassageUnderline = readingPassageUnderlineRange(question.question, question.underline, question.passageUnderline, passage, question.passageUnderlineOccurrence);
  const sourcePassageUnderlineRanges = passage && passageQuestions ? readingPassageUnderlineRanges(passageQuestions, passage) : undefined;
  const hasMarkdownTable = !!passage && findMarkdownPipeTables(passage).length > 0;
  const [showPassageTranslation, setShowPassageTranslation] = useState(false);
  const [showQuestionTranslation, setShowQuestionTranslation] = useState(false);
  const [showListeningTranslation, setShowListeningTranslation] = useState(false);
  const [highlightReferences, setHighlightReferences] = useState(false);
  const [referenceTab, setReferenceTab] = useState<"questions" | "references">("questions");
  const [referenceMatches, setReferenceMatches] = useState<{
    vocab: { id: string; word: string }[];
    bunpo: { id: string; pattern: string }[];
    vocabTerms: string[];
  }>({ vocab: [], bunpo: [], vocabTerms: [] });
  useEffect(() => {
    let cancelled = false;
    setReferenceMatches({ vocab: [], bunpo: [], vocabTerms: [] });
    if (!passage || !showPassage) {
      return () => {
        cancelled = true;
      };
    }
    // Load the reading/vocabulary catalogs only when answer review is opened;
    // do not add that bundle or work to the active exam-taking screen.
    import("../../popup/readingLinks.ts").then(({ findVocabInPassage, findBunpoInPassage, getVocabReferenceTerms }) => {
      if (cancelled) return;
      const source = { level, body: [{ text: passage, furigana: null }] };
      const vocab = findVocabInPassage(source);
      const bunpo = findBunpoInPassage(source);
      setReferenceMatches({
        vocab,
        bunpo,
        vocabTerms: vocab.flatMap((vocab) => getVocabReferenceTerms(vocab)),
      });
    }).catch(() => {
      if (!cancelled) setReferenceMatches({ vocab: [], bunpo: [], vocabTerms: [] });
    });
    return () => {
      cancelled = true;
    };
  }, [level, passage, showPassage]);
  const { vocab: vocabMatches, bunpo: bunpoMatches, vocabTerms } = referenceMatches;
  const displayedQuestionTranslation = questionVi ?? question.questionVi ?? null;
  const optionExplanationCount = question.optionsImage ? question.optionCount ?? 0 : question.options.length;
  const isListeningReview = Boolean(question.listeningAudioUrl || question.listeningPrompt || question.transcriptTurns?.length);
  const hasListeningTranscript = Boolean(question.transcriptTurns?.length);
  const listeningMondaiLabel = isListeningReview ? getJlptListeningMondaiLabel(question.problemGroup) : undefined;
  const hasReferences = !!passage && showPassage && (vocabMatches.length > 0 || bunpoMatches.length > 0);
  const referenceTerms = useMemo(
    () => [
      ...vocabTerms,
      ...bunpoMatches.flatMap((grammar) => examGrammarChunks(grammar.pattern)),
    ],
    [bunpoMatches, vocabTerms],
  );

  const translatedUnits = useMemo(
    () => showPassage && passage && passageVi ? translatedPassageUnits(passage, passageVi, passageSentencesVi ?? undefined, passageFurigana) : [],
    [passage, passageFurigana, passageSentencesVi, passageVi, showPassage],
  );
  const translatedUnitsWithFurigana = useMemo(() => {
    if (!passage || !passageFurigana) return translatedUnits.map((unit) => ({ ...unit, furigana: unit.furigana ?? null }));
    let searchFrom = 0;
    return translatedUnits.map((unit) => {
      const furigana = unit.furigana ?? sliceFuriganaForText(passage, passageFurigana, unit.japanese, searchFrom);
      const matchedAt = passage.indexOf(unit.japanese, searchFrom);
      if (matchedAt >= 0) searchFrom = matchedAt + unit.japanese.length;
      return { ...unit, furigana };
    });
  }, [passage, passageFurigana, translatedUnits]);

  return (
    <>
      {showListeningAudio && question.listeningAudioUrl ? (
        <Card className="mt-3 gap-3.5 rounded-2xl border-neutral-200 p-5 ring-0">
          {question.listeningPrompt ? (
            <div className="flex items-start gap-2 text-sm font-semibold text-neutral-700">
              <Headphones size={17} className="mt-0.5 shrink-0 text-neutral-400" />
              <div>
                {showFurigana ? <FuriganaText annotations={question.listeningPromptFurigana} text={question.listeningPrompt} /> : question.listeningPrompt}
                {showListeningTranslation && question.listeningPromptVi ? (
                  <div className="mt-1 text-sm font-normal text-neutral-500">{question.listeningPromptVi}</div>
                ) : null}
              </div>
            </div>
          ) : null}
          <AudioPlayer
            src={assetUrl(question.listeningAudioUrl)}
            startAtSeconds={question.audioStartSec}
            endAtSeconds={question.audioEndSec}
            translationToggle={question.listeningPromptVi && !hasListeningTranscript
              ? { active: showListeningTranslation, onToggle: () => setShowListeningTranslation((visible) => !visible) }
              : undefined}
          />
        </Card>
      ) : null}
      {!showListeningAudio && question.listeningPrompt ? (
        <Card className="mt-3 gap-0 rounded-2xl border-neutral-200 p-5 ring-0">
          <div className="flex items-start gap-2 text-sm font-semibold text-neutral-700">
            <Headphones size={17} className="mt-0.5 shrink-0 text-neutral-400" />
            <div>
              {showFurigana ? <FuriganaText annotations={question.listeningPromptFurigana} text={question.listeningPrompt} /> : question.listeningPrompt}
              {showListeningTranslation && question.listeningPromptVi ? (
                <div className="mt-1 text-sm font-normal text-neutral-500">{question.listeningPromptVi}</div>
              ) : null}
            </div>
          </div>
          {question.listeningPromptVi ? (
            <button
              type="button"
              onClick={() => setShowListeningTranslation((visible) => !visible)}
              className="mt-3 inline-flex w-fit items-center gap-1.5 rounded-full border border-neutral-200 px-3 py-1 text-xs font-semibold text-neutral-600 hover:bg-neutral-50"
            >
              <Languages size={13} /> {showListeningTranslation ? "Ẩn bản dịch" : "Hiện bản dịch"}
            </button>
          ) : null}
        </Card>
      ) : null}
      {hasListeningTranscript ? (
        <ListeningTranscriptCard
          turns={question.transcriptTurns!}
          showFurigana={!!showFurigana}
          onToggleFurigana={onToggleFurigana}
          showTranslation={showListeningTranslation}
          onToggleTranslation={() => setShowListeningTranslation((visible) => !visible)}
          className="mt-3"
        />
      ) : question.transcript && !question.listeningPrompt ? (
        <Card className="mt-3 gap-0 rounded-2xl border-neutral-200 p-5 ring-0">
          <div className="text-xs font-bold tracking-wide text-neutral-400 uppercase">Transcript</div>
          <div className="mt-3 whitespace-pre-line text-sm leading-relaxed text-neutral-700">{question.transcript}</div>
          {question.transcriptVi ? (
            <div className="mt-3">
              <button
                type="button"
                onClick={() => setShowListeningTranslation((visible) => !visible)}
                className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 px-3 py-1 text-xs font-semibold text-neutral-600 hover:bg-neutral-50"
              >
                <Languages size={13} /> {showListeningTranslation ? "Ẩn bản dịch" : "Hiện bản dịch"}
              </button>
              {showListeningTranslation ? (
                <div className="mt-2 whitespace-pre-line text-sm leading-relaxed text-neutral-600 italic">{question.transcriptVi}</div>
              ) : null}
            </div>
          ) : null}
        </Card>
      ) : null}
      <Card className="mt-3 gap-0 rounded-2xl border-neutral-200 p-5 ring-0">
      <div className="text-xs font-semibold text-neutral-400 uppercase">
        Câu {question.number} · {listeningMondaiLabel ? `${listeningMondaiLabel} · ` : ""}{question.problemGroup}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {!isListeningReview || !hasListeningTranscript ? <button
          type="button"
          onClick={onToggleFurigana}
          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors ${
            showFurigana
              ? "border-rose-200 bg-rose-50 text-rose-700"
              : "border-neutral-200 text-neutral-600 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700"
          }`}
        >
          <BookOpenText size={13} /> {showFurigana ? "Ẩn furigana" : "Hiện furigana"}
        </button> : null}
        {showPassage && passage && passageVi ? (
          <button
            type="button"
            onClick={() => setShowPassageTranslation((visible) => !visible)}
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors ${
              showPassageTranslation
                ? "border-sky-200 bg-sky-50 text-sky-700"
                : "border-neutral-200 text-neutral-500 hover:border-sky-200 hover:bg-sky-50 hover:text-sky-700"
            }`}
          >
            <Languages size={13} /> {showPassageTranslation ? "Ẩn bản dịch" : "Xem bản dịch"}
          </button>
        ) : null}
      </div>
      {showPassage && passage ? (
        <div className="mt-3 rounded-lg bg-neutral-50 p-4 text-sm leading-relaxed text-neutral-700">
          {showPassageTranslation && passageVi && hasMarkdownTable ? (
            <div className="space-y-5">
              <PassageTextWithReferences text={passage} questionNumber={question.number} referenceTerms={referenceTerms} highlightReferences={highlightReferences} furigana={passageFurigana} showFurigana={showFurigana} underlineRange={sourcePassageUnderline} />
              <div className="border-t border-neutral-200 pt-4 text-neutral-600">
                <div className="mb-3 text-xs font-semibold uppercase text-neutral-400">Bản dịch</div>
                <MarkdownTableText text={passageVi} />
              </div>
            </div>
          ) : showPassageTranslation && passageVi ? (
            <div className="flex flex-col gap-3">
              {translatedUnitsWithFurigana.map((unit, index) => (
                <div key={index}>
                  <div className="whitespace-pre-line">
                    <PassageTextWithReferences text={unit.japanese} questionNumber={question.number} referenceTerms={referenceTerms} highlightReferences={highlightReferences} furigana={unit.furigana} showFurigana={showFurigana} underlineRange={sourcePassageUnderline} />
                  </div>
                  {unit.vietnamese ? (
                    <div className="mt-1 border-l-2 border-neutral-300 pl-3 text-sm leading-snug text-neutral-500 italic whitespace-pre-line">
                      <PassageText text={unit.vietnamese} questionNumber={question.number} />
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <PassageTextWithReferences text={passage} questionNumber={question.number} referenceTerms={referenceTerms} highlightReferences={highlightReferences} furigana={passageFurigana} showFurigana={showFurigana} underlineRange={sourcePassageUnderline} underlineRanges={sourcePassageUnderlineRanges} />
          )}
        </div>
      ) : null}
      {hasReferences ? (
        <div className="mt-5 flex rounded-xl border border-neutral-200 bg-neutral-50 p-1" role="tablist" aria-label={`Nội dung câu ${question.number}`}>
          <button
            type="button"
            role="tab"
            aria-selected={referenceTab === "questions"}
            aria-controls={`review-question-panel-${question.number}`}
            id={`review-question-tab-${question.number}`}
            onClick={() => setReferenceTab("questions")}
            className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
              referenceTab === "questions" ? "bg-white text-neutral-800 shadow-sm" : "text-neutral-500 hover:text-neutral-700"
            }`}
          >
            Câu hỏi (1)
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={referenceTab === "references"}
            aria-controls={`review-reference-panel-${question.number}`}
            id={`review-reference-tab-${question.number}`}
            onClick={() => setReferenceTab("references")}
            className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
              referenceTab === "references" ? "bg-white text-neutral-800 shadow-sm" : "text-neutral-500 hover:text-neutral-700"
            }`}
          >
            Tham khảo ({vocabMatches.length + bunpoMatches.length})
          </button>
        </div>
      ) : null}
      {hasReferences && referenceTab === "references" ? (
        <div
          className="mt-4 rounded-xl border border-neutral-200 bg-white p-4"
          role="tabpanel"
          id={`review-reference-panel-${question.number}`}
          aria-labelledby={`review-reference-tab-${question.number}`}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-bold text-neutral-800">Từ vựng và ngữ pháp trong bài</h3>
              <p className="mt-0.5 text-xs text-neutral-500">Các mục trọng tâm được tìm thấy trong đoạn đọc.</p>
            </div>
            <button
              type="button"
              onClick={() => setHighlightReferences((enabled) => !enabled)}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
                highlightReferences ? "border-rose-300 bg-rose-50 text-rose-600" : "border-neutral-200 text-neutral-600"
              }`}
            >
              {highlightReferences ? "Tắt bôi đậm trong bài" : "Bôi đậm trong bài"}
            </button>
          </div>
          {vocabMatches.length > 0 ? (
            <div className="mt-3">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-neutral-500"><Library size={14} /> Từ vựng trọng tâm</div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {vocabMatches.map((vocab) => (
                  <button key={vocab.id} type="button" onClick={() => onNavigate?.("vocab", vocab.id)} className="rounded-lg border border-neutral-200 px-2.5 py-1 text-xs text-neutral-600 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700">
                    {vocab.word}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          {bunpoMatches.length > 0 ? (
            <div className="mt-3">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-neutral-500"><PenSquare size={14} /> Ngữ pháp trong bài</div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {bunpoMatches.map((grammar) => (
                  <button key={grammar.id} type="button" onClick={() => onNavigate?.("bunpo", grammar.id)} className="rounded-lg border border-neutral-200 px-2.5 py-1 text-xs text-neutral-600 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700">
                    {grammar.pattern}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
      {(!hasReferences || referenceTab === "questions") ? (
      <div
        role={hasReferences ? "tabpanel" : undefined}
        id={hasReferences ? `review-question-panel-${question.number}` : undefined}
        aria-labelledby={hasReferences ? `review-question-tab-${question.number}` : undefined}
      >
      {question.question ? (
        <div className="mt-3 flex items-start gap-2 whitespace-pre-line text-base font-semibold leading-loose text-neutral-800">
          <span className="mt-0.5 shrink-0 rounded-md bg-neutral-100 px-2 py-0.5 text-xs font-bold text-neutral-600">{question.number}.</span>
          <div className="min-w-0 flex-1">
            <QuestionText text={formatExamQuestion(question.question, question.problemGroup)} underline={sourceUnderline} furigana={formatExamFurigana(question.questionFurigana, question.problemGroup)} showFurigana={showFurigana} />
          </div>
        </div>
      ) : null}
      {isListeningReview ? (
        showListeningTranslation && displayedQuestionTranslation ? (
          <div className="mt-1 text-sm text-neutral-500">{displayedQuestionTranslation}</div>
        ) : null
      ) : displayedQuestionTranslation ? (
        <div className="mt-2">
          <button
            type="button"
            onClick={() => setShowQuestionTranslation((visible) => !visible)}
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors ${
              showQuestionTranslation
                ? "border-sky-200 bg-sky-50 text-sky-700"
                : "border-neutral-200 text-neutral-500 hover:border-sky-200 hover:bg-sky-50 hover:text-sky-700"
            }`}
          >
            <Languages size={13} /> {showQuestionTranslation ? "Ẩn dịch câu hỏi" : "Xem dịch câu hỏi"}
          </button>
          {showQuestionTranslation ? <div className="mt-2 whitespace-pre-line rounded-lg bg-sky-50 px-3 py-2 text-sm text-sky-800">{displayedQuestionTranslation}</div> : null}
        </div>
      ) : null}
      {question.questionImage ? (
        <img src={assetUrl(question.questionImage)} alt="Hình tình huống của câu nghe" className="mt-3 w-full rounded-lg border border-neutral-200" />
      ) : null}
      {question.optionsImage ? (
        <>
          <img src={assetUrl(question.optionsImage)} alt="Lựa chọn minh hoạ" className="mt-3 w-full rounded-lg border border-neutral-200" />
          <div className="mt-3 grid grid-cols-4 gap-2">
            {Array.from({ length: question.optionCount ?? 4 }, (_, oi) => {
              let cls = "border-neutral-200 opacity-60";
              if (question.correctIndex !== null && oi === question.correctIndex) cls = "border-emerald-300 bg-emerald-50 text-emerald-700";
              else if (oi === chosenIndex) cls = question.correctIndex === null ? "border-sky-300 bg-sky-50 text-sky-700" : "border-rose-300 bg-rose-50 text-rose-700";
              return (
                <div key={oi} className={`rounded-lg border py-2 text-center text-sm font-bold ${cls}`}>
                  {oi + 1}
                </div>
              );
            })}
          </div>
        </>
      ) : (
        <div className="mt-4 grid gap-2 md:grid-cols-2">
          {question.options.map((opt, oi) => {
            let cls = "border-neutral-200 opacity-60";
            if (question.correctIndex !== null && oi === question.correctIndex) cls = "border-emerald-300 bg-emerald-50 text-emerald-700";
            else if (oi === chosenIndex) cls = question.correctIndex === null ? "border-sky-300 bg-sky-50 text-sky-700" : "border-rose-300 bg-rose-50 text-rose-700";
            return (
              <div key={oi} className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-left text-sm ${cls}`}>
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-current text-xs font-bold">
                  {oi + 1}
                </span>
                <div className="leading-loose">
                  <QuestionText
                    text={opt}
                    underline={optionUnderline(question.problemGroup, question.question, question.underlineForms, opt)}
                    keepUnderlineTogether
                    furigana={question.optionsFurigana?.[oi]}
                    showFurigana={showFurigana}
                  />
                  {question.optionsVi?.[oi] && (!isListeningReview || showListeningTranslation) ? <div className="mt-0.5 text-xs opacity-80 italic">{question.optionsVi[oi]}</div> : null}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {chosenIndex !== null ? (
        question.correctIndex === null ? (
          <div className="mt-4 font-semibold text-sky-700">Đã chọn phương án {chosenIndex + 1} · chưa chấm vì chưa có MP3 và đáp án.</div>
        ) : (
          <div className={`mt-4 font-semibold ${chosenIndex === question.correctIndex ? "text-emerald-700" : "text-rose-700"}`}>
            {chosenIndex === question.correctIndex ? "✓ Đúng" : "✗ Sai"}
          </div>
        )
      ) : null}
      {question.explanation || orderingReconstruction ? (
        <div className="mt-2 text-sm text-neutral-600">
          {question.explanation ? <p>{question.explanation}</p> : null}
          {orderingReconstruction ? (
            <div className={question.explanation ? "mt-2 border-t border-neutral-200 pt-2" : ""}>
              <p className="font-semibold">
                Thứ tự ghép: {orderingReconstruction.order.map((optionIndex) => optionIndex + 1).join(" → ")} (★ ở phương án {question.correctIndex === null ? "?" : question.correctIndex + 1}).
              </p>
              <p className="mt-1 whitespace-pre-line">
                <span className="font-semibold">Câu hoàn chỉnh: </span>{orderingReconstruction.sentence}
              </p>
            </div>
          ) : null}
        </div>
      ) : null}
      {question.optionExplanations?.length === optionExplanationCount && question.optionExplanations.some((explanation) => explanation.trim()) ? (
        <div className="mt-4 border-t border-neutral-100 pt-3">
          <div className="text-xs font-bold tracking-wide text-neutral-400 uppercase">Giải thích từng đáp án</div>
          <div className="mt-2 space-y-2 text-xs leading-relaxed text-neutral-600">
            {question.optionExplanations.map((explanation, oi) => explanation.trim() ? (
              <div key={oi} className="flex gap-2">
                <span
                  className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                    oi === question.correctIndex ? "bg-emerald-100 text-emerald-700" : "bg-rose-50 text-rose-600"
                  }`}
                >
                  {oi + 1}
                </span>
                <span>{explanation}</span>
              </div>
            ) : null)}
          </div>
        </div>
      ) : null}
      {question.answerSourceNote ? <div className="mt-3 rounded-lg bg-amber-50 p-2 text-xs text-amber-700">{question.answerSourceNote}</div> : null}
      {question.transcriptUncertainty?.length ? (
        <div className="mt-2 text-xs text-amber-700">Chưa xác minh: {question.transcriptUncertainty.join(" ")}</div>
      ) : null}
      {chosenIndex === null ? <p className="mt-3 text-xs font-medium text-neutral-400">Bạn chưa trả lời câu này.</p> : null}
      </div>
      ) : null}
    </Card>
    </>
  );
}
