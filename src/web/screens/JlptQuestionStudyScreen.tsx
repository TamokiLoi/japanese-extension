import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ChevronLeft, ChevronRight, RotateCcw, BookOpenText } from "lucide-react";
import { ALL_EXAMS } from "../../popup/dethiCatalog.ts";
import {
  clearJlptQuestionPracticeAnswer,
  loadJlptQuestionPracticeProgress,
  loadJlptQuestionPracticeSelection,
  recordJlptQuestionPracticeAnswer,
  saveJlptQuestionPracticeSelection,
  type JlptQuestionPracticeProgress,
  type JlptQuestionPracticeStatus,
} from "../../popup/jlptQuestionPracticeState.ts";
import type { DeThiExam, DeThiPaper, DeThiQuestion } from "../../types/dethi.ts";
import type { ReadingBodySegment } from "../../types/reading.ts";
import { PageHeader } from "../components/PageHeader.tsx";
import { StatCard } from "../components/StatCard.tsx";
import { Card } from "../components/ui/card.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select.tsx";
import { LoadingScreen } from "../components/LoadingScreen.tsx";
import { QuestionPalette, type PaletteStatus } from "../components/QuestionPalette.tsx";
import { QuestionExplanationBlock } from "../components/QuestionExplanationBlock.tsx";
import { JlptSessionSetup, type SessionSize } from "../components/JlptSessionSetup.tsx";
import { JlptBankListeningAudio, JlptBankListeningReview, prepareListeningBankQuestion } from "../components/JlptBankListening.tsx";
import { reconstructOrderingQuestion } from "../../lib/jlptOrdering.ts";
import { resolvePassage, stableHash } from "../../lib/jlptReading.ts";
import { readingPassageUnderlineRange, readingQuestionUnderline } from "../../lib/jlptReadingAnnotations.ts";
import { findMarkdownPipeTables } from "../../lib/markdownpipetable.ts";
import { MarkdownTableText } from "../../components/markdowntabletext.tsx";
import { alignTextSegmentsToLineBreaks } from "../../lib/alignTextSegments.ts";

type QuestionCategory = "goi" | "grammar" | "reading" | "listening";
type StudyBank = "n3-goi" | "n3-bunpo" | "n3-reading" | "n3-listening";
type StatusFilter = "all" | "correct" | "wrong" | "not-started";

interface PracticeQuestion {
  key: string;
  category: QuestionCategory;
  exam: DeThiExam;
  paper: DeThiPaper;
  question: DeThiQuestion & { correctIndex: number };
  paperIndex: number;
}

type ExamQuestionSets = Record<QuestionCategory, PracticeQuestion[]> & {
  exam: DeThiExam;
};

const SOURCE_ORDER = ["cac-nam", "de-n3"];
const SOURCE_LABELS: Record<string, string> = {
  "cac-nam": "Đề JLPT theo kỳ",
  "de-n3": "10 đề N3",
};
const ALL_TERMS = "all-terms";
const ALL_SOURCES = "all-sources";
const BANK_PAGE_SIZE = 20;
const GOI_TYPES = [
  { value: "all", label: "Tất cả dạng" },
  { value: "kanji", label: "Kanji · đọc và chọn chữ" },
  { value: "3", label: "Từ theo ngữ cảnh" },
  { value: "4", label: "Từ gần nghĩa" },
  { value: "5", label: "Cách dùng từ" },
];
const BUNPO_TYPES = [
  { value: "all", label: "Tất cả dạng" },
  { value: "1", label: "Chọn mẫu ngữ pháp" },
  { value: "2", label: "Sắp xếp câu ★" },
  { value: "3", label: "Ngữ pháp trong đoạn văn" },
];
const BANK_CONFIG = {
  "n3-goi": { category: "goi", title: "Goi", description: "Kanji và từ vựng", types: GOI_TYPES },
  "n3-bunpo": { category: "grammar", title: "Bunpo", description: "Ngữ pháp", types: BUNPO_TYPES },
  "n3-reading": { category: "reading", title: "Đọc hiểu", description: "Đọc hiểu", types: [
    { value: "all", label: "Tất cả dạng" },
    { value: "4", label: "Đoạn văn ngắn" },
    { value: "5", label: "Đoạn văn vừa" },
    { value: "6", label: "Đoạn văn dài" },
    { value: "7", label: "Tìm thông tin" },
  ] },
  "n3-listening": { category: "listening", title: "Nghe hiểu", description: "Nghe hiểu", types: [
    { value: "all", label: "Tất cả dạng" },
    { value: "1", label: "Hiểu yêu cầu" },
    { value: "2", label: "Bắt ý chính" },
    { value: "3", label: "Hiểu tổng quan" },
    { value: "4", label: "Diễn đạt theo tình huống" },
    { value: "5", label: "Phản xạ nhanh" },
  ] },
} satisfies Record<StudyBank, { category: QuestionCategory; title: string; description: string; types: typeof GOI_TYPES }>;

function shuffled<T>(items: readonly T[]): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index--) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

function matchesBankType(question: DeThiQuestion, type: string): boolean {
  const group = groupNumber(question);
  if (type === "all") return true;
  if (type === "kanji") return group === 1 || group === 2;
  return String(group) === type;
}

function findStudyPassage({ paper, paperIndex, question }: PracticeQuestion) {
  if (!question.passage) return null;
  const text = resolvePassage(paper, paperIndex);
  if (!text) return null;
  const related = paper.questions.filter((candidate, index) =>
    candidate.problemGroup === question.problemGroup && resolvePassage(paper, index) === text,
  );
  const furigana = related.find((candidate) => candidate.passageFurigana?.length)?.passageFurigana;
  const body = furigana?.map((segment) => segment.text).join("") === text ? furigana : [{ text, furigana: null }];
  const signature = stableHash(JSON.stringify(body));
  const presentation = related.find((candidate) => candidate.readingPresentation?.bodySignature === signature)?.readingPresentation;
  const translation = presentation?.translationVi?.trim()
    || related.find((candidate) => candidate.passageVi?.trim())?.passageVi
    || (presentation?.sentencesVi ?? related.find((candidate) => candidate.passageSentencesVi?.length)?.passageSentencesVi)?.join("\n");
  return { text, translation, furigana };
}

function readingGroups(items: PracticeQuestion[]): PracticeQuestion[][] {
  const groups = new Map<string, PracticeQuestion[]>();
  for (const item of items) {
    const passage = resolvePassage(item.paper, item.paperIndex);
    const key = passage
      ? JSON.stringify([item.exam.id, item.paper.id, item.question.problemGroup, passage])
      : item.key;
    const group = groups.get(key);
    if (group) group.push(item);
    else groups.set(key, [item]);
  }
  return [...groups.values()];
}

function groupNumber(question: DeThiQuestion): number {
  const match = question.problemGroup.match(/\d+/u);
  return match ? Number(match[0]) : -1;
}

function questionCategory(paper: DeThiPaper, question: DeThiQuestion, bankCategory?: QuestionCategory): QuestionCategory | null {
  const group = groupNumber(question);
  if (paper.id === "moji-goi") return "goi";
  // N1 stores 文字・語彙, 文法, and 読解 in one combined paper.
  if (paper.id === "language-reading") {
    if (group >= 1 && group <= 5) return "goi";
    if (group >= 6 && group <= 8) return "grammar";
    return null;
  }
  // N3 paper data keeps the grammar 問題1–3 before the reading groups.
  if (paper.id === "bunpou-dokkai" && group >= 1 && group <= 3) return "grammar";
  if (bankCategory === "reading" && paper.id === "bunpou-dokkai" && group >= 4 && group <= 7) return "reading";
  if (bankCategory === "listening" && paper.id === "choukai") return "listening";
  return null;
}

function buildExamQuestionSets(exam: DeThiExam, bankCategory?: QuestionCategory): ExamQuestionSets {
  const sets: ExamQuestionSets = { exam, goi: [], grammar: [], reading: [], listening: [] };
  exam.papers.forEach((paper) => {
    if (paper.gradingAvailable === false) return;
    paper.questions.forEach((sourceQuestion, paperIndex) => {
      const category = questionCategory(paper, sourceQuestion, bankCategory);
      if (!category || (bankCategory && category !== bankCategory)) return;
      const question = category === "listening" ? prepareListeningBankQuestion(exam, paper, sourceQuestion) : sourceQuestion;
      if (!question) return;
      const optionCount = question.optionsImage ? question.optionCount ?? 0 : question.options.length;
      if (question.correctIndex === null || !Number.isInteger(question.correctIndex) || question.correctIndex < 0 || question.correctIndex >= optionCount) return;
      const item: PracticeQuestion = {
        key: `${exam.id}::${paper.id}::${question.number}::${paperIndex}`,
        category,
        exam,
        paper,
        question: question as DeThiQuestion & { correctIndex: number },
        paperIndex,
      };
      sets[category].push(item);
    });
  });
  return sets;
}

function renderEmphasizedText(text: string, terms: Array<string | undefined>) {
  const matches = terms
    .filter((term): term is string => !!term?.trim())
    .map((term) => ({ term, index: text.indexOf(term) }))
    .filter((match) => match.index >= 0)
    .sort((a, b) => a.index - b.index || b.term.length - a.term.length);
  const match = matches[0];
  if (!match) return text;
  return (
    <>
      {text.slice(0, match.index)}
      <u className="decoration-2 underline-offset-4">{match.term}</u>
      {text.slice(match.index + match.term.length)}
    </>
  );
}

function renderFuriganaText(
  text: string,
  segments: ReadingBodySegment[] | undefined,
  visible: boolean,
  terms: Array<string | undefined> = [],
  range?: { start: number; end: number },
) {
  function renderRange(value: string, offset: number) {
    if (!range) return renderEmphasizedText(value, terms);
    const start = Math.max(0, range.start - offset);
    const end = Math.min(value.length, range.end - offset);
    if (end <= start) return value;
    return <>{value.slice(0, start)}<u className="decoration-2 underline-offset-4">{value.slice(start, end)}</u>{value.slice(end)}</>;
  }

  const alignedSegments = alignTextSegmentsToLineBreaks(segments, text);
  if (!visible || !alignedSegments?.length) return renderRange(text, 0);

  let offset = 0;
  return alignedSegments.map((segment, index) => {
    const content = renderRange(segment.text, offset);
    offset += segment.text.length;
    return (
      <span key={index}>
        {segment.furigana ? <ruby>{content}<rt className="text-[10px] font-normal text-neutral-400">{segment.furigana}</rt></ruby> : content}
      </span>
    );
  });
}

function statusLabel(status: JlptQuestionPracticeStatus | undefined): string {
  if (status === "correct") return "Đã làm đúng";
  if (status === "wrong") return "Cần ôn lại";
  return "Chưa làm";
}

export function JlptQuestionStudyScreen({
  bank,
  targetId,
  onBack,
  onBackLabel = "Menu",
  onCurrentItemChange,
}: {
  bank?: StudyBank;
  targetId?: string;
  onBack?: () => void;
  onBackLabel?: string;
  onCurrentItemChange?: (id: string | undefined) => void;
} = {}) {
  const config = bank ? BANK_CONFIG[bank] : undefined;
  const isBank = config !== undefined;
  const isBunpoBank = bank === "n3-bunpo";
  const isReadingBank = bank === "n3-reading";
  const isListeningBank = bank === "n3-listening";
  const bankCategory = config?.category ?? "goi";
  const catalog = useMemo(() => {
    const sourceRank = (source: string) => {
      const index = SOURCE_ORDER.indexOf(source);
      return index < 0 ? SOURCE_ORDER.length : index;
    };
    return [...ALL_EXAMS]
      .filter((exam) => !isBank || (exam.level === "N3" && SOURCE_ORDER.includes(exam.source)))
      .sort((a, b) => sourceRank(a.source) - sourceRank(b.source) || (a.source === "de-n3"
        ? a.id.localeCompare(b.id, undefined, { numeric: true })
        : b.id.localeCompare(a.id)))
      .map((exam) => buildExamQuestionSets(exam, config?.category));
  }, [config, isBank]);
  const initialItem = targetId
    ? catalog.flatMap((set) => [...set.goi, ...set.grammar]).find((item) => item.key === targetId)
    : undefined;
  const initialSource = initialItem?.exam.source ?? SOURCE_ORDER.find((source) => catalog.some((set) =>
    set.exam.source === source && (isBank ? set[bankCategory].length > 0 : set.goi.length + set.grammar.length > 0),
  )) ?? "cac-nam";
  const initialCategory = initialItem?.category ?? bankCategory;
  const initialExam = isBank ? ALL_TERMS : initialItem?.exam.id ?? catalog.find((set) => set.exam.source === initialSource && set[initialCategory].length > 0)?.exam.id ?? "";
  const [source, setSource] = useState(initialSource);
  const [category, setCategory] = useState<QuestionCategory>(initialCategory);
  const [examId, setExamId] = useState(initialExam);
  const [selectedQuestionId, setSelectedQuestionId] = useState<string | null>(initialItem?.key ?? null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [bankType, setBankType] = useState("all");
  const [page, setPage] = useState(0);
  const [bankSession, setBankSession] = useState<PracticeQuestion[]>([]);
  const [roundAnswers, setRoundAnswers] = useState<JlptQuestionPracticeProgress | null>(null);
  const [optionOrders, setOptionOrders] = useState<Record<string, number[]>>({});
  const [sessionSize, setSessionSize] = useState<SessionSize>(20);
  const [reviewSize, setReviewSize] = useState<SessionSize>(20);
  const [shuffleQuestions, setShuffleQuestions] = useState(false);
  const [shuffleOptions, setShuffleOptions] = useState(false);
  const [requireAnswer, setRequireAnswer] = useState(true);
  const [progress, setProgress] = useState<JlptQuestionPracticeProgress | null>(null);
  const [savingQuestionId, setSavingQuestionId] = useState<string | null>(null);
  const [selectionRestored, setSelectionRestored] = useState(Boolean(targetId));

  useEffect(() => {
    let cancelled = false;
    Promise.all([loadJlptQuestionPracticeProgress(), isBank ? null : loadJlptQuestionPracticeSelection()]).then(([saved, selection]) => {
      if (cancelled) return;
      setProgress(saved);
      if (!targetId && selection) {
        const restoredExam = selection.examId ? catalog.find((set) => set.exam.id === selection.examId) : undefined;
        const restoredCategory = selection.category === "goi" || selection.category === "grammar" ? selection.category : undefined;
        if (restoredExam && restoredCategory && restoredExam.exam.source === selection.source && restoredExam[restoredCategory].length > 0) {
          setSource(restoredExam.exam.source);
          setCategory(restoredCategory);
          setExamId(restoredExam.exam.id);
        }
      }
      setSelectionRestored(true);
    });
    return () => {
      cancelled = true;
    };
  }, [isBank, targetId]);

  useEffect(() => {
    if (isBank || !selectionRestored) return;
    saveJlptQuestionPracticeSelection({ source, category, examId });
  }, [source, category, examId, selectionRestored, isBank]);

  useEffect(() => {
    onCurrentItemChange?.(selectedQuestionId ?? undefined);
  }, [selectedQuestionId, onCurrentItemChange]);

  if (progress === null) return <LoadingScreen variant="quiz" title="Luyện câu hỏi JLPT" />;

  const registeredSourceOptions = SOURCE_ORDER
    .filter((id) => catalog.some((set) => set.exam.source === id && set[category].length > 0))
    .map((id) => ({ value: id, label: SOURCE_LABELS[id] ?? id }));
  const sourceOptions = isBank ? [...registeredSourceOptions, { value: ALL_SOURCES, label: "Tất cả nguồn" }] : registeredSourceOptions;
  const examsForSource = catalog.filter((set) =>
    (set.exam.source === source || (isBank && source === ALL_SOURCES)) && set[category].length > 0,
  );
  const examOptions = examsForSource.map((set) => ({ value: set.exam.id, label: set.exam.examLabel }));
  const selectedExam = examsForSource.find((set) => set.exam.id === examId) ?? examsForSource[0];
  const selectedBankExams = isBank ? examsForSource.filter((set) => examId === ALL_TERMS || set.exam.id === examId) : [];
  const allExamsLabel = source === "cac-nam" ? "Tất cả kỳ thi" : "Tất cả đề";
  const questions = isBank
    ? selectedBankExams
      .flatMap((set) => set[bankCategory])
      .filter((item) => matchesBankType(item.question, bankType))
    : selectedExam?.[category] ?? [];
  const sessionQuestions = isBank ? bankSession : questions;
  const selectedQuestion = selectedQuestionId ? sessionQuestions.find((item) => item.key === selectedQuestionId) : undefined;

  function openQuestion(item: PracticeQuestion) {
    setSelectedQuestionId(item.key);
    if (isBank) window.scrollTo(0, 0);
  }

  function backToList() {
    setSelectedQuestionId(null);
    if (isBank) window.scrollTo(0, 0);
  }

  async function chooseAnswer(item: PracticeQuestion, selectedIndex: number) {
    const activeProgress = roundAnswers ?? progress;
    if (!activeProgress || activeProgress[item.key] || savingQuestionId) return;
    setSavingQuestionId(item.key);
    try {
      const attempt = await recordJlptQuestionPracticeAnswer(item.key, selectedIndex, item.question.correctIndex);
      setProgress((current) => ({ ...(current ?? {}), [item.key]: attempt }));
      setRoundAnswers((current) => current === null ? null : { ...current, [item.key]: attempt });
    } finally {
      setSavingQuestionId(null);
    }
  }

  async function redoQuestion(item: PracticeQuestion) {
    await clearJlptQuestionPracticeAnswer(item.key);
    setProgress((current) => {
      if (!current) return current;
      const { [item.key]: _removed, ...remaining } = current;
      return remaining;
    });
  }

  if (selectedQuestion) {
    const currentIndex = sessionQuestions.findIndex((item) => item.key === selectedQuestion.key);
    const displayedProgress = roundAnswers ?? progress;
    const saved = displayedProgress[selectedQuestion.key];
    const previous = currentIndex > 0 ? sessionQuestions[currentIndex - 1] : undefined;
    const next = sessionQuestions[currentIndex + 1];
    return (
      <QuestionDetail
        item={selectedQuestion}
        isBank={isBank}
        optionOrder={optionOrders[selectedQuestion.key]}
        requireAnswer={roundAnswers !== null && requireAnswer}
        index={currentIndex}
        total={sessionQuestions.length}
        savedIndex={saved?.selectedIndex}
        status={saved?.status}
        saving={savingQuestionId === selectedQuestion.key}
        progress={displayedProgress}
        questions={sessionQuestions}
        onBack={backToList}
        onOpen={openQuestion}
        onAnswer={(index) => chooseAnswer(selectedQuestion, index)}
        onRedo={roundAnswers === null ? () => redoQuestion(selectedQuestion) : undefined}
        previous={previous}
        next={next}
      />
    );
  }

  const answeredCount = questions.filter((item) => !!progress[item.key]).length;
  const correctCount = questions.filter((item) => progress[item.key]?.status === "correct").length;
  const wrongCount = questions.filter((item) => progress[item.key]?.status === "wrong").length;
  const notStartedCount = questions.length - answeredCount;
  const visibleQuestions = questions.filter((item) => {
    const status = progress[item.key]?.status;
    if (statusFilter === "all") return true;
    if (statusFilter === "not-started") return !status;
    return status === statusFilter;
  });
  const currentPage = Math.min(page, Math.max(0, Math.ceil(visibleQuestions.length / BANK_PAGE_SIZE) - 1));
  const offset = isBank ? currentPage * BANK_PAGE_SIZE : 0;
  const listedQuestions = isBank ? visibleQuestions.slice(offset, offset + BANK_PAGE_SIZE) : visibleQuestions;

  function startRound(pool: PracticeQuestion[], size: SessionSize, review = false) {
    let items: PracticeQuestion[];
    if (isReadingBank) {
      const groups = readingGroups(pool).filter((group) => !review || group.some((item) => progress?.[item.key]?.status !== "correct"));
      items = [];
      for (const group of shuffleQuestions ? shuffled(groups) : groups) {
        if (size !== "all" && items.length >= size) break;
        items.push(...group);
      }
    } else {
      const ordered = shuffleQuestions ? shuffled(pool) : pool;
      items = size === "all" ? ordered : ordered.slice(0, size);
    }
    if (!items.length) return;
    setRoundAnswers({});
    setOptionOrders(shuffleOptions && !isListeningBank
      ? Object.fromEntries(items
        .filter((item) => !isBunpoBank || groupNumber(item.question) !== 2)
        .map((item) => [item.key, shuffled(item.question.options.map((_, index) => index))]))
      : {});
    setBankSession(items);
    openQuestion(items[0]);
  }

  function openBankReview(item: PracticeQuestion) {
    setRoundAnswers(null);
    setOptionOrders({});
    setBankSession(isReadingBank
      ? readingGroups(questions).find((group) => group.includes(item)) ?? [item]
      : visibleQuestions);
    openQuestion(item);
  }

  function toggleStatus(value: Exclude<StatusFilter, "all">) {
    setPage(0);
    setStatusFilter(statusFilter === value ? "all" : value);
  }

  function changeCategory(nextCategory: QuestionCategory) {
    const nextExams = catalog.filter((set) => set.exam.source === source && set[nextCategory].length > 0);
    setCategory(nextCategory);
    if (!nextExams.some((set) => set.exam.id === examId)) setExamId(nextExams[0]?.exam.id ?? "");
    setSelectedQuestionId(null);
    setStatusFilter("all");
  }

  function changeSource(nextSource: string) {
    const nextExam = isBank ? undefined : catalog.find((set) => set.exam.source === nextSource && set[category].length > 0);
    setSource(nextSource);
    setExamId(isBank ? ALL_TERMS : nextExam?.exam.id ?? "");
    setSelectedQuestionId(null);
    setPage(0);
    setStatusFilter("all");
  }

  function changeExam(nextExamId: string) {
    setExamId(nextExamId);
    setSelectedQuestionId(null);
    setPage(0);
    setStatusFilter("all");
  }

  return (
    <div className="mx-auto max-w-6xl px-2.5 py-2 md:px-8 md:py-6">
      {onBack ? (
        <button onClick={onBack} className="mb-2 flex items-center gap-1 text-sm font-medium text-neutral-500 hover:text-neutral-700">
          <ArrowLeft size={15} /> {onBackLabel}
        </button>
      ) : null}
      <PageHeader
        title={config ? `Ôn theo dạng · ${config.title} N3` : "Ôn Goi & Bunpo JLPT"}
        subtitle={config ? `${config.description} · ${selectedBankExams.length} đề · ${questions.length} câu` : `${questions.length} câu${selectedExam ? ` · ${selectedExam.exam.examLabel}` : ""}`}
        icon={{ img: "icon-jlpt.png", bg: "#eff6ff" }}
      />

      {!isBank ? <div className="mt-4 grid grid-cols-2 gap-2 rounded-2xl border border-neutral-200 bg-neutral-50 p-1 sm:max-w-xl">
        <button
          type="button"
          onClick={() => changeCategory("goi")}
          aria-pressed={category === "goi"}
          className={`rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors ${category === "goi" ? "bg-white text-rose-700 shadow-sm" : "text-neutral-500 hover:text-neutral-800"}`}
        >
          Goi - Kanji & Tango
        </button>
        <button
          type="button"
          onClick={() => changeCategory("grammar")}
          aria-pressed={category === "grammar"}
          className={`rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors ${category === "grammar" ? "bg-white text-rose-700 shadow-sm" : "text-neutral-500 hover:text-neutral-800"}`}
        >
          Bunpo
        </button>
      </div> : null}

      <div className={`mt-3 grid gap-3 sm:grid-cols-2 ${isBank ? "lg:grid-cols-3" : ""}`}>
        <div>
          <div className="text-xs font-semibold text-neutral-500">Nguồn đề</div>
          <Select items={sourceOptions} value={source} onValueChange={(value) => value !== null && changeSource(value)}>
            <SelectTrigger aria-label="Nguồn đề ôn JLPT" className="mt-1.5 h-11 w-full rounded-xl px-3 text-left font-medium shadow-none">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {sourceOptions.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        {config ? (
          <div>
            <div className="text-xs font-semibold text-neutral-500">Dạng câu hỏi</div>
            <Select items={config.types} value={bankType} onValueChange={(value) => {
              if (value === null) return;
              setBankType(value);
              setPage(0);
            }}>
              <SelectTrigger aria-label={`Dạng câu hỏi ${config.title}`} className="mt-1.5 h-11 w-full rounded-xl px-3 text-left font-medium shadow-none">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {config.types.map((type) => <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        ) : null}
        <div>
          <div className="text-xs font-semibold text-neutral-500">{isBank && source === "cac-nam" ? "Kỳ thi" : "Kỳ thi / bộ đề"}</div>
          <Select
            items={isBank ? [{ value: ALL_TERMS, label: allExamsLabel }, ...examOptions] : examOptions}
            value={isBank ? examId : selectedExam?.exam.id ?? ""}
            onValueChange={(value) => value !== null && changeExam(value)}
          >
            <SelectTrigger aria-label="Chọn kỳ thi hoặc bộ đề JLPT" className="mt-1.5 h-11 w-full rounded-xl px-3 text-left font-medium shadow-none">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {isBank ? <SelectItem value={ALL_TERMS}>{allExamsLabel}</SelectItem> : null}
              {examsForSource.map((set) => <SelectItem key={set.exam.id} value={set.exam.id}>{set.exam.examLabel}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
      {!isBank ? <p className="mt-1 text-xs text-neutral-400">Hai lựa chọn này chỉ lọc danh sách ôn Goi và Bunpo bên dưới.</p> : null}

      {isBank ? (
        <JlptSessionSetup
          total={questions.length}
          correct={correctCount}
          size={sessionSize}
          reviewSize={reviewSize}
          shuffleQuestions={shuffleQuestions}
          shuffleOptions={shuffleOptions}
          shuffleOptionsNote={isBunpoBank ? "Giữ thứ tự gốc ở câu sắp xếp ★." : undefined}
          keepReadingGroups={isReadingBank}
          preserveOptionOrder={isListeningBank}
          requireAnswer={requireAnswer}
          onSizeChange={setSessionSize}
          onReviewSizeChange={setReviewSize}
          onShuffleQuestionsChange={setShuffleQuestions}
          onShuffleOptionsChange={setShuffleOptions}
          onRequireAnswerChange={setRequireAnswer}
          onStart={() => startRound(questions, sessionSize)}
          onStartReview={() => startRound(isReadingBank ? questions : questions.filter((item) => progress[item.key]?.status !== "correct"), reviewSize, true)}
        />
      ) : null}

      {isBank ? <h2 className="mt-6 text-base font-bold text-neutral-800">Danh sách câu hỏi</h2> : null}
      <div className="mt-4 grid grid-cols-3 gap-2 sm:gap-3">
        <StatCard label="Đã làm đúng" value={correctCount} tone="emerald" active={statusFilter === "correct"} onClick={() => toggleStatus("correct")} />
        <StatCard label="Cần ôn lại" value={wrongCount} tone="rose" active={statusFilter === "wrong"} onClick={() => toggleStatus("wrong")} />
        <StatCard label="Chưa làm" value={notStartedCount} active={statusFilter === "not-started"} onClick={() => toggleStatus("not-started")} />
      </div>
      <p className="mt-2 text-right text-xs text-neutral-400">Đã lưu {answeredCount}/{questions.length} câu · bấm “Làm lại” để xoá kết quả từng câu</p>
      {visibleQuestions.length ? (
        <div className="mt-3 flex flex-col gap-2">
          {listedQuestions.map((item, index) => {
            const attempt = progress[item.key];
            const borderClass = attempt?.status === "correct" ? "border-l-emerald-400" : attempt?.status === "wrong" ? "border-l-rose-400" : "border-l-neutral-200";
            return (
              <button
                type="button"
                key={item.key}
                onClick={() => isBank ? openBankReview(item) : openQuestion(item)}
                className={`flex items-center gap-3 rounded-2xl border border-l-4 border-neutral-200 bg-white px-4 py-3 text-left transition-colors hover:border-rose-200 hover:bg-rose-50/30 ${borderClass}`}
              >
                <span className="w-9 shrink-0 text-xs font-semibold text-neutral-400">{String(offset + index + 1).padStart(2, "0")}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-neutral-800">{item.question.question || `Câu ${item.question.number}`}</span>
                  <span className="mt-0.5 block text-xs text-neutral-500">Câu gốc {item.question.number} · {item.question.problemGroup} · {isBank ? item.exam.examLabel : item.exam.level}</span>
                </span>
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${attempt?.status === "correct" ? "bg-emerald-50 text-emerald-700" : attempt?.status === "wrong" ? "bg-rose-50 text-rose-700" : "bg-neutral-100 text-neutral-400"}`}>
                  {statusLabel(attempt?.status)}
                </span>
              </button>
            );
          })}
        </div>
      ) : (
        <p className="mt-4 rounded-xl bg-neutral-50 p-4 text-sm text-neutral-500">Không có câu hỏi phù hợp với bộ lọc.</p>
      )}
      {isBank && visibleQuestions.length > BANK_PAGE_SIZE ? (
        <div className="mt-4 flex items-center justify-between gap-2 text-sm text-neutral-600">
          <button type="button" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)} className="rounded-xl border border-neutral-200 px-3 py-2 font-semibold disabled:opacity-40">Trang trước</button>
          <span>{offset + 1}–{offset + listedQuestions.length} / {visibleQuestions.length}</span>
          <button type="button" disabled={offset + listedQuestions.length >= visibleQuestions.length} onClick={() => setPage(currentPage + 1)} className="rounded-xl border border-neutral-200 px-3 py-2 font-semibold disabled:opacity-40">Trang sau</button>
        </div>
      ) : null}
    </div>
  );
}

function QuestionDetail({
  item,
  isBank,
  optionOrder,
  requireAnswer,
  index,
  total,
  savedIndex,
  status,
  saving,
  progress,
  questions,
  onBack,
  onOpen,
  onAnswer,
  onRedo,
  previous,
  next,
}: {
  item: PracticeQuestion;
  isBank: boolean;
  optionOrder?: number[];
  requireAnswer: boolean;
  index: number;
  total: number;
  savedIndex?: number;
  status?: JlptQuestionPracticeStatus;
  saving: boolean;
  progress: JlptQuestionPracticeProgress;
  questions: PracticeQuestion[];
  onBack: () => void;
  onOpen: (item: PracticeQuestion) => void;
  onAnswer: (index: number) => void;
  onRedo?: () => void;
  previous?: PracticeQuestion;
  next?: PracticeQuestion;
}) {
  const [showFurigana, setShowFurigana] = useState(false);
  const question = item.question;
  const isReading = item.category === "reading";
  const isListening = item.category === "listening";
  const passage = isReading || (isBank && item.category === "grammar") ? findStudyPassage(item) : null;
  const passageRange = isReading && passage ? readingPassageUnderlineRange(question.question, question.underline,
    question.passageUnderline, passage.text, question.passageUnderlineOccurrence) : undefined;
  const promptUnderline = isReading ? readingQuestionUnderline(question.question, question.underline, passage?.text ?? null) : question.underline;
  const orderingReconstruction = reconstructOrderingQuestion(question);
  const answered = savedIndex !== undefined;
  const locked = answered || saving;
  const hideSpokenChoices = isListening && !answered && groupNumber(question) >= 3;
  const displayedOptions = optionOrder ?? Array.from(
    { length: question.optionsImage ? question.optionCount ?? 0 : question.options.length },
    (_, index) => index,
  );
  const displayedCorrectIndex = displayedOptions.indexOf(question.correctIndex);
  const optionExplanations = question.optionExplanations;
  const officialExam = item.exam.source === "cac-nam";
  const furiganaVisible = showFurigana && (answered || (!isBank && !officialExam));
  const passageHasTable = !!passage && findMarkdownPipeTables(passage.text).length > 0;
  const hasFurigana = !!question.questionFurigana?.length || (!passageHasTable && !!passage?.furigana?.length) || !!question.optionsFurigana?.some((segments) => segments?.length);
  const categoryLabel = { goi: "Goi - Kanji & Tango", grammar: "Bunpo", reading: "Đọc hiểu", listening: "Nghe hiểu" }[item.category];
  const firstUnanswered = requireAnswer ? questions.findIndex((candidate) => !progress[candidate.key]) : -1;
  const paletteItems = questions.map((candidate, candidateIndex) => {
    const candidateStatus = progress[candidate.key]?.status;
    const paletteStatus: PaletteStatus = candidate.key === item.key ? "current" : candidateStatus ?? "unanswered";
    return {
      id: `${candidate.question.number}-${candidateIndex}`,
      status: paletteStatus,
      title: isBank ? `${candidate.exam.examLabel} · Câu gốc ${candidate.question.number}` : undefined,
    };
  });

  return (
    <div className="mx-auto max-w-6xl px-2.5 py-2 md:px-8 md:py-6">
      <button onClick={onBack} disabled={saving} className="flex items-center gap-1 text-sm font-medium text-neutral-500 hover:text-neutral-700 disabled:opacity-40">
        <ArrowLeft size={15} /> Danh sách câu hỏi
      </button>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-semibold text-neutral-600">{item.exam.level}</span>
        <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-semibold text-neutral-600">{item.exam.examLabel}</span>
        <span className="rounded-full bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700">{categoryLabel}</span>
      </div>
      <h1 className="mt-2 text-lg font-bold text-neutral-800">Câu {index + 1}/{total} · {question.problemGroup}</h1>
      <QuestionPalette
        summary={`Câu ${index + 1}/${total} · đã làm ${questions.filter((candidate) => !!progress[candidate.key]).length}`}
        onJump={(position) => {
          if (saving || (firstUnanswered >= 0 && position > firstUnanswered)) return;
          const target = questions[position];
          if (target) onOpen(target);
        }}
        items={paletteItems}
      />

      {hasFurigana && (!isBank || answered) ? (
        <button
          type="button"
          aria-pressed={showFurigana}
          onClick={() => setShowFurigana((value) => !value)}
          className={`mt-3 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ${showFurigana ? "bg-rose-50 text-rose-700" : "bg-neutral-100 text-neutral-500"}`}
        >
          <BookOpenText size={13} /> {showFurigana ? "Ẩn furigana" : "Hiện furigana"}
        </button>
      ) : null}

      <Card className="mt-4 gap-0 rounded-2xl border-neutral-200 p-5 ring-0 sm:p-6">
        {passage ? (
          <details open key={passage.text} className="mb-4 min-w-0 rounded-xl border border-neutral-200 bg-neutral-50 p-3 text-sm text-neutral-700 sm:p-4">
            <summary className="cursor-pointer font-semibold">Đoạn văn</summary>
            <div lang="ja" className="mt-2 overflow-x-auto whitespace-pre-line leading-relaxed">
              {passageHasTable ? <MarkdownTableText text={passage.text} /> : renderFuriganaText(
                passage.text, passage.furigana, furiganaVisible,
                isReading ? [] : [`（${question.number}）`, `(${question.number})`], passageRange,
              )}
            </div>
            {answered && passage.translation ? (
              <details className="mt-3 border-t border-neutral-200 pt-2">
                <summary className="cursor-pointer font-semibold">Bản dịch đoạn văn</summary>
                <div className="mt-2 overflow-x-auto leading-relaxed"><MarkdownTableText text={passage.translation} /></div>
              </details>
            ) : null}
          </details>
        ) : null}
        {isListening ? <JlptBankListeningAudio key={item.key} question={question} paper={item.paper} /> : null}
        <div className="flex items-start gap-3">
          <span className="shrink-0 rounded-lg bg-neutral-100 px-2 py-1 text-sm font-bold text-neutral-600">{question.number}.</span>
          <div className="whitespace-pre-line text-lg font-semibold leading-relaxed text-neutral-800">
            {isListening && !answered ? "Nghe rồi chọn đáp án" : renderFuriganaText(question.question, question.questionFurigana, furiganaVisible, [promptUnderline])}
          </div>
        </div>
        {answered && question.questionVi ? <p className="mt-2 whitespace-pre-line pl-10 text-sm text-neutral-500">{question.questionVi}</p> : null}

        <div className={`mt-5 grid gap-2 ${question.options.every((option) => option.length <= 14) ? "grid-cols-2" : "grid-cols-1 sm:grid-cols-2"}`}>
          {displayedOptions.map((optionIndex, displayIndex) => {
            const rawOption = question.options[optionIndex] ?? "";
            const option = hideSpokenChoices || (isListening && rawOption.trim() === String(optionIndex + 1)) ? "" : rawOption;
            const isCorrect = optionIndex === question.correctIndex;
            const isSelected = optionIndex === savedIndex;
            const optionClass = !answered
              ? "border-neutral-200 hover:border-rose-200 hover:bg-rose-50/40"
              : isCorrect
                ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                : isSelected
                  ? "border-rose-300 bg-rose-50 text-rose-800"
                  : "border-neutral-200 opacity-55";
            return (
              <button
                type="button"
                key={optionIndex}
                disabled={locked}
                onClick={() => onAnswer(optionIndex)}
                className={`min-h-12 rounded-xl border px-3 py-2.5 text-left text-sm font-medium text-neutral-800 transition-colors disabled:cursor-default ${optionClass}`}
              >
                <span className="mr-2 inline-flex h-6 w-6 items-center justify-center rounded-full border border-current/20 text-xs text-neutral-400">{displayIndex + 1}</span>
                {renderFuriganaText(option, question.optionsFurigana?.[optionIndex] ?? undefined, furiganaVisible, [question.underlineForms?.[optionIndex], question.underline])}
                {answered && question.optionsVi?.[optionIndex] ? <span className="mt-1 block pl-8 text-xs font-normal text-neutral-500">{question.optionsVi[optionIndex]}</span> : null}
              </button>
            );
          })}
        </div>

        {answered ? (
          <div className={`mt-4 rounded-xl border p-4 text-sm ${status === "correct" ? "border-emerald-100 bg-emerald-50/50" : "border-rose-100 bg-rose-50/50"}`}>
            <p className={`font-bold ${status === "correct" ? "text-emerald-700" : "text-rose-700"}`}>
              {status === "correct" ? "Bạn trả lời đúng" : "Bạn trả lời chưa đúng"} · đáp án {displayedCorrectIndex + 1}
            </p>
            {orderingReconstruction ? (
              <div className="mt-3">
                <p className="font-semibold text-neutral-700">
                  Thứ tự ghép: {orderingReconstruction.order.map((optionIndex) => optionIndex + 1).join(" → ")} · ★ là phương án {question.correctIndex + 1}
                </p>
                <p className="mt-1 leading-relaxed text-neutral-700">
                  <span className="font-semibold">Câu hoàn chỉnh: </span>{orderingReconstruction.sentence}
                </p>
                {question.orderingSentenceVi ? <p className="mt-1 leading-relaxed text-neutral-500"><span className="font-semibold not-italic">Dịch: </span>{question.orderingSentenceVi}</p> : null}
              </div>
            ) : null}
            <QuestionExplanationBlock
              explanation={question.explanation}
              optionExplanations={optionExplanations ? displayedOptions.map((index) => optionExplanations[index]) : undefined}
              correctIndex={displayedCorrectIndex}
              showMissing={!orderingReconstruction}
              className={orderingReconstruction ? "mt-3 border-t border-neutral-200/70 pt-3" : "mt-2"}
            />
            {question.answerSourceNote ? <p className="mt-3 rounded-lg bg-amber-50 p-2 text-xs leading-relaxed text-amber-700">{question.answerSourceNote}</p> : null}
            {onRedo ? <button type="button" onClick={onRedo} className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-neutral-500 hover:text-rose-700">
              <RotateCcw size={13} /> Làm lại câu này
            </button> : null}
          </div>
        ) : saving ? <p className="mt-4 text-sm text-neutral-500">Đang lưu câu trả lời...</p> : null}
      </Card>
      {isListening && answered ? <JlptBankListeningReview key={item.key} question={question} /> : null}

      <div className="mt-4 flex items-center justify-between gap-3">
        <button type="button" disabled={!previous || saving} onClick={() => previous && onOpen(previous)} className="inline-flex items-center gap-1 rounded-xl border border-neutral-200 px-3 py-2 text-sm font-semibold text-neutral-600 disabled:opacity-40">
          <ChevronLeft size={16} /> Câu trước
        </button>
        <span className="hidden text-xs font-medium text-neutral-400 sm:inline">Lưu từng câu riêng</span>
        <button type="button" disabled={saving || (requireAnswer && !answered) || (!next && !isBank)} onClick={() => next ? onOpen(next) : onBack()} className="inline-flex items-center gap-1 rounded-xl bg-rose-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-40">
          {isBank && !next ? "Về danh sách" : "Câu sau"} <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}
