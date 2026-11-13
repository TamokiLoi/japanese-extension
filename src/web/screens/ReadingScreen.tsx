import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Shuffle, Undo2, ChevronLeft, ChevronRight, Sparkles, BarChart3, Library, PenSquare, CheckCircle2, Languages, Bookmark, BookmarkCheck, ExternalLink, Pause, Play, Square, Lightbulb } from "lucide-react";
import type { ReadingBodySegment, ReadingPassage, ReadingLength } from "../../types/reading.ts";
import { findUniqueTextRanges, type TextRange } from "../../lib/textRanges.ts";
import { alignTextSegmentsToLineBreaks } from "../../lib/alignTextSegments.ts";
import { findMarkdownPipeTables } from "../../lib/markdownpipetable.ts";
import { sliceReadingBody, splitPassageParagraphs } from "../../lib/passageParagraphs.ts";
import { splitBodyIntoSentences, translatedReadingUnits } from "../../lib/readingSentences.ts";
import { MarkdownTableText } from "../../components/markdowntabletext.tsx";
import {
  ALL_READING,
  AVAILABLE_LEVELS,
  AVAILABLE_LENGTHS,
  AVAILABLE_BOOKS,
  AVAILABLE_JLPT_EXAMS,
  AVAILABLE_N3_SETS,
  AVAILABLE_READING_EXAMS,
  READING_EXAM_BOOKS,
  AVAILABLE_TOPICS,
  LENGTH_LABELS,
  BOOK_LABELS,
  BOOK_DIFFICULTY_NOTE,
  pickRandomPassage,
  findReadingById,
  readingQuestionId,
  loadViewerState,
  saveViewerState,
  getPassageProgress,
  resetPassageAnswers,
  matchesFilters,
  matchesReadingSources,
  readingExamIdsForBook,
  initialReadingExamIds,
  initialReadingExamIdsForBook,
  isReadingExamBook,
  type ReadingPassageViewOptions,
  type ReadingViewerState,
} from "../../popup/readingState.ts";
import { findVocabInPassage, findBunpoInPassage, bunpoPassageMatchLabel, getVocabReferenceTerms } from "../../popup/readingLinks.ts";
import { extractMatchChunks } from "../../popup/bunpoLinks.ts";
import { recordAnswer } from "../../popup/progressState.ts";
import { pruneToggle } from "../../popup/filterUtils.ts";
import { Card } from "../components/ui/card.tsx";
import { StudyFeedbackButton } from "../components/StudyFeedbackButton.tsx";
import { QuestionExplanationBlock } from "../components/QuestionExplanationBlock.tsx";
import { Button } from "../components/ui/button.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select.tsx";
import { levelBadgeStyle } from "../lib/levelColors.tsx";
import { PageHeader } from "../components/PageHeader.tsx";
import { StatCard } from "../components/StatCard.tsx";
import { useConfirm } from "../components/ConfirmDialog.tsx";
import { useFloatingNav } from "../WebAppShell.tsx";
import { FilterBar, FilterTrigger } from "../components/FilterBar.tsx";
import { ActiveFilters } from "../components/ActiveFilters.tsx";
import { FilterSheet, FilterGroup, FilterChipOption } from "../components/FilterSheet.tsx";
import { LoadingScreen } from "../components/LoadingScreen.tsx";
import { hasJapaneseVoice, onVoicesChanged, speakJapanese } from "../lib/speak.ts";
import { JLPT_LEISURE_BY_ID } from "../data/jlptLeisurePilot.ts";

function timelineLabel(passage: ReadingPassage): string {
  const min = passage.estimatedMinutes;
  const max = min + (passage.length === "long" ? 3 : passage.length === "medium" ? 2 : 1);
  return `${LENGTH_LABELS[passage.length]} · ~${min}-${max} phút`;
}

function isInCollection(passage: ReadingPassage, collection: "all" | "news" | "stories" | "library"): boolean {
  if (collection === "news") return passage.book === "news";
  if (collection === "stories") return passage.book === "ai-story";
  if (collection === "library") return passage.book === "ai-story" || JLPT_LEISURE_BY_ID.has(passage.id);
  return passage.book !== "ai-story";
}

function leisurePageRanges(body: ReadingBodySegment[], maxSentences = 2): { start: number; end: number }[] {
  const sentences = splitBodyIntoSentences(body);
  const pages: { start: number; end: number }[] = [];
  let start = 0;
  let count = 0;
  sentences.forEach((segments, index) => {
    if (index > start && segments[0]?.paragraphStart && count > 0) {
      pages.push({ start, end: index });
      start = index;
      count = 0;
    }
    count++;
    if (count >= maxSentences) {
      pages.push({ start, end: index + 1 });
      start = index + 1;
      count = 0;
    }
  });
  if (start < sentences.length) pages.push({ start, end: sentences.length });
  return pages;
}

type ReferenceTerm = { text: string; kind: "vocab" | "bunpo" };

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function renderTextWithReferences(
  text: string,
  terms: ReferenceTerm[],
  highlightReferences: boolean,
  underlineRanges: TextRange[] = [],
  sourceOffset = 0,
): ReactNode {
  const renderLines = (value: string, keyPrefix: string) =>
    value.split("\n").map((line, lineIndex, lines) => (
      <span key={`${keyPrefix}-${lineIndex}`}>
        {line}
        {lineIndex < lines.length - 1 ? <br /> : null}
      </span>
    ));

  const uniqueTerms = highlightReferences
    ? [...new Set(terms.map((term) => term.text).filter((term) => term.length >= 2))].sort((a, b) => b.length - a.length)
    : [];
  const referenceRanges: TextRange[] = [];
  for (const term of uniqueTerms) {
    const pattern = new RegExp(escapeRegExp(term), "gu");
    for (const match of text.matchAll(pattern)) {
      const start = match.index ?? 0;
      referenceRanges.push({ start, end: start + match[0].length });
    }
  }
  const localUnderlineRanges = underlineRanges.flatMap((range) => {
    const start = Math.max(0, range.start - sourceOffset);
    const end = Math.min(text.length, range.end - sourceOffset);
    return start < end ? [{ start, end }] : [];
  });
  if (referenceRanges.length === 0 && localUnderlineRanges.length === 0) return renderLines(text, "plain");

  const boundaries = new Set([0, text.length]);
  for (const range of [...referenceRanges, ...localUnderlineRanges]) {
    boundaries.add(range.start);
    boundaries.add(range.end);
  }
  const points = [...boundaries].sort((a, b) => a - b);
  return points.slice(0, -1).map((start, index) => {
    const end = points[index + 1];
    const part = text.slice(start, end);
    const isReference = referenceRanges.some((range) => start >= range.start && end <= range.end);
    const isUnderlined = localUnderlineRanges.some((range) => start >= range.start && end <= range.end);
    const content = renderLines(part, `marked-${index}`);
    return isReference || isUnderlined ? (
      <strong key={index} className={`${isReference ? "font-extrabold text-rose-700 underline decoration-rose-200 decoration-2 underline-offset-2" : "font-bold underline decoration-2 underline-offset-2"}`}>
        {content}
      </strong>
    ) : <span key={index}>{content}</span>;
  });
}

function renderAnnotatedText(
  text: string,
  segments: ReadingBodySegment[] | undefined,
  showFurigana: boolean,
  underlineRanges: TextRange[] = [],
): ReactNode {
  const alignedSegments = alignTextSegmentsToLineBreaks(segments, text);
  if (!showFurigana || !alignedSegments?.length) {
    return renderTextWithReferences(text, [], false, underlineRanges);
  }
  let offset = 0;
  return alignedSegments.map((segment, index) => {
    const content = renderTextWithReferences(segment.text, [], false, underlineRanges, offset);
    offset += segment.text.length;
    return showFurigana && segment.furigana
      ? <ruby key={index}>{content}<rt className="text-[10px] text-neutral-400">{segment.furigana}</rt></ruby>
      : <span key={index}>{content}</span>;
  });
}

function ReadingBody({
  passage,
  showFurigana,
  referenceTerms = [],
  highlightReferences = false,
}: {
  passage: ReadingPassage;
  showFurigana: boolean;
  referenceTerms?: ReferenceTerm[];
  highlightReferences?: boolean;
}) {
  const isArticle = passage.book === "news" || passage.book === "custom" || passage.book === "ai-story";
  const passageText = passage.body.map((segment) => segment.text).join("");
  const underlineRanges = findUniqueTextRanges(passageText, passage.underlinedPhrases, passage.underlinedRanges);
  const markdownTables = findMarkdownPipeTables(passageText);
  if (isArticle) {
    const paragraphs: ReadingPassage["body"][] = [];
    for (const segment of passage.body) {
      if (paragraphs.length === 0 || segment.paragraphStart) paragraphs.push([]);
      paragraphs[paragraphs.length - 1].push(segment);
    }
    return (
      <div className="space-y-5">
      {paragraphs.map((paragraph, pi) => (
          <p key={pi}>
            {paragraph.map((seg, i) => {
              const text = seg.paragraphStart ? seg.text.replace(/^\n+/u, "") : seg.text;
              const sourceOffset = passageText.indexOf(seg.text);
              return showFurigana && seg.furigana ? (
                <ruby key={i}>
                  {renderTextWithReferences(text, referenceTerms, highlightReferences, underlineRanges, Math.max(0, sourceOffset))}
                  <rt className="text-[10px] text-neutral-400">{seg.furigana}</rt>
                </ruby>
              ) : <span key={i}>{renderTextWithReferences(text, referenceTerms, highlightReferences, underlineRanges, Math.max(0, sourceOffset))}</span>;
            })}
          </p>
        ))}
      </div>
    );
  }
  if (markdownTables.length > 0) {
    let segmentOffset = 0;
    const segmentRanges = passage.body.map((segment) => {
      const start = segmentOffset;
      segmentOffset += segment.text.length;
      return { segment, start, end: segmentOffset };
    });
    const renderTextAtOffset = (text: string, sourceOffset: number, keyPrefix: string, renderBreakTags: boolean): ReactNode => {
      if (!renderBreakTags) return renderTextWithReferences(text, referenceTerms, highlightReferences, underlineRanges, sourceOffset);
      let localOffset = 0;
      return text.split(/(<br\s*\/?>)/giu).map((part, index) => {
        const partOffset = localOffset;
        localOffset += part.length;
        if (/^<br\s*\/?>$/iu.test(part)) return <br key={`${keyPrefix}-br-${index}`} />;
        return part ? <span key={`${keyPrefix}-text-${index}`}>{renderTextWithReferences(part, referenceTerms, highlightReferences, underlineRanges, sourceOffset + partOffset)}</span> : null;
      });
    };
    const renderSourceRange = (start: number, end: number, keyPrefix: string, renderBreakTags = false): ReactNode[] =>
      segmentRanges.flatMap(({ segment, start: segmentStart, end: segmentEnd }, index) => {
        const from = Math.max(start, segmentStart);
        const to = Math.min(end, segmentEnd);
        if (from >= to) return [];
        const text = segment.text.slice(from - segmentStart, to - segmentStart);
        const content = renderTextAtOffset(text, from, `${keyPrefix}-${index}`, renderBreakTags);
        const key = `${keyPrefix}-${index}`;
        return showFurigana && segment.furigana && from === segmentStart && to === segmentEnd
          ? [<ruby key={key}>{content}<rt className="text-[10px] text-neutral-400">{segment.furigana}</rt></ruby>]
          : [<span key={key}>{content}</span>];
      });

    const blocks: ReactNode[] = [];
    let cursor = 0;
    markdownTables.forEach((table, tableIndex) => {
      const columnCount = table.header?.length ?? Math.max(...table.rows.map((row) => row.reduce((count, cell) => count + (cell.colSpan ?? 1), 0)));
      let textEnd = table.start;
      while (textEnd > cursor && (passageText[textEnd - 1] === "\n" || passageText[textEnd - 1] === "\r")) textEnd--;
      if (textEnd > cursor) blocks.push(
        <p key={`before-${tableIndex}`} className="whitespace-pre-line">{renderSourceRange(cursor, textEnd, `before-${tableIndex}`)}</p>,
      );
      blocks.push(
        <div key={`table-${tableIndex}`} className="reading-markdown-table-scroll">
          <table className="reading-markdown-table" style={{ minWidth: `${Math.max(620, columnCount * 140)}px` }}>
            {table.header ? (
              <thead>
                <tr>
                  {table.header.map((cell, cellIndex) => (
                    <th key={cellIndex} colSpan={cell.colSpan ?? 1} scope="col">{renderSourceRange(cell.start, cell.end, `header-${tableIndex}-${cellIndex}`, true)}</th>
                  ))}
                </tr>
              </thead>
            ) : null}
            <tbody>
              {table.rows.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {row.map((cell, cellIndex) => (
                    <td key={cellIndex} colSpan={cell.colSpan ?? 1}>{renderSourceRange(cell.start, cell.end, `cell-${tableIndex}-${rowIndex}-${cellIndex}`, true)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      cursor = table.end;
      while (passageText[cursor] === "\n" || passageText[cursor] === "\r") cursor++;
    });
    if (cursor < passageText.length) blocks.push(
      <p key="after-table" className="whitespace-pre-line">{renderSourceRange(cursor, passageText.length, "after-table")}</p>,
    );
    return <div className="reading-passage-text-blocks">{blocks}</div>;
  }
  return (
    <div className="space-y-4">
      {splitPassageParagraphs(passageText).map((paragraph, pi) => (
        <p key={pi}>
          {sliceReadingBody(passage.body, paragraph.start, paragraph.end).map((segment, si) => {
            const content = renderTextWithReferences(segment.text, referenceTerms, highlightReferences, underlineRanges, segment.offset);
            return showFurigana && segment.furigana
              ? <ruby key={si}>{content}<rt className="text-[10px] text-neutral-400">{segment.furigana}</rt></ruby>
              : <span key={si}>{content}</span>;
          })}
        </p>
      ))}
    </div>
  );
}

// Used instead of plain ReadingBody when "Xem bản dịch" is on and the
// passage has per-sentence data -- interleaves each JP sentence with its VI
// translation right below it (same idea as Listening's turn+textVi), rather
// than one dense translated block after the whole passage.
function ReadingBodyInterleaved({
  passage,
  showFurigana,
  referenceTerms = [],
  highlightReferences = false,
}: {
  passage: ReadingPassage;
  showFurigana: boolean;
  referenceTerms?: ReferenceTerm[];
  highlightReferences?: boolean;
}) {
  const units = translatedReadingUnits(passage.body, passage.sentencesVi ?? []);
  const passageText = passage.body.map((segment) => segment.text).join("");
  const underlineRanges = findUniqueTextRanges(passageText, passage.underlinedPhrases, passage.underlinedRanges);
  let sourceSearchFrom = 0;
  return (
    <div className="flex flex-col gap-3">
      {units.map(({ segments: segs, translation }, gi) => (
        <div key={gi} className={gi > 0 && segs[0]?.paragraphStart ? "pt-4" : undefined}>
          <div>
      {segs.map((seg, si) => {
              const matchOffset = passageText.indexOf(seg.text, sourceSearchFrom);
              const offset = matchOffset >= 0 ? matchOffset : sourceSearchFrom;
              sourceSearchFrom = offset + seg.text.length;
              return showFurigana && seg.furigana ? (
                <ruby key={si}>
                  {renderTextWithReferences(seg.text, referenceTerms, highlightReferences, underlineRanges, offset)}
                  <rt className="text-[10px] text-neutral-400">{seg.furigana}</rt>
                </ruby>
              ) : (
                <span key={si}>{renderTextWithReferences(seg.text, referenceTerms, highlightReferences, underlineRanges, offset)}</span>
              );
            })}
          </div>
          {translation ? (
            <div className="mt-1 border-l-2 border-neutral-300 pl-3 text-sm leading-snug text-neutral-500 italic">
              {translation}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function AiStoryReadingBody({
  passage,
  showFurigana,
  showTranslation,
  referenceTerms,
  highlightReferences,
  activeSentenceIndex,
  sentenceRange,
  canSpeak,
  onSpeakSentence,
}: {
  passage: ReadingPassage;
  showFurigana: boolean;
  showTranslation: boolean;
  referenceTerms: ReferenceTerm[];
  highlightReferences: boolean;
  activeSentenceIndex: number;
  sentenceRange?: { start: number; end: number };
  canSpeak: boolean;
  onSpeakSentence: (index: number) => void;
}) {
  const allSentenceGroups = splitBodyIntoSentences(passage.body);
  const sentenceStart = sentenceRange?.start ?? 0;
  const sentenceGroups = allSentenceGroups.slice(sentenceStart, sentenceRange?.end ?? allSentenceGroups.length);
  const passageText = passage.body.map((segment) => segment.text).join("");
  const underlineRanges = findUniqueTextRanges(passageText, passage.underlinedPhrases, passage.underlinedRanges);
  const sentenceRefs = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    const active = sentenceRefs.current[activeSentenceIndex];
    if (!active) return;
    const bounds = active.getBoundingClientRect();
    if (bounds.top < 80 || bounds.bottom > window.innerHeight - 80) {
      active.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }, [activeSentenceIndex, sentenceRange?.start]);

  const paragraphs: { index: number; segments: typeof sentenceGroups[number] }[][] = [];
  sentenceGroups.forEach((segments, localIndex) => {
    if (paragraphs.length === 0 || segments[0]?.paragraphStart) paragraphs.push([]);
    paragraphs[paragraphs.length - 1].push({ index: sentenceStart + localIndex, segments });
  });

  let sourceSearchFrom = 0;
  const renderSentence = (segments: typeof sentenceGroups[number], index: number) => (
    <button
      key={index}
      ref={(element) => { sentenceRefs.current[index] = element; }}
      type="button"
      disabled={!canSpeak}
      title={canSpeak ? "Bấm để nghe từ câu này" : undefined}
      aria-label={canSpeak ? `Nghe câu ${index + 1}` : undefined}
      onClick={() => onSpeakSentence(index)}
      className={`inline rounded px-0.5 py-0.5 align-baseline transition-colors ${
        activeSentenceIndex === index ? "bg-amber-100 text-amber-950 ring-1 ring-amber-300" : ""
      } ${canSpeak ? "cursor-pointer hover:bg-amber-50 focus-visible:outline-2 focus-visible:outline-rose-400" : "cursor-text"}`}
      style={{ font: "inherit", color: "inherit" }}
    >
      {segments.map((segment, segmentIndex) => {
        const text = segment.paragraphStart ? segment.text.replace(/^\n+/u, "") : segment.text;
        const foundAt = passageText.indexOf(segment.text, sourceSearchFrom);
        const sourceOffset = foundAt >= 0 ? foundAt : sourceSearchFrom;
        sourceSearchFrom = sourceOffset + segment.text.length;
        const content = renderTextWithReferences(text, referenceTerms, highlightReferences, underlineRanges, sourceOffset);
        return showFurigana && segment.furigana ? (
          <ruby key={segmentIndex}>{content}<rt className="text-[10px] text-neutral-400">{segment.furigana}</rt></ruby>
        ) : <span key={segmentIndex}>{content}</span>;
      })}
    </button>
  );

  if (showTranslation && passage.sentencesVi?.length) {
    return (
      <div className="flex flex-col gap-3">
        {sentenceGroups.map((segments, localIndex) => {
          const index = sentenceStart + localIndex;
          return (
          <div key={index} className={index > 0 && segments[0]?.paragraphStart ? "pt-3" : undefined}>
            <div>{renderSentence(segments, index)}</div>
            {passage.sentencesVi?.[index] ? (
              <div className="mt-1 border-l-2 border-neutral-300 pl-3 text-sm leading-snug text-neutral-500 italic">
                {passage.sentencesVi[index]}
              </div>
            ) : null}
          </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {paragraphs.map((paragraph, paragraphIndex) => (
        <p key={paragraphIndex}>
          {paragraph.map(({ index, segments }) => renderSentence(segments, index))}
        </p>
      ))}
    </div>
  );
}

function StorySpeechControls({
  available,
  status,
  activeSentenceIndex,
  sentenceCount,
  rate,
  error,
  onToggle,
  onStop,
  onRateChange,
}: {
  available: boolean;
  status: "idle" | "playing" | "paused";
  activeSentenceIndex: number;
  sentenceCount: number;
  rate: number;
  error?: string;
  onToggle: () => void;
  onStop: () => void;
  onRateChange: (rate: number) => void;
}) {
  return (
    <div className="mt-4 rounded-xl border border-neutral-200 bg-white p-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={!available}
          onClick={onToggle}
          className="inline-flex items-center gap-1.5 rounded-full bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-700 disabled:cursor-not-allowed disabled:bg-neutral-300"
        >
          {status === "playing" ? <Pause size={14} /> : <Play size={14} />}
          {status === "playing" ? "Tạm dừng" : status === "paused" ? "Tiếp tục" : "Nghe truyện"}
        </button>
        {status !== "idle" ? (
          <button
            type="button"
            onClick={onStop}
            className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 px-3 py-1.5 text-xs font-semibold text-neutral-600 hover:bg-neutral-50"
          >
            <Square size={12} fill="currentColor" /> Dừng
          </button>
        ) : null}
        <label className="flex items-center gap-1.5 text-xs text-neutral-500">
          Tốc độ
          <select
            aria-label="Tốc độ đọc truyện"
            value={rate}
            onChange={(event) => onRateChange(Number(event.target.value))}
            className="rounded-lg border border-neutral-200 bg-white px-2 py-1 text-xs text-neutral-700"
          >
            {[0.75, 0.9, 1, 1.1, 1.25].map((value) => <option key={value} value={value}>{value}×</option>)}
          </select>
        </label>
        <span className="text-xs text-neutral-400">
          {activeSentenceIndex >= 0 ? `Câu ${activeSentenceIndex + 1}/${sentenceCount}` : `${sentenceCount} câu`}
        </span>
      </div>
      {error ? (
        <p className="mt-2 text-xs text-rose-600">{error}</p>
      ) : !available ? (
        <p className="mt-2 text-xs text-neutral-500">Thiết bị chưa có giọng đọc tiếng Nhật. Hãy bật/cài giọng Japanese trong cài đặt đọc văn bản của thiết bị.</p>
      ) : (
        <p className="mt-2 text-xs text-neutral-400">Bấm vào câu bất kỳ để đọc từ câu đó. Giọng đọc tùy theo trình duyệt và thiết bị.</p>
      )}
    </div>
  );
}

export function ReadingScreen({
  collection = "all",
  savedOnlyView = false,
  targetId,
  onOpenSavedStories,
  onOpenStories,
  onOpenExamTips,
  onOpenVocab,
  onOpenBunpo,
  onCurrentItemChange,
}: {
  collection?: "all" | "news" | "stories" | "library";
  savedOnlyView?: boolean;
  targetId?: string;
  onOpenSavedStories?: () => void;
  onOpenStories?: () => void;
  onOpenExamTips?: () => void;
  onOpenVocab: (vocabId: string) => void;
  onOpenBunpo: (bunpoId: string, senseId?: string) => void;
  onCurrentItemChange?: (id: string | undefined) => void;
}) {
  const [state, setState] = useState<ReadingViewerState | null>(null);
  const [error, setError] = useState<string | undefined>(undefined);
  const [libraryTab, setLibraryTab] = useState<"stories" | "jlpt">("stories");
  const [leisureLevel, setLeisureLevel] = useState<"all" | "N1" | "N3">("all");
  const [leisureLength, setLeisureLength] = useState<"all" | ReadingLength>("all");
  const [leisureExamId, setLeisureExamId] = useState("all");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let s = await loadViewerState();
      const foundTarget = targetId ? findReadingById(targetId) : undefined;
      const passage = foundTarget && isInCollection(foundTarget, collection) && (!savedOnlyView || s.savedPassageIds.includes(foundTarget.id)) ? foundTarget : undefined;
      if (passage) {
        if (collection === "library") setLibraryTab(passage.book === "ai-story" ? "stories" : "jlpt");
        s = {
          ...s,
          currentPassageId: passage.id,
          lastPassageId: passage.id,
          answers: { ...s.answers, [passage.id]: s.answers[passage.id] ?? passage.questions.map(() => null) },
          showFurigana: false,
          showTranslation: false,
          showStudyNote: false,
          resultsRevealed: getPassageProgress(passage, s.answers).status === "done",
        };
        await saveViewerState(s);
      } else if (savedOnlyView && !targetId && s.currentPassageId) {
        // Opening the saved-stories destination should show its collection;
        // keep lastPassageId so the user can still resume from the list.
        s = { ...s, currentPassageId: null };
        await saveViewerState(s);
      } else if (s.currentPassageId) {
        const currentPassage = findReadingById(s.currentPassageId);
        if (collection === "library" && currentPassage && isInCollection(currentPassage, collection)) {
          setLibraryTab(currentPassage.book === "ai-story" ? "stories" : "jlpt");
        }
        if (currentPassage && getPassageProgress(currentPassage, s.answers).status === "done" && !s.resultsRevealed) {
          s = { ...s, resultsRevealed: true };
          await saveViewerState(s);
        }
      }
      if (cancelled) return;
      setState(s);
    })();
    return () => {
      cancelled = true;
    };
  }, [collection, savedOnlyView, targetId]);

  async function mutate(partial: Partial<ReadingViewerState>) {
    if (!state) return;
    const next = { ...state, ...partial };
    await saveViewerState(next);
    setState(next);
    setError(undefined);
  }

  const savedPassage = state?.currentPassageId ? findReadingById(state.currentPassageId) : undefined;
  const passage = savedPassage && isInCollection(savedPassage, collection) && (!savedOnlyView || state?.savedPassageIds.includes(savedPassage.id)) ? savedPassage : undefined;
  const isStateLoaded = state !== null;
  useEffect(() => {
    if (!isStateLoaded) return;
    onCurrentItemChange?.(passage?.id);
  }, [isStateLoaded, passage?.id, onCurrentItemChange]);

  if (!state) return <LoadingScreen variant="reading" title={savedOnlyView ? "Truyện đã lưu" : collection === "news" ? "Đọc báo" : collection === "stories" ? "Truyện AI" : collection === "library" ? "Thư viện đọc" : "Luyện đọc"} />;

  // Lifted up from ListView (rather than each screen recomputing its own
  // copy) so PassageView can sequence Trước/Tiếp through the exact same
  // filtered+status-filtered order the user was browsing in the list --
  // same reasoning as BunpoScreen.tsx's DetailView visibleList.
  const filtered = ALL_READING.filter((p) => {
    if (collection === "library") {
      if (libraryTab === "stories") return p.book === "ai-story";
      return JLPT_LEISURE_BY_ID.has(p.id) &&
        (leisureLevel === "all" || p.level === leisureLevel) &&
        (leisureLength === "all" || p.length === leisureLength) &&
        (leisureExamId === "all" || p.examId === leisureExamId);
    }
    if (collection === "stories") return p.book === "ai-story" && (!savedOnlyView || state.savedPassageIds.includes(p.id));
    if (collection === "news") return p.book === "news" && state.selectedLevels.includes(p.level) && state.selectedLengths.includes(p.length) && (!p.topic || state.selectedTopics.includes(p.topic));
    return p.book !== "ai-story" && matchesFilters(p, state);
  });
  const visiblePassages = filtered.filter((p) => {
    if (collection === "library") return true;
    if (state.savedOnly && !state.savedPassageIds.includes(p.id)) return false;
    if (state.listStatusFilter === "all") return true;
    const progress = getPassageProgress(p, state.answers);
    if (state.listStatusFilter === "needs-review") return progress.status === "done" && progress.correct < progress.total;
    return progress.status === state.listStatusFilter;
  });

  async function openPassage(passage: ReadingPassage) {
    if (collection === "library") setLibraryTab(passage.book === "ai-story" ? "stories" : "jlpt");
    await mutate({
      currentPassageId: passage.id,
      lastPassageId: passage.id,
      answers: { ...state!.answers, [passage.id]: state!.answers[passage.id] ?? passage.questions.map(() => null) },
      // Reset the session-level fallback when switching passages; per-passage
      // display choices are retained separately in passageViewOptions.
      showFurigana: false,
      showTranslation: false,
      showStudyNote: false,
      resultsRevealed: getPassageProgress(passage, state!.answers).status === "done",
    });
  }

  if (passage) {
    if (collection === "library" && libraryTab === "jlpt" && JLPT_LEISURE_BY_ID.has(passage.id)) {
      return (
        <JlptLeisureSlideReader
          passage={passage}
          state={state}
          mutate={mutate}
          onBack={() => mutate({ currentPassageId: null })}
        />
      );
    }
    return (
      <PassageView
        passage={passage}
        state={state}
        mutate={mutate}
        onOpenVocab={onOpenVocab}
        onOpenBunpo={onOpenBunpo}
        visiblePassages={visiblePassages}
        openPassage={openPassage}
        collection={collection}
        savedOnlyView={savedOnlyView}
      />
    );
  }

  return (
    <ListView
      state={state}
      mutate={mutate}
      error={error}
      setError={setError}
      filtered={filtered}
      visiblePassages={visiblePassages}
      openPassage={openPassage}
      collection={collection}
      libraryTab={libraryTab}
      setLibraryTab={setLibraryTab}
      leisureLevel={leisureLevel}
      setLeisureLevel={setLeisureLevel}
      leisureLength={leisureLength}
      setLeisureLength={setLeisureLength}
      leisureExamId={leisureExamId}
      setLeisureExamId={setLeisureExamId}
      savedOnlyView={savedOnlyView}
      onOpenSavedStories={onOpenSavedStories}
      onOpenStories={onOpenStories}
      onOpenExamTips={onOpenExamTips}
    />
  );
}

function JlptLeisureSlideReader({
  passage,
  state,
  mutate,
  onBack,
}: {
  passage: ReadingPassage;
  state: ReadingViewerState;
  mutate: (partial: Partial<ReadingViewerState>) => Promise<void>;
  onBack: () => void;
}) {
  const entry = JLPT_LEISURE_BY_ID.get(passage.id)!;
  const skippedLeadingSentences = entry.skipLeadingSentences ?? 0;
  const readerBody = useMemo(() => {
    const groups = splitBodyIntoSentences(passage.body).slice(skippedLeadingSentences);
    const body = groups.flatMap((group) => group);
    if (body.length) body[0] = { ...body[0], paragraphStart: true };
    return body;
  }, [passage.id, skippedLeadingSentences]);
  const readerPassage = useMemo(() => ({
    ...passage,
    body: readerBody,
    sentencesVi: passage.sentencesVi?.slice(skippedLeadingSentences),
    underlinedPhrases: undefined,
    underlinedRanges: undefined,
  }), [passage.id, readerBody, skippedLeadingSentences]);
  const ranges = useMemo(() => leisurePageRanges(readerBody), [passage.id, readerBody]);
  const savedPage = state.leisurePageByPassage[passage.id] ?? 0;
  const pageIndex = ranges.length ? Math.min(savedPage, ranges.length - 1) : 0;
  const range = ranges[pageIndex] ?? { start: 0, end: 0 };
  const scene = [...entry.scenes].reverse().find((item) => item.startSentence <= range.start + skippedLeadingSentences) ?? entry.scenes[0];
  const isComplete = state.leisureCompletedPassageIds.includes(passage.id);
  const viewOptions = state.passageViewOptions[passage.id] ?? {};
  const showFurigana = viewOptions.showFurigana ?? state.showFurigana;
  const showTranslation = viewOptions.showTranslation ?? state.showTranslation;
  const speechSentences = useMemo(
    () => splitBodyIntoSentences(readerBody).map((segments) => segments.map((segment) => segment.text).join("").replace(/\s+/gu, " ").trim()),
    [readerBody],
  );
  const [speechAvailable, setSpeechAvailable] = useState(hasJapaneseVoice);
  const [speechStatus, setSpeechStatus] = useState<"idle" | "playing" | "paused">("idle");
  const [activeSpeechSentence, setActiveSpeechSentence] = useState(-1);
  const [speechRate, setSpeechRate] = useState(0.9);
  const [speechError, setSpeechError] = useState<string | undefined>();
  const [showQuestions, setShowQuestions] = useState(false);
  const speechRunRef = useRef(0);
  const speechRateRef = useRef(speechRate);
  speechRateRef.current = speechRate;
  const hasInlineTranslation = Boolean(passage.sentencesVi?.length);

  useEffect(() => {
    const refreshVoices = () => setSpeechAvailable(hasJapaneseVoice());
    refreshVoices();
    return onVoicesChanged(refreshVoices);
  }, []);

  useEffect(() => {
    speechRunRef.current++;
    window.speechSynthesis?.cancel();
    setSpeechStatus("idle");
    setActiveSpeechSentence(-1);
    setSpeechError(undefined);
    setShowQuestions(false);
  }, [passage.id]);

  useEffect(() => () => {
    speechRunRef.current++;
    window.speechSynthesis?.cancel();
  }, []);

  function speakSentenceAt(index: number, runId: number, endIndex: number) {
    if (runId !== speechRunRef.current) return;
    const text = speechSentences[index];
    if (!text) {
      setSpeechStatus("idle");
      setActiveSpeechSentence(-1);
      return;
    }
    setActiveSpeechSentence(index);
    const started = speakJapanese(text, {
      rate: speechRateRef.current,
      onEnd: () => {
        if (runId !== speechRunRef.current) return;
        if (index + 1 < endIndex) speakSentenceAt(index + 1, runId, endIndex);
        else {
          setSpeechStatus("idle");
          setActiveSpeechSentence(-1);
        }
      },
      onError: () => {
        if (runId !== speechRunRef.current) return;
        speechRunRef.current++;
        setSpeechStatus("idle");
        setActiveSpeechSentence(-1);
        setSpeechError("Trình duyệt không thể phát giọng đọc tiếng Nhật lúc này.");
      },
    });
    if (!started) {
      setSpeechStatus("idle");
      setActiveSpeechSentence(-1);
      setSpeechError("Trình duyệt không hỗ trợ đọc văn bản trên thiết bị này.");
    }
  }

  function toggleSpeech() {
    if (!speechAvailable || !speechSentences.length) return;
    if (speechStatus === "playing") {
      window.speechSynthesis?.pause();
      setSpeechStatus("paused");
      return;
    }
    if (speechStatus === "paused") {
      window.speechSynthesis?.resume();
      setSpeechStatus("playing");
      return;
    }
    const runId = ++speechRunRef.current;
    window.speechSynthesis?.cancel();
    setSpeechError(undefined);
    setSpeechStatus("playing");
    speakSentenceAt(range.start, runId, range.end);
  }

  function stopSpeech() {
    speechRunRef.current++;
    window.speechSynthesis?.cancel();
    setSpeechStatus("idle");
    setActiveSpeechSentence(-1);
  }

  function updateViewOptions(partial: Partial<ReadingPassageViewOptions>) {
    void mutate({
      passageViewOptions: {
        ...state.passageViewOptions,
        [passage.id]: { ...viewOptions, ...partial },
      },
    });
  }

  function changePage(nextPage: number) {
    stopSpeech();
    void mutate({ leisurePageByPassage: { ...state.leisurePageByPassage, [passage.id]: nextPage } });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function openQuestions() {
    stopSpeech();
    await mutate({ leisureCompletedPassageIds: [...new Set([...state.leisureCompletedPassageIds, passage.id])] });
    setShowQuestions(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const softButton = "flex h-11 min-w-11 items-center justify-center rounded-xl border border-neutral-200 bg-white text-neutral-700 shadow-sm transition-colors hover:bg-neutral-50 disabled:opacity-35";

  if (showQuestions) {
    return (
      <JlptLeisureQuestionStage
        passage={passage}
        state={state}
        mutate={mutate}
        onBackToReading={() => setShowQuestions(false)}
        onBackToLibrary={onBack}
      />
    );
  }

  return (
    <div className="mx-auto min-h-[calc(100dvh-4.5rem)] max-w-4xl px-2.5 py-2 md:px-8 md:py-6">
      <div className="sticky top-0 z-20 -mx-2.5 flex items-center gap-3 bg-white/95 px-2.5 py-2 backdrop-blur md:static md:mx-0 md:px-0">
        <button type="button" onClick={onBack} aria-label="Quay lại thư viện đọc" className={softButton}>
          <ChevronLeft size={20} />
        </button>
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-center justify-between gap-2 text-xs font-semibold text-neutral-600">
            <span className="truncate">{entry.title}</span>
            <span className="shrink-0">{pageIndex + 1} / {ranges.length}</span>
          </div>
          <div
            role="progressbar"
            aria-label="Tiến độ bài đọc"
            aria-valuemin={0}
            aria-valuemax={ranges.length}
            aria-valuenow={pageIndex + 1}
            className="h-2 overflow-hidden rounded-full bg-neutral-200"
          >
            <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${ranges.length ? ((pageIndex + 1) / ranges.length) * 100 : 0}%` }} />
          </div>
        </div>
        <span className="rounded-full bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700">{passage.level}</span>
      </div>

      <main className="mx-auto max-w-3xl pb-[calc(8.5rem+env(safe-area-inset-bottom))] md:pb-24">
        <div className="mb-2 mt-2 flex items-center justify-between gap-2 text-xs text-neutral-500 md:mt-4">
          <span>{passage.examLabel} · {timelineLabel(passage)}</span>
          {isComplete ? <span className="font-semibold text-emerald-700">Đã đọc</span> : null}
        </div>

        <article className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm">
          {scene ? (
            <img
              src={`${import.meta.env.BASE_URL}${scene.path}`}
              alt={scene.alt}
              className="aspect-video w-full bg-neutral-100 object-cover"
            />
          ) : null}
          <div className="px-4 py-4 text-lg leading-[1.7] text-neutral-900 md:px-8 md:py-7 md:text-2xl md:leading-[1.9]">
            <AiStoryReadingBody
              passage={readerPassage}
              showFurigana={showFurigana}
              showTranslation={showTranslation && hasInlineTranslation}
              referenceTerms={[]}
              highlightReferences={false}
              activeSentenceIndex={activeSpeechSentence}
              sentenceRange={range}
              canSpeak={speechAvailable}
              onSpeakSentence={(index) => {
                const runId = ++speechRunRef.current;
                window.speechSynthesis?.cancel();
                setSpeechStatus("playing");
                setSpeechError(undefined);
                speakSentenceAt(index, runId, range.end);
              }}
            />
          </div>
        </article>

        {pageIndex >= ranges.length - 1 ? (
          <button type="button" onClick={() => void openQuestions()} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-rose-600 px-4 py-3 text-sm font-bold text-white shadow-sm transition-colors hover:bg-rose-700">
            Xem câu hỏi ({passage.questions.length}) <ChevronRight size={17} />
          </button>
        ) : null}

        {showTranslation && !hasInlineTranslation ? (
          <section className="mt-3 max-h-64 overflow-y-auto rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-relaxed text-amber-900" aria-label="Bản dịch toàn bài">
            <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-amber-700">Bản dịch toàn bài</h2>
            {passage.translationVi.split("\n").map((line, index, lines) => (
              <span key={index}>{line}{index < lines.length - 1 ? <br /> : null}</span>
            ))}
          </section>
        ) : null}

        {speechError ? <p className="mt-2 text-center text-xs text-rose-600">{speechError}</p> : null}
      </main>

      <div className="fixed left-1/2 bottom-[calc(4.25rem+env(safe-area-inset-bottom))] z-20 w-max max-w-[calc(100vw-1rem)] -translate-x-1/2 md:bottom-5 md:left-[calc(50%+var(--sidebar-center-offset,7.5rem))]">
        <div className="flex max-w-full items-center justify-center gap-1.5 rounded-2xl border border-neutral-200 bg-white/95 p-2 shadow-xl backdrop-blur">
          <button
            type="button"
            aria-label={showFurigana ? "Ẩn furigana" : "Hiện furigana"}
            aria-pressed={showFurigana}
            title="Furigana"
            onClick={() => updateViewOptions({ showFurigana: !showFurigana })}
            className={`${softButton} ${showFurigana ? "border-blue-300 text-blue-700" : ""}`}
          ><span className="text-sm font-bold">あ</span></button>
          <button
            type="button"
            aria-label={showTranslation ? "Ẩn bản dịch" : "Hiện bản dịch"}
            aria-pressed={showTranslation}
            title="Bản dịch"
            onClick={() => updateViewOptions({ showTranslation: !showTranslation })}
            className={`${softButton} ${showTranslation ? "border-blue-300 text-blue-700" : ""}`}
          ><Languages size={19} /></button>
          <button
            type="button"
            aria-label={speechStatus === "playing" ? "Tạm dừng đọc" : speechStatus === "paused" ? "Tiếp tục đọc" : "Nghe trang"}
            onClick={toggleSpeech}
            disabled={!speechAvailable}
            className={`${softButton} border-rose-300 text-rose-600 disabled:cursor-not-allowed`}
          >{speechStatus === "playing" ? <Pause size={19} /> : <Play size={19} />}</button>
          <select
            aria-label="Tốc độ giọng đọc"
            value={speechRate}
            onChange={(event) => setSpeechRate(Number(event.target.value))}
            className="h-11 max-w-[4.25rem] rounded-xl border border-neutral-200 bg-white px-1 text-center text-xs font-semibold text-neutral-700"
          >
            {[0.75, 0.9, 1, 1.1, 1.25].map((rate) => <option key={rate} value={rate}>{rate}×</option>)}
          </select>
          <button type="button" aria-label="Trang trước" disabled={pageIndex === 0} onClick={() => changePage(Math.max(0, pageIndex - 1))} className={softButton}>
            <ChevronLeft size={20} />
          </button>
          <button
            type="button"
            aria-label={pageIndex >= ranges.length - 1 ? "Xem câu hỏi" : "Trang tiếp"}
            onClick={() => {
              if (pageIndex >= ranges.length - 1) void openQuestions();
              else changePage(pageIndex + 1);
            }}
            className="flex h-11 min-w-11 items-center justify-center rounded-xl border border-neutral-900 bg-neutral-900 text-white shadow-sm transition-colors hover:bg-neutral-700 disabled:cursor-default disabled:opacity-60"
          >{pageIndex >= ranges.length - 1 ? <CheckCircle2 size={19} /> : <ChevronRight size={20} />}</button>
        </div>
      </div>
    </div>
  );
}

function JlptLeisureQuestionStage({
  passage,
  state,
  mutate,
  onBackToReading,
  onBackToLibrary,
}: {
  passage: ReadingPassage;
  state: ReadingViewerState;
  mutate: (partial: Partial<ReadingViewerState>) => Promise<void>;
  onBackToReading: () => void;
  onBackToLibrary: () => void;
}) {
  const answers = state.answers[passage.id] ?? passage.questions.map(() => null);
  const answeredCount = answers.filter((answer) => answer !== null).length;
  const correctCount = passage.questions.filter((question, index) => answers[index] === question.correctIndex).length;
  const allAnswered = answeredCount === passage.questions.length;
  const viewOptions = state.passageViewOptions[passage.id] ?? {};
  const showFurigana = viewOptions.showFurigana ?? state.showFurigana;
  const visibleQuestionTranslations = viewOptions.visibleQuestionTranslations ?? {};

  function updateViewOptions(partial: Partial<ReadingPassageViewOptions>) {
    void mutate({
      passageViewOptions: {
        ...state.passageViewOptions,
        [passage.id]: { ...viewOptions, ...partial },
      },
    });
  }

  return (
    <div className="mx-auto max-w-3xl px-2.5 py-3 md:px-8 md:py-6">
      <div className="flex items-center gap-3">
        <button type="button" onClick={onBackToReading} aria-label="Quay lại bài đọc" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-neutral-200 bg-white text-neutral-700 shadow-sm hover:bg-neutral-50">
          <ChevronLeft size={20} />
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <h1 className="truncate text-lg font-bold text-neutral-900">Câu hỏi đọc hiểu</h1>
            <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700">Đã đọc xong</span>
          </div>
          <p className="truncate text-sm text-neutral-500">{JLPT_LEISURE_BY_ID.get(passage.id)?.titleJa ?? passage.title}</p>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-3 rounded-xl bg-neutral-100 p-3 text-sm">
        <span className="font-semibold">{passage.examLabel}</span>
        <span className="text-neutral-400">·</span>
        <span>{answeredCount}/{passage.questions.length} câu đã trả lời</span>
        <span className="ml-auto rounded-full bg-white px-2 py-1 text-xs font-semibold text-neutral-600">{passage.level}</span>
      </div>

      <div className="mt-4 flex flex-col gap-4">
        {passage.questions.map((question, questionIndex) => {
          const answered = answers[questionIndex];
          const showQuestionTranslation = visibleQuestionTranslations[questionIndex] === true;
          return (
            <Card key={questionIndex} className="gap-0 rounded-2xl border-neutral-200 p-4 ring-0 md:p-5">
              <div className="flex flex-col items-start gap-2">
                <div className="whitespace-pre-line font-semibold text-neutral-800">
                  Câu {question.sourceNumber ?? questionIndex + 1}: {renderAnnotatedText(
                    question.question,
                    question.questionFurigana,
                    showFurigana,
                    findUniqueTextRanges(question.question, question.underline ? [question.underline] : []),
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {question.questionVi?.trim() ? (
                    <button
                      type="button"
                      onClick={() => updateViewOptions({ visibleQuestionTranslations: { ...visibleQuestionTranslations, [questionIndex]: !showQuestionTranslation } })}
                      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${showQuestionTranslation ? "border-sky-200 bg-sky-50 text-sky-700" : "border-neutral-200 text-neutral-500 hover:bg-sky-50"}`}
                    ><Languages size={13} /> {showQuestionTranslation ? "Ẩn dịch câu hỏi" : "Xem dịch câu hỏi"}</button>
                  ) : null}
                  <StudyFeedbackButton
                    entityId={`study:reading:${readingQuestionId(passage.id, questionIndex)}`}
                    snapshot={{
                      title: `Câu ${question.sourceNumber ?? questionIndex + 1}: ${question.question}`,
                      context: `${passage.title}${passage.examLabel ? ` · ${passage.examLabel}` : ""}`,
                      currentValue: state.resultsRevealed
                        ? question.correctIndex >= 0 && question.correctIndex < question.options.length
                          ? `Phương án ${question.correctIndex + 1}: ${question.options[question.correctIndex]}`
                          : "Chưa có đáp án trong dữ liệu"
                        : "Đáp án sẽ hiện sau khi hoàn tất lượt luyện",
                      sources: [BOOK_LABELS[passage.book], passage.examLabel, passage.source].filter((source): source is string => Boolean(source)),
                    }}
                  />
                </div>
              </div>
              {showQuestionTranslation && question.questionVi?.trim() ? <div className="mt-2 whitespace-pre-line rounded-lg bg-sky-50 px-3 py-2 text-sm text-sky-800">{question.questionVi}</div> : null}

              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {question.options.map((option, optionIndex) => {
                  let optionClass = "border-neutral-200 hover:bg-neutral-50";
                  if (state.resultsRevealed && answered !== null) {
                    if (optionIndex === question.correctIndex) optionClass = "border-emerald-300 bg-emerald-50 text-emerald-700";
                    else if (optionIndex === answered) optionClass = "border-rose-300 bg-rose-50 text-rose-700";
                    else optionClass = "border-neutral-200 opacity-50";
                  } else if (answered !== null && optionIndex === answered) optionClass = "border-neutral-400 bg-neutral-100 text-neutral-700";

                  return (
                    <button
                      key={optionIndex}
                      type="button"
                      disabled={answered !== null}
                      onClick={() => {
                        void recordAnswer(readingQuestionId(passage.id, questionIndex), optionIndex === question.correctIndex, "answer", ["answer"]);
                        const nextAnswers = [...answers];
                        nextAnswers[questionIndex] = optionIndex;
                        void mutate({ answers: { ...state.answers, [passage.id]: nextAnswers } });
                      }}
                      className={`rounded-lg border px-3 py-2 text-left text-sm ${optionClass}`}
                    >
                      {renderAnnotatedText(option, question.optionsFurigana?.[optionIndex] ?? undefined, showFurigana)}
                      {state.resultsRevealed && answered !== null ? <span className="mt-0.5 block text-xs text-neutral-400">{question.optionsVi[optionIndex]}</span> : null}
                    </button>
                  );
                })}
              </div>

              {state.resultsRevealed && answered !== null ? (
                <div className="mt-3 space-y-3 border-t border-neutral-100 pt-3 text-sm">
                  <QuestionExplanationBlock explanation={question.explanation} correctIndex={question.correctIndex} showMissing className="space-y-3" />
                  {question.answerSourceNote ? <div className="rounded-lg bg-amber-50 p-2 text-xs leading-relaxed text-amber-700"><span className="font-semibold">Đối chiếu PDF: </span>{question.answerSourceNote}</div> : null}
                </div>
              ) : null}
            </Card>
          );
        })}
      </div>

      {state.resultsRevealed && allAnswered ? (
        <div className={`mt-4 rounded-xl p-3 text-center text-sm font-bold ${correctCount === passage.questions.length ? "bg-emerald-50 text-emerald-700" : "bg-sky-50 text-sky-700"}`}>
          Đúng {correctCount}/{passage.questions.length} câu ({Math.round((correctCount / passage.questions.length) * 100)}%)
        </div>
      ) : null}

      {answeredCount > 0 ? <Button className="mt-4 w-full" onClick={() => void mutate({ resultsRevealed: !state.resultsRevealed })}>
        <CheckCircle2 size={16} /> {state.resultsRevealed ? "Ẩn kết quả" : "Kiểm tra kết quả"}
      </Button> : null}

      <div className="mt-4 grid grid-cols-2 gap-2">
        <Button variant="outline" onClick={onBackToReading}>Đọc lại slide</Button>
        <Button variant="outline" onClick={onBackToLibrary}>Về thư viện</Button>
      </div>
    </div>
  );
}

function ListView({
  state,
  mutate,
  error,
  setError,
  filtered,
  visiblePassages,
  openPassage,
  collection,
  libraryTab,
  setLibraryTab,
  leisureLevel,
  setLeisureLevel,
  leisureLength,
  setLeisureLength,
  leisureExamId,
  setLeisureExamId,
  savedOnlyView,
  onOpenSavedStories,
  onOpenStories,
  onOpenExamTips,
}: {
  state: ReadingViewerState;
  mutate: (partial: Partial<ReadingViewerState>) => Promise<void>;
  error?: string;
  setError: (e?: string) => void;
  filtered: ReadingPassage[];
  visiblePassages: ReadingPassage[];
  openPassage: (passage: ReadingPassage) => Promise<void>;
  collection: "all" | "news" | "stories" | "library";
  libraryTab: "stories" | "jlpt";
  setLibraryTab: (tab: "stories" | "jlpt") => void;
  leisureLevel: "all" | "N1" | "N3";
  setLeisureLevel: (level: "all" | "N1" | "N3") => void;
  leisureLength: "all" | ReadingLength;
  setLeisureLength: (length: "all" | ReadingLength) => void;
  leisureExamId: string;
  setLeisureExamId: (examId: string) => void;
  savedOnlyView: boolean;
  onOpenSavedStories?: () => void;
  onOpenStories?: () => void;
  onOpenExamTips?: () => void;
}) {
  const confirm = useConfirm();
  const [filterOpen, setFilterOpen] = useState(false);
  const statusCounts = filtered.reduce(
    (acc, p) => {
      if (p.questions.length === 0) return acc;
      const progress = getPassageProgress(p, state.answers);
      acc[progress.status]++;
      if (progress.status === "done" && progress.correct < progress.total) acc.needsReview++;
      return acc;
    },
    { done: 0, "in-progress": 0, "not-started": 0, needsReview: 0 } as Record<"done" | "in-progress" | "not-started", number> & {
      needsReview: number;
    },
  );

  const allLevelsChecked = AVAILABLE_LEVELS.length <= 1 || state.selectedLevels.length === AVAILABLE_LEVELS.length;
  const regularBooks = AVAILABLE_BOOKS.filter((book) => !isReadingExamBook(book));
  const selectedRegularBooks = state.selectedBooks.filter((book) => !isReadingExamBook(book));
  const allBooksChecked = collection !== "all" || (state.selectedBooks.length === AVAILABLE_BOOKS.length && state.selectedExamIds.length === AVAILABLE_READING_EXAMS.length);
  const selectedJlptExamIds = state.selectedExamIds.filter((id) => readingExamIdsForBook("jlpt-exam").includes(id));
  const selectedN3SetIds = state.selectedExamIds.filter((id) => readingExamIdsForBook("de-n3").includes(id));
  const sourceSummary = [
    selectedRegularBooks.length === 1 ? BOOK_LABELS[selectedRegularBooks[0]] : selectedRegularBooks.length ? `${selectedRegularBooks.length} nguồn sách` : "",
    selectedJlptExamIds.length === AVAILABLE_JLPT_EXAMS.length && selectedJlptExamIds.length ? "Đề JLPT" : selectedJlptExamIds.length === 1 ? `JLPT ${AVAILABLE_JLPT_EXAMS.find((exam) => exam.id === selectedJlptExamIds[0])?.label ?? "1 kỳ"}` : selectedJlptExamIds.length ? `${selectedJlptExamIds.length} kỳ JLPT` : "",
    selectedN3SetIds.length === AVAILABLE_N3_SETS.length && selectedN3SetIds.length ? "10 đề N3" : selectedN3SetIds.length === 1 ? `10 đề N3 · ${AVAILABLE_N3_SETS.find((exam) => exam.id === selectedN3SetIds[0])?.label ?? "1 đề"}` : selectedN3SetIds.length ? `${selectedN3SetIds.length} đề N3` : "",
  ].filter(Boolean).join(" · ");
  const allLengthsChecked = state.selectedLengths.length === AVAILABLE_LENGTHS.length;
  const availableTopics = collection === "stories" ? [] : collection === "news"
    ? AVAILABLE_TOPICS.filter((topic) => ALL_READING.some((p) => p.book === "news" && p.topic === topic))
    : AVAILABLE_TOPICS;
  const allTopicsChecked = availableTopics.every((topic) => state.selectedTopics.includes(topic));
  const activeSelectedTopics = state.selectedTopics.filter((topic) =>
    ALL_READING.some((p) => p.topic === topic && (collection === "news" ? p.book === "news" : matchesReadingSources(p, state.selectedBooks, state.selectedExamIds))),
  );
  const topicFilterActive = (collection === "news" || state.selectedBooks.some((book) => book === "jlpt-exam" || book === "news" || book === "custom")) && !allTopicsChecked;
  const filterCount =
    (allLevelsChecked ? 0 : state.selectedLevels.length) +
    (allBooksChecked ? 0 : 1) +
    (allLengthsChecked ? 0 : state.selectedLengths.length) +
    (topicFilterActive ? 1 : 0) +
    (state.savedOnly ? 1 : 0);
  const libraryShowsJlpt = collection === "library" && libraryTab === "jlpt";
  const leisureCandidates = ALL_READING.filter((p) => JLPT_LEISURE_BY_ID.has(p.id));
  const leisureExamOptions = [...new Map(leisureCandidates.map((p) => [p.examId!, p.examLabel ?? p.examId!])).entries()];

  async function handleStart() {
    const randomPool = collection === "stories" || collection === "library"
      ? (visiblePassages.length ? visiblePassages : filtered)
      : null;
    const passage = randomPool
      ? randomPool[Math.floor(Math.random() * randomPool.length)] ?? null
      : pickRandomPassage(state.selectedLevels, state.selectedLengths, collection === "news" ? ["news"] : state.selectedBooks, undefined, state.selectedTopics, state.selectedExamIds);
    if (!passage) {
      setError(savedOnlyView ? "Chưa có truyện nào được lưu." : collection === "news" ? "Không có bài báo nào khớp bộ lọc này." : collection === "stories" || (collection === "library" && libraryTab === "stories") ? "Chưa có truyện nào." : "Không có bài đọc nào khớp bộ lọc này.");
      return;
    }
    await openPassage(passage);
  }

  const lastPassageCandidate = state.lastPassageId ? findReadingById(state.lastPassageId) : undefined;
  const lastPassage = lastPassageCandidate && isInCollection(lastPassageCandidate, collection) &&
    (collection !== "library" || (libraryTab === "stories" ? lastPassageCandidate.book === "ai-story" : JLPT_LEISURE_BY_ID.has(lastPassageCandidate.id))) &&
    (!savedOnlyView || state.savedPassageIds.includes(lastPassageCandidate.id)) ? lastPassageCandidate : undefined;
  const savedStoryCount = state.savedPassageIds.filter((id) => ALL_READING.some((p) => p.id === id && p.book === "ai-story")).length;

  async function handleResetRow(passage: ReadingPassage) {
    if (!(await confirm(`Làm lại "${passage.title}" từ đầu? Kết quả đã trả lời sẽ bị xoá.`))) return;
    await mutate(resetPassageAnswers(state, passage.id));
  }

  return (
    <div className="mx-auto max-w-6xl px-2.5 py-2 md:px-8 md:py-6">
      <PageHeader title={savedOnlyView ? "Truyện đã lưu" : collection === "news" ? "Đọc báo" : collection === "stories" ? "Truyện AI" : collection === "library" ? "Thư viện đọc" : "Luyện đọc"} subtitle={`${filtered.length} ${savedOnlyView ? "truyện" : "bài"}`} icon={{ img: "icon-reading.png", bg: "#ede9fe" }} action={collection === "all" && !savedOnlyView && onOpenExamTips ? <Button size="sm" variant="outline" onClick={onOpenExamTips}><Lightbulb size={14} /> Mẹo đọc N3</Button> : undefined} />

      {collection === "library" ? (
        <div className="mt-4 flex gap-2 rounded-2xl bg-neutral-100 p-1" role="tablist" aria-label="Loại bài đọc">
          {([{ id: "stories", label: "Truyện AI" }, { id: "jlpt", label: "Bài đọc JLPT" }] as const).map((tab) => (
            <button key={tab.id} role="tab" aria-selected={libraryTab === tab.id} onClick={() => { setLibraryTab(tab.id); mutate({ listStatusFilter: "all", savedOnly: false }); }} className={`flex-1 rounded-xl px-3 py-2.5 text-sm font-semibold ${libraryTab === tab.id ? "bg-white text-rose-600 shadow-sm" : "text-neutral-500"}`}>
              {tab.label}
            </button>
          ))}
        </div>
      ) : null}

      {libraryShowsJlpt ? (
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
          <Select
            items={[{ value: "all", label: "Thể loại" }, { value: "N1", label: "N1" }, { value: "N3", label: "N3" }]}
            value={leisureLevel}
            onValueChange={(value) => value !== null && setLeisureLevel(value as "all" | "N1" | "N3")}
          >
            <SelectTrigger aria-label="Thể loại" className="h-10 w-full rounded-xl bg-white px-3 text-sm font-medium shadow-none">
              <SelectValue placeholder="Thể loại" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Thể loại</SelectItem><SelectItem value="N1">N1</SelectItem><SelectItem value="N3">N3</SelectItem>
            </SelectContent>
          </Select>
          <Select
            items={[
              { value: "all", label: "Tất cả độ dài" },
              ...(["short", "medium", "long"] as const).map((length) => ({ value: length, label: LENGTH_LABELS[length] })),
            ]}
            value={leisureLength}
            onValueChange={(value) => value !== null && setLeisureLength(value as "all" | ReadingLength)}
          >
            <SelectTrigger aria-label="Độ dài bài đọc" className="h-10 w-full rounded-xl bg-white px-3 text-sm font-medium shadow-none">
              <SelectValue placeholder="Độ dài bài đọc" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tất cả độ dài</SelectItem>{(["short", "medium", "long"] as const).map((length) => <SelectItem key={length} value={length}>{LENGTH_LABELS[length]}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select
            items={[{ value: "all", label: "Tất cả kỳ thi" }, ...leisureExamOptions.map(([id, label]) => ({ value: id, label }))]}
            value={leisureExamId}
            onValueChange={(value) => value !== null && setLeisureExamId(value)}
          >
            <SelectTrigger aria-label="Kỳ thi" className="h-10 w-full rounded-xl bg-white px-3 text-sm font-medium shadow-none">
              <SelectValue placeholder="Tất cả kỳ thi" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tất cả kỳ thi</SelectItem>{leisureExamOptions.map(([id, label]) => <SelectItem key={id} value={id}>{label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      ) : null}

      {collection === "news" && !ALL_READING.some((p) => p.book === "news") ? (
        <p className="mt-4 rounded-xl border border-neutral-200 bg-white p-4 text-sm leading-relaxed text-neutral-600">
          Chưa có bài báo nào được đưa vào thư viện. Khi có bài được biên tập và xuất bản, chúng sẽ xuất hiện tại đây.
        </p>
      ) : null}
      {(collection === "stories" || (collection === "library" && libraryTab === "stories")) && filtered.length === 0 ? (
        <p className="mt-4 rounded-xl border border-neutral-200 bg-white p-4 text-sm leading-relaxed text-neutral-600">
          {savedOnlyView ? "Chưa có truyện nào được lưu. Mở Truyện AI rồi bấm Lưu bài để giữ truyện ở đây." : "Chưa có truyện AI nào được thêm vào thư viện."}
        </p>
      ) : null}

      {!savedOnlyView && collection !== "library" ? (
        <div className="mt-4 grid grid-cols-2 gap-3">
          <StatCard
            label="Đã hoàn thành"
            value={statusCounts.done}
            tone="emerald"
            active={state.listStatusFilter === "done"}
            onClick={() => mutate({ listStatusFilter: state.listStatusFilter === "done" ? "all" : "done" })}
          />
          <StatCard
            label="Đang làm dở"
            value={statusCounts["in-progress"]}
            tone="amber"
            active={state.listStatusFilter === "in-progress"}
            onClick={() => mutate({ listStatusFilter: state.listStatusFilter === "in-progress" ? "all" : "in-progress" })}
          />
          <StatCard
            label="Chưa làm"
            value={statusCounts["not-started"]}
            active={state.listStatusFilter === "not-started"}
            onClick={() => mutate({ listStatusFilter: state.listStatusFilter === "not-started" ? "all" : "not-started" })}
          />
          <StatCard
            label="Cần ôn lại"
            value={statusCounts.needsReview}
            tone="rose"
            active={state.listStatusFilter === "needs-review"}
            onClick={() => mutate({ listStatusFilter: state.listStatusFilter === "needs-review" ? "all" : "needs-review" })}
          />
        </div>
      ) : null}

      <FilterBar>
        {collection === "all" || collection === "news" ? <FilterTrigger count={filterCount} onClick={() => setFilterOpen(true)} /> : null}
        {lastPassage ? <Button size="sm" variant="outline" title={lastPassage.title} onClick={() => openPassage(lastPassage)}>{collection === "news" ? "Tiếp tục đọc báo" : collection === "stories" ? (savedOnlyView ? "Đọc tiếp truyện đã lưu" : "Đọc tiếp truyện") : "Tiếp tục đọc"}</Button> : null}
        {collection === "stories" || (collection === "library" && libraryTab === "stories") ? (
          savedOnlyView ? (
            <Button size="sm" variant="outline" onClick={onOpenStories}>Tất cả truyện</Button>
          ) : (
            <Button size="sm" variant="outline" onClick={onOpenSavedStories}>
              <BookmarkCheck size={14} /> Truyện đã lưu ({savedStoryCount})
            </Button>
          )
        ) : (
          <Button size="sm" variant={state.savedOnly ? "default" : "outline"} onClick={() => mutate({ savedOnly: !state.savedOnly })}>
            <BookmarkCheck size={14} /> Đã lưu ({state.savedPassageIds.length})
          </Button>
        )}
        {!savedOnlyView ? <Button size="sm" variant="outline" onClick={handleStart}>
          <Shuffle size={14} /> {collection === "news" ? "Random bài báo" : collection === "stories" || (collection === "library" && libraryTab === "stories") ? "Random truyện" : "Random bài đọc"}
        </Button> : null}
      </FilterBar>

      {collection === "all" || collection === "news" ? <ActiveFilters
        chips={[
          ...(state.savedOnly ? [{ key: "saved", label: "Chỉ bài đã lưu", onRemove: () => mutate({ savedOnly: false }) }] : []),
          ...(allLevelsChecked
            ? []
            : state.selectedLevels.map((level) => ({
                key: `level-${level}`,
                label: level,
                onRemove: () => {
                  const next = state.selectedLevels.filter((l) => l !== level);
                  if (next.length === 0) return;
                  mutate({ selectedLevels: next });
                },
              }))),
          ...(allBooksChecked
            ? []
            : [{
              key: "sources",
              label: `Nguồn: ${sourceSummary}`,
              onRemove: () => {
                mutate({ selectedBooks: [...AVAILABLE_BOOKS], selectedExamIds: AVAILABLE_READING_EXAMS.map((exam) => exam.id) });
              },
            }]),
          ...(allLengthsChecked
            ? []
            : state.selectedLengths.map((length) => ({
                key: `length-${length}`,
                label: LENGTH_LABELS[length],
                onRemove: () => {
                  const next = state.selectedLengths.filter((l) => l !== length);
                  if (next.length === 0) return;
                  mutate({ selectedLengths: next });
                },
              }))),
          ...(!topicFilterActive || activeSelectedTopics.length === 0
            ? []
            : activeSelectedTopics.map((topic) => ({
                key: `topic-${topic}`,
                label: topic,
                onRemove: () => {
                  const next = state.selectedTopics.filter((item) => item !== topic);
                  if (next.length === 0) return;
                  mutate({ selectedTopics: next });
                },
              }))),
        ]}
      /> : null}

      {error ? <p className="mt-3 rounded-lg bg-rose-50 p-3 text-sm text-rose-600">{error}</p> : null}

      <FilterSheet
        open={filterOpen && (collection === "all" || collection === "news")}
        onClose={() => setFilterOpen(false)}
        title={collection === "news" ? "Bộ lọc đọc báo" : "Bộ lọc luyện đọc"}
        onReset={() => mutate({ selectedLevels: [...AVAILABLE_LEVELS], ...(collection === "news" ? {} : { selectedBooks: [...AVAILABLE_BOOKS], selectedExamIds: initialReadingExamIds() }), selectedLengths: [...AVAILABLE_LENGTHS], selectedTopics: [...AVAILABLE_TOPICS] })}
      >
        {AVAILABLE_LEVELS.length > 1 ? (
          <FilterGroup title="Cấp độ">
            {AVAILABLE_LEVELS.map((level) => {
              const checked = state.selectedLevels.includes(level);
              const count = ALL_READING.filter(
                (p) => p.level === level && state.selectedLengths.includes(p.length) && (collection === "news" ? p.book === "news" : matchesReadingSources(p, state.selectedBooks, state.selectedExamIds)),
              ).length;
              return (
                <FilterChipOption
                  key={level}
                  label={`${level} (${count})`}
                  active={checked}
                  onClick={() => {
                    const next = checked ? state.selectedLevels.filter((l) => l !== level) : [...new Set([...state.selectedLevels, level])];
                    if (next.length === 0) return;
                    if (collection === "news") {
                      mutate({ selectedLevels: next });
                    } else {
                      const nextExamIds = state.selectedExamIds.length
                        ? pruneToggle(state.selectedExamIds, AVAILABLE_READING_EXAMS.map((exam) => exam.id), (id) =>
                            ALL_READING.some((p) => p.examId === id && state.selectedBooks.includes(p.book) && next.includes(p.level) && state.selectedLengths.includes(p.length)),
                          )
                        : [];
                      const nextBooks = pruneToggle(state.selectedBooks, AVAILABLE_BOOKS, (book) =>
                        ALL_READING.some((p) => p.book === book && next.includes(p.level) && state.selectedLengths.includes(p.length) && (!isReadingExamBook(book) || (!!p.examId && nextExamIds.includes(p.examId)))),
                      );
                      const nextLengths = pruneToggle(state.selectedLengths, AVAILABLE_LENGTHS, (length) =>
                        ALL_READING.some((p) => p.length === length && next.includes(p.level) && matchesReadingSources(p, nextBooks, nextExamIds)),
                      );
                      mutate({ selectedLevels: next, selectedBooks: nextBooks, selectedExamIds: nextExamIds, selectedLengths: nextLengths });
                    }
                  }}
                />
              );
            })}
          </FilterGroup>
        ) : null}

        {collection !== "news" ? (
          <FilterGroup title="Nguồn bài đọc">
            {AVAILABLE_BOOKS.map((book) => {
              const checked = state.selectedBooks.includes(book);
              const count = ALL_READING.filter(
                (p) => p.book === book && state.selectedLevels.includes(p.level) && state.selectedLengths.includes(p.length),
              ).length;
              return (
                <FilterChipOption
                  key={book}
                  label={`${BOOK_LABELS[book]} (${count})`}
                  active={checked}
                  onClick={() => {
                    const next = checked ? state.selectedBooks.filter((b) => b !== book) : [...new Set([...state.selectedBooks, book])];
                    if (next.length === 0) return;
                    const familyIds = readingExamIdsForBook(book);
                    const nextExamIds = isReadingExamBook(book)
                      ? checked
                        ? state.selectedExamIds.filter((id) => !familyIds.includes(id))
                        : [...new Set([...state.selectedExamIds, ...initialReadingExamIdsForBook(book)])]
                      : state.selectedExamIds;
                    const nextLevels = pruneToggle(state.selectedLevels, AVAILABLE_LEVELS, (level) =>
                      ALL_READING.some((p) => p.level === level && state.selectedLengths.includes(p.length) && matchesReadingSources(p, next, nextExamIds)),
                    );
                    const nextLengths = pruneToggle(state.selectedLengths, AVAILABLE_LENGTHS, (length) =>
                      ALL_READING.some((p) => p.length === length && nextLevels.includes(p.level) && matchesReadingSources(p, next, nextExamIds)),
                    );
                    mutate({ selectedBooks: next, selectedExamIds: nextExamIds, selectedLevels: nextLevels, selectedLengths: nextLengths });
                  }}
                />
              );
            })}
          </FilterGroup>
        ) : null}

        {collection !== "news" ? READING_EXAM_BOOKS.map((book) => {
          if (!state.selectedBooks.includes(book)) return null;
          const options = book === "jlpt-exam" ? AVAILABLE_JLPT_EXAMS : AVAILABLE_N3_SETS;
          const countForBook = ALL_READING.filter((p) => p.book === book && state.selectedLevels.includes(p.level) && state.selectedLengths.includes(p.length)).length;
          const selectedCount = options.filter((exam) => state.selectedExamIds.includes(exam.id)).length;
          const title = book === "jlpt-exam" ? "Đề JLPT theo kỳ" : "10 đề N3 theo đề";
          return (
            <details key={book} className="rounded-xl border border-neutral-200 px-3 py-2">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 py-1 text-sm font-semibold text-neutral-700">
                <span>{title}</span>
                <span className="shrink-0 text-xs font-normal text-neutral-400">{selectedCount}/{options.length} · {countForBook} bài</span>
              </summary>
              <div className="mt-2 flex justify-end">
                <button
                  type="button"
                  disabled={selectedCount === options.length}
                  onClick={() => {
                    const nextExamIds = [...new Set([...state.selectedExamIds, ...readingExamIdsForBook(book)])];
                    const nextBooks = [...new Set([...state.selectedBooks, book])];
                    mutate({ selectedExamIds: nextExamIds, selectedBooks: nextBooks });
                  }}
                  className="text-xs font-semibold text-rose-600 hover:underline disabled:cursor-default disabled:text-neutral-400 disabled:no-underline"
                >
                  {selectedCount === options.length ? "Đã chọn tất cả" : "Chọn tất cả"}
                </button>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {options.map((exam) => {
                  const checked = state.selectedExamIds.includes(exam.id);
                  const count = ALL_READING.filter((p) => p.examId === exam.id && state.selectedLevels.includes(p.level) && state.selectedLengths.includes(p.length)).length;
                  if (!count) return null;
                  return (
                    <FilterChipOption
                      key={exam.id}
                      label={`${exam.label} (${count})`}
                      active={checked}
                      onClick={() => {
                        const nextExamIds = checked
                          ? state.selectedExamIds.filter((id) => id !== exam.id)
                          : [...new Set([...state.selectedExamIds, exam.id])];
                        const idsForBook = readingExamIdsForBook(book);
                        const remainingInBook = nextExamIds.some((id) => idsForBook.includes(id));
                        const nextBooks = remainingInBook
                          ? [...new Set([...state.selectedBooks, book])]
                          : state.selectedBooks.filter((item) => item !== book);
                        if (nextBooks.length === 0) return;
                        const nextLevels = pruneToggle(state.selectedLevels, AVAILABLE_LEVELS, (level) =>
                          ALL_READING.some((p) => p.level === level && state.selectedLengths.includes(p.length) && matchesReadingSources(p, nextBooks, nextExamIds)),
                        );
                        const nextLengths = pruneToggle(state.selectedLengths, AVAILABLE_LENGTHS, (length) =>
                          ALL_READING.some((p) => p.length === length && nextLevels.includes(p.level) && matchesReadingSources(p, nextBooks, nextExamIds)),
                        );
                        mutate({ selectedExamIds: nextExamIds, selectedBooks: nextBooks, selectedLevels: nextLevels, selectedLengths: nextLengths });
                      }}
                    />
                  );
                })}
              </div>
            </details>
          );
        }) : null}

        {collection !== "news" && state.selectedBooks.includes("jlpt-exam") ? (
          <FilterGroup title="Phần đề JLPT">
            {AVAILABLE_TOPICS.filter((topic) => ALL_READING.some((p) => p.book === "jlpt-exam" && p.topic === topic && !!p.examId && state.selectedExamIds.includes(p.examId) && state.selectedLevels.includes(p.level) && state.selectedLengths.includes(p.length))).map((topic) => {
              const checked = state.selectedTopics.includes(topic);
              const count = ALL_READING.filter(
                (p) => p.book === "jlpt-exam" && p.topic === topic && !!p.examId && state.selectedExamIds.includes(p.examId) && state.selectedLevels.includes(p.level) && state.selectedLengths.includes(p.length),
              ).length;
              return (
                <FilterChipOption
                  key={topic}
                  label={`${topic} (${count})`}
                  active={checked}
                  onClick={() => {
                    const next = checked ? state.selectedTopics.filter((item) => item !== topic) : [...new Set([...state.selectedTopics, topic])];
                    if (next.length === 0) return;
                    mutate({ selectedTopics: next });
                  }}
                />
              );
            })}
          </FilterGroup>
        ) : null}

        {(collection === "news" ? (["news"] as const) : (["news", "custom"] as const)).map((book) => {
          if (collection !== "news" && !state.selectedBooks.includes(book)) return null;
          const topics = [...new Set(ALL_READING.filter((p) => p.book === book && p.topic).map((p) => p.topic!))]
            .sort((a, b) => a.localeCompare(b, "ja", { numeric: true }));
          if (topics.length === 0) return null;
          return (
            <FilterGroup key={book} title={book === "news" ? "Chủ đề báo Nhật" : "Chủ đề nội dung tự thêm"}>
              {topics.map((topic) => {
                const checked = state.selectedTopics.includes(topic);
                const count = ALL_READING.filter(
                  (p) => p.book === book && p.topic === topic && state.selectedLevels.includes(p.level) && state.selectedLengths.includes(p.length),
                ).length;
                return (
                  <FilterChipOption
                    key={topic}
                    label={`${topic} (${count})`}
                    active={checked}
                    onClick={() => {
                      const next = checked ? state.selectedTopics.filter((item) => item !== topic) : [...new Set([...state.selectedTopics, topic])];
                      if (next.length === 0) return;
                      mutate({ selectedTopics: next });
                    }}
                  />
                );
              })}
            </FilterGroup>
          );
        })}

        <FilterGroup title="Độ dài bài đọc">
          {AVAILABLE_LENGTHS.map((length) => {
            const checked = state.selectedLengths.includes(length);
            const count = ALL_READING.filter(
              (p) => p.length === length && state.selectedLevels.includes(p.level) && (collection === "news" ? p.book === "news" : matchesReadingSources(p, state.selectedBooks, state.selectedExamIds)),
            ).length;
            return (
              <FilterChipOption
                key={length}
                label={`${LENGTH_LABELS[length]} (${count})`}
                active={checked}
                onClick={() => {
                  const next = checked ? state.selectedLengths.filter((l) => l !== length) : [...new Set([...state.selectedLengths, length])];
                  if (next.length === 0) return;
                  if (collection === "news") {
                    mutate({ selectedLengths: next });
                  } else {
                    const nextLevels = pruneToggle(state.selectedLevels, AVAILABLE_LEVELS, (level) =>
                      ALL_READING.some((p) => p.level === level && next.includes(p.length) && matchesReadingSources(p, state.selectedBooks, state.selectedExamIds)),
                    );
                    const nextExamIds = state.selectedExamIds.length
                      ? pruneToggle(state.selectedExamIds, AVAILABLE_READING_EXAMS.map((exam) => exam.id), (id) =>
                          ALL_READING.some((p) => p.examId === id && state.selectedBooks.includes(p.book) && next.includes(p.length) && nextLevels.includes(p.level)),
                        )
                      : [];
                    const nextBooks = pruneToggle(state.selectedBooks, AVAILABLE_BOOKS, (book) =>
                      ALL_READING.some((p) => p.book === book && next.includes(p.length) && nextLevels.includes(p.level) && (!isReadingExamBook(book) || (!!p.examId && nextExamIds.includes(p.examId)))),
                    );
                    mutate({ selectedLengths: next, selectedLevels: nextLevels, selectedBooks: nextBooks, selectedExamIds: nextExamIds });
                  }
                }}
              />
            );
          })}
        </FilterGroup>
      </FilterSheet>

      {visiblePassages.length === 0 ? (
        (collection === "news" && !ALL_READING.some((p) => p.book === "news")) || (collection === "stories" && filtered.length === 0) || (collection === "library" && libraryTab === "stories" && filtered.length === 0) ? null : (
          <p className="mt-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-600">
            {savedOnlyView ? "Chưa có truyện nào được lưu. Mở Truyện AI rồi bấm Lưu bài để giữ truyện ở đây." : collection === "news" ? "Không có bài báo nào khớp bộ lọc này." : collection === "stories" ? "Không có truyện nào khớp trạng thái đã chọn." : "Không có bài đọc nào khớp bộ lọc này."}
          </p>
        )
      ) : (
        <div className={`mt-4 ${libraryShowsJlpt ? "grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3" : "flex flex-col gap-2"}`}>
          {visiblePassages.map((p, i) => {
            const isArticle = p.book === "news" || p.book === "custom";
            const leisureEntry = JLPT_LEISURE_BY_ID.get(p.id);
            const leisurePageCount = leisureEntry ? leisurePageRanges(p.body).length : 0;
            const leisureReadPage = state.leisurePageByPassage[p.id] ?? 0;
            const leisureComplete = state.leisureCompletedPassageIds.includes(p.id);
            const isSaved = state.savedPassageIds.includes(p.id);
            const progress = getPassageProgress(p, state.answers);
            const borderCls =
              progress.status === "not-started"
                ? "border-l-neutral-200"
                : progress.status === "in-progress"
                  ? "border-l-amber-400"
                  : progress.correct === progress.total
                    ? "border-l-emerald-400"
                    : "border-l-rose-400";
            if (collection === "library" && libraryTab === "jlpt" && leisureEntry) {
              return (
                <button key={p.id} onClick={() => openPassage(p)} className="flex h-full flex-col overflow-hidden rounded-2xl border border-neutral-200 bg-white text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
                  <div className="relative aspect-[16/8] overflow-hidden bg-neutral-100">
                    <img loading="lazy" src={`${import.meta.env.BASE_URL}${leisureEntry.scenes[0].path}`} alt={leisureEntry.scenes[0].alt} className="h-full w-full object-cover" />
                    <span className="absolute left-3 top-3 rounded-full bg-white/90 px-2.5 py-1 text-xs font-bold text-rose-700">{p.level}</span>
                  </div>
                  <div className="flex flex-1 flex-col p-4">
                    <div className="flex items-start justify-between gap-2">
                      <h2 lang="ja" className="min-w-0 flex-1 truncate font-bold text-neutral-800" title={leisureEntry.titleJa}>{leisureEntry.titleJa}</h2>
                      <span className={`shrink-0 rounded-full px-2 py-1 text-[11px] font-semibold ${leisureComplete ? "bg-emerald-50 text-emerald-700" : state.lastPassageId === p.id ? "bg-amber-50 text-amber-700" : "bg-neutral-100 text-neutral-500"}`}>{leisureComplete ? "Đã đọc" : state.lastPassageId === p.id ? "Đọc tiếp" : "Bắt đầu"}</span>
                    </div>
                    <p lang="ja" className="mt-1.5 line-clamp-2 min-h-[2.75rem] text-sm leading-[1.375rem] text-neutral-600">{leisureEntry.summaryJa}</p>
                    <div className="mt-auto flex min-h-[2.75rem] flex-wrap items-center gap-x-2 gap-y-1 pt-2 text-xs text-neutral-500">
                      <span>{p.examLabel}</span><span>·</span><span>{timelineLabel(p)}</span><span>·</span><span>{leisureEntry.scenes.length} ảnh</span>
                    </div>
                    <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-neutral-100"><div className={`h-full rounded-full ${leisureComplete ? "bg-emerald-500" : "bg-rose-400"}`} style={{ width: leisureComplete ? "100%" : leisureReadPage > 0 ? `${Math.min(95, (leisureReadPage / leisurePageCount) * 100)}%` : "0%" }} /></div>
                  </div>
                </button>
              );
            }
            return (
              <button
                key={p.id}
                onClick={() => openPassage(p)}
                className={`flex items-center gap-3 rounded-2xl border border-l-4 border-neutral-200 bg-white px-4 py-3.5 text-left hover:border-rose-200 hover:bg-rose-50/40 ${borderCls}`}
              >
                <span className="w-6 shrink-0 text-xs font-semibold text-neutral-300">{String(i + 1).padStart(2, "0")}</span>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold text-neutral-800">{p.title}</div>
                  <div className="truncate text-xs text-neutral-500">
                    {BOOK_LABELS[p.book]}
                    {p.topic ? ` · ${p.topic}` : ""}
                    {AVAILABLE_LEVELS.length > 1 ? ` · ${p.level}` : ""} · {timelineLabel(p)}
                    {p.publishedAt ? ` · ${p.publishedAt}` : ""}
                  </div>
                </div>
                {isArticle ? (
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${state.currentPassageId === p.id ? "bg-sky-50 text-sky-600" : isSaved ? "bg-rose-50 text-rose-600" : "bg-neutral-100 text-neutral-400"}`}>
                    {state.lastPassageId === p.id ? "Đọc tiếp" : isSaved ? "Đã lưu" : "Bài đọc"}
                  </span>
                ) : progress.status === "done" ? (
                  <span className="shrink-0 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-600">
                    ✓ {progress.correct}/{progress.total}
                  </span>
                ) : progress.status === "in-progress" ? (
                  <span className="shrink-0 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-600">⋯ đang làm</span>
                ) : (
                  <span className="shrink-0 rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-semibold text-neutral-400">chưa làm</span>
                )}
                {!isArticle && progress.status !== "not-started" ? (
                  <span
                    role="button"
                    title="Làm lại từ đầu"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleResetRow(p);
                    }}
                    className="shrink-0 text-neutral-300 hover:text-neutral-500"
                  >
                    <Undo2 size={14} />
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function PassageView({
  passage,
  state,
  mutate,
  onOpenVocab,
  onOpenBunpo,
  visiblePassages,
  openPassage,
  collection,
  savedOnlyView,
}: {
  passage: ReadingPassage;
  state: ReadingViewerState;
  mutate: (partial: Partial<ReadingViewerState>) => Promise<void>;
  onOpenVocab: (vocabId: string) => void;
  onOpenBunpo: (bunpoId: string, senseId?: string) => void;
  visiblePassages: ReadingPassage[];
  openPassage: (passage: ReadingPassage) => Promise<void>;
  collection: "all" | "news" | "stories" | "library";
  savedOnlyView: boolean;
}) {
  const confirm = useConfirm();
  const isAiStory = passage.book === "ai-story";
  const isArticle = passage.book === "news" || passage.book === "custom";
  const isLinkOnly = passage.linkOnly === true;
  const isSaved = state.savedPassageIds.includes(passage.id);
  const answers = state.answers[passage.id] ?? passage.questions.map(() => null);
  const answeredCount = answers.filter((a) => a !== null).length;
  const total = passage.questions.length;
  const allAnswered = answeredCount >= total;
  const correctCount = passage.questions.filter((q, qi) => answers[qi] === q.correctIndex).length;
  const vocabMatches = findVocabInPassage(passage);
  const bunpoMatches = findBunpoInPassage(passage);
  const referenceTerms: ReferenceTerm[] = [
    ...vocabMatches.flatMap((v) => getVocabReferenceTerms(v).map((text) => ({ text, kind: "vocab" as const }))),
    ...bunpoMatches.flatMap(({ grammar }) => extractMatchChunks(grammar.pattern).map((text) => ({ text, kind: "bunpo" as const }))),
  ];
  const [referenceTab, setReferenceTab] = useState<"questions" | "references" | "vocabulary" | "grammar">("questions");
  const [floatingNavVisible, setFloatingNavVisible] = useState(false);
  const speechSentences = useMemo(
    () => splitBodyIntoSentences(passage.body).map((segments) => segments.map((segment) => segment.text).join("").replace(/\s+/gu, " ").trim()),
    [passage.id],
  );
  const [speechAvailable, setSpeechAvailable] = useState(hasJapaneseVoice);
  const [speechStatus, setSpeechStatus] = useState<"idle" | "playing" | "paused">("idle");
  const [activeSpeechSentence, setActiveSpeechSentence] = useState(-1);
  const [speechRate, setSpeechRate] = useState(0.9);
  const [speechError, setSpeechError] = useState<string | undefined>();
  const speechRunRef = useRef(0);
  const speechRateRef = useRef(speechRate);
  speechRateRef.current = speechRate;
  const leisureEntry = JLPT_LEISURE_BY_ID.get(passage.id);
  const isLeisureJlpt = !!leisureEntry;
  const leisureRanges = useMemo(() => leisureEntry ? leisurePageRanges(passage.body) : [], [passage.id]);
  const savedLeisurePage = state.leisurePageByPassage[passage.id] ?? 0;
  const leisurePageIndex = leisureRanges.length ? Math.min(savedLeisurePage, leisureRanges.length - 1) : 0;
  const leisurePageRange = leisureRanges[leisurePageIndex];
  const [showWholeLeisurePassage, setShowWholeLeisurePassage] = useState(false);
  const leisureComplete = state.leisureCompletedPassageIds.includes(passage.id);
  const leisureScene = leisureEntry && leisurePageRange
    ? [...leisureEntry.scenes].reverse().find((scene) => scene.startSentence <= leisurePageRange.start) ?? leisureEntry.scenes[0]
    : undefined;
  const viewOptions = state.passageViewOptions[passage.id] ?? {};
  const showFurigana = viewOptions.showFurigana ?? state.showFurigana;
  const showTranslation = viewOptions.showTranslation ?? state.showTranslation;
  const showStudyNote = viewOptions.showStudyNote ?? state.showStudyNote;
  const highlightReferences = viewOptions.highlightReferences ?? (allAnswered && state.resultsRevealed);
  const visibleQuestionTranslations = viewOptions.visibleQuestionTranslations ?? {};
  const hasReferences = vocabMatches.length > 0 || bunpoMatches.length > 0;
  const hasMarkdownTable = findMarkdownPipeTables(passage.body.map((segment) => segment.text).join("")).length > 0;

  useEffect(() => {
    setReferenceTab("questions");
    setShowWholeLeisurePassage(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [passage.id]);

  useEffect(() => {
    const refreshVoices = () => setSpeechAvailable(hasJapaneseVoice());
    refreshVoices();
    return onVoicesChanged(refreshVoices);
  }, []);

  useEffect(() => {
    speechRunRef.current++;
    window.speechSynthesis?.cancel();
    setSpeechStatus("idle");
    setActiveSpeechSentence(-1);
    setSpeechError(undefined);
  }, [passage.id]);

  useEffect(() => () => {
    speechRunRef.current++;
    window.speechSynthesis?.cancel();
  }, []);

  function speakSentenceAt(index: number, runId: number, endIndex = speechSentences.length) {
    if (runId !== speechRunRef.current) return;
    const text = speechSentences[index];
    if (!text) {
      setSpeechStatus("idle");
      setActiveSpeechSentence(-1);
      return;
    }
    setActiveSpeechSentence(index);
    const started = speakJapanese(text, {
      rate: speechRateRef.current,
      onEnd: () => {
        if (runId !== speechRunRef.current) return;
        if (index + 1 < endIndex) {
          speakSentenceAt(index + 1, runId, endIndex);
        } else {
          setSpeechStatus("idle");
          setActiveSpeechSentence(-1);
        }
      },
      onError: () => {
        if (runId !== speechRunRef.current) return;
        speechRunRef.current++;
        setSpeechStatus("idle");
        setActiveSpeechSentence(-1);
        setSpeechError("Trình duyệt không thể phát giọng đọc tiếng Nhật lúc này.");
      },
    });
    if (!started) {
      setSpeechStatus("idle");
      setActiveSpeechSentence(-1);
      setSpeechError("Trình duyệt không hỗ trợ đọc văn bản trên thiết bị này.");
    }
  }

  function startSpeechAt(index: number, endIndex = speechSentences.length) {
    if (!speechAvailable || speechSentences.length === 0) return;
    const runId = ++speechRunRef.current;
    window.speechSynthesis?.cancel();
    setSpeechError(undefined);
    setSpeechStatus("playing");
    speakSentenceAt(index, runId, endIndex);
  }

  function toggleStorySpeech(startIndex = 0, endIndex = speechSentences.length) {
    if (speechStatus === "playing") {
      window.speechSynthesis?.pause();
      setSpeechStatus("paused");
    } else if (speechStatus === "paused") {
      window.speechSynthesis?.resume();
      setSpeechStatus("playing");
    } else {
      startSpeechAt(startIndex, endIndex);
    }
  }

  function stopStorySpeech() {
    speechRunRef.current++;
    window.speechSynthesis?.cancel();
    setSpeechStatus("idle");
    setActiveSpeechSentence(-1);
  }

  useEffect(() => {
    let hideTimer: number | undefined;
    function handleScroll() {
      setFloatingNavVisible(true);
      if (hideTimer !== undefined) window.clearTimeout(hideTimer);
      hideTimer = window.setTimeout(() => setFloatingNavVisible(false), 1000);
    }

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", handleScroll);
      if (hideTimer !== undefined) window.clearTimeout(hideTimer);
    };
  }, []);

  function updateViewOptions(partial: Partial<ReadingPassageViewOptions>) {
    void mutate({
      passageViewOptions: {
        ...state.passageViewOptions,
        [passage.id]: { ...viewOptions, ...partial },
      },
    });
  }

  const currentIndex = visiblePassages.findIndex((p) => p.id === passage.id);
  const prevPassage = currentIndex > 0 ? visiblePassages[currentIndex - 1] : null;
  const nextPassage = currentIndex >= 0 && currentIndex < visiblePassages.length - 1 ? visiblePassages[currentIndex + 1] : null;

  const floatingNavBottom = useFloatingNav(true, (!!prevPassage || !!nextPassage) && floatingNavVisible);

  async function handleReset() {
    if (!(await confirm(`Làm lại "${passage.title}" từ đầu? Kết quả đã trả lời sẽ bị xoá.`))) return;
    await mutate({ ...resetPassageAnswers(state, passage.id), resultsRevealed: false });
  }

  function toggleSaved() {
    const savedPassageIds = isSaved
      ? state.savedPassageIds.filter((id) => id !== passage.id)
      : [...state.savedPassageIds, passage.id];
    void mutate({ savedPassageIds });
  }

  return (
    <div className="mx-auto max-w-6xl px-2.5 py-2 md:px-8 md:py-6">
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => mutate({ currentPassageId: null })}
          className="flex items-center gap-1 text-sm font-medium text-neutral-500 hover:text-neutral-700"
        >
          <ChevronLeft size={15} /> {savedOnlyView ? "Truyện đã lưu" : collection === "news" ? "Đọc báo" : collection === "stories" ? "Truyện AI" : collection === "library" ? "Thư viện đọc" : "Luyện đọc"}
        </button>
        <span className="rounded-full px-2.5 py-1 text-xs font-semibold" style={levelBadgeStyle(passage.level)}>
          {passage.level}
        </span>
        <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-semibold text-neutral-500">{BOOK_LABELS[passage.book]}</span>
        {passage.topic ? <span className="rounded-full bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-600">{passage.topic}</span> : null}
        <span className="text-xs text-neutral-400">{timelineLabel(passage)}</span>
      </div>

      <h1 className="mt-3 text-2xl font-bold text-neutral-800">{leisureEntry?.title ?? passage.title}</h1>
      {leisureEntry ? <p className="mt-2 max-w-3xl text-sm leading-relaxed text-neutral-600">{leisureEntry.summary}</p> : null}

      {isArticle || isAiStory || isLeisureJlpt ? (
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-neutral-500">
          <span>{isLeisureJlpt ? passage.examLabel : passage.source}</span>
          {passage.publishedAt ? <span>{passage.publishedAt}</span> : null}
          {passage.sourceUrl ? (
            <a href={passage.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-rose-600 hover:text-rose-700">
              Nguồn gốc <ExternalLink size={13} />
            </a>
          ) : null}
          <button
            type="button"
            onClick={toggleSaved}
            className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold ${isSaved ? "border-rose-200 bg-rose-50 text-rose-600" : "border-neutral-200 text-neutral-600 hover:border-rose-200 hover:text-rose-600"}`}
          >
            {isSaved ? <BookmarkCheck size={13} /> : <Bookmark size={13} />}
            {isSaved ? "Đã lưu" : "Lưu bài"}
          </button>
          {passage.sourceNotice ? <p className="basis-full text-xs text-neutral-400">{passage.sourceNotice}</p> : null}
        </div>
      ) : null}

      {leisureScene ? (
        <Card className="mt-4 overflow-hidden gap-0 rounded-2xl border-neutral-200 p-2 ring-0">
          <img src={`${import.meta.env.BASE_URL}${leisureScene.path}`} alt={leisureScene.alt} className="max-h-[min(62vw,420px)] w-full rounded-xl object-cover" />
        </Card>
      ) : passage.illustration ? (
        <Card className="mt-4 overflow-hidden gap-0 rounded-2xl border-neutral-200 p-2 ring-0">
          <img
            src={`${import.meta.env.BASE_URL}${passage.illustration.path}`}
            alt={passage.illustration.alt}
            className="max-h-[min(62vw,420px)] w-full rounded-xl object-cover"
          />
        </Card>
      ) : null}

      {leisureEntry && leisurePageRange ? (
        <div className="mt-4 flex items-center gap-3" aria-label="Tiến độ đọc">
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-neutral-100"><div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${((leisurePageIndex + 1) / leisureRanges.length) * 100}%` }} /></div>
          <span className="shrink-0 text-xs font-semibold text-neutral-600">{leisurePageIndex + 1} / {leisureRanges.length}</span>
        </div>
      ) : null}

      {!isArticle ? <div className="mt-4 flex items-center gap-3">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-neutral-100">
          <div className="h-full rounded-full bg-rose-400" style={{ width: `${total ? (answeredCount / total) * 100 : 0}%` }} />
        </div>
        <span className="shrink-0 text-xs font-medium text-neutral-500">
          {answeredCount}/{total} câu
        </span>
      </div> : null}

      {state.resultsRevealed && allAnswered && total > 0 ? (
        <div className={`mt-4 flex items-center gap-2 rounded-xl p-3 text-sm font-semibold ${correctCount === total ? "bg-emerald-50 text-emerald-700" : "bg-sky-50 text-sky-700"}`}>
          {correctCount === total ? <Sparkles size={16} /> : <BarChart3 size={16} />}
          Đúng {correctCount}/{total} câu ({Math.round((correctCount / total) * 100)}%)
        </div>
      ) : null}

      {!isLinkOnly ? <div className="mt-4 flex flex-wrap gap-2">
        <button
          onClick={() => updateViewOptions({ showFurigana: !showFurigana })}
          className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${showFurigana ? "border-rose-300 bg-rose-50 text-rose-600" : "border-neutral-200 text-neutral-600"}`}
        >
          {showFurigana ? "Ẩn furigana" : "Hiện furigana"}
        </button>
        <button
          onClick={() => updateViewOptions({ showTranslation: !showTranslation })}
          className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${showTranslation ? "border-rose-300 bg-rose-50 text-rose-600" : "border-neutral-200 text-neutral-600"}`}
        >
          {showTranslation ? "Ẩn bản dịch" : "Xem bản dịch"}
        </button>
        {passage.studyNote ? (
          <button
            onClick={() => updateViewOptions({ showStudyNote: !showStudyNote })}
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${showStudyNote ? "border-rose-300 bg-rose-50 text-rose-600" : "border-neutral-200 text-neutral-600"}`}
          >
            {showStudyNote ? "Ẩn ghi chú" : "Xem ghi chú"}
          </button>
        ) : null}
      </div> : null}

      {(isAiStory || isLeisureJlpt) && !isLinkOnly ? (
        <StorySpeechControls
          available={speechAvailable}
          status={speechStatus}
          activeSentenceIndex={activeSpeechSentence}
          sentenceCount={speechSentences.length}
          rate={speechRate}
          error={speechError}
          onToggle={isLeisureJlpt && leisurePageRange && !showWholeLeisurePassage ? () => toggleStorySpeech(leisurePageRange.start, leisurePageRange.end) : toggleStorySpeech}
          onStop={stopStorySpeech}
          onRateChange={setSpeechRate}
        />
      ) : null}

      {!isLinkOnly ? <Card className="mt-4 gap-0 rounded-2xl border-neutral-200 p-5 ring-0">
        <div className="rounded-lg bg-neutral-50 p-4 text-sm leading-relaxed text-neutral-700">
          {isAiStory || isLeisureJlpt ? (
            <AiStoryReadingBody
              passage={passage}
              showFurigana={showFurigana}
              showTranslation={showTranslation && !hasMarkdownTable}
              referenceTerms={referenceTerms}
              highlightReferences={highlightReferences}
              activeSentenceIndex={activeSpeechSentence}
              sentenceRange={isLeisureJlpt && !showWholeLeisurePassage ? leisurePageRange : undefined}
              canSpeak={speechAvailable}
              onSpeakSentence={isLeisureJlpt && leisurePageRange && !showWholeLeisurePassage ? (index) => startSpeechAt(index, leisurePageRange.end) : startSpeechAt}
            />
          ) : showTranslation && passage.sentencesVi && !hasMarkdownTable ? (
            <ReadingBodyInterleaved
              passage={passage}
              showFurigana={showFurigana}
              referenceTerms={referenceTerms}
              highlightReferences={highlightReferences}
            />
          ) : (
            <ReadingBody
              passage={passage}
              showFurigana={showFurigana}
              referenceTerms={referenceTerms}
              highlightReferences={highlightReferences}
            />
          )}
        </div>
      </Card> : (
        <Card className="mt-4 gap-0 rounded-2xl border-sky-100 bg-sky-50 p-5 ring-0">
          <p className="text-sm leading-relaxed text-sky-800">Nội dung bài chưa được cấp quyền hiển thị trong ứng dụng. Bạn có thể mở nguồn để đọc trực tiếp.</p>
        </Card>
      )}

      {showTranslation && (!passage.sentencesVi || hasMarkdownTable) ? (
        <div className="mt-3 rounded-xl bg-amber-50 p-4 text-sm leading-relaxed text-amber-800">
          {hasMarkdownTable ? <MarkdownTableText text={passage.translationVi} /> : passage.translationVi.split("\n").map((line, i, arr) => (
            <span key={i}>
              {line}
              {i < arr.length - 1 ? <br /> : null}
            </span>
          ))}
        </div>
      ) : null}

      {isLeisureJlpt && leisurePageRange ? (
        <div className="mt-4 flex items-center justify-between gap-3">
          <button type="button" disabled={leisurePageIndex === 0 || showWholeLeisurePassage} onClick={() => {
            stopStorySpeech();
            void mutate({ leisurePageByPassage: { ...state.leisurePageByPassage, [passage.id]: Math.max(0, leisurePageIndex - 1) } });
            window.scrollTo({ top: 0, behavior: "smooth" });
          }} className="rounded-xl border border-neutral-200 bg-white px-4 py-2.5 text-sm font-semibold text-neutral-700 disabled:opacity-40">‹ Trước</button>
          <button type="button" onClick={() => setShowWholeLeisurePassage((value) => !value)} className="text-sm font-semibold text-rose-600">{showWholeLeisurePassage ? "Xem theo trang" : "Xem toàn bài"}</button>
          <button type="button" disabled={showWholeLeisurePassage || (leisurePageIndex >= leisureRanges.length - 1 && leisureComplete)} onClick={() => {
            stopStorySpeech();
            if (leisurePageIndex >= leisureRanges.length - 1) {
              void mutate({ leisureCompletedPassageIds: [...new Set([...state.leisureCompletedPassageIds, passage.id])] });
            } else {
              void mutate({ leisurePageByPassage: { ...state.leisurePageByPassage, [passage.id]: leisurePageIndex + 1 } });
            }
            window.scrollTo({ top: 0, behavior: "smooth" });
          }} className="rounded-xl bg-neutral-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40">{leisurePageIndex >= leisureRanges.length - 1 ? leisureComplete ? "Đã đọc" : "Hoàn tất" : "Tiếp ›"}</button>
        </div>
      ) : null}

      {showStudyNote && passage.studyNote ? (
        <div className="mt-3 rounded-xl bg-sky-50 p-4 text-sm leading-relaxed text-sky-800">
          {passage.studyNote.split("\n").map((line, i, arr) => (
            <span key={i}>
              {line}
              {i < arr.length - 1 ? <br /> : null}
            </span>
          ))}
        </div>
      ) : null}

      {!isArticle ? <div className="mt-5 flex rounded-xl border border-neutral-200 bg-neutral-50 p-1" role="tablist" aria-label="Nội dung bài đọc">
        <button
          role="tab"
          aria-selected={referenceTab === "questions"}
          onClick={() => setReferenceTab("questions")}
          className={`flex-1 rounded-lg px-2 py-2 text-sm font-semibold transition-colors ${
            referenceTab === "questions" ? "bg-white text-neutral-800 shadow-sm" : "text-neutral-500 hover:text-neutral-700"
          }`}
        >
          Câu hỏi ({total})
        </button>
        {isAiStory ? (
          <>
            <button
              role="tab"
              aria-selected={referenceTab === "vocabulary"}
              onClick={() => setReferenceTab("vocabulary")}
              className={`flex-1 rounded-lg px-2 py-2 text-sm font-semibold transition-colors ${
                referenceTab === "vocabulary" ? "bg-white text-neutral-800 shadow-sm" : "text-neutral-500 hover:text-neutral-700"
              }`}
            >
              Từ vựng ({vocabMatches.length})
            </button>
            <button
              role="tab"
              aria-selected={referenceTab === "grammar"}
              onClick={() => setReferenceTab("grammar")}
              className={`flex-1 rounded-lg px-2 py-2 text-sm font-semibold transition-colors ${
                referenceTab === "grammar" ? "bg-white text-neutral-800 shadow-sm" : "text-neutral-500 hover:text-neutral-700"
              }`}
            >
              Ngữ pháp ({bunpoMatches.length})
            </button>
          </>
        ) : vocabMatches.length > 0 || bunpoMatches.length > 0 ? (
          <button
            role="tab"
            aria-selected={referenceTab === "references"}
            onClick={() => setReferenceTab("references")}
            className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
              referenceTab === "references" ? "bg-white text-neutral-800 shadow-sm" : "text-neutral-500 hover:text-neutral-700"
            }`}
          >
            Tham khảo ({vocabMatches.length + bunpoMatches.length})
          </button>
        ) : null}
      </div> : null}

      {isArticle ? (hasReferences ? (
        <Card className="mt-5 gap-4 rounded-2xl border-neutral-200 p-4 ring-0">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-bold text-neutral-800">Từ vựng và ngữ pháp trong bài</h2>
              <p className="mt-0.5 text-xs text-neutral-500">Ưu tiên các mục quan trọng để hiểu nội dung bài đọc.</p>
            </div>
            <button
              onClick={() => updateViewOptions({ highlightReferences: !highlightReferences })}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${highlightReferences ? "border-rose-300 bg-rose-50 text-rose-600" : "border-neutral-200 text-neutral-600"}`}
            >
              {highlightReferences ? "Tắt bôi đậm trong bài" : "Bôi đậm trong bài"}
            </button>
          </div>
          {vocabMatches.length > 0 ? (
            <div>
              <div className="flex items-center gap-1.5 text-xs font-semibold text-neutral-500"><Library size={14} /> Từ vựng trọng tâm</div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {vocabMatches.map((v) => <button key={v.id} onClick={() => onOpenVocab(v.id)} className="rounded-lg border border-neutral-200 px-2.5 py-1 text-xs text-neutral-600 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700">{v.word}</button>)}
              </div>
            </div>
          ) : null}
          {bunpoMatches.length > 0 ? (
            <div>
              <div className="flex items-center gap-1.5 text-xs font-semibold text-neutral-500"><PenSquare size={14} /> Ngữ pháp trong bài</div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {bunpoMatches.map((match) => <button key={`${match.grammar.id}:${match.senseId}`} onClick={() => onOpenBunpo(match.grammar.id, match.senseId)} className="rounded-lg border border-neutral-200 px-2.5 py-1 text-xs text-neutral-600 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700">{bunpoPassageMatchLabel(bunpoMatches, match)}</button>)}
              </div>
            </div>
          ) : null}
        </Card>
      ) : null) : referenceTab !== "questions" ? (
        <Card className="mt-4 gap-4 rounded-2xl border-neutral-200 p-4 ring-0">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-bold text-neutral-800">
                {referenceTab === "vocabulary" ? "Từ vựng trong truyện" : referenceTab === "grammar" ? "Ngữ pháp trong truyện" : "Từ vựng và ngữ pháp trong bài"}
              </h2>
              <p className="mt-0.5 text-xs text-neutral-500">{isAiStory ? "Các mục được chọn để học trong câu chuyện này." : "Ưu tiên các từ khó và mẫu ngữ pháp đáng chú ý trong bài đọc."}</p>
            </div>
            <button
              onClick={() => updateViewOptions({ highlightReferences: !highlightReferences })}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
                highlightReferences ? "border-rose-300 bg-rose-50 text-rose-600" : "border-neutral-200 text-neutral-600"
              }`}
            >
              {highlightReferences ? "Tắt bôi đậm trong bài" : "Bôi đậm trong bài"}
            </button>
          </div>

          {referenceTab !== "grammar" && vocabMatches.length > 0 ? (
            <div>
              <div className="flex items-center gap-1.5 text-xs font-semibold text-neutral-500">
                <Library size={14} /> Từ vựng trọng tâm
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {vocabMatches.map((v) => (
                  <button
                    key={v.id}
                    onClick={() => onOpenVocab(v.id)}
                    className="rounded-lg border border-neutral-200 px-2.5 py-1 text-xs text-neutral-600 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700"
                  >
                    {v.word}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          {referenceTab !== "vocabulary" && bunpoMatches.length > 0 ? (
            <div>
              <div className="flex items-center gap-1.5 text-xs font-semibold text-neutral-500">
                <PenSquare size={14} /> Ngữ pháp trong bài
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {bunpoMatches.map((match) => (
                  <button
                    key={`${match.grammar.id}:${match.senseId}`}
                    onClick={() => onOpenBunpo(match.grammar.id, match.senseId)}
                    className="rounded-lg border border-neutral-200 px-2.5 py-1 text-xs text-neutral-600 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700"
                  >
                    {bunpoPassageMatchLabel(bunpoMatches, match)}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </Card>
      ) : (
      <>
      <div className="mt-6 flex flex-col gap-4">
        {passage.questions.map((q, qi) => {
          const answered = answers[qi];
          const showQuestionTranslation = visibleQuestionTranslations[qi] === true;
          return (
            <Card key={qi} className="gap-0 rounded-2xl border-neutral-200 p-5 ring-0">
              <div className="flex flex-col items-start gap-2">
                <div className="whitespace-pre-line font-semibold text-neutral-800">
                  Câu {q.sourceNumber ?? qi + 1}: {renderAnnotatedText(
                    q.question,
                    q.questionFurigana,
                    showFurigana,
                    findUniqueTextRanges(q.question, q.underline ? [q.underline] : []),
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {q.questionVi?.trim() ? (
                    <button
                      type="button"
                      onClick={() =>
                        updateViewOptions({
                          visibleQuestionTranslations: {
                            ...visibleQuestionTranslations,
                            [qi]: !showQuestionTranslation,
                          },
                        })
                      }
                      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors ${
                        showQuestionTranslation
                          ? "border-sky-200 bg-sky-50 text-sky-700"
                          : "border-neutral-200 text-neutral-500 hover:border-sky-200 hover:bg-sky-50 hover:text-sky-700"
                      }`}
                    >
                      <Languages size={13} /> {showQuestionTranslation ? "Ẩn dịch câu hỏi" : "Xem dịch câu hỏi"}
                    </button>
                  ) : null}
                  <StudyFeedbackButton
                    entityId={`study:reading:${readingQuestionId(passage.id, qi)}`}
                    snapshot={{
                      title: `Câu ${q.sourceNumber ?? qi + 1}: ${q.question}`,
                      context: `${passage.title}${passage.examLabel ? ` · ${passage.examLabel}` : ""}`,
                      currentValue: state.resultsRevealed
                        ? q.correctIndex >= 0 && q.correctIndex < q.options.length
                          ? `Phương án ${q.correctIndex + 1}: ${q.options[q.correctIndex]}`
                          : "Chưa có đáp án trong dữ liệu"
                        : "Đáp án sẽ hiện sau khi hoàn tất lượt luyện",
                      sources: [BOOK_LABELS[passage.book], passage.examLabel, passage.source].filter((source): source is string => Boolean(source)),
                    }}
                  />
                </div>
              </div>
              {showQuestionTranslation && q.questionVi?.trim() ? <div className="mt-2 whitespace-pre-line rounded-lg bg-sky-50 px-3 py-2 text-sm text-sky-800">{q.questionVi}</div> : null}
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {q.options.map((opt, oi) => {
                  let cls = "border-neutral-200 hover:bg-neutral-50";
                  if (state.resultsRevealed && answered !== null) {
                    if (oi === q.correctIndex) cls = "border-emerald-300 bg-emerald-50 text-emerald-700";
                    else if (oi === answered) cls = "border-rose-300 bg-rose-50 text-rose-700";
                    else cls = "border-neutral-200 opacity-50";
                  } else if (answered !== null && oi === answered) {
                    // Answered but not checked yet -- a neutral "this is your
                    // pick" highlight that doesn't leak correct/wrong.
                    cls = "border-neutral-400 bg-neutral-100 text-neutral-700";
                  }
                  return (
                    <button
                      key={oi}
                      disabled={answered !== null}
                      onClick={() => {
                        void recordAnswer(readingQuestionId(passage.id, qi), oi === q.correctIndex, "answer", ["answer"]);
                        const newAnswers = [...answers];
                        newAnswers[qi] = oi;
                        mutate({ answers: { ...state.answers, [passage.id]: newAnswers } });
                      }}
                      className={`rounded-lg border px-3 py-2 text-left text-sm ${cls}`}
                    >
                      {renderAnnotatedText(opt, q.optionsFurigana?.[oi] ?? undefined, showFurigana)}
                      {state.resultsRevealed && answered !== null ? (
                        <span className="mt-0.5 block text-xs text-neutral-400">{q.optionsVi[oi]}</span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
              {state.resultsRevealed && answered !== null && isReadingExamBook(passage.book) ? (
                <div className="mt-3 space-y-3 border-t border-neutral-100 pt-3 text-sm">
                  <QuestionExplanationBlock
                    explanation={q.explanation}
                    correctIndex={q.correctIndex}
                    showMissing
                    className="space-y-3"
                  />
                  {q.answerSourceNote ? (
                    <div className="rounded-lg bg-amber-50 p-2 text-xs leading-relaxed text-amber-700">
                      <span className="font-semibold">Đối chiếu PDF: </span>{q.answerSourceNote}
                    </div>
                  ) : null}
                </div>
              ) : state.resultsRevealed && answered !== null && (q.explanation || q.answerSourceNote) ? (
                <div className="mt-3 space-y-3 border-t border-neutral-100 pt-3 text-sm">
                  {q.explanation ? (
                    <div>
                      <div className="text-xs font-semibold tracking-wide text-neutral-400 uppercase">Giải thích</div>
                      <div className="mt-1 text-neutral-600">{q.explanation}</div>
                    </div>
                  ) : null}
                  {q.answerSourceNote ? (
                    <div className="rounded-lg bg-amber-50 p-2 text-xs leading-relaxed text-amber-700">
                      <span className="font-semibold">Đối chiếu PDF: </span>{q.answerSourceNote}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </Card>
          );
        })}
      </div>

      <div className="mt-6 flex flex-col gap-2">
        {!allAnswered || !state.resultsRevealed ? (
          <Button
            className="w-full"
            onClick={() => mutate({ resultsRevealed: !state.resultsRevealed })}
            disabled={answeredCount === 0}
            title={answeredCount === 0 ? "Chọn ít nhất 1 câu trả lời trước" : undefined}
          >
            <CheckCircle2 size={16} /> {state.resultsRevealed ? "Ẩn kết quả" : "Kiểm tra kết quả"}
          </Button>
        ) : null}
        <div className="flex gap-2">
          {answeredCount > 0 ? (
            <Button variant="outline" className="flex-1" onClick={handleReset}>
              <Undo2 size={16} /> Làm lại cả bài
            </Button>
          ) : null}
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => nextPassage && openPassage(nextPassage)}
            disabled={!nextPassage}
          >
            <ChevronRight size={16} /> Bài tiếp theo
          </Button>
        </div>
      </div>
      </>
      )}

      {prevPassage ? (
        <button
          onClick={() => openPassage(prevPassage)}
          aria-label="Bài trước"
          aria-hidden={!floatingNavVisible}
          tabIndex={floatingNavVisible ? 0 : -1}
          className={`fixed ${floatingNavBottom} left-4 z-20 floating-action-button bg-white text-neutral-600 shadow-lg ring-1 ring-neutral-200 transition-opacity duration-200 active:bg-neutral-50 md:hidden ${floatingNavVisible ? "opacity-100" : "pointer-events-none opacity-0"}`}
        >
          <ChevronLeft size={16} />
        </button>
      ) : null}
      {nextPassage ? (
        <button
          onClick={() => openPassage(nextPassage)}
          aria-label="Bài sau"
          aria-hidden={!floatingNavVisible}
          tabIndex={floatingNavVisible ? 0 : -1}
          className={`fixed right-4 ${floatingNavBottom} z-20 floating-action-button bg-rose-600 text-white shadow-lg transition-opacity duration-200 active:bg-rose-700 md:hidden ${floatingNavVisible ? "opacity-100" : "pointer-events-none opacity-0"}`}
        >
          <ChevronRight size={16} />
        </button>
      ) : null}
    </div>
  );
}
