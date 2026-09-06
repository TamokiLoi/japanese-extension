import { useEffect, useState } from "react";
import {
  Settings,
  BookMarked,
  Library,
  PenSquare,
  BookOpenText,
  Headphones,
  GraduationCap,
  ClipboardCheck,
  RotateCcw,
  ChevronRight,
  CheckCircle2,
  NotebookText,
  ListChecks,
  Circle,
} from "lucide-react";
import type { Screen } from "../../popup/App.tsx";
import {
  loadRoadmapSettings,
  setExamDate,
  clearRoadmapSettings,
  computeRoadmapStatus,
  type RoadmapPhase,
} from "../../popup/roadmapState.ts";
import { loadProgressMap } from "../../popup/progressState.ts";
import { loadDailyGoals, buildDailyPlanItem, PLAN_TYPES, type PlanType, type DailyPlanItem } from "../../popup/dailyPlanState.ts";
import { loadCurricula, stopItems, jumpToStop, type RoadmapCurricula } from "../lib/roadmapCurriculum.ts";
import { ALL_BOOK_NOTES, findBookNote } from "../lib/bookNotes.ts";
import { ALL_QUIZBOOK, AVAILABLE_CATEGORIES, CATEGORY_LABELS, loadViewerState as loadQuizBookViewerState } from "../../popup/quizBookState.ts";
import type { QuizBookCategory } from "../../types/quizBook.ts";
import { ALL_EXAMS, loadDeThiHistory } from "../../popup/dethiState.ts";
import { PageHeader } from "../components/PageHeader.tsx";
import { FilterSheet } from "../components/FilterSheet.tsx";

const PHASE_LABEL: Record<RoadmapPhase, string> = {
  foundation: "Nền tảng",
  practice: "Đọc - Nghe",
  sprint: "Nước rút",
  "past-exam": "Đã qua ngày thi",
};
const PHASE_DESC: Record<RoadmapPhase, string> = {
  foundation: "Tập trung học Kanji, Từ vựng, Ngữ pháp trước khi chuyển sang Đọc hiểu, Luyện nghe.",
  practice: "Thêm Đọc hiểu và Luyện nghe vào kế hoạch hằng ngày, vẫn tiếp tục Kanji/Từ vựng/Ngữ pháp.",
  sprint: "Bắt đầu luyện đề, thi thử và ôn lại lỗi sai trước ngày thi.",
  "past-exam": "",
};
const FOUNDATION_TYPES: PlanType[] = ["kanji", "vocab", "bunpo"];
const NOTE_TYPES: PlanType[] = ["vocab", "bunpo", "reading", "listening"];
const DIFFICULTY_COLOR: Record<string, string> = {
  "Dễ": "bg-emerald-50 text-emerald-600",
  "Trung bình": "bg-amber-50 text-amber-600",
  Khó: "bg-rose-50 text-rose-600",
};

function DifficultyBadge({ difficulty }: { difficulty: string }) {
  return (
    <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${DIFFICULTY_COLOR[difficulty] ?? "bg-neutral-100 text-neutral-500"}`}>
      {difficulty}
    </span>
  );
}

const PLAN_META: Record<PlanType, { label: string; unit: string; icon: typeof BookMarked; screen: Screen }> = {
  kanji: { label: "Kanji", unit: "chữ mới", icon: BookMarked, screen: "kanji" },
  vocab: { label: "Từ vựng", unit: "từ mới", icon: Library, screen: "vocab" },
  bunpo: { label: "Ngữ pháp", unit: "mẫu mới", icon: PenSquare, screen: "bunpo" },
  reading: { label: "Luyện đọc", unit: "câu mới", icon: BookOpenText, screen: "reading" },
  listening: { label: "Luyện nghe", unit: "câu mới", icon: Headphones, screen: "listening" },
};

interface RoadmapData {
  curricula: RoadmapCurricula;
  dailyPlan: Partial<Record<PlanType, DailyPlanItem>>;
}

async function loadRoadmapData(): Promise<RoadmapData> {
  const [map, goals, curricula] = await Promise.all([loadProgressMap(), loadDailyGoals(), loadCurricula()]);
  const dailyPlan: Partial<Record<PlanType, DailyPlanItem>> = {};
  for (const type of PLAN_TYPES) {
    const cur = curricula[type];
    if (cur.currentIndex === null) continue;
    const items = stopItems(type, cur.stops[cur.currentIndex].key);
    dailyPlan[type] = buildDailyPlanItem(items, goals[type].goal, map);
  }
  return { curricula, dailyPlan };
}

async function loadQuizBookRemaining(): Promise<Record<QuizBookCategory, number>> {
  const state = await loadQuizBookViewerState();
  const remaining = {} as Record<QuizBookCategory, number>;
  for (const c of AVAILABLE_CATEGORIES) remaining[c] = 0;
  for (const q of ALL_QUIZBOOK) {
    if (state.answers[q.id] == null) remaining[q.category]++;
  }
  return remaining;
}

interface DethiSummary {
  attemptedPapers: number;
  totalPapers: number;
}

async function loadDethiSummary(): Promise<DethiSummary> {
  const history = await loadDeThiHistory();
  const attemptedPapers = new Set(history.map((h) => `${h.examId}:${h.paperId}`)).size;
  const totalPapers = ALL_EXAMS.reduce((n, e) => n + e.papers.length, 0);
  return { attemptedPapers, totalPapers };
}

function PlanRow({
  icon: Icon,
  title,
  subtitle,
  onClick,
  accent,
  done,
}: {
  icon: typeof BookMarked;
  title: string;
  subtitle: React.ReactNode;
  onClick: () => void;
  accent: string;
  done?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-2xl border border-neutral-200 bg-white p-3.5 text-left hover:bg-neutral-50"
    >
      <span
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
        style={{ background: done ? "#ecfdf5" : `${accent}1a`, color: done ? "#059669" : accent }}
      >
        {done ? <CheckCircle2 size={17} /> : <Icon size={17} />}
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold text-neutral-800">{title}</div>
        <div className="text-xs text-neutral-400">{subtitle}</div>
      </div>
      <ChevronRight size={16} className="shrink-0 text-neutral-300" />
    </button>
  );
}

function ExamDateForm({ value, onChange, onSave }: { value: string; onChange: (v: string) => void; onSave: () => void }) {
  return (
    <div className="mt-3 flex items-center gap-2">
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="flex-1 rounded-xl border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-rose-300"
      />
      <button
        onClick={onSave}
        disabled={!value}
        className="shrink-0 rounded-full bg-rose-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
      >
        Lưu ngày thi
      </button>
    </div>
  );
}

export function RoadmapScreen({ onNavigate }: { onNavigate: (screen: Screen) => void }) {
  const [examDate, setExamDateState] = useState<string | null | undefined>(undefined);
  const [dateInput, setDateInput] = useState("");
  const [data, setData] = useState<RoadmapData | null>(null);
  const [quizRemaining, setQuizRemaining] = useState<Record<QuizBookCategory, number> | null>(null);
  const [dethiSummary, setDethiSummary] = useState<DethiSummary | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [fullRoadmapOpen, setFullRoadmapOpen] = useState(false);

  useEffect(() => {
    loadRoadmapSettings().then((s) => setExamDateState(s.examDate));
  }, []);

  const [status, setStatus] = useState<ReturnType<typeof computeRoadmapStatus>>(null);
  useEffect(() => {
    if (examDate === undefined) return;
    if (!examDate) {
      setStatus(null);
      return;
    }
    loadRoadmapSettings().then((s) => setStatus(computeRoadmapStatus(s)));
  }, [examDate]);

  useEffect(() => {
    if (!status || status.phase === "past-exam") return;
    loadRoadmapData().then(setData);
    if (status.phase === "sprint") {
      loadQuizBookRemaining().then(setQuizRemaining);
      loadDethiSummary().then(setDethiSummary);
    }
  }, [status?.phase]);

  async function handleSaveDate() {
    if (!dateInput) return;
    const next = await setExamDate(dateInput);
    setExamDateState(next.examDate);
    setDateInput("");
    setSettingsOpen(false);
  }

  async function handleReset() {
    await clearRoadmapSettings();
    setExamDateState(null);
    setStatus(null);
    setData(null);
    setQuizRemaining(null);
    setDethiSummary(null);
    setSettingsOpen(false);
  }

  async function handleRowClick(type: PlanType, stopKey: string | null) {
    if (stopKey) await jumpToStop(type, stopKey);
    onNavigate(PLAN_META[type].screen);
  }

  if (examDate === undefined) {
    return <div className="p-6 text-neutral-400">Đang tải...</div>;
  }

  if (!examDate) {
    return (
      <div className="mx-auto max-w-2xl px-2.5 py-2 md:px-8 md:py-6">
        <PageHeader title="Lộ trình ôn thi N3" icon={{ img: "icon-jlpt.png", bg: "#dbeafe" }} />
        <div className="mt-4 rounded-2xl border border-neutral-200 bg-white p-5">
          <p className="text-sm text-neutral-600">
            Nhập ngày thi N3 của bạn -- app sẽ tự chia lộ trình thành 3 giai đoạn, và tự sắp xếp thứ tự sách/nguồn nên học trước-sau
            cho từng phần (Kanji, Từ vựng, Ngữ pháp, Đọc, Nghe) dựa trên đúng dữ liệu bạn đang học:
          </p>
          <ul className="mt-3 space-y-1.5 text-sm text-neutral-500">
            <li>
              <b className="text-neutral-700">Nền tảng</b> (60% đầu chặng đường): tập trung Kanji, Từ vựng, Ngữ pháp -- theo đúng
              thứ tự sách từ dễ tới khó.
            </li>
            <li>
              <b className="text-neutral-700">Luyện đề</b> (60-85%): thêm Đọc hiểu, Luyện nghe và bắt đầu luyện đề.
            </li>
            <li>
              <b className="text-neutral-700">Nước rút</b> (85-100%): tập trung thi thử và ôn lại lỗi sai.
            </li>
          </ul>
          <ExamDateForm value={dateInput} onChange={setDateInput} onSave={handleSaveDate} />
        </div>
      </div>
    );
  }

  if (!status) {
    return <div className="p-6 text-neutral-400">Đang tải...</div>;
  }

  if (status.phase === "past-exam") {
    return (
      <div className="mx-auto max-w-2xl px-2.5 py-2 md:px-8 md:py-6">
        <PageHeader title="Lộ trình ôn thi N3" icon={{ img: "icon-jlpt.png", bg: "#dbeafe" }} />
        <div className="mt-4 rounded-2xl border border-neutral-200 bg-white p-5 text-center">
          <p className="text-sm text-neutral-600">Đã qua ngày thi ({examDate}). Chúc bạn thi tốt!</p>
          <button onClick={handleReset} className="mt-4 rounded-full bg-rose-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-rose-700">
            Đặt ngày thi mới
          </button>
        </div>
      </div>
    );
  }

  const relevantTypes = status.phase === "foundation" ? FOUNDATION_TYPES : PLAN_TYPES;
  const pct = Math.round(status.progressRatio * 100);

  return (
    <div className="mx-auto max-w-3xl px-2.5 py-2 md:px-8 md:py-6">
      <PageHeader
        title="Lộ trình ôn thi N3"
        subtitle={`Còn ${status.daysRemaining} ngày · Giai đoạn: ${PHASE_LABEL[status.phase]}`}
        icon={{ img: "icon-jlpt.png", bg: "#dbeafe" }}
        action={
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setFullRoadmapOpen(true)}
              aria-label="Toàn bộ lộ trình"
              title="Toàn bộ lộ trình"
              className="flex h-9 w-9 items-center justify-center rounded-full border border-neutral-200 text-neutral-500 hover:bg-neutral-50"
            >
              <ListChecks size={16} />
            </button>
            <button
              onClick={() => setNotesOpen(true)}
              aria-label="Ghi chú tài liệu"
              title="Ghi chú tài liệu"
              className="flex h-9 w-9 items-center justify-center rounded-full border border-neutral-200 text-neutral-500 hover:bg-neutral-50"
            >
              <NotebookText size={16} />
            </button>
            <button
              onClick={() => setSettingsOpen(true)}
              aria-label="Cài đặt ngày thi"
              className="flex h-9 w-9 items-center justify-center rounded-full border border-neutral-200 text-neutral-500 hover:bg-neutral-50"
            >
              <Settings size={16} />
            </button>
          </div>
        }
      />

      <div className="mt-4 rounded-2xl border border-neutral-200 bg-white p-4">
        <div className="flex items-center justify-between text-sm">
          <span className="font-semibold text-neutral-700">{PHASE_LABEL[status.phase]}</span>
          <span className="text-neutral-400">{pct}%</span>
        </div>
        <div className="mt-2 h-2 rounded-full bg-neutral-100">
          <div className="h-full rounded-full bg-rose-600" style={{ width: `${pct}%` }} />
        </div>
        <p className="mt-2 text-xs text-neutral-400">{PHASE_DESC[status.phase]}</p>
      </div>

      <div className="mt-5">
        <h2 className="text-sm font-semibold tracking-wide text-neutral-400 uppercase">Kế hoạch hôm nay</h2>
        {data ? (
          <div className="mt-2.5 flex flex-col gap-2">
            {relevantTypes.map((type) => {
              const meta = PLAN_META[type];
              const cur = data.curricula[type];
              if (cur.currentIndex === null) {
                const requiredCount = cur.stops.filter((s) => s.required).length;
                const bonusCount = cur.stops.length - requiredCount;
                return (
                  <PlanRow
                    key={type}
                    icon={meta.icon}
                    title={meta.label}
                    subtitle={`Đã thuộc đủ ${requiredCount} bộ cốt lõi (≥90%)${bonusCount > 0 ? ` -- còn ${bonusCount} bộ mở rộng tùy chọn, xem ở "Toàn bộ lộ trình"` : ""}.`}
                    onClick={() => handleRowClick(type, null)}
                    accent="#e11d48"
                    done
                  />
                );
              }
              const currentStop = cur.stops[cur.currentIndex];
              const item = data.dailyPlan[type];
              const upcoming = cur.stops.slice(cur.currentIndex + 1, cur.currentIndex + 3).map((s) => s.label);
              const moreCount = cur.stops.length - cur.currentIndex - 1 - upcoming.length;
              const note = findBookNote(type, currentStop.key);
              return (
                <PlanRow
                  key={type}
                  icon={meta.icon}
                  title={meta.label}
                  subtitle={
                    <>
                      <div className="flex items-center gap-1.5 truncate text-neutral-600">
                        <span className="truncate">
                          Đang học: <b>{currentStop.label}</b>
                          {currentStop.note ? ` (${currentStop.note})` : ""} · bộ {cur.currentIndex + 1}/{cur.stops.length}
                        </span>
                        {note ? <DifficultyBadge difficulty={note.difficulty} /> : null}
                      </div>
                      <div>
                        {currentStop.masteredCount}/{currentStop.total} đã thuộc (
                        {Math.round((currentStop.masteredCount / currentStop.total) * 100)}%, cần 90% để qua bộ tiếp theo)
                      </div>
                      {item ? (
                        <div>
                          {item.doneToday}/{item.goal} {meta.unit} hôm nay
                          {item.daysLeft !== null && item.remainingNew > 0 ? ` · còn ${item.daysLeft} ngày` : ""}
                        </div>
                      ) : null}
                      {upcoming.length > 0 ? (
                        <div className="truncate">
                          Tiếp theo: {upcoming.join(", ")}
                          {moreCount > 0 ? ` +${moreCount} bộ nữa` : ""}
                        </div>
                      ) : null}
                    </>
                  }
                  onClick={() => handleRowClick(type, currentStop.key)}
                  accent="#e11d48"
                />
              );
            })}
          </div>
        ) : (
          <p className="mt-2 text-sm text-neutral-400">Đang tải...</p>
        )}
      </div>

      {status.phase === "sprint" ? (
        <div className="mt-5">
          <h2 className="text-sm font-semibold tracking-wide text-neutral-400 uppercase">Nước rút</h2>
          <div className="mt-2.5 flex flex-col gap-2">
            {quizRemaining ? (
              <PlanRow
                icon={GraduationCap}
                title="Luyện đề"
                subtitle={AVAILABLE_CATEGORIES.map((c) => `${CATEGORY_LABELS[c]} còn ${quizRemaining[c]} câu`).join(" · ")}
                onClick={() => onNavigate("quizBook")}
                accent="#d97706"
              />
            ) : null}
            {dethiSummary ? (
              <PlanRow
                icon={ClipboardCheck}
                title="Thi thử"
                subtitle={`Đã làm ${dethiSummary.attemptedPapers}/${dethiSummary.totalPapers} phần (25 đề × 2/3 mục -- chưa có mục nghe)`}
                onClick={() => onNavigate("exams")}
                accent="#2563eb"
              />
            ) : null}
            <PlanRow
              icon={RotateCcw}
              title="Ôn lại lỗi sai"
              subtitle="Ôn tập các thẻ cần ôn lại (SRS)"
              onClick={() => onNavigate("review")}
              accent="#e11d48"
            />
          </div>
        </div>
      ) : null}

      <FilterSheet open={settingsOpen} onClose={() => setSettingsOpen(false)} title="Cài đặt ngày thi">
        <p className="text-sm text-neutral-500">Đổi ngày thi hiện tại ({examDate}), hoặc xóa để đặt lại từ đầu.</p>
        <ExamDateForm value={dateInput} onChange={setDateInput} onSave={handleSaveDate} />
        <button onClick={handleReset} className="mt-4 text-sm font-medium text-rose-600 hover:underline">
          Xóa ngày thi, đặt lại từ đầu
        </button>
      </FilterSheet>

      <FilterSheet open={notesOpen} onClose={() => setNotesOpen(false)} title="Ghi chú tài liệu">
        <div className="flex flex-col gap-5">
          {NOTE_TYPES.map((type) => {
            const notes = ALL_BOOK_NOTES.filter((n) => n.type === type);
            if (notes.length === 0) return null;
            return (
              <div key={type}>
                <div className="mb-2 text-xs font-semibold tracking-wide text-neutral-400 uppercase">{PLAN_META[type].label}</div>
                <div className="flex flex-col gap-2.5">
                  {notes.map((n) => (
                    <div key={n.key} className="rounded-xl border border-neutral-200 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-semibold text-neutral-800">{n.label}</span>
                        <DifficultyBadge difficulty={n.difficulty} />
                      </div>
                      <p className="mt-1 text-xs text-neutral-500">{n.description}</p>
                      <p className="mt-1 text-xs text-neutral-400 italic">{n.audienceNote}</p>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </FilterSheet>

      <FilterSheet open={fullRoadmapOpen} onClose={() => setFullRoadmapOpen(false)} title="Toàn bộ lộ trình">
        {data ? (
          <div className="flex flex-col gap-5">
            {PLAN_TYPES.map((type) => {
              const meta = PLAN_META[type];
              const cur = data.curricula[type];
              const Icon = meta.icon;
              return (
                <div key={type}>
                  <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold tracking-wide text-neutral-400 uppercase">
                    <Icon size={13} /> {meta.label}
                  </div>
                  <div className="flex flex-col gap-1.5">
                    {cur.stops.map((s, i) => {
                      const isCurrent = cur.currentIndex === i;
                      const pct = s.total > 0 ? Math.round((s.masteredCount / s.total) * 100) : 0;
                      return (
                        <div
                          key={s.key}
                          className={`flex items-center gap-2.5 rounded-xl border px-3 py-2 text-sm ${
                            isCurrent ? "border-rose-300 bg-rose-50" : "border-neutral-200 bg-white"
                          }`}
                        >
                          {s.done ? (
                            <CheckCircle2 size={16} className="shrink-0 text-emerald-500" />
                          ) : isCurrent ? (
                            <span className="flex h-4 w-4 shrink-0 items-center justify-center">
                              <span className="h-2 w-2 rounded-full bg-rose-600" />
                            </span>
                          ) : (
                            <Circle size={16} className="shrink-0 text-neutral-300" />
                          )}
                          <span className={`min-w-0 flex-1 truncate ${isCurrent ? "font-semibold text-neutral-800" : s.done ? "text-neutral-500" : "text-neutral-600"}`}>
                            {s.label}
                          </span>
                          {!s.required ? (
                            <span className="shrink-0 rounded-full bg-neutral-100 px-1.5 py-0.5 text-[10px] font-medium text-neutral-400">Tùy chọn</span>
                          ) : null}
                          <span className="shrink-0 text-xs text-neutral-400">
                            {s.masteredCount}/{s.total} ({pct}%)
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-neutral-400">Đang tải...</p>
        )}
      </FilterSheet>
    </div>
  );
}
