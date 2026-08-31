import { useEffect, useState } from "react";
import { ChevronRight, Sparkles } from "lucide-react";
import {
  buildReviewQuestions,
  loadReviewSession,
  saveReviewSession,
  clearReviewSession,
  isReviewSessionUnfinished,
  isCorrectAnswer,
  type ReviewQuestion,
  type ReviewSession,
} from "../../popup/reviewState.ts";
import { recordAnswer } from "../../popup/progressState.ts";
import { requiredDirectionsFor } from "../../popup/quizState.ts";
import { Card } from "../components/ui/card.tsx";
import { Button } from "../components/ui/button.tsx";
import { levelBadgeStyle } from "../lib/levelColors.tsx";
import { QuestionDetail } from "./QuizScreen.tsx";

type ReviewStep = "resume" | "empty" | "play" | "result";
type OpenCallbacks = {
  onOpenKanji: (kanjiId: string) => void;
  onOpenVocab: (vocabId: string) => void;
  onOpenBunpo: (bunpoId: string) => void;
};

export function ReviewScreen({ onDone, ...open }: { onDone: () => void } & OpenCallbacks) {
  const [step, setStep] = useState<ReviewStep>();
  const [session, setSession] = useState<ReviewSession | null>(null);

  useEffect(() => {
    (async () => {
      const existing = await loadReviewSession();
      if (existing && isReviewSessionUnfinished(existing)) {
        setSession(existing);
        setStep("resume");
        return;
      }
      const questions = await buildReviewQuestions();
      if (questions.length === 0) {
        setStep("empty");
        return;
      }
      const fresh: ReviewSession = { questions, answers: questions.map(() => null), currentIndex: 0 };
      await saveReviewSession(fresh);
      setSession(fresh);
      setStep("play");
    })();
  }, []);

  if (step === undefined) return <div className="p-6 text-neutral-400">Đang tải...</div>;

  if (step === "empty") {
    return (
      <div className="mx-auto max-w-4xl px-2.5 py-2 text-center md:px-8 md:py-6">
        <h1 className="text-2xl font-bold text-neutral-800">Ôn tập</h1>
        <p className="mt-3 text-neutral-500">
          Không có thẻ nào đến hạn ôn lại ngay bây giờ — cứ tiếp tục khám phá nội dung mới ở thanh bên nhé.
        </p>
        <Button className="mt-6" onClick={onDone}>
          Về trang chủ
        </Button>
      </div>
    );
  }

  if (step === "resume") {
    if (!session) return <div className="p-6 text-neutral-400">Đang tải...</div>;
    const answeredCount = session.answers.filter((a) => a !== null).length;
    return (
      <div className="mx-auto max-w-4xl px-2.5 py-2 text-center md:px-8 md:py-6">
        <h1 className="text-2xl font-bold text-neutral-800">Ôn tập</h1>
        <p className="mt-3 text-neutral-500">
          Bạn có 1 buổi ôn tập đang làm dở ({answeredCount}/{session.questions.length} câu đã trả lời).
        </p>
        <Button className="mt-6 w-full" onClick={() => setStep("play")}>
          Tiếp tục
        </Button>
        <Button
          variant="outline"
          className="mt-2 w-full"
          onClick={async () => {
            await clearReviewSession();
            const questions = await buildReviewQuestions();
            if (questions.length === 0) {
              setStep("empty");
              return;
            }
            const fresh: ReviewSession = { questions, answers: questions.map(() => null), currentIndex: 0 };
            await saveReviewSession(fresh);
            setSession(fresh);
            setStep("play");
          }}
        >
          Bắt đầu lại
        </Button>
      </div>
    );
  }

  if (step === "play") {
    if (!session) return <div className="p-6 text-neutral-400">Đang tải...</div>;
    return (
      <PlayView
        session={session}
        onSessionChange={setSession}
        onFinish={async () => {
          await clearReviewSession();
          setStep("result");
        }}
        {...open}
      />
    );
  }

  if (!session) return <div className="p-6 text-neutral-400">Đang tải...</div>;
  return <ResultView session={session} onDone={onDone} />;
}

function PlayView({
  session,
  onSessionChange,
  onFinish,
  ...open
}: {
  session: ReviewSession;
  onSessionChange: (s: ReviewSession) => void;
  onFinish: () => void;
} & OpenCallbacks) {
  const idx = session.currentIndex;
  const q = session.questions[idx];
  const answered = session.answers[idx];
  const [answerText, setAnswerText] = useState("");
  const isLast = idx === session.questions.length - 1;

  useEffect(() => {
    setAnswerText("");
  }, [idx]);

  async function submitTyped() {
    if (answered !== null || answerText.trim() === "") return;
    const correct = isCorrectAnswer(answerText, q.expectedAnswers);
    await grade(correct, answerText);
  }

  async function grade(correct: boolean, text: string) {
    await recordAnswer(q.id, correct, q.mode, requiredDirectionsFor(q));
    const newAnswers = [...session.answers];
    newAnswers[idx] = { text, correct };
    const newSession = { ...session, answers: newAnswers };
    await saveReviewSession(newSession);
    onSessionChange(newSession);
  }

  async function goNext() {
    if (isLast) {
      onFinish();
      return;
    }
    const newSession = { ...session, currentIndex: idx + 1 };
    await saveReviewSession(newSession);
    onSessionChange(newSession);
  }

  return (
    <div className="mx-auto max-w-4xl px-2.5 py-2 md:px-8 md:py-6">
      <h1 className="text-lg font-bold text-neutral-800">
        Câu {idx + 1} / {session.questions.length}
      </h1>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-neutral-100">
        <div
          className="h-full rounded-full bg-rose-400 transition-all"
          style={{ width: `${((idx + (answered ? 1 : 0)) / session.questions.length) * 100}%` }}
        />
      </div>

      <Card className="mt-4 gap-0 p-6">
        <span className="w-fit rounded-full px-2.5 py-1 text-xs font-semibold" style={levelBadgeStyle(q.level)}>
          {q.level}
        </span>
        <div className="mt-3 text-xs font-semibold tracking-wide text-neutral-400 uppercase">{q.promptLabel}</div>
        <div className={`mt-1 font-bold text-neutral-800 ${q.prompt.length > 6 ? "text-2xl" : "text-4xl"}`}>{q.prompt}</div>

        {q.answerFormat === "typed" ? (
          <div className="mt-5">
            <input
              type="text"
              autoFocus
              disabled={answered !== null}
              value={answered ? answered.text : answerText}
              onChange={(e) => setAnswerText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submitTyped();
              }}
              placeholder="Gõ đáp án..."
              className="w-full rounded-xl border border-neutral-200 px-4 py-2.5 text-base disabled:bg-neutral-50"
            />
            {answered === null ? (
              <Button className="mt-3 w-full" onClick={submitTyped} disabled={answerText.trim() === ""}>
                Kiểm tra
              </Button>
            ) : (
              <div
                className={`mt-3 rounded-xl p-4 text-sm font-medium ${
                  answered.correct ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"
                }`}
              >
                {answered.correct ? "Chính xác!" : "Chưa đúng."} Đáp án: <b>{q.displayAnswer}</b>
              </div>
            )}
          </div>
        ) : answered === null ? (
          <RevealPanel q={q} onGrade={grade} />
        ) : (
          <div className="mt-5 rounded-xl bg-neutral-50 p-4 text-center text-lg font-semibold text-neutral-800">{q.displayAnswer}</div>
        )}

        {answered !== null ? <QuestionDetail q={q} {...open} /> : null}
      </Card>

      {answered !== null ? (
        <div className="mt-4 flex items-center gap-2">
          <Button className="ml-auto" onClick={goNext}>
            {isLast ? "Xem kết quả" : "Câu tiếp theo"} <ChevronRight size={16} />
          </Button>
        </div>
      ) : null}
    </div>
  );
}

// Bunpo's "reveal" flow: show the answer, then let the user self-grade
// ("Nhớ đúng"/"Chưa nhớ") -- meaningVi is often a long free-text phrase
// (see reviewState.ts) that isn't fair to exact-match like Kanji/Vocab.
function RevealPanel({ q, onGrade }: { q: ReviewQuestion; onGrade: (correct: boolean, text: string) => void }) {
  const [revealed, setRevealed] = useState(false);
  if (!revealed) {
    return (
      <Button variant="outline" className="mt-5 w-full" onClick={() => setRevealed(true)}>
        Hiện đáp án
      </Button>
    );
  }
  return (
    <div className="mt-5 space-y-3">
      <div className="rounded-xl bg-neutral-50 p-4 text-center text-lg font-semibold text-neutral-800">{q.displayAnswer}</div>
      <div className="flex gap-2">
        <Button variant="outline" className="flex-1" onClick={() => onGrade(false, "")}>
          Chưa nhớ
        </Button>
        <Button className="flex-1" onClick={() => onGrade(true, "")}>
          Nhớ đúng
        </Button>
      </div>
    </div>
  );
}

function ResultView({ session, onDone }: { session: ReviewSession; onDone: () => void }) {
  const total = session.questions.length;
  const score = session.answers.filter((a) => a?.correct).length;
  const pct = total > 0 ? Math.round((score / total) * 100) : 0;

  return (
    <div className="mx-auto max-w-4xl px-2.5 py-2 text-center md:px-8 md:py-6">
      <h1 className="text-2xl font-bold text-neutral-800">Hoàn thành!</h1>
      <div className="mt-4 flex items-center justify-center gap-2 text-5xl font-bold text-rose-600">
        <Sparkles size={36} /> {score} / {total}
      </div>
      <div className="mt-2 text-neutral-500">{pct}% nhớ đúng</div>
      <Button className="mt-6" onClick={onDone}>
        Về trang chủ
      </Button>

      <div className="mt-8 text-left">
        <div className="text-xs font-semibold tracking-wide text-neutral-400 uppercase">Chi tiết</div>
        <div className="mt-3 flex flex-col gap-2">
          {session.questions.map((q, i) => {
            const a = session.answers[i];
            const correct = !!a?.correct;
            const cls = a === null ? "border-neutral-200" : correct ? "border-emerald-200 bg-emerald-50" : "border-rose-200 bg-rose-50";
            return (
              <div key={q.id} className={`flex items-center gap-3 rounded-xl border px-4 py-2.5 ${cls}`}>
                <span className="text-xs font-semibold text-neutral-400">{i + 1}</span>
                <span className="min-w-0 flex-1 truncate text-sm text-neutral-700">{q.prompt}</span>
                <span className={`shrink-0 text-xs font-semibold ${correct ? "text-emerald-600" : "text-rose-600"}`}>
                  {a === null ? "Chưa trả lời" : correct ? "Đúng" : "Sai"}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
