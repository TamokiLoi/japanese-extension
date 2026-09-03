import { useEffect, useState } from "react";
import {
  Flame,
  ArrowRight,
  GraduationCap,
  ClipboardCheck,
  BookMarked,
  Library,
  PenSquare,
  BookOpenText,
  Headphones,
  HelpCircle,
  Check,
  Pencil,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Quote,
} from "lucide-react";
import type { Screen } from "../../popup/App.tsx";
import { ALL_KANJI, getOrderedList as getFilteredKanji, loadViewerState as loadKanjiViewerState } from "../../popup/kanjiState.ts";
import { ALL_VOCAB, getOrderedList as getFilteredVocab, loadViewerState as loadVocabViewerState } from "../../popup/vocabState.ts";
import { ALL_BUNPO, getFilteredList as getFilteredBunpo, loadViewerState as loadBunpoViewerState } from "../../popup/bunpoState.ts";
import {
  getFilteredQuestions as getFilteredReading,
  loadViewerState as loadReadingViewerState,
  findReadingById,
  getPassageProgress,
} from "../../popup/readingState.ts";
import {
  ALL_QUIZBOOK,
  matchesFilters as matchesQuizBookFilters,
  loadViewerState as loadQuizBookViewerState,
} from "../../popup/quizBookState.ts";
import { getFilteredList as getFilteredListening, loadViewerState as loadListeningViewerState } from "../../popup/listeningState.ts";
import {
  dictationProgressId,
  getFilteredList as getFilteredDictation,
  loadViewerState as loadDictationViewerState,
} from "../../popup/dictationState.ts";
import {
  loadProgressMap,
  countBuckets,
  countStudiedToday,
  countDue,
  getStudyStreak,
  getWeekStudyDays,
  getMonthStudyDays,
  bucketFor,
  type ProgressMap,
  type ProgressBucket,
} from "../../popup/progressState.ts";
import {
  loadDailyGoals,
  saveDailyGoals,
  buildDailyPlanItem,
  PLAN_TYPES,
  type PlanType,
  type DailyGoals,
  type DailyPlanItem,
} from "../../popup/dailyPlanState.ts";
import { FilterSheet } from "../components/FilterSheet.tsx";

const BUCKET_ORDER: ProgressBucket[] = ["mastered", "learning", "flagged", "new"];
const BUCKET_LABEL: Record<ProgressBucket, string> = {
  mastered: "Đã thuộc",
  learning: "Đang học",
  flagged: "Cần ôn lại",
  new: "Chưa học",
};
const BUCKET_COLOR: Record<ProgressBucket, string> = {
  mastered: "text-emerald-600 bg-emerald-50",
  learning: "text-amber-600 bg-amber-50",
  flagged: "text-rose-600 bg-rose-50",
  new: "text-neutral-500 bg-neutral-100",
};

const WEEKDAY_LABELS = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];

type DailyPlan = Record<PlanType, DailyPlanItem>;

const PLAN_META: Record<PlanType, { label: string; unit: string; icon: typeof BookMarked; screen: Screen }> = {
  kanji: { label: "Kanji", unit: "chữ mới", icon: BookMarked, screen: "kanji" },
  vocab: { label: "Từ vựng", unit: "từ mới", icon: Library, screen: "vocab" },
  bunpo: { label: "Ngữ pháp", unit: "mẫu mới", icon: PenSquare, screen: "bunpo" },
  reading: { label: "Luyện đọc", unit: "câu mới", icon: BookOpenText, screen: "reading" },
  listening: { label: "Luyện nghe", unit: "câu mới", icon: Headphones, screen: "listening" },
};

function greeting(): string {
  const h = new Date().getHours();
  if (h < 11) return "Chào buổi sáng!";
  if (h < 14) return "Chào buổi trưa!";
  if (h < 18) return "Chào buổi chiều!";
  return "Chào buổi tối!";
}

interface ContentCounts {
  kanji: number;
  vocab: number;
  bunpo: number;
  reading: number;
  listening: number;
}

interface TypeProgress {
  mastered: number;
  total: number;
}

interface Stats {
  streak: number;
  weekDays: boolean[];
  studiedToday: number;
  totalItems: number;
  counts: ContentCounts;
  buckets: Record<ProgressBucket, number>;
  due: { kanji: number; vocab: number; bunpo: number };
  // Mastered/total per type, for "Tiến độ học tập"'s % cards -- same
  // filtered lists as `counts` above, just with a mastered count alongside
  // instead of only the raw total.
  progress: { kanji: TypeProgress; vocab: TypeProgress; bunpo: TypeProgress };
  quickStats: {
    // Reading passages fully answered (status "done") -- a genuine
    // discrete "lesson" unit, unlike Kanji/Vocab/Bunpo's per-card
    // mastery which "Tiến độ học tập" already covers above.
    lessonsDone: number;
    // Listening + Nghe chép chính tả + Luyện đề questions with any
    // recorded attempt (not just "mastered") -- "practiced", not "learned".
    questionsPracticed: number;
  };
}

// Kept around after loadStats() resolves so building/rebuilding the daily
// plan (goals change, no filters changed) never has to reload every
// section's viewer state and the progress map again -- only a fresh Home
// mount re-fetches this, which is exactly when a filter changed elsewhere
// should be picked up.
interface FilteredContent {
  map: ProgressMap;
  kanji: { id: string }[];
  vocab: { id: string }[];
  bunpo: { id: string }[];
  reading: { id: string }[];
  listening: { id: string }[];
}

function computePlan(content: FilteredContent, goals: DailyGoals): DailyPlan {
  const lists: Record<PlanType, { id: string }[]> = {
    kanji: content.kanji,
    vocab: content.vocab,
    bunpo: content.bunpo,
    reading: content.reading,
    listening: content.listening,
  };
  const plan = {} as DailyPlan;
  for (const type of PLAN_TYPES) {
    plan[type] = buildDailyPlanItem(lists[type], goals[type].goal, content.map);
  }
  return plan;
}

async function loadStats(): Promise<{ stats: Stats; content: FilteredContent }> {
  const [map, kanjiState, vocabState, bunpoState, readingState, quizBookState, listeningState, dictationState] = await Promise.all([
    loadProgressMap(),
    loadKanjiViewerState(),
    loadVocabViewerState(),
    loadBunpoViewerState(),
    loadReadingViewerState(),
    loadQuizBookViewerState(),
    loadListeningViewerState(),
    loadDictationViewerState(),
  ]);
  // Each content type is narrowed to whatever that section's own filter
  // sheet currently has selected (its persisted viewer state), rather than
  // always counting the full dataset -- "Kho học liệu"/"Tổng quan tiến độ"
  // then answer "how much of what I'm actually studying right now",
  // matching each screen's own filtered list instead of a fixed grand total.
  const filteredKanji = getFilteredKanji(kanjiState);
  const filteredVocab = getFilteredVocab(vocabState);
  const filteredBunpo = getFilteredBunpo(bunpoState);
  const filteredReading = getFilteredReading(readingState);
  const filteredListening = getFilteredListening(listeningState);
  const filteredQuizBook = ALL_QUIZBOOK.filter((q) => matchesQuizBookFilters(q, quizBookState));
  // Listening's own "answer"-direction entries use the question's plain id;
  // Dictation's use a "dict:"-prefixed id (see dictationProgressId) so the
  // two tracks don't collide in the same ItemProgress record for one
  // question -- both need to be in this pool for the bucket/total counts
  // below to reflect them, as two separate trackable items each.
  const filteredDictationItems = getFilteredDictation(dictationState).map((q) => ({ id: dictationProgressId(q.id) }));
  const filteredItems = [
    ...filteredKanji,
    ...filteredVocab,
    ...filteredBunpo,
    ...filteredReading,
    ...filteredQuizBook,
    ...filteredListening,
    ...filteredDictationItems,
  ];
  const masteredCount = (items: { id: string }[]) => items.filter((item) => bucketFor(map[item.id]) === "mastered").length;
  // Reading's filtered list is per-question (ReadingQuestionItem), but
  // "lessons done" counts whole passages -- dedupe down to the passages
  // those questions belong to, then check each one's own answers record.
  const passageIds = new Set(filteredReading.map((q) => q.passageId));
  const lessonsDone = [...passageIds].filter((id) => {
    const passage = findReadingById(id);
    return passage && getPassageProgress(passage, readingState.answers).status === "done";
  }).length;
  const questionsPracticed = [...filteredListening, ...filteredDictationItems, ...filteredQuizBook].filter(
    (item) => map[item.id] !== undefined,
  ).length;
  const [streak, weekDays] = await Promise.all([getStudyStreak(), getWeekStudyDays()]);
  return {
    stats: {
      streak,
      weekDays,
      studiedToday: countStudiedToday(filteredItems, map),
      totalItems: filteredItems.length,
      counts: {
        kanji: filteredKanji.length,
        vocab: filteredVocab.length,
        bunpo: filteredBunpo.length,
        reading: filteredReading.length,
        listening: filteredListening.length,
      },
      buckets: countBuckets(filteredItems, map),
      // Kanji/Vocab/Bunpo only -- Ôn tập (reviewState.ts) can only build a
      // review session from these 3 content types so far, so "Cần ôn ngay"
      // below stays scoped to what it can actually launch. Listening/
      // Dictation still show up in "Tổng quan tiến độ" above (bucket counts
      // include them), just not in this specific due-review CTA yet.
      due: {
        kanji: countDue(ALL_KANJI, map),
        vocab: countDue(ALL_VOCAB, map),
        bunpo: countDue(ALL_BUNPO, map),
      },
      progress: {
        kanji: { mastered: masteredCount(filteredKanji), total: filteredKanji.length },
        vocab: { mastered: masteredCount(filteredVocab), total: filteredVocab.length },
        bunpo: { mastered: masteredCount(filteredBunpo), total: filteredBunpo.length },
      },
      quickStats: { lessonsDone, questionsPracticed },
    },
    content: {
      map,
      kanji: filteredKanji,
      vocab: filteredVocab,
      bunpo: filteredBunpo,
      reading: filteredReading,
      listening: filteredListening,
    },
  };
}

function WeekCalendar({ weekDays }: { weekDays: boolean[] }) {
  const todayIndex = (new Date().getDay() + 6) % 7; // Mon=0..Sun=6
  return (
    <div className="flex gap-1.5">
      {WEEKDAY_LABELS.map((label, i) => {
        const studied = weekDays[i];
        const isToday = i === todayIndex;
        return (
          <div key={label} className="flex flex-1 flex-col items-center gap-1.5">
            <span className={`text-[11px] font-semibold ${isToday ? "text-rose-600" : "text-neutral-400"}`}>{label}</span>
            <div
              className={`flex h-7 w-7 items-center justify-center rounded-full border-[1.5px] ${
                studied
                  ? "border-rose-600 bg-rose-600 text-white"
                  : isToday
                    ? "border-2 border-rose-600 bg-white"
                    : "border-rose-200 bg-white"
              }`}
            >
              {studied ? <Check size={13} strokeWidth={3} /> : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function MonthCalendar({ monthDate, monthDays }: { monthDate: Date; monthDays: boolean[] | null }) {
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstWeekday = (new Date(year, month, 1).getDay() + 6) % 7; // Mon=0..Sun=6
  const today = new Date();
  const isCurrentMonth = today.getFullYear() === year && today.getMonth() === month;

  const cells: ({ day: number } | null)[] = [...Array(firstWeekday).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => ({ day: i + 1 }))];

  return (
    <div className="grid grid-cols-7 gap-y-1.5 text-center">
      {WEEKDAY_LABELS.map((label) => (
        <span key={label} className="text-[10px] font-semibold text-rose-700">
          {label}
        </span>
      ))}
      {cells.map((cell, i) => {
        if (!cell) return <span key={i} />;
        const studied = monthDays?.[cell.day - 1] ?? false;
        const isToday = isCurrentMonth && cell.day === today.getDate();
        return (
          <div key={i} className="flex items-center justify-center">
            <span
              className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] ${
                studied
                  ? "bg-rose-600 font-semibold text-white"
                  : isToday
                    ? "border-2 border-rose-600 font-semibold text-rose-600"
                    : "text-neutral-600"
              }`}
            >
              {cell.day}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function StreakCard({ streak, weekDays }: { streak: number; weekDays: boolean[] }) {
  const [view, setView] = useState<"week" | "month">("week");
  const [monthDate, setMonthDate] = useState(() => new Date());
  const [monthDays, setMonthDays] = useState<boolean[] | null>(null);

  useEffect(() => {
    if (view !== "month") return;
    let cancelled = false;
    getMonthStudyDays(monthDate.getFullYear(), monthDate.getMonth()).then((days) => {
      if (!cancelled) setMonthDays(days);
    });
    return () => {
      cancelled = true;
    };
  }, [view, monthDate]);

  return (
    <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-orange-500">
          <Flame size={18} />
          <span className="text-xs font-semibold uppercase tracking-wide text-neutral-800">Chuỗi ngày học</span>
        </div>
        <button
          onClick={() => setView(view === "week" ? "month" : "week")}
          title={view === "week" ? "Xem theo tháng" : "Xem theo tuần"}
          className={`flex h-6 w-6 items-center justify-center rounded-full ${
            view === "month" ? "bg-rose-600 text-white" : "bg-white text-rose-700"
          }`}
        >
          <CalendarDays size={13} />
        </button>
      </div>
      <div className="mt-2 text-2xl font-bold text-neutral-800">{streak} ngày liên tiếp</div>
      <p className="mt-1 text-xs text-rose-700">Học mỗi ngày để giữ chuỗi streak và ghi nhớ lâu hơn.</p>
      <div className="mt-4">
        {view === "week" ? (
          <WeekCalendar weekDays={weekDays} />
        ) : (
          <>
            <div className="flex items-center justify-between">
              <button
                onClick={() => setMonthDate(new Date(monthDate.getFullYear(), monthDate.getMonth() - 1, 1))}
                className="flex h-6 w-6 items-center justify-center rounded-full text-rose-700 hover:bg-white"
              >
                <ChevronLeft size={14} />
              </button>
              <span className="text-xs font-semibold text-neutral-700">
                Tháng {monthDate.getMonth() + 1}, {monthDate.getFullYear()}
              </span>
              <button
                onClick={() => setMonthDate(new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 1))}
                className="flex h-6 w-6 items-center justify-center rounded-full text-rose-700 hover:bg-white"
              >
                <ChevronRight size={14} />
              </button>
            </div>
            <div className="mt-2">
              <MonthCalendar monthDate={monthDate} monthDays={monthDays} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function DailyPlanSettingsSheet({
  open,
  onClose,
  goals,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  goals: DailyGoals;
  onSave: (goals: DailyGoals) => void;
}) {
  const [draft, setDraft] = useState(goals);

  useEffect(() => {
    if (open) setDraft(goals);
  }, [open, goals]);

  return (
    <FilterSheet open={open} onClose={onClose} title="Cài đặt kế hoạch học">
      <p className="text-sm text-neutral-500">
        Đặt tốc độ mỗi ngày cho từng mục. Số ngày còn lại được tính trên số mục "chưa học" theo đúng bộ lọc bạn đang chọn ở màn đó --
        đổi bộ lọc sẽ tự tính lại lần tới bạn mở trang chủ.
      </p>
      <div className="mt-4 flex flex-col gap-3">
        {PLAN_TYPES.map((type) => {
          const meta = PLAN_META[type];
          const setting = draft[type];
          const Icon = meta.icon;
          return (
            <div key={type} className="flex items-center gap-3 rounded-xl border border-neutral-200 p-3">
              <button
                onClick={() => setDraft({ ...draft, [type]: { ...setting, enabled: !setting.enabled } })}
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 ${
                  setting.enabled ? "border-rose-600 bg-rose-600 text-white" : "border-neutral-300"
                }`}
              >
                {setting.enabled ? <Check size={12} strokeWidth={3} /> : null}
              </button>
              <span className="flex flex-1 items-center gap-2 text-sm text-neutral-700">
                <Icon size={15} className="text-rose-600" /> {meta.label}
              </span>
              <input
                type="number"
                min={1}
                value={setting.goal}
                onChange={(e) =>
                  setDraft({ ...draft, [type]: { ...setting, goal: Math.max(1, Number(e.target.value) || 1) } })
                }
                className="w-16 rounded-lg border border-neutral-200 px-2 py-1 text-right text-sm"
              />
              <span className="w-14 shrink-0 text-xs text-neutral-400">/ ngày</span>
            </div>
          );
        })}
      </div>
      <button
        onClick={() => {
          onSave(draft);
          onClose();
        }}
        className="mt-5 w-full rounded-full bg-rose-600 py-2.5 text-sm font-semibold text-white hover:bg-rose-700"
      >
        Lưu kế hoạch
      </button>
    </FilterSheet>
  );
}

function DailyPlanCard({
  goals,
  plan,
  onNavigate,
  onSaveGoals,
}: {
  goals: DailyGoals;
  plan: DailyPlan;
  onNavigate: (screen: Screen) => void;
  onSaveGoals: (goals: DailyGoals) => void;
}) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const enabledTypes = PLAN_TYPES.filter((type) => goals[type].enabled);

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-400">Kế hoạch hôm nay</h2>
        <button
          onClick={() => setSettingsOpen(true)}
          className="flex h-7 w-7 items-center justify-center rounded-full text-neutral-400 hover:bg-neutral-100 hover:text-rose-600"
          title="Cài đặt kế hoạch"
        >
          <Pencil size={13} />
        </button>
      </div>

      {enabledTypes.length === 0 ? (
        <p className="mt-3 text-sm text-neutral-400">Chưa bật mục nào -- bấm nút bút chì để chọn mục và đặt tốc độ mỗi ngày.</p>
      ) : (
        <div className="mt-3 flex flex-col gap-3">
          {enabledTypes.map((type) => {
            const meta = PLAN_META[type];
            const item = plan[type];
            const Icon = meta.icon;
            const done = item.doneToday >= item.goal;
            return (
              <button
                key={type}
                onClick={() => onNavigate(meta.screen)}
                className="flex items-center gap-3 rounded-xl px-1 py-1 text-left hover:bg-rose-50/40"
              >
                <span
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
                    done ? "border-emerald-500 bg-emerald-500 text-white" : "border-neutral-300"
                  }`}
                >
                  {done ? <Check size={12} strokeWidth={3} /> : null}
                </span>
                <span className="min-w-0 flex-1 text-sm text-neutral-700">
                  {meta.label} <span className="text-neutral-400">-- {item.goal} {meta.unit}/ngày</span>
                  {item.daysLeft !== null ? (
                    <span className="block text-xs text-neutral-400">
                      {item.remainingNew > 0 ? `còn ~${item.daysLeft} ngày là hết` : "đã hết mục chưa học"}
                    </span>
                  ) : null}
                </span>
                <span className={`shrink-0 text-xs font-semibold ${done ? "text-emerald-600" : "text-neutral-400"}`}>
                  {item.doneToday}/{item.goal}
                </span>
              </button>
            );
          })}
        </div>
      )}

      <DailyPlanSettingsSheet open={settingsOpen} onClose={() => setSettingsOpen(false)} goals={goals} onSave={onSaveGoals} />
    </div>
  );
}

const PROGRESS_ACCENT = {
  rose: { icon: "bg-rose-50 text-rose-600", pct: "text-rose-600", bar: "bg-rose-600" },
  orange: { icon: "bg-orange-50 text-orange-600", pct: "text-orange-600", bar: "bg-orange-600" },
  emerald: { icon: "bg-emerald-50 text-emerald-600", pct: "text-emerald-600", bar: "bg-emerald-600" },
} as const;

function ProgressCard({
  icon: Icon,
  label,
  progress,
  accent,
  onClick,
}: {
  icon: typeof BookMarked;
  label: string;
  progress: { mastered: number; total: number };
  accent: keyof typeof PROGRESS_ACCENT;
  onClick: () => void;
}) {
  const colors = PROGRESS_ACCENT[accent];
  const pct = progress.total > 0 ? Math.round((progress.mastered / progress.total) * 100) : 0;
  return (
    <button onClick={onClick} className="rounded-2xl border border-neutral-200 bg-white p-4 text-left transition-colors hover:border-rose-200">
      <div className="flex items-center gap-2.5">
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${colors.icon}`}>
          <Icon size={16} />
        </span>
        <span className="text-sm font-semibold text-neutral-800">{label}</span>
      </div>
      <div className={`mt-2.5 text-2xl font-bold ${colors.pct}`}>{pct}%</div>
      <div className="mt-0.5 text-xs text-neutral-400">
        {progress.mastered.toLocaleString("vi-VN")} / {progress.total.toLocaleString("vi-VN")}
      </div>
      <div className="mt-2 h-1.5 rounded-full bg-neutral-100">
        <div className={`h-full rounded-full ${colors.bar}`} style={{ width: `${pct}%` }} />
      </div>
    </button>
  );
}

function ContinueCard({
  icon: Icon,
  title,
  subtitle,
  onClick,
}: {
  icon: typeof BookMarked;
  title: string;
  subtitle: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-3 rounded-2xl border border-neutral-200 bg-white p-4 text-left transition-colors hover:border-rose-200 hover:bg-rose-50/40"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-rose-50 text-rose-600">
        <Icon size={18} />
      </span>
      <div className="min-w-0">
        <div className="truncate text-sm font-semibold text-neutral-800">{title}</div>
        <div className="truncate text-xs text-neutral-400">{subtitle}</div>
      </div>
    </button>
  );
}

export function HomeScreen({ onNavigate }: { onNavigate: (screen: Screen, id?: string) => void }) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [content, setContent] = useState<FilteredContent | null>(null);
  const [goals, setGoals] = useState<DailyGoals | null>(null);
  const [plan, setPlan] = useState<DailyPlan | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([loadStats(), loadDailyGoals()]).then(([{ stats: s, content: c }, g]) => {
      if (cancelled) return;
      setStats(s);
      setContent(c);
      setGoals(g);
      setPlan(computePlan(c, g));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSaveGoals(next: DailyGoals) {
    setGoals(next);
    await saveDailyGoals(next);
    if (content) setPlan(computePlan(content, next));
  }

  const totalDue = stats ? stats.due.kanji + stats.due.vocab + stats.due.bunpo : 0;

  return (
    <div className="mx-auto max-w-6xl px-2.5 py-2 md:px-8 md:py-6">
      <h1 className="text-2xl font-bold text-neutral-800">{greeting()}</h1>
      <p className="mt-1 text-neutral-500">Tiếp tục hành trình học tiếng Nhật của bạn nào.</p>

      {stats ? (
        <div className="mt-6 flex flex-col gap-6 md:flex-row md:items-start">
          {/* Streak, mobile-only instance -- today's habit prompt belongs
              above the fold, before the two columns below split apart. The
              desktop instance lives inside the rail further down instead of
              trying to keep this one row-synced with the main column via
              CSS grid -- that forced the two independently-tall columns to
              share row tracks, staggering every section under it. */}
          <div className="md:hidden">
            <StreakCard streak={stats.streak} weekDays={stats.weekDays} />
          </div>

          {/* Main column */}
          <div className="flex flex-1 flex-col gap-8">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-400">Tiến độ học tập (theo bộ lọc hiện tại)</h2>
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
                <ProgressCard icon={BookMarked} label="Kanji" progress={stats.progress.kanji} accent="rose" onClick={() => onNavigate("kanji")} />
                <ProgressCard icon={Library} label="Từ vựng" progress={stats.progress.vocab} accent="orange" onClick={() => onNavigate("vocab")} />
                <ProgressCard icon={PenSquare} label="Ngữ pháp" progress={stats.progress.bunpo} accent="emerald" onClick={() => onNavigate("bunpo")} />
              </div>
            </div>

            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-400">Tổng quan tiến độ</h2>
              <p className="mt-1 text-xs text-neutral-400">
                Theo đúng bộ lọc cấp độ/nguồn bạn đang chọn ở từng mục (Kanji, Từ vựng, Ngữ pháp...) -- đổi bộ lọc ở đó sẽ đổi số ở đây.
              </p>
              <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
                {BUCKET_ORDER.map((b) => (
                  <button
                    key={b}
                    onClick={() => onNavigate("stats", `bucket:${b}`)}
                    className={`rounded-2xl p-4 text-left transition-transform hover:scale-[1.02] ${BUCKET_COLOR[b]}`}
                  >
                    <div className="text-xs font-semibold">{BUCKET_LABEL[b]}</div>
                    <div className="mt-1 text-xl font-bold">{stats.buckets[b]}</div>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-400">Tiếp tục học</h2>
              <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
                <ContinueCard icon={BookMarked} title="Kanji" subtitle={`${stats.counts.kanji} chữ Hán`} onClick={() => onNavigate("kanji")} />
                <ContinueCard icon={Library} title="Từ vựng" subtitle={`${stats.counts.vocab} từ`} onClick={() => onNavigate("vocab")} />
                <ContinueCard icon={PenSquare} title="Ngữ pháp" subtitle={`${stats.counts.bunpo} mẫu câu`} onClick={() => onNavigate("bunpo")} />
                <ContinueCard
                  icon={BookOpenText}
                  title="Luyện đọc"
                  subtitle={`${stats.counts.reading} câu hỏi`}
                  onClick={() => onNavigate("reading")}
                />
                <ContinueCard
                  icon={Headphones}
                  title="Luyện nghe"
                  subtitle={`${stats.counts.listening} câu`}
                  onClick={() => onNavigate("listening")}
                />
                <ContinueCard icon={HelpCircle} title="Quiz" subtitle="Tự chọn phạm vi" onClick={() => onNavigate("quiz")} />
              </div>
            </div>
          </div>

          {/* Right rail -- on mobile this is just "Cần ôn ngay" + "Luyện
              thi" (Streak already showed above, full-width); on desktop it's
              the whole rail, flowing independently of the main column so
              its shorter content doesn't force gaps into the main column. */}
          <div className="flex flex-col gap-4 md:w-80 md:shrink-0">
            <div className="hidden md:block">
              <StreakCard streak={stats.streak} weekDays={stats.weekDays} />
            </div>

            {goals && plan ? (
              <DailyPlanCard goals={goals} plan={plan} onNavigate={onNavigate} onSaveGoals={handleSaveGoals} />
            ) : null}

            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-400">Cần ôn ngay</h2>
              {totalDue > 0 ? (
                <button
                  onClick={() => onNavigate("review")}
                  className="mt-3 flex w-full items-center justify-between rounded-2xl border border-rose-200 bg-rose-50 p-4 text-left transition-colors hover:bg-rose-100"
                >
                  <div className="flex items-center gap-3">
                    <GraduationCap className="text-rose-600" size={22} />
                    <div>
                      <div className="font-semibold text-neutral-800">Bắt đầu ôn tập</div>
                      <div className="text-sm text-rose-600">
                        {totalDue} thẻ cần ôn lại (Kanji {stats.due.kanji} · Từ vựng {stats.due.vocab} · Ngữ pháp {stats.due.bunpo})
                      </div>
                    </div>
                  </div>
                  <ArrowRight className="text-rose-400" size={18} />
                </button>
              ) : (
                <p className="mt-3 rounded-2xl border border-neutral-200 bg-white p-4 text-sm text-neutral-500">
                  Không có thẻ nào đến hạn ôn lại ngay bây giờ — cứ tiếp tục khám phá nội dung mới ở thanh bên nhé.
                </p>
              )}
            </div>

            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-400">Luyện thi</h2>
              <button
                onClick={() => onNavigate("dethi")}
                className="mt-3 flex w-full items-center gap-3 rounded-2xl border border-neutral-200 bg-white p-4 text-left transition-colors hover:bg-neutral-50"
              >
                <ClipboardCheck className="shrink-0 text-neutral-600" size={22} />
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-neutral-800">Làm đề thi JLPT N3</div>
                  <div className="text-sm text-neutral-500">25 đề thật, có tính giờ và chấm điểm theo barem</div>
                </div>
              </button>
            </div>

            {/* Static -- one fixed câu danh ngôn, no rotation/content bank
                needed for this. */}
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
              <div className="flex items-center gap-2 text-amber-700">
                <Quote size={16} />
                <span className="text-xs font-semibold uppercase tracking-wide">Câu nói hôm nay</span>
              </div>
              <div className="mt-3 text-base font-bold text-neutral-800">継続は力なり。</div>
              <div className="mt-1 text-xs text-amber-700">Keizoku wa chikara nari.</div>
              <div className="mt-1 text-xs text-amber-700 italic">"Kiên trì là sức mạnh."</div>
            </div>

            <div className="rounded-2xl border border-neutral-200 bg-white p-5">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-400">Thống kê nhanh</h2>
              <div className="mt-3 flex flex-col gap-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-neutral-500">Bài đọc đã học</span>
                  <span className="font-semibold text-neutral-800">{stats.quickStats.lessonsDone}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-neutral-500">Câu đã luyện</span>
                  <span className="font-semibold text-neutral-800">{stats.quickStats.questionsPracticed}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-neutral-500">Đã học hôm nay</span>
                  <span className="font-semibold text-neutral-800">{stats.studiedToday} thẻ</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <p className="mt-6 text-neutral-400">Đang tải...</p>
      )}
    </div>
  );
}
