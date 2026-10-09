import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ChevronLeft, ChevronRight, RotateCcw } from "lucide-react";
import { ALL_EXAMS } from "../../popup/dethiCatalog.ts";
import {
  clearJlptQuestionPracticeAnswer,
  loadJlptQuestionPracticeProgress,
  recordJlptQuestionPracticeAnswer,
  type JlptQuestionPracticeProgress,
  type JlptQuestionPracticeStatus,
} from "../../popup/jlptQuestionPracticeState.ts";
import type { DeThiExam, DeThiPaper, DeThiQuestion } from "../../types/dethi.ts";
import { PageHeader } from "../components/PageHeader.tsx";
import { StatCard } from "../components/StatCard.tsx";
import { Card } from "../components/ui/card.tsx";
import { LoadingScreen } from "../components/LoadingScreen.tsx";
import { QuestionPalette, type PaletteStatus } from "../components/QuestionPalette.tsx";

type QuestionCategory = "goi" | "grammar";
type StatusFilter = "all" | "correct" | "wrong" | "not-started";

interface PracticeQuestion {
  key: string;
  category: QuestionCategory;
  exam: DeThiExam;
  paper: DeThiPaper;
  question: DeThiQuestion & { correctIndex: number };
  paperIndex: number;
}

interface ExamQuestionSets {
  exam: DeThiExam;
  goi: PracticeQuestion[];
  grammar: PracticeQuestion[];
}

const SOURCE_ORDER = ["cac-nam", "de-n3"];
const SOURCE_LABELS: Record<string, string> = {
  "cac-nam": "Đề JLPT theo kỳ",
  "de-n3": "10 đề N3",
};

function groupNumber(question: DeThiQuestion): number {
  const match = question.problemGroup.match(/\d+/u);
  return match ? Number(match[0]) : -1;
}

function questionCategory(paper: DeThiPaper, question: DeThiQuestion): QuestionCategory | null {
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
  return null;
}

function buildExamQuestionSets(exam: DeThiExam): ExamQuestionSets {
  const goi: PracticeQuestion[] = [];
  const grammar: PracticeQuestion[] = [];
  exam.papers.forEach((paper) => {
    if (paper.gradingAvailable === false) return;
    paper.questions.forEach((question, paperIndex) => {
      if (question.correctIndex === null) return;
      const category = questionCategory(paper, question);
      if (!category) return;
      const item: PracticeQuestion = {
        key: `${exam.id}::${paper.id}::${question.number}::${paperIndex}`,
        category,
        exam,
        paper,
        question: question as DeThiQuestion & { correctIndex: number },
        paperIndex,
      };
      (category === "goi" ? goi : grammar).push(item);
    });
  });
  return { exam, goi, grammar };
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

function statusLabel(status: JlptQuestionPracticeStatus | undefined): string {
  if (status === "correct") return "Đã làm đúng";
  if (status === "wrong") return "Cần ôn lại";
  return "Chưa làm";
}

export function JlptQuestionStudyScreen({
  targetId,
  onBack,
  onBackLabel = "Menu",
  onCurrentItemChange,
}: {
  targetId?: string;
  onBack?: () => void;
  onBackLabel?: string;
  onCurrentItemChange?: (id: string | undefined) => void;
} = {}) {
  const catalog = useMemo(() => {
    const sourceRank = (source: string) => {
      const index = SOURCE_ORDER.indexOf(source);
      return index < 0 ? SOURCE_ORDER.length : index;
    };
    return [...ALL_EXAMS]
      .sort((a, b) => sourceRank(a.source) - sourceRank(b.source) || b.id.localeCompare(a.id))
      .map(buildExamQuestionSets);
  }, []);
  const initialItem = targetId
    ? catalog.flatMap((set) => [...set.goi, ...set.grammar]).find((item) => item.key === targetId)
    : undefined;
  const initialSource = initialItem?.exam.source ?? SOURCE_ORDER.find((source) => catalog.some((set) => set.exam.source === source && set.goi.length + set.grammar.length > 0)) ?? "cac-nam";
  const initialCategory = initialItem?.category ?? "goi";
  const initialExam = initialItem?.exam.id ?? catalog.find((set) => set.exam.source === initialSource && set[initialCategory].length > 0)?.exam.id ?? "";
  const [source, setSource] = useState(initialSource);
  const [category, setCategory] = useState<QuestionCategory>(initialCategory);
  const [examId, setExamId] = useState(initialExam);
  const [selectedQuestionId, setSelectedQuestionId] = useState<string | null>(initialItem?.key ?? null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [progress, setProgress] = useState<JlptQuestionPracticeProgress | null>(null);
  const [savingQuestionId, setSavingQuestionId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadJlptQuestionPracticeProgress().then((saved) => {
      if (!cancelled) setProgress(saved);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    onCurrentItemChange?.(selectedQuestionId ?? undefined);
  }, [selectedQuestionId, onCurrentItemChange]);

  if (progress === null) return <LoadingScreen />;

  const sourceOptions = SOURCE_ORDER
    .filter((id) => catalog.some((set) => set.exam.source === id && set[category].length > 0))
    .map((id) => ({ id, label: SOURCE_LABELS[id] ?? id }));
  const examsForSource = catalog.filter((set) => set.exam.source === source && set[category].length > 0);
  const selectedExam = examsForSource.find((set) => set.exam.id === examId) ?? examsForSource[0];
  const questions = selectedExam?.[category] ?? [];
  const selectedQuestion = selectedQuestionId ? questions.find((item) => item.key === selectedQuestionId) : undefined;

  function openQuestion(item: PracticeQuestion) {
    setSelectedQuestionId(item.key);
  }

  function backToList() {
    setSelectedQuestionId(null);
  }

  async function chooseAnswer(item: PracticeQuestion, selectedIndex: number) {
    if (!progress || progress[item.key] || savingQuestionId) return;
    setSavingQuestionId(item.key);
    try {
      const attempt = await recordJlptQuestionPracticeAnswer(item.key, selectedIndex, item.question.correctIndex);
      setProgress((current) => ({ ...(current ?? {}), [item.key]: attempt }));
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
    const currentIndex = questions.findIndex((item) => item.key === selectedQuestion.key);
    const saved = progress[selectedQuestion.key];
    const previous = currentIndex > 0 ? questions[currentIndex - 1] : undefined;
    const next = currentIndex >= 0 && currentIndex < questions.length - 1 ? questions[currentIndex + 1] : undefined;
    return (
      <QuestionDetail
        item={selectedQuestion}
        index={currentIndex}
        total={questions.length}
        savedIndex={saved?.selectedIndex}
        status={saved?.status}
        saving={savingQuestionId === selectedQuestion.key}
        progress={progress}
        questions={questions}
        onBack={backToList}
        onOpen={openQuestion}
        onAnswer={(index) => chooseAnswer(selectedQuestion, index)}
        onRedo={() => redoQuestion(selectedQuestion)}
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

  function changeCategory(nextCategory: QuestionCategory) {
    const nextExams = catalog.filter((set) => set.exam.source === source && set[nextCategory].length > 0);
    setCategory(nextCategory);
    if (!nextExams.some((set) => set.exam.id === examId)) setExamId(nextExams[0]?.exam.id ?? "");
    setSelectedQuestionId(null);
    setStatusFilter("all");
  }

  function changeSource(nextSource: string) {
    const nextExam = catalog.find((set) => set.exam.source === nextSource && set[category].length > 0);
    setSource(nextSource);
    setExamId(nextExam?.exam.id ?? "");
    setSelectedQuestionId(null);
    setStatusFilter("all");
  }

  function changeExam(nextExamId: string) {
    setExamId(nextExamId);
    setSelectedQuestionId(null);
    setStatusFilter("all");
  }

  return (
    <div className="mx-auto max-w-5xl px-2.5 py-2 md:px-8 md:py-6">
      {onBack ? (
        <button onClick={onBack} className="mb-2 flex items-center gap-1 text-sm font-medium text-neutral-500 hover:text-neutral-700">
          <ArrowLeft size={15} /> {onBackLabel}
        </button>
      ) : null}
      <PageHeader
        title="Ôn Goi & Ngữ pháp JLPT"
        subtitle={`${questions.length} câu${selectedExam ? ` · ${selectedExam.exam.examLabel}` : ""}`}
        icon={{ img: "icon-jlpt.png", bg: "#eff6ff" }}
      />

      <div className="mt-4 grid grid-cols-2 gap-2 rounded-2xl border border-neutral-200 bg-neutral-50 p-1 sm:max-w-xl">
        <button
          type="button"
          onClick={() => changeCategory("goi")}
          aria-pressed={category === "goi"}
          className={`rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors ${category === "goi" ? "bg-white text-rose-700 shadow-sm" : "text-neutral-500 hover:text-neutral-800"}`}
        >
          Goi · Chữ Hán & từ vựng
        </button>
        <button
          type="button"
          onClick={() => changeCategory("grammar")}
          aria-pressed={category === "grammar"}
          className={`rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors ${category === "grammar" ? "bg-white text-rose-700 shadow-sm" : "text-neutral-500 hover:text-neutral-800"}`}
        >
          Ngữ pháp
        </button>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="block text-xs font-semibold text-neutral-500">
          Nguồn đề ôn
          <select
            aria-label="Nguồn đề ôn JLPT"
            value={source}
            onChange={(event) => changeSource(event.target.value)}
            className="mt-1.5 w-full rounded-xl border border-neutral-200 bg-white px-3 py-2.5 text-sm font-medium text-neutral-800 outline-none focus:border-rose-300"
          >
            {sourceOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
          </select>
        </label>
        <label className="block text-xs font-semibold text-neutral-500">
          Kỳ thi / bộ đề
          <select
            aria-label="Chọn kỳ thi hoặc bộ đề JLPT"
            value={selectedExam?.exam.id ?? ""}
            onChange={(event) => changeExam(event.target.value)}
            className="mt-1.5 w-full rounded-xl border border-neutral-200 bg-white px-3 py-2.5 text-sm font-medium text-neutral-800 outline-none focus:border-rose-300"
          >
            {examsForSource.map((set) => <option key={set.exam.id} value={set.exam.id}>{set.exam.examLabel}</option>)}
          </select>
        </label>
      </div>
      <p className="mt-1 text-xs text-neutral-400">Hai lựa chọn này chỉ lọc danh sách ôn Goi và ngữ pháp bên dưới.</p>

      <div className="mt-4 grid grid-cols-3 gap-2 sm:gap-3">
        <StatCard label="Đã làm đúng" value={correctCount} tone="emerald" active={statusFilter === "correct"} onClick={() => setStatusFilter(statusFilter === "correct" ? "all" : "correct")} />
        <StatCard label="Cần ôn lại" value={wrongCount} tone="rose" active={statusFilter === "wrong"} onClick={() => setStatusFilter(statusFilter === "wrong" ? "all" : "wrong")} />
        <StatCard label="Chưa làm" value={notStartedCount} active={statusFilter === "not-started"} onClick={() => setStatusFilter(statusFilter === "not-started" ? "all" : "not-started")} />
      </div>
      <p className="mt-2 text-right text-xs text-neutral-400">Đã lưu {answeredCount}/{questions.length} câu · bấm “Làm lại” để xoá kết quả từng câu</p>

      {visibleQuestions.length ? (
        <div className="mt-3 flex flex-col gap-2">
          {visibleQuestions.map((item, index) => {
            const attempt = progress[item.key];
            const borderClass = attempt?.status === "correct" ? "border-l-emerald-400" : attempt?.status === "wrong" ? "border-l-rose-400" : "border-l-neutral-200";
            return (
              <button
                type="button"
                key={item.key}
                onClick={() => openQuestion(item)}
                className={`flex items-center gap-3 rounded-2xl border border-l-4 border-neutral-200 bg-white px-4 py-3 text-left transition-colors hover:border-rose-200 hover:bg-rose-50/30 ${borderClass}`}
              >
                <span className="w-9 shrink-0 text-xs font-semibold text-neutral-300">{String(index + 1).padStart(2, "0")}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-neutral-800">{item.question.question || `Câu ${item.question.number}`}</span>
                  <span className="mt-0.5 block text-xs text-neutral-500">Câu {item.question.number} · {item.question.problemGroup} · {item.exam.level}</span>
                </span>
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${attempt?.status === "correct" ? "bg-emerald-50 text-emerald-700" : attempt?.status === "wrong" ? "bg-rose-50 text-rose-700" : "bg-neutral-100 text-neutral-400"}`}>
                  {statusLabel(attempt?.status)}
                </span>
              </button>
            );
          })}
        </div>
      ) : (
        <p className="mt-4 rounded-xl bg-neutral-50 p-4 text-sm text-neutral-500">Đề này chưa có câu hỏi {category === "goi" ? "Goi" : "Ngữ pháp"} có đáp án.</p>
      )}
    </div>
  );
}

function QuestionDetail({
  item,
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
  onRedo: () => void;
  previous?: PracticeQuestion;
  next?: PracticeQuestion;
}) {
  const question = item.question;
  const answered = savedIndex !== undefined;
  const locked = answered || saving;
  const categoryLabel = item.category === "goi" ? "Goi · Chữ Hán & từ vựng" : "Ngữ pháp";
  const paletteItems = questions.map((candidate, candidateIndex) => {
    const candidateStatus = progress[candidate.key]?.status;
    const paletteStatus: PaletteStatus = candidate.key === item.key ? "current" : candidateStatus ?? "unanswered";
    return { id: `${candidate.question.number}-${candidateIndex}`, status: paletteStatus };
  });

  return (
    <div className="mx-auto max-w-4xl px-2.5 py-2 md:px-8 md:py-6">
      <button onClick={onBack} className="flex items-center gap-1 text-sm font-medium text-neutral-500 hover:text-neutral-700">
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
          const target = questions[position];
          if (target) onOpen(target);
        }}
        items={paletteItems}
      />

      <Card className="mt-4 gap-0 rounded-2xl border-neutral-200 p-5 ring-0 sm:p-6">
        <div className="flex items-start gap-3">
          <span className="shrink-0 rounded-lg bg-neutral-100 px-2 py-1 text-sm font-bold text-neutral-600">{question.number}.</span>
          <div className="whitespace-pre-line text-lg font-semibold leading-relaxed text-neutral-800">
            {renderEmphasizedText(question.question, [question.underline])}
          </div>
        </div>
        {answered && question.questionVi ? <p className="mt-2 pl-10 text-sm text-neutral-500">{question.questionVi}</p> : null}

        <div className={`mt-5 grid gap-2 ${question.options.every((option) => option.length <= 14) ? "grid-cols-2" : "grid-cols-1 sm:grid-cols-2"}`}>
          {question.options.map((option, optionIndex) => {
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
                <span className="mr-2 inline-flex h-6 w-6 items-center justify-center rounded-full border border-current/20 text-xs text-neutral-400">{optionIndex + 1}</span>
                {renderEmphasizedText(option, [question.underlineForms?.[optionIndex], question.underline])}
                {answered && question.optionsVi?.[optionIndex] ? <span className="mt-1 block pl-8 text-xs font-normal text-neutral-500">{question.optionsVi[optionIndex]}</span> : null}
              </button>
            );
          })}
        </div>

        {answered ? (
          <div className={`mt-4 rounded-xl border p-4 text-sm ${status === "correct" ? "border-emerald-100 bg-emerald-50/50" : "border-rose-100 bg-rose-50/50"}`}>
            <p className={`font-bold ${status === "correct" ? "text-emerald-700" : "text-rose-700"}`}>
              {status === "correct" ? "Bạn trả lời đúng" : "Bạn trả lời chưa đúng"} · đáp án {question.correctIndex + 1}
            </p>
            {question.explanation ? <p className="mt-2 leading-relaxed text-neutral-700">{question.explanation}</p> : <p className="mt-2 text-neutral-500">Câu này chưa có giải thích riêng.</p>}
            {question.optionExplanations?.some((text) => !!text.trim()) ? (
              <div className="mt-3 space-y-1 border-t border-neutral-200/70 pt-3">
                {question.optionExplanations.map((text, optionIndex) => text.trim() ? (
                  <p key={optionIndex} className="text-xs leading-relaxed text-neutral-600">{optionIndex + 1}. {text}</p>
                ) : null)}
              </div>
            ) : null}
            <button type="button" onClick={onRedo} className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-neutral-500 hover:text-rose-700">
              <RotateCcw size={13} /> Làm lại câu này
            </button>
          </div>
        ) : saving ? <p className="mt-4 text-sm text-neutral-500">Đang lưu câu trả lời...</p> : null}
      </Card>

      <div className="mt-4 flex items-center justify-between gap-3">
        <button type="button" disabled={!previous} onClick={() => previous && onOpen(previous)} className="inline-flex items-center gap-1 rounded-xl border border-neutral-200 px-3 py-2 text-sm font-semibold text-neutral-600 disabled:opacity-40">
          <ChevronLeft size={16} /> Câu trước
        </button>
        <span className="hidden text-xs font-medium text-neutral-400 sm:inline">Lưu từng câu riêng</span>
        <button type="button" disabled={!next} onClick={() => next && onOpen(next)} className="inline-flex items-center gap-1 rounded-xl bg-rose-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-40">
          Câu sau <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}
