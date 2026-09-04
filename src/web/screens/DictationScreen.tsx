import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Check, Eye, EyeOff, Info, Undo2 } from "lucide-react";
import {
  loadViewerState,
  saveViewerState,
  getFilteredList,
  loadDictationProgress,
  recordDictationAttempt,
  clearDictationAttempt,
  dictationProgressId,
  referenceTextFor,
  diffChars,
  accuracyPercent,
  type DictationViewerState,
  type DictationProgressMap,
  type CharDiff,
} from "../../popup/dictationState.ts";
import { AVAILABLE_BOOKS, AVAILABLE_TASK_TYPES, BOOK_LABELS, TASK_TYPE_LABELS, ALL_LISTENING } from "../../popup/listeningState.ts";
import { recordAnswer as recordSharedAnswer } from "../../popup/progressState.ts";
import { pruneToggle } from "../../popup/filterUtils.ts";
import type { ListeningQuestion } from "../../types/listening.ts";
import { assetUrl } from "../../platform/assetUrl";
import { AudioPlayer } from "../components/AudioPlayer.tsx";
import { Card } from "../components/ui/card.tsx";
import { Button } from "../components/ui/button.tsx";
import { PageHeader } from "../components/PageHeader.tsx";
import { StatCard } from "../components/StatCard.tsx";
import { QuestionPalette, type PaletteStatus } from "../components/QuestionPalette.tsx";
import { useFloatingNav } from "../WebAppShell.tsx";
import { levelBadgeStyle } from "../lib/levelColors.tsx";
import { FilterBar, FilterTrigger } from "../components/FilterBar.tsx";
import { ActiveFilters } from "../components/ActiveFilters.tsx";
import { FilterSheet, FilterGroup, FilterChipOption } from "../components/FilterSheet.tsx";

type GridStatus = "correct" | "partial" | "empty";

function statusFor(id: string, progress: DictationProgressMap): GridStatus {
  const p = progress[id];
  if (!p) return "empty";
  return p.bestAccuracy >= 100 ? "correct" : "partial";
}

function gridCellStyle(status: GridStatus, current: boolean): string {
  if (current) return "border-rose-600 bg-rose-600 text-white";
  if (status === "correct") return "border-emerald-300 bg-emerald-100 text-emerald-700 hover:bg-emerald-200";
  if (status === "partial") return "border-amber-300 bg-amber-100 text-amber-700 hover:bg-amber-200";
  return "border-neutral-200 bg-white text-neutral-400 hover:bg-neutral-50";
}

export function DictationScreen({
  topBar,
  jumpToId,
  onCurrentItemChange,
}: {
  topBar?: React.ReactNode;
  // Opens straight into a specific question (e.g. from Stats' "Cần ôn lại"
  // list). Widens the book/task-type filter to include it if it's excluded
  // (e.g. a kadai item while the filter is still sokuji-only) -- otherwise
  // the jump target wouldn't be in the filtered list at all.
  jumpToId?: string;
  onCurrentItemChange?: (id: string | undefined) => void;
} = {}) {
  const [currentId, setCurrentId] = useState<string | null>(jumpToId ?? null);
  const [state, setState] = useState<DictationViewerState | null>(null);
  const [progress, setProgress] = useState<DictationProgressMap>({});

  useEffect(() => {
    onCurrentItemChange?.(currentId ?? undefined);
  }, [currentId, onCurrentItemChange]);

  useEffect(() => {
    (async () => {
      let s = await loadViewerState();
      const target = jumpToId ? ALL_LISTENING.find((q) => q.id === jumpToId) : undefined;
      if (target) {
        const selectedBooks = s.selectedBooks.includes(target.book) ? s.selectedBooks : [...s.selectedBooks, target.book];
        const selectedTaskTypes = s.selectedTaskTypes.includes(target.taskType)
          ? s.selectedTaskTypes
          : [...s.selectedTaskTypes, target.taskType];
        s = { ...s, selectedBooks, selectedTaskTypes };
        await saveViewerState(s);
      }
      setState(s);
    })();
    loadDictationProgress().then(setProgress);
  }, [jumpToId]);

  async function refreshProgress() {
    setProgress(await loadDictationProgress());
  }

  if (!state) return <div className="p-6 text-neutral-400">Đang tải...</div>;

  const list = getFilteredList(state);
  const current = currentId ? list.find((q) => q.id === currentId) : undefined;

  if (current) {
    return (
      <PracticeView
        key={current.id}
        question={current}
        list={list}
        progress={progress}
        autoAdvance={state.autoAdvance}
        onAutoAdvanceChange={(v) => {
          const next = { ...state, autoAdvance: v };
          setState(next);
          saveViewerState(next);
        }}
        onAttempted={refreshProgress}
        onOpen={setCurrentId}
        onBack={() => setCurrentId(null)}
      />
    );
  }

  return <ListView topBar={topBar} state={state} onStateChange={setState} progress={progress} list={list} onOpen={setCurrentId} />;
}

function ListView({
  topBar,
  state,
  onStateChange,
  progress,
  list,
  onOpen,
}: {
  topBar?: React.ReactNode;
  state: DictationViewerState;
  onStateChange: (s: DictationViewerState) => void;
  progress: DictationProgressMap;
  list: ListeningQuestion[];
  onOpen: (id: string) => void;
}) {
  const [filterOpen, setFilterOpen] = useState(false);

  async function mutate(partial: Partial<DictationViewerState>) {
    const next = { ...state, ...partial };
    onStateChange(next);
    await saveViewerState(next);
  }

  const allBooksChecked = state.selectedBooks.length === AVAILABLE_BOOKS.length;
  const allTaskTypesChecked = state.selectedTaskTypes.length === AVAILABLE_TASK_TYPES.length;
  const filterCount = (allBooksChecked ? 0 : state.selectedBooks.length) + (allTaskTypesChecked ? 0 : state.selectedTaskTypes.length);

  const correctCount = list.filter((q) => statusFor(q.id, progress) === "correct").length;
  const accuracies = list.map((q) => progress[q.id]?.bestAccuracy).filter((a): a is number => a !== undefined);
  const avgAccuracy = accuracies.length > 0 ? Math.round(accuracies.reduce((a, b) => a + b, 0) / accuracies.length) : 0;

  return (
    <div className="mx-auto max-w-3xl px-2.5 py-2 md:px-8 md:py-6">
      {topBar}
      <PageHeader title="Nghe chép chính tả" icon={{ img: "icon-listening.png", bg: "#fce7f3" }} />

      <FilterBar>
        <FilterTrigger count={filterCount} onClick={() => setFilterOpen(true)} />
      </FilterBar>

      <ActiveFilters
        chips={[
          ...(allBooksChecked
            ? []
            : state.selectedBooks.map((book) => ({
                key: `book-${book}`,
                label: BOOK_LABELS[book],
                onRemove: () => {
                  const next = state.selectedBooks.filter((b) => b !== book);
                  if (next.length === 0) return;
                  mutate({ selectedBooks: next });
                },
              }))),
          ...(allTaskTypesChecked
            ? []
            : state.selectedTaskTypes.map((t) => ({
                key: `type-${t}`,
                label: TASK_TYPE_LABELS[t],
                onRemove: () => {
                  const next = state.selectedTaskTypes.filter((x) => x !== t);
                  if (next.length === 0) return;
                  mutate({ selectedTaskTypes: next });
                },
              }))),
        ]}
      />

      <FilterSheet
        open={filterOpen}
        onClose={() => setFilterOpen(false)}
        title="Bộ lọc chép chính tả"
        onReset={() => mutate({ selectedBooks: [...AVAILABLE_BOOKS], selectedTaskTypes: [...AVAILABLE_TASK_TYPES] })}
      >
        <FilterGroup title="Sách">
          {AVAILABLE_BOOKS.map((book) => {
            const checked = state.selectedBooks.includes(book);
            const count = ALL_LISTENING.filter((q) => q.book === book && state.selectedTaskTypes.includes(q.taskType)).length;
            return (
              <FilterChipOption
                key={book}
                label={`${BOOK_LABELS[book]} (${count})`}
                active={checked}
                onClick={() => {
                  const next = checked ? state.selectedBooks.filter((b) => b !== book) : [...new Set([...state.selectedBooks, book])];
                  if (next.length === 0) return;
                  const nextTaskTypes = pruneToggle(state.selectedTaskTypes, AVAILABLE_TASK_TYPES, (t) =>
                    ALL_LISTENING.some((q) => q.taskType === t && next.includes(q.book)),
                  );
                  mutate({ selectedBooks: next, selectedTaskTypes: nextTaskTypes });
                }}
              />
            );
          })}
        </FilterGroup>

        <FilterGroup title="Dạng câu hỏi">
          {AVAILABLE_TASK_TYPES.map((t) => {
            const checked = state.selectedTaskTypes.includes(t);
            const count = ALL_LISTENING.filter((q) => q.taskType === t && state.selectedBooks.includes(q.book)).length;
            return (
              <FilterChipOption
                key={t}
                label={`${TASK_TYPE_LABELS[t]} (${count})`}
                active={checked}
                onClick={() => {
                  const next = checked ? state.selectedTaskTypes.filter((x) => x !== t) : [...new Set([...state.selectedTaskTypes, t])];
                  if (next.length === 0) return;
                  const nextBooks = pruneToggle(state.selectedBooks, AVAILABLE_BOOKS, (b) =>
                    ALL_LISTENING.some((q) => q.book === b && next.includes(q.taskType)),
                  );
                  mutate({ selectedTaskTypes: next, selectedBooks: nextBooks });
                }}
              />
            );
          })}
        </FilterGroup>
      </FilterSheet>

      <div className="mt-4 grid grid-cols-3 gap-3">
        <StatCard label="Tổng số câu" value={list.length} />
        <StatCard label="Đúng hoàn toàn" value={correctCount} tone="emerald" />
        <StatCard label="Chính xác TB" value={`${avgAccuracy}%`} tone="rose" />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-4 text-xs text-neutral-500">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-[3px] border border-emerald-300 bg-emerald-100" /> Đúng hoàn toàn
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-[3px] border border-amber-300 bg-amber-100" /> Đã làm, chưa đúng hết
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-[3px] border border-neutral-200 bg-white" /> Chưa làm
        </span>
      </div>

      {list.length === 0 ? (
        <p className="mt-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-600">Không có câu nào khớp bộ lọc này.</p>
      ) : (
        <Card className="mt-3 gap-0 rounded-2xl border-neutral-200 p-4 ring-0">
          <div className="grid grid-cols-8 gap-2 sm:grid-cols-10">
            {list.map((q, i) => (
              <button
                key={q.id}
                onClick={() => onOpen(q.id)}
                title={q.scenario || q.question}
                className={`flex h-9 items-center justify-center rounded-lg border text-sm font-bold ${gridCellStyle(statusFor(q.id, progress), false)}`}
              >
                {i + 1}
              </button>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

function PracticeView({
  question,
  list,
  progress,
  autoAdvance,
  onAutoAdvanceChange,
  onAttempted,
  onOpen,
  onBack,
}: {
  question: ListeningQuestion;
  list: ListeningQuestion[];
  progress: DictationProgressMap;
  autoAdvance: boolean;
  onAutoAdvanceChange: (v: boolean) => void;
  onAttempted: () => void;
  onOpen: (id: string) => void;
  onBack: () => void;
}) {
  const [typed, setTyped] = useState("");
  const [diff, setDiff] = useState<CharDiff[] | null>(null);
  const [revealed, setRevealed] = useState(false);

  const index = list.findIndex((q) => q.id === question.id);
  const prevQuestion = index > 0 ? list[index - 1] : null;
  const nextQuestion = index >= 0 && index < list.length - 1 ? list[index + 1] : null;

  useFloatingNav(true);

  const reference = referenceTextFor(question);
  // One label per line of `reference` (scenario line, if any, then one per
  // turn) -- shown as a hint so it's clear this is "type back everything you
  // just heard, line by line" and not "answer the question below".
  const isSpokenOptions = question.taskType === "sokuji" && !question.optionsImage;
  const dictationLines = [
    ...(question.scenario ? ["Dẫn truyện"] : []),
    ...question.turns.map((t) => t.speaker),
    ...(isSpokenOptions ? question.options.map((_, i) => `Lựa chọn ${i + 1}`) : []),
  ];
  // Same lines as `reference`/dictationLines above, paired with their
  // translation -- one JP line then its VN line right under it (matching
  // ListeningScreen's transcript layout), not JP block then VN block, which
  // forces the reader to match them up by eye across a wall of text.
  const revealPairs = [
    ...(question.scenario ? [{ jp: question.scenario, vi: question.scenarioVi }] : []),
    ...question.turns.map((t) => ({ jp: t.text, vi: t.textVi })),
    ...(isSpokenOptions ? question.options.map((opt, i) => ({ jp: opt, vi: question.optionsVi[i] })) : []),
  ];

  useEffect(() => {
    setTyped("");
    setDiff(null);
    setRevealed(false);
  }, [question.id]);

  async function check() {
    const result = diffChars(typed, reference);
    const pct = accuracyPercent(result);
    setDiff(result);
    await recordDictationAttempt(question.id, pct);
    // Dual-written into the shared progressState.ts map too, under a
    // "dict:"-prefixed id (see dictationProgressId) so it doesn't collide
    // with Listening's own "answer"-direction entry for this same question
    // -- 100% accuracy counts as a correct rep toward the usual 3-in-a-row
    // mastery streak, same as any other content type.
    await recordSharedAnswer(dictationProgressId(question.id), pct >= 100, "dictation", ["dictation"]);
    onAttempted();
  }

  const pct = diff ? accuracyPercent(diff) : null;
  const pctColor = pct === null ? "" : pct === 100 ? "text-emerald-600" : pct >= 60 ? "text-amber-600" : "text-rose-600";

  return (
    <div className="mx-auto max-w-3xl px-2.5 py-2 md:px-8 md:py-6">
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={onBack} className="flex items-center gap-1 text-sm font-medium text-neutral-500 hover:text-neutral-700">
          <ChevronLeft size={15} /> Nghe chép chính tả
        </button>
        <span className="rounded-full px-2.5 py-1 text-xs font-semibold" style={levelBadgeStyle(question.level)}>
          {question.level}
        </span>
        <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-semibold text-neutral-600">
          {TASK_TYPE_LABELS[question.taskType]}
        </span>
        <span className="ml-auto text-sm font-semibold text-neutral-600">
          Câu {index + 1} / {list.length}
        </span>
      </div>

      <QuestionPalette
        summary={`Câu ${index + 1}/${list.length} · đã làm ${list.filter((q) => progress[q.id]).length}`}
        onJump={(i) => onOpen(list[i].id)}
        items={list.map((q, i) => {
          const status = statusFor(q.id, progress);
          const paletteStatus: PaletteStatus =
            i === index ? "current" : status === "empty" ? "unanswered" : status === "correct" ? "correct" : "answered";
          return { id: q.id, status: paletteStatus };
        })}
      />

      <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-neutral-100">
        <div className="h-full rounded-full bg-rose-600" style={{ width: `${((index + 1) / list.length) * 100}%` }} />
      </div>

      <Card className="mt-4 gap-0 rounded-2xl border-neutral-200 p-5 ring-0">
        <AudioPlayer key={question.id} src={assetUrl(question.audioUrl)} autoPlay={autoAdvance} />
        <label className="mt-3.5 flex items-center gap-2 text-xs font-medium text-neutral-600">
          <input
            type="checkbox"
            checked={autoAdvance}
            onChange={(e) => onAutoAdvanceChange(e.target.checked)}
            className="h-3.5 w-3.5 accent-rose-600"
          />
          Tự phát khi sang câu mới
        </label>
      </Card>

      <Card className="mt-4 gap-0 rounded-2xl border-neutral-200 p-5 ring-0">
        <div className="mb-3 flex items-start gap-2 rounded-lg bg-neutral-50 px-3 py-2.5 text-xs text-neutral-600">
          <Info size={14} className="mt-0.5 shrink-0 text-neutral-400" />
          <span>
            Chép lại <b>đúng mọi câu</b> đoạn ghi âm này phát ra, theo đúng thứ tự -- {dictationLines.length} câu:{" "}
            <b className="text-neutral-700">{dictationLines.join(" → ")}</b>
            {isSpokenOptions ? " (dạng này không in gì trên giấy, cả 3 lựa chọn đều được đọc to trong audio)" : ""}. Xuống dòng
            (Enter) giữa mỗi câu, mỗi câu 1 dòng.
          </span>
        </div>
        <textarea
          value={typed}
          onChange={(e) => {
            setTyped(e.target.value);
            setDiff(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              check();
            }
          }}
          placeholder="Gõ lại từng câu bạn nghe được, mỗi câu 1 dòng... (Ctrl+Enter để kiểm tra)"
          rows={Math.max(3, dictationLines.length)}
          className="w-full resize-y rounded-lg border border-neutral-200 px-3.5 py-3 text-[15px] leading-relaxed text-neutral-800 outline-none focus:border-rose-300"
        />

        <div className="mt-3 flex items-center gap-2.5">
          <Button onClick={check} disabled={typed.trim() === ""}>
            <Check size={15} /> Kiểm tra
          </Button>
          <Button variant="outline" onClick={() => setRevealed((v) => !v)}>
            {revealed ? <EyeOff size={15} /> : <Eye size={15} />} {revealed ? "Ẩn đáp án" : "Hiện đáp án"}
          </Button>
          {diff ? <span className={`ml-auto text-sm font-bold ${pctColor}`}>{pct}% ký tự đúng</span> : null}
        </div>

        {diff ? (
          <div className="mt-3.5 border-t border-neutral-100 pt-3.5">
            <div className="mb-2 text-xs font-bold tracking-wide text-neutral-400 uppercase">Đối chiếu từng ký tự</div>
            <p className="text-lg leading-loose whitespace-pre-wrap">
              {diff.map((d, i) => (
                <span
                  key={i}
                  className={
                    d.correct
                      ? "rounded bg-emerald-100 text-emerald-700"
                      : "rounded bg-rose-100 text-rose-700 underline decoration-rose-300"
                  }
                >
                  {d.char}
                </span>
              ))}
            </p>
          </div>
        ) : null}

        {revealed ? (
          <div className="mt-3.5 flex flex-col gap-3 rounded-lg bg-neutral-50 p-3.5">
            {revealPairs.map((p, i) => (
              <div key={i}>
                <div className="text-[15px] leading-relaxed text-neutral-800">{p.jp}</div>
                {p.vi ? (
                  <div className="mt-1 border-l-2 border-neutral-300 pl-3 text-[13px] leading-snug text-neutral-500 italic">{p.vi}</div>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}

        {diff ? (
          <button
            onClick={async () => {
              setTyped("");
              setDiff(null);
              await clearDictationAttempt(question.id);
              onAttempted();
            }}
            className="mt-3.5 flex items-center gap-1 text-xs font-semibold text-neutral-400 hover:text-neutral-600"
          >
            <Undo2 size={12} /> Làm lại câu này
          </button>
        ) : null}
      </Card>

      {prevQuestion ? (
        <button
          onClick={() => onOpen(prevQuestion.id)}
          aria-label="Câu trước"
          className="fixed bottom-36 left-4 z-20 flex h-10 w-10 items-center justify-center rounded-full bg-white text-neutral-600 shadow-lg ring-1 ring-neutral-200 active:bg-neutral-50 md:hidden"
        >
          <ChevronLeft size={18} />
        </button>
      ) : null}
      {nextQuestion ? (
        <button
          onClick={() => onOpen(nextQuestion.id)}
          aria-label="Câu sau"
          className="fixed right-4 bottom-36 z-20 flex h-10 w-10 items-center justify-center rounded-full bg-rose-600 text-white shadow-lg active:bg-rose-700 md:hidden"
        >
          <ChevronRight size={18} />
        </button>
      ) : null}
    </div>
  );
}
