import { useEffect, useRef, useState } from "react";
import { Clock, FileText, BookOpenText, PenSquare, Headphones, ChevronLeft, ChevronRight, Check, Flag, RotateCcw } from "lucide-react";
import type { DeThiExam, DeThiPaper } from "../../types/dethi.ts";
import {
  ALL_EXAMS,
  SOURCE_LABELS,
  AVAILABLE_SOURCES,
  findExamById,
  findPaper,
  loadDeThiSession,
  saveDeThiSession,
  clearDeThiSession,
  startPaperAttempt,
  submitPaper,
  getExamSummary,
  clearHistoryForPaper,
  type DeThiSession,
  type DeThiHistoryEntry,
  type DeThiPaperSummary,
} from "../../popup/dethiState.ts";
import { ALL_LISTENING } from "../../popup/listeningState.ts";
import type { Screen } from "../../popup/App.tsx";
import { Card } from "../components/ui/card.tsx";
import { Button } from "../components/ui/button.tsx";
import { PageHeader } from "../components/PageHeader.tsx";
import { levelBadgeStyle } from "../lib/levelColors.tsx";
import { QuestionPalette, type PaletteStatus } from "../components/QuestionPalette.tsx";
import { useConfirm } from "../components/ConfirmDialog.tsx";
import { AudioPlayer } from "../components/AudioPlayer.tsx";
import { assetUrl } from "../../platform/assetUrl";
import { useFloatingNav } from "../WebAppShell.tsx";
import { useSwipeNavigation } from "../lib/useSwipeNavigation.ts";
import { useCountdown } from "../lib/useCountdown.ts";

type Step =
  | { name: "examList" }
  | { name: "examDetail"; examId: string }
  | { name: "taking"; session: DeThiSession }
  // Keeps the just-finished session (not just the aggregate entry) so the
  // result view can show per-question correct/wrong without needing to
  // re-derive or re-fetch anything -- the session is already gone from
  // storage by this point (submitPaper clears it), this is the only copy.
  | { name: "result"; entry: DeThiHistoryEntry; session: DeThiSession };

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

  useEffect(() => {
    audioRef.current?.play().catch(() => {
      // Trình duyệt chặn autoplay (hiếm khi xảy ra vì "Bắt đầu" vừa là 1 cú
      // click của người dùng) -- không có gì để làm thêm, người học vẫn thấy
      // timeline đứng yên ở 0:00 và biết cần tương tác lại.
    });
  }, []);

  const pct = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="flex items-center gap-3">
      <audio
        ref={audioRef}
        src={src}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
        onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
      />
      <span className="w-9 text-right text-xs tabular-nums text-neutral-400">{formatAudioTime(currentTime)}</span>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-neutral-200">
        <div className="h-full rounded-full bg-rose-600 transition-[width]" style={{ width: `${pct}%` }} />
      </div>
      <span className="w-9 text-xs tabular-nums text-neutral-400">{formatAudioTime(duration)}</span>
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
}: { targetId?: string; onNavigate?: (screen: Screen, id?: string) => void } = {}) {
  const [step, setStep] = useState<Step | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
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
          if (!cancelled) setStep({ name: "result", entry, session });
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

  if (!step) return <div className="p-6 text-neutral-400">Đang tải...</div>;

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
        onNavigate={onNavigate}
      />
    );
  }
  if (step.name === "taking") {
    return (
      <TakingView
        session={step.session}
        onSessionChange={(session) => setStep({ name: "taking", session })}
        onFinish={(entry, finishedSession) => setStep({ name: "result", entry, session: finishedSession })}
        onBack={() => setStep({ name: "examDetail", examId: step.session.examId })}
      />
    );
  }
  return (
    <ResultView
      entry={step.entry}
      session={step.session}
      onBackToExam={() => setStep({ name: "examDetail", examId: step.entry.examId })}
      onRetry={() => {
        const found = findPaper(step.entry.examId, step.entry.paperId);
        if (!found) {
          setStep({ name: "examList" });
          return;
        }
        setStep({ name: "taking", session: startPaperAttempt(found.exam.id, found.paper) });
      }}
    />
  );
}

function ExamListView({ onOpen }: { onOpen: (examId: string) => void }) {
  const [summaries, setSummaries] = useState<Record<string, Record<string, DeThiPaperSummary>>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const entries = await Promise.all(ALL_EXAMS.map(async (e) => [e.id, await getExamSummary(e.id)] as const));
      if (!cancelled) setSummaries(Object.fromEntries(entries));
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="mx-auto max-w-4xl px-2.5 py-2 md:px-8 md:py-6">
      <div className="mb-1 text-xs font-medium text-neutral-400">Luyện thi JLPT</div>
      <PageHeader title="Đề mô phỏng" icon={{ img: "icon-jlpt.png", bg: "#fef3c7" }} />

      <div className="mt-4 flex gap-2 overflow-x-auto">
        {(["N5", "N4", "N3", "N2", "N1"] as const).map((level) =>
          level === "N3" ? (
            <span
              key={level}
              style={levelBadgeStyle("N3")}
              className="shrink-0 rounded-full px-3.5 py-1.5 text-xs font-bold"
            >
              N3
            </span>
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
      <div className="mt-1.5 text-[11px] text-neutral-400">🔒 N2/N1 khoá -- chưa có bộ đề, sẽ mở khi cập nhật dữ liệu.</div>

      {AVAILABLE_SOURCES.map((source) => (
        <div key={source} className="mt-6">
          <h2 className="text-sm font-semibold text-neutral-600">
            {SOURCE_LABELS[source] ?? source}{" "}
            <span className="font-normal text-neutral-400">({ALL_EXAMS.filter((e) => e.source === source).length})</span>
          </h2>
          <div className="mt-2.5 grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5">
            {ALL_EXAMS.filter((exam) => exam.source === source).map((exam) => {
              const paperSummaries = summary(exam, summaries[exam.id]);
              const doneCount = paperSummaries.filter((s) => s.attempts > 0).length;
              const best = paperSummaries.some((s) => s.bestPercent !== null)
                ? Math.round(
                    paperSummaries.reduce((sum, s) => sum + (s.bestPercent ?? 0), 0) /
                      paperSummaries.filter((s) => s.bestPercent !== null).length,
                  )
                : null;
              return (
                <button
                  key={exam.id}
                  onClick={() => onOpen(exam.id)}
                  className="flex flex-col items-start gap-2 rounded-2xl border border-neutral-200 bg-white p-4 text-left hover:border-rose-200 hover:bg-rose-50/40"
                >
                  <div className="text-sm font-bold text-neutral-800">{exam.examLabel}</div>
                  <div className="flex gap-1">
                    {exam.papers.map((p, i) => (
                      <span
                        key={p.id}
                        className={`h-2 w-2 rounded-full ${paperSummaries[i]?.attempts ? "bg-emerald-500" : "bg-neutral-200"}`}
                      />
                    ))}
                  </div>
                  <div className="text-[11px] font-semibold text-neutral-400">
                    {doneCount === 0 ? "Chưa làm" : best !== null ? `${best}%` : `${doneCount}/${exam.papers.length}`}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ))}
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
  onNavigate,
}: {
  exam: DeThiExam;
  onBack: () => void;
  onStart: (paper: DeThiPaper, practiceMode?: boolean) => void;
  onNavigate?: (screen: Screen, id?: string) => void;
}) {
  const confirm = useConfirm();
  const [summaries, setSummaries] = useState<Record<string, DeThiPaperSummary> | null>(null);

  // Native audio paper (e.g. "choukai") already renders in the normal
  // papers.map grid below like any other paper -- the "link out to Luyện
  // nghe" fallback card only makes sense when the exam has NO native 聴解
  // paper of its own, only a separately-converted Luyện nghe book.
  const hasNativeAudioPaper = exam.papers.some((p) => p.audioUrl);
  const firstListeningQuestion =
    !hasNativeAudioPaper && exam.listeningBook ? ALL_LISTENING.find((q) => q.book === exam.listeningBook) : undefined;
  const listeningCount =
    !hasNativeAudioPaper && exam.listeningBook ? ALL_LISTENING.filter((q) => q.book === exam.listeningBook).length : 0;

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
    <div className="mx-auto max-w-4xl px-2.5 py-2 md:px-8 md:py-6">
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

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {exam.papers.map((paper) => {
          const Icon = paperIcon(paper.id);
          const s = summaries?.[paper.id];
          return (
            <Card key={paper.id} className="gap-3 rounded-2xl border-neutral-200 p-5 ring-0">
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
                <Button className="flex-1" onClick={() => onStart(paper)}>
                  Bắt đầu <ChevronRight size={15} />
                </Button>
                {paper.audioUrl ? (
                  <Button
                    variant="outline"
                    title="Nghe tự do -- dừng/tua/lặp lại/đổi tốc độ được, không tính giờ, không lưu vào lịch sử"
                    onClick={() => onStart(paper, true)}
                  >
                    Ôn tập
                  </Button>
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

        {hasNativeAudioPaper ? null : firstListeningQuestion ? (
          <Card className="gap-3 rounded-2xl border-neutral-200 p-5 ring-0">
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
          <Card className="gap-3 rounded-2xl border-dashed border-neutral-200 bg-neutral-50/60 p-5 ring-0">
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

  const { label: timeLabel, isLow } = useCountdown(session.deadlineAt, () => {
    finish();
  });

  useFloatingNav(true);

  if (!found) return <div className="p-6 text-neutral-400">Không tìm thấy đề này.</div>;
  const { exam, paper } = found;

  const idx = session.currentIndex;
  const q = paper.questions[idx];
  const answered = session.answers[idx];
  const allAnswered = session.answers.every((a) => a !== null);
  const isLast = idx === paper.questions.length - 1;

  async function goTo(newIndex: number) {
    const next = { ...session, currentIndex: newIndex };
    await saveDeThiSession(next);
    onSessionChange(next);
  }

  async function selectAnswer(optionIndex: number) {
    const answers = [...session.answers];
    answers[idx] = optionIndex;
    const next = { ...session, answers };
    await saveDeThiSession(next);
    onSessionChange(next);
  }

  function goNext() {
    if (isLast) return;
    goTo(idx + 1);
  }

  const swipe = useSwipeNavigation({
    onSwipeLeft: goNext,
    onSwipeRight: () => {
      if (idx > 0) goTo(idx - 1);
    },
  });

  return (
    <div className="mx-auto max-w-4xl px-2.5 py-2 pb-28 md:px-8 md:py-6 md:pb-6" {...swipe}>
      <button onClick={onBack} className="flex items-center gap-1 text-sm font-medium text-neutral-500 hover:text-neutral-700">
        <ChevronLeft size={15} /> {exam.examLabel}
      </button>

      <div className="mt-1.5 flex items-center justify-between">
        <div>
          <div className="text-xs font-semibold text-neutral-400">{paper.label}</div>
          <h1 className="text-lg font-bold text-neutral-800">
            Câu {idx + 1} / {paper.questions.length}
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
        summary={`Câu ${idx + 1}/${paper.questions.length} · đã trả lời ${session.answers.filter((a) => a !== null).length}`}
        onJump={goTo}
        items={paper.questions.map((question, i) => {
          const a = session.answers[i];
          const status: PaletteStatus = i === idx ? "current" : a === null ? "unanswered" : "answered";
          return { id: String(question.number), status };
        })}
      />

      <Card className="mt-4 gap-0 rounded-2xl border-neutral-200 p-6 ring-0">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs font-semibold text-neutral-400 uppercase">
            <span style={levelBadgeStyle("N3")} className="rounded-full px-2 py-0.5 text-[10px] font-bold normal-case">
              N3
            </span>
            {q.problemGroup}
          </div>
        </div>

        {q.passage ? (
          <div className="mt-3 rounded-lg bg-neutral-50 p-4 text-sm leading-relaxed whitespace-pre-line text-neutral-700">{q.passage}</div>
        ) : null}

        <div className="mt-4 text-lg leading-relaxed font-semibold text-neutral-800">{q.question}</div>

        {q.optionsImage ? (
          <>
            <img src={assetUrl(q.optionsImage)} alt="Lựa chọn minh hoạ" className="mt-4 w-full rounded-lg border border-neutral-200" />
            <div className="mt-3 grid grid-cols-4 gap-2">
              {Array.from({ length: q.optionCount ?? 4 }, (_, oi) => (
                <button
                  key={oi}
                  onClick={() => selectAnswer(oi)}
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
          <div className="mt-5 grid gap-2 sm:grid-cols-2">
            {q.options.map((opt, oi) => (
              <button
                key={oi}
                onClick={() => selectAnswer(oi)}
                className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-left text-sm ${
                  answered === oi ? "border-rose-300 bg-rose-50 text-rose-700" : "border-neutral-200 hover:bg-neutral-50"
                }`}
              >
                <span
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-bold ${
                    answered === oi ? "border-rose-300 text-rose-600" : "border-neutral-300 text-neutral-400"
                  }`}
                >
                  {oi + 1}
                </span>
                {opt}
              </button>
            ))}
          </div>
        )}
      </Card>

      {/* Desktop-only inline row -- on mobile, see the floating buttons below.
          Full-width on mobile it would put "Câu sau" right at the screen edge,
          the same edge-swipe-back trap fixed in QuizScreen (see useSwipeNavigation.ts). */}
      <div className="mt-4 hidden items-center gap-2 md:flex">
        <Button variant="outline" disabled={idx === 0} onClick={() => goTo(idx - 1)}>
          <ChevronLeft size={16} /> Câu trước
        </Button>
        <Button className="ml-auto" disabled={isLast} onClick={goNext}>
          Câu sau <ChevronRight size={16} />
        </Button>
      </div>

      {idx > 0 ? (
        <button
          onClick={() => goTo(idx - 1)}
          aria-label="Câu trước"
          className="fixed bottom-36 left-4 z-20 flex h-10 w-10 items-center justify-center rounded-full bg-white text-neutral-600 shadow-lg ring-1 ring-neutral-200 active:bg-neutral-50 md:hidden"
        >
          <ChevronLeft size={18} />
        </button>
      ) : null}
      {!isLast ? (
        <button
          onClick={goNext}
          aria-label="Câu sau"
          className="fixed right-4 bottom-36 z-20 flex h-10 w-10 items-center justify-center rounded-full bg-rose-600 text-white shadow-lg active:bg-rose-700 md:hidden"
        >
          <ChevronRight size={18} />
        </button>
      ) : null}
    </div>
  );
}

function ResultView({
  entry,
  session,
  onBackToExam,
  onRetry,
}: {
  entry: DeThiHistoryEntry;
  session: DeThiSession;
  onBackToExam: () => void;
  onRetry: () => void;
}) {
  const found = findPaper(entry.examId, entry.paperId);
  const [reviewIndex, setReviewIndex] = useState<number | null>(null);

  return (
    <div className="mx-auto max-w-2xl px-2.5 py-2 text-center md:px-8 md:py-6">
      <h1 className="text-2xl font-bold text-neutral-800">Kết quả</h1>
      <p className="mt-1 text-sm text-neutral-500">
        {found ? `${found.exam.examLabel} · ${found.paper.label}` : ""}
      </p>

      <div className="mt-6 flex flex-col items-center">
        <div className="text-5xl font-extrabold text-rose-600">{entry.percent}%</div>
        <div className="mt-1 text-sm font-medium text-neutral-500">
          {entry.correctPoints}/{entry.totalPoints} điểm · {entry.correctCount}/{entry.totalQuestions} câu đúng
        </div>
        <div className="mt-1 text-xs text-neutral-400">Thời gian làm bài: {formatDuration(entry.durationSec)}</div>
      </div>

      <div className="mt-8 flex gap-2">
        <Button variant="outline" className="flex-1" onClick={onBackToExam}>
          Về danh sách đề
        </Button>
        <Button className="flex-1" onClick={onRetry}>
          Làm lại
        </Button>
      </div>

      {found ? (
        <div className="mt-8 text-left">
          <QuestionPalette
            defaultOpen
            summary={`${entry.correctCount} đúng · ${entry.totalQuestions - entry.correctCount - session.answers.filter((a) => a === null).length} sai${
              session.answers.some((a) => a === null) ? ` · ${session.answers.filter((a) => a === null).length} chưa làm` : ""
            } — bấm 1 câu để xem lại`}
            onJump={(i) => setReviewIndex(i)}
            items={found.paper.questions.map((q, i) => {
              const a = session.answers[i];
              const status: PaletteStatus = a === null ? "unanswered" : a === q.correctIndex ? "correct" : "wrong";
              return { id: String(q.number), status };
            })}
          />
          {reviewIndex !== null ? (
            <ReviewQuestion question={found.paper.questions[reviewIndex]} chosenIndex={session.answers[reviewIndex]} />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function ReviewQuestion({ question, chosenIndex }: { question: DeThiPaper["questions"][number]; chosenIndex: number | null }) {
  return (
    <Card className="mt-3 gap-0 rounded-2xl border-neutral-200 p-5 ring-0">
      <div className="text-xs font-semibold text-neutral-400 uppercase">{question.problemGroup}</div>
      {question.passage ? (
        <div className="mt-2 rounded-lg bg-neutral-50 p-4 text-sm leading-relaxed whitespace-pre-line text-neutral-700">{question.passage}</div>
      ) : null}
      <div className="mt-3 text-base font-semibold text-neutral-800">{question.question}</div>
      {question.optionsImage ? (
        <>
          <img src={assetUrl(question.optionsImage)} alt="Lựa chọn minh hoạ" className="mt-3 w-full rounded-lg border border-neutral-200" />
          <div className="mt-3 grid grid-cols-4 gap-2">
            {Array.from({ length: question.optionCount ?? 4 }, (_, oi) => {
              let cls = "border-neutral-200 opacity-60";
              if (oi === question.correctIndex) cls = "border-emerald-300 bg-emerald-50 text-emerald-700";
              else if (oi === chosenIndex) cls = "border-rose-300 bg-rose-50 text-rose-700";
              return (
                <div key={oi} className={`rounded-lg border py-2 text-center text-sm font-bold ${cls}`}>
                  {oi + 1}
                </div>
              );
            })}
          </div>
        </>
      ) : (
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {question.options.map((opt, oi) => {
            let cls = "border-neutral-200 opacity-60";
            if (oi === question.correctIndex) cls = "border-emerald-300 bg-emerald-50 text-emerald-700";
            else if (oi === chosenIndex) cls = "border-rose-300 bg-rose-50 text-rose-700";
            return (
              <div key={oi} className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-left text-sm ${cls}`}>
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-current text-xs font-bold">
                  {oi + 1}
                </span>
                {opt}
              </div>
            );
          })}
        </div>
      )}
      {chosenIndex === null ? <p className="mt-3 text-xs font-medium text-neutral-400">Bạn chưa trả lời câu này.</p> : null}
    </Card>
  );
}
