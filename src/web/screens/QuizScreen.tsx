import { useEffect, useState } from "react";
import { Check, ChevronLeft, ChevronRight, ArrowRight } from "lucide-react";
import {
  buildKanjiQuiz,
  buildVocabQuiz,
  buildBunpoQuiz,
  loadQuizSettings,
  saveQuizSettings,
  loadQuizSession,
  saveQuizSession,
  clearQuizSession,
  isSessionUnfinished,
  QUESTION_COUNT_OPTIONS,
  ALL_QUESTIONS_SENTINEL,
  type QuizQuestion,
  type QuizContentType,
  type QuizSettings,
  type QuizSession,
  type KanjiQuizMode,
  type VocabQuizMode,
  type BunpoQuizMode,
  requiredDirectionsFor,
} from "../../popup/quizState.ts";
import { recordAnswer, loadProgressMap, bucketFor, type ProgressMap } from "../../popup/progressState.ts";
import { loadViewerState as loadKanjiViewerState, findKanjiById } from "../../popup/kanjiState.ts";
import { loadViewerState as loadVocabViewerState, findVocabById, SOURCE_LABELS } from "../../popup/vocabState.ts";
import { loadViewerState as loadBunpoViewerState, findBunpoById, SOURCE_LABELS as BUNPO_SOURCE_LABELS } from "../../popup/bunpoState.ts";
import { formatHanViet } from "../../hanVietFormat.ts";
import { Card } from "../components/ui/card.tsx";
import { Button } from "../components/ui/button.tsx";
import { levelBadgeStyle } from "../lib/levelColors.tsx";
import { QuestionPalette, type PaletteStatus } from "../components/QuestionPalette.tsx";

type QuizStep = "resume" | "setup" | "play" | "result";
type OpenCallbacks = {
  onOpenKanji: (kanjiId: string) => void;
  onOpenVocab: (vocabId: string) => void;
  onOpenBunpo: (bunpoId: string) => void;
};

// Unlike the extension's QuizScreen (whose `step` lives in App's outer nav
// stack so "←" pops through the shared router), this web version owns
// `step` as local state -- the web shell's sidebar/hash routing has no
// concept of a sub-step, and Quiz's own screens already provide their own
// way back (setup -> resume via "Bắt đầu bài mới", result -> "Làm lại").
export function QuizScreen(open: OpenCallbacks) {
  const [step, setStep] = useState<QuizStep>();
  const [session, setSession] = useState<QuizSession | null>(null);
  const [settings, setSettings] = useState<QuizSettings | null>(null);
  const [error, setError] = useState<string | undefined>(undefined);

  useEffect(() => {
    (async () => {
      const existing = await loadQuizSession();
      if (existing && isSessionUnfinished(existing)) {
        setSession(existing);
        setStep("resume");
        return;
      }
      setSettings(await loadQuizSettings());
      setStep("setup");
    })();
  }, []);

  if (step === undefined) return <div className="p-6 text-neutral-400">Đang tải...</div>;

  if (step === "resume") {
    if (!session) return <div className="p-6 text-neutral-400">Đang tải...</div>;
    const answeredCount = session.answers.filter((a) => a !== null).length;
    return (
      <div className="mx-auto max-w-4xl px-2.5 py-2 text-center md:px-8 md:py-6">
        <h1 className="text-2xl font-bold text-neutral-800">Quiz</h1>
        <p className="mt-3 text-neutral-500">
          Bạn có 1 bài quiz đang làm dở ({answeredCount}/{session.questions.length} câu đã trả lời).
        </p>
        <Button className="mt-6 w-full" onClick={() => setStep("play")}>
          Tiếp tục
        </Button>
        <Button
          variant="outline"
          className="mt-2 w-full"
          onClick={async () => {
            await clearQuizSession();
            setSettings(await loadQuizSettings());
            setStep("setup");
          }}
        >
          Bắt đầu bài mới
        </Button>
      </div>
    );
  }

  if (step === "setup") {
    if (!settings) return <div className="p-6 text-neutral-400">Đang tải...</div>;
    return (
      <SetupView
        settings={settings}
        error={error}
        onSettingsChange={setSettings}
        onError={setError}
        onStart={(newSession) => {
          setSession(newSession);
          setError(undefined);
          setStep("play");
        }}
      />
    );
  }

  if (step === "play") {
    if (!session) return <div className="p-6 text-neutral-400">Đang tải...</div>;
    return <PlayView session={session} onSessionChange={setSession} onFinish={() => setStep("result")} {...open} />;
  }

  if (!session) return <div className="p-6 text-neutral-400">Đang tải...</div>;
  return (
    <ResultView
      session={session}
      onRetry={async () => {
        setSettings(await loadQuizSettings());
        setStep("setup");
      }}
      onReviewQuestion={(index) => {
        setSession({ ...session, currentIndex: index });
        setStep("play");
      }}
    />
  );
}

function SegmentedRadio<T extends string>({
  options,
  value,
  onChange,
}: {
  options: [T, string][];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map(([v, label]) => (
        <button
          key={v}
          onClick={() => onChange(v)}
          className={`rounded-full border px-3 py-1.5 text-sm font-medium ${
            value === v ? "border-rose-300 bg-rose-50 text-rose-600" : "border-neutral-200 text-neutral-600 hover:bg-neutral-50"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function SetupView({
  settings,
  error,
  onSettingsChange,
  onError,
  onStart,
}: {
  settings: QuizSettings;
  error?: string;
  onSettingsChange: (next: QuizSettings) => void;
  onError: (msg: string | undefined) => void;
  onStart: (session: QuizSession) => void;
}) {
  const [kanjiFilterText, setKanjiFilterText] = useState("—");
  const [vocabFilterText, setVocabFilterText] = useState("—");
  const [bunpoFilterText, setBunpoFilterText] = useState("—");
  const [questionCount, setQuestionCount] = useState(settings.questionCount);

  useEffect(() => {
    (async () => {
      const [kanjiState, vocabState, bunpoState] = await Promise.all([
        loadKanjiViewerState(),
        loadVocabViewerState(),
        loadBunpoViewerState(),
      ]);
      setKanjiFilterText(kanjiState.selectedLevels.join(", ") || "—");
      setVocabFilterText(vocabState.selectedSources.map((s) => SOURCE_LABELS[s]).join(", ") || "—");
      setBunpoFilterText(bunpoState.selectedSources.map((s) => BUNPO_SOURCE_LABELS[s]).join(", ") || "—");
    })();
  }, []);

  const filterTextByType: Record<QuizContentType, string> = { kanji: kanjiFilterText, vocab: vocabFilterText, bunpo: bunpoFilterText };
  const filterScreenLabel: Record<QuizContentType, string> = { kanji: "Kanji", vocab: "Từ vựng", bunpo: "Bunpo" };

  async function updateSettings(partial: Partial<QuizSettings>) {
    const next = { ...settings, ...partial };
    await saveQuizSettings(next);
    onSettingsChange(next);
  }

  async function handleStart() {
    const questions =
      settings.contentType === "kanji"
        ? await buildKanjiQuiz(settings.kanjiMode, questionCount)
        : settings.contentType === "vocab"
          ? await buildVocabQuiz(settings.vocabMode, questionCount)
          : await buildBunpoQuiz(settings.bunpoMode, questionCount);
    if (questions.length === 0) {
      onError("Không đủ dữ liệu để tạo câu hỏi với bộ lọc hiện tại — hãy chọn thêm level/nguồn ở màn tương ứng.");
      return;
    }
    const session: QuizSession = { questions, answers: questions.map(() => null), currentIndex: 0 };
    await saveQuizSession(session);
    onError(undefined);
    onStart(session);
  }

  return (
    <div className="mx-auto max-w-4xl px-2.5 py-2 md:px-8 md:py-6">
      <h1 className="text-2xl font-bold text-neutral-800">Quiz</h1>

      <Card className="mt-4 gap-5 p-6">
        <div>
          <div className="mb-2 text-sm font-semibold text-neutral-500">Nội dung</div>
          <SegmentedRadio
            options={[
              ["kanji", "Kanji"],
              ["vocab", "Từ vựng"],
              ["bunpo", "Ngữ pháp"],
            ]}
            value={settings.contentType}
            onChange={(v) => updateSettings({ contentType: v as QuizContentType })}
          />
        </div>

        {settings.contentType === "kanji" ? (
          <div>
            <div className="mb-2 text-sm font-semibold text-neutral-500">Dạng câu hỏi</div>
            <SegmentedRadio
              options={[
                ["meaning", "Xem chữ, đoán nghĩa"],
                ["character", "Xem nghĩa, đoán chữ"],
              ]}
              value={settings.kanjiMode}
              onChange={(v) => updateSettings({ kanjiMode: v as KanjiQuizMode })}
            />
          </div>
        ) : null}

        {settings.contentType === "vocab" ? (
          <div>
            <div className="mb-2 text-sm font-semibold text-neutral-500">Dạng câu hỏi</div>
            <SegmentedRadio
              options={
                [
                  ["meaning", "Xem từ, đoán nghĩa"],
                  ["reading", "Xem từ, đoán cách đọc"],
                  ["wordFromMeaning", "Xem nghĩa, đoán từ"],
                  ["wordFromReading", "Xem cách đọc, đoán từ"],
                ] as [VocabQuizMode, string][]
              }
              value={settings.vocabMode}
              onChange={(v) => updateSettings({ vocabMode: v as VocabQuizMode })}
            />
          </div>
        ) : null}

        {settings.contentType === "bunpo" ? (
          <div>
            <div className="mb-2 text-sm font-semibold text-neutral-500">Dạng câu hỏi</div>
            <SegmentedRadio
              options={[
                ["meaning", "Xem mẫu ngữ pháp, đoán nghĩa"],
                ["pattern", "Xem nghĩa, đoán mẫu ngữ pháp"],
              ]}
              value={settings.bunpoMode}
              onChange={(v) => updateSettings({ bunpoMode: v as BunpoQuizMode })}
            />
          </div>
        ) : null}

        <div>
          <div className="mb-2 text-sm font-semibold text-neutral-500">Số câu hỏi</div>
          <select
            value={questionCount}
            onChange={(e) => {
              const value = Number(e.target.value);
              setQuestionCount(value);
              saveQuizSettings({ ...settings, questionCount: value });
            }}
            className="rounded-lg border border-neutral-200 px-3 py-1.5 text-sm"
          >
            {[...QUESTION_COUNT_OPTIONS, ALL_QUESTIONS_SENTINEL].map((n) => (
              <option key={n} value={n}>
                {n === ALL_QUESTIONS_SENTINEL ? "Tất cả" : `${n} câu`}
              </option>
            ))}
          </select>
        </div>

        <div>
          <div className="mb-2 text-sm font-semibold text-neutral-500">Phạm vi</div>
          <div className="rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-neutral-600">
            Theo bộ lọc hiện tại ở màn {filterScreenLabel[settings.contentType]} —{" "}
            <span className="font-semibold text-neutral-800">{filterTextByType[settings.contentType]}</span>
          </div>
        </div>

        {error ? <p className="rounded-lg bg-rose-50 p-3 text-sm text-rose-600">{error}</p> : null}

        <Button onClick={handleStart}>Bắt đầu</Button>
      </Card>
    </div>
  );
}

function QuestionDetail({ q, ...open }: { q: QuizQuestion } & OpenCallbacks) {
  if (q.kind === "kanji") {
    const k = findKanjiById(q.id);
    if (!k) return null;
    return (
      <div className="mt-4 space-y-1.5 rounded-xl bg-neutral-50 p-4 text-sm">
        {k.hanViet.length > 0 ? (
          <div>
            <b className="text-neutral-700">Hán Việt:</b> {formatHanViet(k.hanViet)}
          </div>
        ) : null}
        {k.readings.on.length > 0 || k.readings.kun.length > 0 ? (
          <div>
            <b className="text-neutral-700">Âm đọc:</b> {[...k.readings.on, ...k.readings.kun].join("、")}
          </div>
        ) : null}
        {k.mnemonic ? (
          <div>
            <b className="text-neutral-700">Mẹo nhớ:</b> {k.mnemonic}
          </div>
        ) : null}
        <button onClick={() => open.onOpenKanji(k.id)} className="flex items-center gap-1 pt-1 font-semibold text-rose-600">
          Xem thẻ đầy đủ <ArrowRight size={14} />
        </button>
      </div>
    );
  }
  if (q.kind === "bunpo") {
    const g = findBunpoById(q.id);
    if (!g) return null;
    return (
      <div className="mt-4 space-y-1.5 rounded-xl bg-neutral-50 p-4 text-sm">
        {g.usage ? (
          <div>
            <b className="text-neutral-700">Cách dùng:</b> {g.usage}
          </div>
        ) : null}
        {g.examTip ? (
          <div>
            <b className="text-neutral-700">Key JLPT:</b> {g.examTip}
          </div>
        ) : null}
        <div>
          {g.example}
          {g.exampleVi ? (
            <>
              <br />
              <span className="text-neutral-400">{g.exampleVi}</span>
            </>
          ) : null}
        </div>
        <button onClick={() => open.onOpenBunpo(g.id)} className="flex items-center gap-1 pt-1 font-semibold text-rose-600">
          Xem thẻ đầy đủ <ArrowRight size={14} />
        </button>
      </div>
    );
  }
  const v = findVocabById(q.id);
  if (!v) return null;
  return (
    <div className="mt-4 space-y-1.5 rounded-xl bg-neutral-50 p-4 text-sm">
      {v.hanViet.length > 0 ? (
        <div>
          <b className="text-neutral-700">Hán Việt:</b> {formatHanViet(v.hanViet)}
        </div>
      ) : null}
      {v.meaningVi ? (
        <div>
          <b className="text-neutral-700">Nghĩa:</b> {v.meaningVi}
        </div>
      ) : null}
      {v.reading ? (
        <div>
          <b className="text-neutral-700">Cách đọc:</b> {v.reading}
        </div>
      ) : null}
      {v.mnemonic.length > 0 ? (
        <div>
          <b className="text-neutral-700">Mẹo nhớ:</b> {v.mnemonic.join(" / ")}
        </div>
      ) : null}
      {v.example ? (
        <div>
          {v.example}
          {v.exampleVi ? (
            <>
              <br />
              <span className="text-neutral-400">{v.exampleVi}</span>
            </>
          ) : null}
        </div>
      ) : null}
      <button onClick={() => open.onOpenVocab(v.id)} className="flex items-center gap-1 pt-1 font-semibold text-rose-600">
        Xem thẻ đầy đủ <ArrowRight size={14} />
      </button>
    </div>
  );
}

function PlayView({
  session,
  onSessionChange,
  onFinish,
  ...open
}: {
  session: QuizSession;
  onSessionChange: (session: QuizSession) => void;
  onFinish: () => void;
} & OpenCallbacks) {
  const [progressMap, setProgressMap] = useState<ProgressMap | null>(null);

  useEffect(() => {
    loadProgressMap().then(setProgressMap);
  }, [session]);

  const idx = session.currentIndex;
  const q = session.questions[idx];
  const answered = session.answers[idx];
  const allAnswered = session.answers.every((a) => a !== null);
  const isLast = idx === session.questions.length - 1;

  async function finish() {
    await clearQuizSession();
    onFinish();
  }

  async function goTo(newIndex: number) {
    const newSession = { ...session, currentIndex: newIndex };
    await saveQuizSession(newSession);
    onSessionChange(newSession);
  }

  return (
    <div className="mx-auto max-w-4xl px-2.5 py-2 md:px-8 md:py-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-neutral-800">
          Câu {idx + 1} / {session.questions.length}
        </h1>
        <button
          title="Nộp bài, xem kết quả"
          onClick={() => {
            if (!allAnswered && !confirm(`Còn ${session.answers.filter((a) => a === null).length} câu chưa trả lời. Vẫn nộp bài?`)) return;
            finish();
          }}
          className="flex items-center gap-1 rounded-full bg-emerald-50 px-3 py-1.5 text-sm font-semibold text-emerald-600"
        >
          <Check size={15} /> Nộp bài
        </button>
      </div>

      <QuestionPalette
        summary={`Câu ${idx + 1}/${session.questions.length} · đã trả lời ${session.answers.filter((a) => a !== null).length}`}
        onJump={goTo}
        items={session.questions.map((question, i) => {
          const isMastered = progressMap ? bucketFor(progressMap[question.id]) === "mastered" : false;
          const answerIndex = session.answers[i];
          const status: PaletteStatus =
            i === idx ? "current" : answerIndex === null ? "unanswered" : question.choices[answerIndex].correct ? "correct" : "wrong";
          return {
            id: question.id,
            status,
            highlighted: isMastered && answerIndex === null,
            title: isMastered ? "Đã thuộc từ trước" : undefined,
          };
        })}
      />

      <div className="mt-4 flex items-center gap-2">
        <Button variant="outline" disabled={idx === 0} onClick={() => goTo(idx - 1)}>
          <ChevronLeft size={16} /> Câu trước
        </Button>
        <Button
          className="ml-auto"
          onClick={() => {
            if (isLast) {
              finish();
              return;
            }
            goTo(idx + 1);
          }}
        >
          {isLast ? "Xem kết quả" : "Câu sau"} <ChevronRight size={16} />
        </Button>
      </div>

      <Card className="mt-4 gap-0 p-6">
        <span className="w-fit rounded-full px-2.5 py-1 text-xs font-semibold" style={levelBadgeStyle(q.level)}>
          {q.level}
        </span>
        <div className="mt-3 text-xs font-semibold uppercase tracking-wide text-neutral-400">{q.promptLabel}</div>
        <div className={`mt-1 font-bold text-neutral-800 ${q.prompt.length > 6 ? "text-2xl" : "text-4xl"}`}>{q.prompt}</div>

        {/* 4-column grid only suits short choices (a bare kanji character, "character" mode) --
            "meaning" mode choices are full phrases and need the wider 1/2-col layout to avoid
            cramped mid-word wrapping. */}
        <div
          className={`mt-5 grid gap-2 ${
            q.kind === "kanji" && q.choices.every((c) => c.text.length <= 2) ? "grid-cols-4" : "grid-cols-1 sm:grid-cols-2"
          }`}
        >
          {q.choices.map((c, i) => {
            let cls = "border-neutral-200 hover:bg-neutral-50";
            if (answered !== null) {
              if (c.correct) cls = "border-emerald-300 bg-emerald-50 text-emerald-700";
              else if (i === answered) cls = "border-rose-300 bg-rose-50 text-rose-700";
              else cls = "border-neutral-200 opacity-50";
            }
            return (
              <button
                key={i}
                disabled={answered !== null}
                onClick={async () => {
                  await recordAnswer(q.id, c.correct, q.mode, requiredDirectionsFor(q));
                  const newAnswers = [...session.answers];
                  newAnswers[idx] = i;
                  const newSession = { ...session, answers: newAnswers };
                  await saveQuizSession(newSession);
                  onSessionChange(newSession);
                }}
                className={`rounded-xl border px-4 py-3 text-left text-sm font-medium ${cls} ${q.kind === "kanji" && c.text.length === 1 ? "text-center text-2xl" : ""}`}
              >
                {c.text}
              </button>
            );
          })}
        </div>

        {answered !== null ? <QuestionDetail q={q} {...open} /> : null}
      </Card>
    </div>
  );
}

function ResultView({
  session,
  onRetry,
  onReviewQuestion,
}: {
  session: QuizSession;
  onRetry: () => void;
  onReviewQuestion: (index: number) => void;
}) {
  const total = session.questions.length;
  const score = session.answers.filter((a, i) => a !== null && session.questions[i].choices[a].correct).length;
  const unanswered = session.answers.filter((a) => a === null).length;
  const pct = total > 0 ? Math.round((score / total) * 100) : 0;

  return (
    <div className="mx-auto max-w-4xl px-2.5 py-2 text-center md:px-8 md:py-6">
      <h1 className="text-2xl font-bold text-neutral-800">Kết quả</h1>
      <div className="mt-4 text-5xl font-bold text-rose-600">
        {score} / {total}
      </div>
      <div className="mt-2 text-neutral-500">
        {pct}% đúng{unanswered > 0 ? ` · ${unanswered} câu chưa trả lời` : ""}
      </div>
      <Button className="mt-6" onClick={onRetry}>
        Làm lại
      </Button>

      <div className="mt-8 text-left">
        <div className="text-xs font-semibold uppercase tracking-wide text-neutral-400">Bấm vào 1 câu để xem lại chi tiết</div>
        <div className="mt-3 flex flex-col gap-2">
          {session.questions.map((q, i) => {
            const a = session.answers[i];
            const correct = a !== null && q.choices[a].correct;
            const cls = a === null ? "border-neutral-200" : correct ? "border-emerald-200 bg-emerald-50" : "border-rose-200 bg-rose-50";
            const status = a === null ? "Chưa trả lời" : correct ? "Đúng" : "Sai";
            const statusColor = a === null ? "text-neutral-400" : correct ? "text-emerald-600" : "text-rose-600";
            return (
              <button key={q.id} onClick={() => onReviewQuestion(i)} className={`flex items-center gap-3 rounded-xl border px-4 py-2.5 text-left ${cls}`}>
                <span className="text-xs font-semibold text-neutral-400">{i + 1}</span>
                <span className="min-w-0 flex-1 truncate text-sm text-neutral-700">{q.prompt}</span>
                <span className={`shrink-0 text-xs font-semibold ${statusColor}`}>{status}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
