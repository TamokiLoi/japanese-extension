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
  Target,
  BarChart3,
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
import { ALL_EXAMS, loadDeThiHistory } from "../../popup/dethiState.ts";
import { loadLastActive, type LastActive, type ResumableScreen } from "../../popup/lastActiveState.ts";
import { FilterSheet } from "../components/FilterSheet.tsx";

// Decorative dashboard artwork (hero/card backgrounds, quick-stat icons) --
// same folder as icons/, so this mirrors BrandLink's `${BASE_URL}icons/...`
// pattern elsewhere in src/web/.
const DASH_IMG = `${import.meta.env.BASE_URL}images/dashboard/`;
const ICON_IMG = `${DASH_IMG}icons/`;

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

const PLAN_META: Record<PlanType, { label: string; unit: string; icon: typeof BookMarked; screen: Screen; accent: string; img: string }> = {
  kanji: { label: "Kanji", unit: "chữ mới", icon: BookMarked, screen: "kanji", accent: "#e11d48", img: "icon-kanji.png" },
  vocab: { label: "Từ vựng", unit: "từ mới", icon: Library, screen: "vocab", accent: "#ea580c", img: "icon-vocab.png" },
  bunpo: { label: "Ngữ pháp", unit: "mẫu mới", icon: PenSquare, screen: "bunpo", accent: "#059669", img: "icon-grammar.png" },
  reading: { label: "Luyện đọc", unit: "câu mới", icon: BookOpenText, screen: "reading", accent: "#7c3aed", img: "icon-reading.png" },
  listening: { label: "Luyện nghe", unit: "câu mới", icon: Headphones, screen: "listening", accent: "#db2777", img: "icon-listening.png" },
};

// What the "Tiếp tục học" banner shows for each resumable screen -- icon,
// display label, and (where a real progress % already exists in Stats) the
// key into stats.progress so the banner can quote real numbers instead of
// a fabricated "you were on card 24/30" claim.
const RESUME_META: Record<ResumableScreen, { label: string; icon: typeof BookMarked; progressKey?: keyof Stats["progress"] }> = {
  kanji: { label: "Kanji", icon: BookMarked, progressKey: "kanji" },
  vocab: { label: "Từ vựng", icon: Library, progressKey: "vocab" },
  bunpo: { label: "Ngữ pháp", icon: PenSquare, progressKey: "bunpo" },
  reading: { label: "Luyện đọc", icon: BookOpenText, progressKey: "reading" },
  listening: { label: "Luyện nghe", icon: Headphones, progressKey: "listening" },
  dethi: { label: "Đề thi JLPT", icon: GraduationCap, progressKey: "dethi" },
  quiz: { label: "Quiz", icon: HelpCircle },
  quizBook: { label: "Luyện đề", icon: ClipboardCheck },
  dictation: { label: "Nghe chép chính tả", icon: Headphones },
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
  progress: { kanji: TypeProgress; vocab: TypeProgress; bunpo: TypeProgress; reading: TypeProgress; listening: TypeProgress; dethi: TypeProgress };
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
  const [streak, weekDays, dethiHistory] = await Promise.all([getStudyStreak(), getWeekStudyDays(), loadDeThiHistory()]);
  // "Đề đã làm" counts distinct papers with at least one finished attempt,
  // against every paper across every exam -- a real completion ratio, same
  // shape as the other progress cards, not a fabricated number.
  const attemptedPapers = new Set(dethiHistory.map((h) => `${h.examId}:${h.paperId}`)).size;
  const totalPapers = ALL_EXAMS.reduce((n, exam) => n + exam.papers.length, 0);
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
        reading: { mastered: masteredCount(filteredReading), total: filteredReading.length },
        listening: { mastered: masteredCount(filteredListening), total: filteredListening.length },
        dethi: { mastered: attemptedPapers, total: totalPapers },
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

function StreakCard({ streak, weekDays, onNavigate }: { streak: number; weekDays: boolean[]; onNavigate: (screen: Screen) => void }) {
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
    <div className="relative overflow-hidden rounded-2xl p-4 md:min-h-55 md:p-5">
      <img
        src={`${DASH_IMG}streak-bg.png`}
        alt=""
        className="absolute inset-0 h-full w-full object-cover object-[68%_center]"
      />
      <div
        className="absolute inset-0"
        style={{ background: "linear-gradient(115deg, #fff1f2 0%, #fff1f2d9 45%, #fff1f255 75%, transparent 100%)" }}
      />
      <div className="relative flex items-center justify-between">
        <div className="flex items-center gap-2" style={{ color: "#f97316" }}>
          <Flame size={16} />
          <span className="text-xs font-bold text-neutral-800">Chuỗi học liên tiếp</span>
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
      <div className="relative mt-1.5 text-xl font-bold text-neutral-800 md:text-[21px]">
        {streak} ngày{streak > 0 ? " liên tiếp" : ""}
      </div>
      <p className="relative mt-0.5 text-xs" style={{ color: "#9f1239" }}>
        {streak > 0 ? "Học mỗi ngày để giữ chuỗi streak và ghi nhớ lâu hơn." : "Bắt đầu học hôm nay để tạo streak!"}
      </p>
      <div className="relative mt-2.5">
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
      {streak === 0 ? (
        <button
          onClick={() => onNavigate("kanji")}
          className="relative mt-2.5 hidden w-full rounded-full bg-rose-600 py-2.5 text-sm font-bold text-white hover:bg-rose-700 md:block"
        >
          Bắt đầu ngay →
        </button>
      ) : null}
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
    <FilterSheet open={open} onClose={onClose} title="Cài đặt mục tiêu mỗi ngày">
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
        Lưu mục tiêu
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
    <div className="relative overflow-hidden rounded-2xl p-4.5" style={{ background: "#F2FAF4" }}>
      <img src={`${DASH_IMG}muc-tieu-moi-ngay-bg.png`} alt="" className="absolute inset-0 h-full w-full object-cover" />
      <div className="relative flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Target size={14} style={{ color: "#E91E4D" }} />
          <h2 className="text-[13px] font-bold" style={{ color: "#111827" }}>
            Mục tiêu mỗi ngày
          </h2>
        </div>
        <button
          onClick={() => setSettingsOpen(true)}
          className="flex h-6 w-6 items-center justify-center rounded-full text-neutral-400 hover:bg-white hover:text-rose-600"
          title="Cài đặt mục tiêu"
        >
          <Pencil size={12} />
        </button>
      </div>

      {enabledTypes.length === 0 ? (
        <p className="relative mt-3 text-sm text-neutral-500">Chưa bật mục nào -- bấm nút bút chì để chọn mục và đặt tốc độ mỗi ngày.</p>
      ) : (
        <div className="relative mt-3.5 flex flex-col gap-1.5">
          {enabledTypes.map((type) => {
            const meta = PLAN_META[type];
            const item = plan[type];
            const pct = item.goal > 0 ? Math.min(100, Math.round((item.doneToday / item.goal) * 100)) : 0;
            return (
              <button key={type} onClick={() => onNavigate(meta.screen)} className="rounded-xl px-1 py-0.75 text-left hover:bg-white/50">
                <div className="flex items-center gap-2">
                  <img src={`${ICON_IMG}${meta.img}`} alt="" className="h-5.5 w-5.5 shrink-0" />
                  <span className="min-w-0 flex-1 truncate text-xs" style={{ color: "#111827" }}>
                    {meta.label}
                  </span>
                  <span className="shrink-0 text-[11px]" style={{ color: "#374151" }}>
                    {item.doneToday} / {item.goal} {meta.unit}
                  </span>
                </div>
                <div className="mt-0.75 ml-7.5 h-0.75 rounded-full bg-neutral-200">
                  <div className="h-full rounded-full" style={{ width: `${pct}%`, background: meta.accent }} />
                </div>
                {item.daysLeft !== null && item.remainingNew > 0 ? (
                  <div className="mt-0.5 ml-7.5 text-[10px] text-neutral-400">còn {item.daysLeft} ngày</div>
                ) : null}
              </button>
            );
          })}
        </div>
      )}

      <DailyPlanSettingsSheet open={settingsOpen} onClose={() => setSettingsOpen(false)} goals={goals} onSave={onSaveGoals} />
    </div>
  );
}

function ProgressCard({
  bgImage,
  tint,
  accent,
  img,
  label,
  progress,
  suffix,
  onClick,
}: {
  bgImage: string;
  tint: string;
  accent: string;
  img: string;
  label: string;
  progress: { mastered: number; total: number };
  suffix: string;
  onClick: () => void;
}) {
  const pct = progress.total > 0 ? Math.round((progress.mastered / progress.total) * 100) : 0;
  return (
    <button
      onClick={onClick}
      className="relative w-[calc(100vw-3rem)] shrink-0 snap-start overflow-hidden rounded-2xl border border-neutral-200 bg-white p-4 text-left md:min-h-36 md:w-auto md:shrink md:p-4.5"
    >
      <img src={`${DASH_IMG}${bgImage}`} alt="" className="absolute inset-0 h-full w-full object-cover object-[68%_center]" />
      <div
        className="absolute inset-0"
        style={{ background: `linear-gradient(100deg, ${tint} 0%, ${tint}d9 50%, ${tint}55 75%, transparent 92%)` }}
      />
      <div className="relative max-w-[70%]">
        <div className="flex items-center gap-1.5">
          <img src={`${ICON_IMG}${img}`} alt="" className="h-6 w-6 shrink-0 md:h-6.75 md:w-6.75" />
          <span className="truncate text-xs font-bold text-neutral-800 md:text-sm">{label}</span>
        </div>
        <div className="mt-1.5 text-xl font-bold md:mt-2 md:text-[27px]" style={{ color: accent }}>
          {pct}%
        </div>
        <div className="mt-0.5 text-[10px] text-neutral-600 md:text-xs">
          {progress.mastered.toLocaleString("vi-VN")} / {progress.total.toLocaleString("vi-VN")} {suffix}
        </div>
        <div className="mt-1.5 h-1.5 rounded-full bg-white/70 md:mt-2 md:h-[7px]">
          <div className="h-full rounded-full" style={{ width: `${pct}%`, background: accent }} />
        </div>
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

// Static -- one fixed câu danh ngôn, no rotation/content bank needed for
// this. Vietnamese translation only under the Japanese line -- no romaji,
// per request.
function QuoteCard() {
  return (
    <div className="relative flex min-h-30 items-center justify-center overflow-hidden rounded-2xl p-3.5 md:min-h-39">
      <img src={`${DASH_IMG}nihongo-nin-quote-flower-bg.png`} alt="" className="absolute inset-0 h-full w-full object-cover" />
      <img src={`${DASH_IMG}icon-quote.png`} alt="" className="absolute top-2.5 left-2.5 h-5.5 w-5.5" />
      <img src={`${DASH_IMG}icon-pin.png`} alt="" className="absolute right-2.5 bottom-2.5 h-7.5 w-7.5" />
      <div className="relative mx-auto text-center">
        <div className="text-xl font-bold text-neutral-800 md:text-2xl">継続は力なり。</div>
        <div className="mt-1.5 text-center text-[15px] italic md:text-base" style={{ color: "#9a3412" }}>
          Kiên trì là sức mạnh.
        </div>
      </div>
    </div>
  );
}

export function HomeScreen({ onNavigate }: { onNavigate: (screen: Screen, id?: string) => void }) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [content, setContent] = useState<FilteredContent | null>(null);
  const [goals, setGoals] = useState<DailyGoals | null>(null);
  const [plan, setPlan] = useState<DailyPlan | null>(null);
  const [lastActive, setLastActive] = useState<LastActive | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([loadStats(), loadDailyGoals(), loadLastActive()]).then(([{ stats: s, content: c }, g, last]) => {
      if (cancelled) return;
      setStats(s);
      setContent(c);
      setGoals(g);
      setPlan(computePlan(c, g));
      setLastActive(last);
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
    <div className="mx-auto max-w-6xl px-2.5 py-2 md:px-8 md:py-4">
      <h1 className="text-2xl font-bold text-neutral-800">{greeting()} 🌸</h1>
      <p className="mt-1 text-neutral-500">Hôm nay học tiếp một chút nhé. Kiên trì mỗi ngày, kết quả sẽ đến!</p>

      {stats ? (
        <div className="mt-4 flex flex-col gap-6 md:mt-5 md:flex-row md:items-start">
          {/* Streak, mobile-only instance -- today's habit prompt belongs
              above the fold, before the two columns below split apart. The
              desktop instance lives inside the rail further down instead of
              trying to keep this one row-synced with the main column via
              CSS grid -- that forced the two independently-tall columns to
              share row tracks, staggering every section under it. */}
          <div className="md:hidden">
            <StreakCard streak={stats.streak} weekDays={stats.weekDays} onNavigate={onNavigate} />
          </div>

          {/* Main column */}
          <div className="flex flex-1 flex-col gap-6">
            {/* "Tiếp tục học" banner. When WebApp's go() has already
                recorded a last-active content screen, this quotes that
                screen's REAL progress (same numbers as its ProgressCard
                below) instead of a fabricated "you were on card 24/30"
                claim -- screens without a tracked % (Quiz/Luyện đề/Nghe
                chép chính tả) just get a generic CTA. First-ever visit (no
                lastActive yet) falls back to the plain welcome banner. */}
            <div className="relative overflow-hidden rounded-2xl p-4 md:flex md:h-52.5 md:items-center md:p-0 md:px-7">
              <img
                src={`${DASH_IMG}hero-japan.png`}
                alt=""
                className="absolute inset-0 h-full w-full object-cover object-[68%_center] md:object-[center_35%]"
              />
              <div
                className="absolute inset-0 md:hidden"
                style={{ background: "linear-gradient(180deg, #fff5f6f2 0%, #fff5f6e6 55%, #fff5f699 80%, transparent 100%)" }}
              />
              <div
                className="absolute inset-0 hidden md:block"
                style={{ background: "linear-gradient(90deg, #fff5f6 0%, #fff5f6cc 40%, transparent 75%)" }}
              />
              {lastActive && stats
                ? (() => {
                    const resume = RESUME_META[lastActive.screen];
                    const ResumeIcon = resume.icon;
                    const resumeProgress = resume.progressKey ? stats.progress[resume.progressKey] : null;
                    const resumePct =
                      resumeProgress && resumeProgress.total > 0 ? Math.round((resumeProgress.mastered / resumeProgress.total) * 100) : null;
                    return (
                      <div className="relative max-w-[74%] md:max-w-[58%]">
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1.5 text-[10px] font-bold text-rose-600 md:px-3 md:text-xs">
                          <ResumeIcon size={11} className="md:hidden" />
                          <ResumeIcon size={15} className="hidden md:block" />
                          TIẾP TỤC HỌC
                        </span>
                        <div className="mt-2 text-base font-bold text-neutral-800 md:mt-3 md:text-2xl">{resume.label}</div>
                        {resumePct !== null && resumeProgress ? (
                          <>
                            <div className="mt-0.5 text-[11px] text-neutral-600 md:mt-1 md:text-[13px]">
                              {resumeProgress.mastered.toLocaleString("vi-VN")} / {resumeProgress.total.toLocaleString("vi-VN")} đã thuộc
                            </div>
                            <div className="mt-2.5 flex items-center gap-2 md:mt-3.5">
                              <div className="h-[7px] flex-1 rounded-full bg-white md:h-2 md:max-w-[300px]">
                                <div className="h-full rounded-full bg-rose-600" style={{ width: `${resumePct}%` }} />
                              </div>
                              <span className="text-xs font-bold text-rose-600">{resumePct}%</span>
                            </div>
                          </>
                        ) : (
                          <p className="mt-1 text-[11px] text-neutral-600 md:text-sm">Tiếp tục luyện tập ngay nào.</p>
                        )}
                        <button
                          onClick={() => onNavigate(lastActive.screen, lastActive.targetId)}
                          className="mt-3 inline-flex items-center gap-2 rounded-full bg-rose-600 px-4 py-2 text-xs font-semibold text-white hover:bg-rose-700 md:mt-4 md:px-5 md:py-2.5 md:text-sm"
                        >
                          Tiếp tục học
                          <ArrowRight size={14} />
                        </button>
                      </div>
                    );
                  })()
                : (
                  <div className="relative max-w-[74%] md:max-w-[58%]">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1.5 text-[10px] font-bold text-rose-600 md:px-3 md:text-xs">
                      <BookMarked size={11} className="md:hidden" />
                      <BookMarked size={15} className="hidden md:block" />
                      TIẾP TỤC HỌC
                    </span>
                    <div className="mt-2 text-base font-bold text-neutral-800 md:mt-3 md:text-2xl">Bắt đầu hành trình của bạn</div>
                    <p className="mt-1 text-[11px] text-neutral-600 md:text-sm">
                      Ôn đều mỗi ngày -- dù chỉ vài phút -- giúp Kanji, từ vựng và ngữ pháp ở lại lâu hơn trong đầu.
                    </p>
                    <button
                      onClick={() => onNavigate(totalDue > 0 ? "review" : "kanji")}
                      className="mt-3 inline-flex items-center gap-2 rounded-full bg-rose-600 px-4 py-2 text-xs font-semibold text-white hover:bg-rose-700 md:mt-4 md:px-5 md:py-2.5 md:text-sm"
                    >
                      {totalDue > 0 ? "Bắt đầu ôn tập" : "Bắt đầu học ngay"}
                      <ArrowRight size={14} />
                    </button>
                  </div>
                )}
            </div>

            {/* Mục tiêu mỗi ngày, mobile-only instance -- right after the
                hero banner, matching the mockup's mobile order (the desktop
                instance further down the rail is hidden here via
                `hidden md:block`, same dual-instance trick as StreakCard
                above). */}
            {goals && plan ? (
              <div className="md:hidden">
                <DailyPlanCard goals={goals} plan={plan} onNavigate={onNavigate} onSaveGoals={handleSaveGoals} />
              </div>
            ) : null}

            <div>
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-400">Tiến độ học tập</h2>
                <button onClick={() => onNavigate("stats")} className="text-xs font-semibold text-rose-600 hover:underline">
                  Xem chi tiết →
                </button>
              </div>
              <div className="mt-2.5 -mx-2.5 flex gap-3 overflow-x-auto px-2.5 pb-1 md:mx-0 md:grid md:grid-cols-3 md:overflow-visible md:px-0 md:pb-0">
                <ProgressCard
                  bgImage="kanji-bg.png"
                  tint="#fdf2f4"
                  accent="#e11d48"
                  img="icon-kanji.png"
                  label="Kanji"
                  progress={stats.progress.kanji}
                  suffix="từ"
                  onClick={() => onNavigate("kanji")}
                />
                <ProgressCard
                  bgImage="vocabulary-bg.png"
                  tint="#fdf3e7"
                  accent="#ea580c"
                  img="icon-vocab.png"
                  label="Từ vựng"
                  progress={stats.progress.vocab}
                  suffix="từ"
                  onClick={() => onNavigate("vocab")}
                />
                <ProgressCard
                  bgImage="grammar-bg.png"
                  tint="#eafbf3"
                  accent="#059669"
                  img="icon-grammar.png"
                  label="Ngữ pháp"
                  progress={stats.progress.bunpo}
                  suffix="mẫu"
                  onClick={() => onNavigate("bunpo")}
                />
                <ProgressCard
                  bgImage="reading-bg.png"
                  tint="#f4f0fc"
                  accent="#7c3aed"
                  img="icon-reading.png"
                  label="Luyện đọc"
                  progress={stats.progress.reading}
                  suffix="bài"
                  onClick={() => onNavigate("reading")}
                />
                <ProgressCard
                  bgImage="listening-bg.png"
                  tint="#fdf1f6"
                  accent="#db2777"
                  img="icon-listening.png"
                  label="Luyện nghe"
                  progress={stats.progress.listening}
                  suffix="bài"
                  onClick={() => onNavigate("listening")}
                />
                <ProgressCard
                  bgImage="review-bg.png"
                  tint="#eff6ff"
                  accent="#2563eb"
                  img="icon-jlpt.png"
                  label="Đề thi JLPT"
                  progress={stats.progress.dethi}
                  suffix="đề"
                  onClick={() => onNavigate("dethi")}
                />
              </div>
            </div>

            <div>
              <h2 className="flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wide text-neutral-400">
                <BarChart3 size={14} className="text-blue-600" /> Thống kê nhanh
              </h2>
              <div className="mt-2.5 grid grid-cols-2 gap-3 rounded-2xl border border-neutral-200 bg-white p-3.5 md:grid-cols-4">
                <div className="flex items-center gap-3 rounded-xl bg-blue-50 p-4">
                  <img src={`${ICON_IMG}icon-time.png`} alt="" className="h-8.5 w-8.5 shrink-0" />
                  <div>
                    <div className="text-[13px] whitespace-nowrap text-neutral-600">Thời gian học</div>
                    <div className="mt-0.5 text-xl font-bold text-neutral-800">0 giờ</div>
                    <div className="text-[11px] text-neutral-400">Hôm nay</div>
                  </div>
                </div>
                <div className="flex items-center gap-3 rounded-xl bg-emerald-50 p-4">
                  <img src={`${ICON_IMG}icon-done.png`} alt="" className="h-8.5 w-8.5 shrink-0" />
                  <div>
                    <div className="text-[13px] whitespace-nowrap text-neutral-600">Bài đã học</div>
                    <div className="mt-0.5 text-xl font-bold text-neutral-800">{stats.quickStats.lessonsDone}</div>
                    <div className="text-[11px] text-neutral-400">Tổng cộng</div>
                  </div>
                </div>
                <div className="flex items-center gap-3 rounded-xl bg-purple-50 p-4">
                  <img src={`${ICON_IMG}icon-practice.png`} alt="" className="h-8.5 w-8.5 shrink-0" />
                  <div>
                    <div className="text-[13px] whitespace-nowrap text-neutral-600">Câu đã luyện</div>
                    <div className="mt-0.5 text-xl font-bold text-neutral-800">{stats.quickStats.questionsPracticed}</div>
                    <div className="text-[11px] text-neutral-400">Tổng cộng</div>
                  </div>
                </div>
                <div className="flex items-center gap-3 rounded-xl bg-rose-50 p-4">
                  <img src={`${ICON_IMG}icon-today.png`} alt="" className="h-8.5 w-8.5 shrink-0" />
                  <div>
                    <div className="text-[13px] whitespace-nowrap text-neutral-600">Học hôm nay</div>
                    <div className="mt-0.5 text-xl font-bold text-neutral-800">{stats.studiedToday} thẻ</div>
                    <div className="text-[11px] text-neutral-400">Hôm nay</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Câu nói hôm nay, mobile-only instance -- right after Thống
                kê nhanh, matching the mockup's mobile order (desktop
                instance stays in the rail, see the `hidden md:block` wrapper
                there). */}
            <div className="md:hidden">
              <QuoteCard />
            </div>

            {/* Tổng quan tiến độ -- tạm ẩn, dư thừa so với "Tiến độ học tập" ở trên (cả desktop và mobile).
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
            */}

            {/* Tiếp tục học -- tạm ẩn, dư thừa so với "Tiến độ học tập" ở trên (cả desktop và mobile).
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
            */}
          </div>

          {/* Right rail -- desktop only now (Streak/DailyPlanCard/QuoteCard
              have their own mobile-only instances above in the main column). */}
          <div className="flex flex-col gap-4 md:w-80 md:shrink-0">
            <div className="hidden md:block">
              <StreakCard streak={stats.streak} weekDays={stats.weekDays} onNavigate={onNavigate} />
            </div>

            {goals && plan ? (
              <div className="hidden md:block">
                <DailyPlanCard goals={goals} plan={plan} onNavigate={onNavigate} onSaveGoals={handleSaveGoals} />
              </div>
            ) : null}

            <div className="hidden md:block">
              <QuoteCard />
            </div>

            {/* Cần ôn ngay -- tạm ẩn, dư thừa (cả desktop và mobile).
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
            */}

            {/* Luyện thi -- tạm ẩn, dư thừa (cả desktop và mobile).
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
            */}
          </div>
        </div>
      ) : (
        <p className="mt-6 text-neutral-400">Đang tải...</p>
      )}
    </div>
  );
}
