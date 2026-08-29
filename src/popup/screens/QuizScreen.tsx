import { useEffect, useState } from "react";
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
} from "../quizState.ts";
import { recordAnswer, loadProgressMap, bucketFor, type ProgressMap } from "../progressState.ts";
import { loadViewerState as loadKanjiViewerState, findKanjiById } from "../kanjiState.ts";
import { loadViewerState as loadVocabViewerState, findVocabById, SOURCE_LABELS } from "../vocabState.ts";
import { loadViewerState as loadBunpoViewerState, findBunpoById, SOURCE_LABELS as BUNPO_SOURCE_LABELS } from "../bunpoState.ts";
import { formatHanViet } from "../../hanVietFormat.ts";

type QuizMode =
  | { kind: "loading" }
  | { kind: "resume"; session: QuizSession }
  | { kind: "setup"; settings: QuizSettings; error?: string }
  | { kind: "play"; session: QuizSession }
  | { kind: "result"; session: QuizSession };

type OpenCallbacks = {
  onOpenKanji: (kanjiId: string) => void;
  onOpenVocab: (vocabId: string) => void;
  onOpenBunpo: (bunpoId: string) => void;
};

export function QuizScreen({
  onBack,
  onOpenKanji,
  onOpenVocab,
  onOpenBunpo,
}: { onBack: () => void } & OpenCallbacks) {
  const [mode, setMode] = useState<QuizMode>({ kind: "loading" });

  useEffect(() => {
    (async () => {
      const existing = await loadQuizSession();
      if (existing && isSessionUnfinished(existing)) {
        setMode({ kind: "resume", session: existing });
        return;
      }
      const settings = await loadQuizSettings();
      setMode({ kind: "setup", settings });
    })();
  }, []);

  const openCallbacks: OpenCallbacks = { onOpenKanji, onOpenVocab, onOpenBunpo };

  if (mode.kind === "loading") {
    return (
      <header className="toolbar">
        <button className="icon-btn" title="Về menu" onClick={onBack}>
          ←
        </button>
        <span className="counter">Quiz</span>
      </header>
    );
  }

  if (mode.kind === "resume") {
    const answeredCount = mode.session.answers.filter((a) => a !== null).length;
    return (
      <>
        <header className="toolbar">
          <button className="icon-btn" title="Về menu" onClick={onBack}>
            ←
          </button>
          <span className="counter">Quiz</span>
        </header>
        <section className="quiz-setup">
          <p className="quiz-filter-note">
            Bạn có 1 bài quiz đang làm dở ({answeredCount}/{mode.session.questions.length} câu đã trả lời).
          </p>
          <button className="primary-action-btn" onClick={() => setMode({ kind: "play", session: mode.session })}>
            Tiếp tục
          </button>
          <button
            className="secondary-action-btn"
            onClick={async () => {
              await clearQuizSession();
              const settings = await loadQuizSettings();
              setMode({ kind: "setup", settings });
            }}
          >
            Bắt đầu bài mới
          </button>
        </section>
      </>
    );
  }

  if (mode.kind === "setup") {
    return <SetupView settings={mode.settings} error={mode.error} onBack={onBack} setMode={setMode} {...openCallbacks} />;
  }

  if (mode.kind === "play") {
    return <PlayView session={mode.session} onBack={onBack} setMode={setMode} {...openCallbacks} />;
  }

  return <ResultView session={mode.session} onBack={onBack} setMode={setMode} />;
}

function SetupView({
  settings,
  error,
  onBack,
  setMode,
}: {
  settings: QuizSettings;
  error?: string;
  onBack: () => void;
  setMode: (m: QuizMode) => void;
} & OpenCallbacks) {
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

  const filterTextByType: Record<QuizContentType, string> = {
    kanji: kanjiFilterText,
    vocab: vocabFilterText,
    bunpo: bunpoFilterText,
  };
  const filterScreenLabel: Record<QuizContentType, string> = { kanji: "Kanji", vocab: "Từ vựng", bunpo: "Bunpo" };

  async function updateSettings(partial: Partial<QuizSettings>) {
    const next = { ...settings, ...partial };
    await saveQuizSettings(next);
    setMode({ kind: "setup", settings: next });
  }

  async function handleStart() {
    const questions =
      settings.contentType === "kanji"
        ? await buildKanjiQuiz(settings.kanjiMode, questionCount)
        : settings.contentType === "vocab"
          ? await buildVocabQuiz(settings.vocabMode, questionCount)
          : await buildBunpoQuiz(settings.bunpoMode, questionCount);
    if (questions.length === 0) {
      setMode({
        kind: "setup",
        settings,
        error: "Không đủ dữ liệu để tạo câu hỏi với bộ lọc hiện tại — hãy chọn thêm level/nguồn ở màn tương ứng.",
      });
      return;
    }
    const session: QuizSession = {
      questions,
      answers: questions.map(() => null),
      currentIndex: 0,
    };
    await saveQuizSession(session);
    setMode({ kind: "play", session });
  }

  return (
    <>
      <header className="toolbar">
        <button className="icon-btn" title="Về menu" onClick={onBack}>
          ←
        </button>
        <span className="counter">Quiz</span>
      </header>

      <section className="quiz-setup">
        <div className="quiz-setup-group">
          <div className="quiz-setup-label">Nội dung</div>
          <div className="quiz-radio-row">
            <label className="quiz-radio">
              <input
                type="radio"
                name="content-type"
                checked={settings.contentType === "kanji"}
                onChange={() => updateSettings({ contentType: "kanji" })}
              />
              Kanji
            </label>
            <label className="quiz-radio">
              <input
                type="radio"
                name="content-type"
                checked={settings.contentType === "vocab"}
                onChange={() => updateSettings({ contentType: "vocab" })}
              />
              Từ vựng
            </label>
            <label className="quiz-radio">
              <input
                type="radio"
                name="content-type"
                checked={settings.contentType === "bunpo"}
                onChange={() => updateSettings({ contentType: "bunpo" })}
              />
              Ngữ pháp
            </label>
          </div>
        </div>

        {settings.contentType === "kanji" ? (
          <div className="quiz-setup-group">
            <div className="quiz-setup-label">Dạng câu hỏi</div>
            <div className="quiz-radio-row">
              <label className="quiz-radio">
                <input
                  type="radio"
                  name="kanji-mode"
                  checked={settings.kanjiMode === "meaning"}
                  onChange={() => updateSettings({ kanjiMode: "meaning" as KanjiQuizMode })}
                />
                Xem chữ, đoán nghĩa
              </label>
              <label className="quiz-radio">
                <input
                  type="radio"
                  name="kanji-mode"
                  checked={settings.kanjiMode === "character"}
                  onChange={() => updateSettings({ kanjiMode: "character" as KanjiQuizMode })}
                />
                Xem nghĩa, đoán chữ
              </label>
            </div>
          </div>
        ) : null}

        {settings.contentType === "vocab" ? (
          <div className="quiz-setup-group">
            <div className="quiz-setup-label">Dạng câu hỏi</div>
            <div className="quiz-radio-row">
              {(
                [
                  ["meaning", "Xem từ, đoán nghĩa"],
                  ["reading", "Xem từ, đoán cách đọc"],
                  ["wordFromMeaning", "Xem nghĩa, đoán từ"],
                  ["wordFromReading", "Xem cách đọc, đoán từ"],
                ] as [VocabQuizMode, string][]
              ).map(([value, label]) => (
                <label key={value} className="quiz-radio">
                  <input
                    type="radio"
                    name="vocab-mode"
                    checked={settings.vocabMode === value}
                    onChange={() => updateSettings({ vocabMode: value })}
                  />
                  {label}
                </label>
              ))}
            </div>
          </div>
        ) : null}

        {settings.contentType === "bunpo" ? (
          <div className="quiz-setup-group">
            <div className="quiz-setup-label">Dạng câu hỏi</div>
            <div className="quiz-radio-row">
              <label className="quiz-radio">
                <input
                  type="radio"
                  name="bunpo-mode"
                  checked={settings.bunpoMode === "meaning"}
                  onChange={() => updateSettings({ bunpoMode: "meaning" as BunpoQuizMode })}
                />
                Xem mẫu ngữ pháp, đoán nghĩa
              </label>
              <label className="quiz-radio">
                <input
                  type="radio"
                  name="bunpo-mode"
                  checked={settings.bunpoMode === "pattern"}
                  onChange={() => updateSettings({ bunpoMode: "pattern" as BunpoQuizMode })}
                />
                Xem nghĩa, đoán mẫu ngữ pháp
              </label>
            </div>
          </div>
        ) : null}

        <div className="quiz-setup-group">
          <div className="quiz-setup-label">Số câu hỏi</div>
          <div className="quiz-count-row">
            <select
              value={questionCount}
              onChange={(e) => {
                const value = Number(e.target.value);
                setQuestionCount(value);
                saveQuizSettings({ ...settings, questionCount: value });
              }}
            >
              {[...QUESTION_COUNT_OPTIONS, ALL_QUESTIONS_SENTINEL].map((n) => (
                <option key={n} value={n}>
                  {n === ALL_QUESTIONS_SENTINEL ? "Tất cả" : `${n} câu`}
                </option>
              ))}
            </select>
          </div>
        </div>

        <p className="quiz-filter-note">
          Dùng bộ lọc đang chọn ở màn {filterScreenLabel[settings.contentType]}:{" "}
          <b>{filterTextByType[settings.contentType]}</b>
        </p>

        {error ? <p className="quiz-error">{error}</p> : null}

        <button className="primary-action-btn" onClick={handleStart}>
          Bắt đầu
        </button>
      </section>
    </>
  );
}

function cellStateClass(session: QuizSession, index: number): string {
  const answerIndex = session.answers[index];
  if (answerIndex === null) return "";
  return session.questions[index].choices[answerIndex].correct ? "quiz-grid-cell-correct" : "quiz-grid-cell-wrong";
}

function QuestionDetail({ q, ...open }: { q: QuizQuestion } & OpenCallbacks) {
  if (q.kind === "kanji") {
    const k = findKanjiById(q.id);
    if (!k) return null;
    return (
      <div className="quiz-detail">
        {k.hanViet.length > 0 ? (
          <div className="quiz-detail-row">
            <b>Hán Việt:</b> {formatHanViet(k.hanViet)}
          </div>
        ) : null}
        {k.readings.on.length > 0 || k.readings.kun.length > 0 ? (
          <div className="quiz-detail-row">
            <b>Âm đọc:</b> {[...k.readings.on, ...k.readings.kun].join("、")}
          </div>
        ) : null}
        {k.mnemonic ? (
          <div className="quiz-detail-row">
            <b>Mẹo nhớ:</b> {k.mnemonic}
          </div>
        ) : null}
        <button className="quiz-detail-link" onClick={() => open.onOpenKanji(k.id)}>
          Xem thẻ đầy đủ →
        </button>
      </div>
    );
  }
  if (q.kind === "bunpo") {
    const g = findBunpoById(q.id);
    if (!g) return null;
    return (
      <div className="quiz-detail">
        {g.usage ? (
          <div className="quiz-detail-row">
            <b>Cách dùng:</b> {g.usage}
          </div>
        ) : null}
        {g.examTip ? (
          <div className="quiz-detail-row">
            <b>Key JLPT:</b> {g.examTip}
          </div>
        ) : null}
        <div className="quiz-detail-row">
          {g.example}
          {g.exampleVi ? (
            <>
              <br />
              <span className="muted">{g.exampleVi}</span>
            </>
          ) : null}
        </div>
        <button className="quiz-detail-link" onClick={() => open.onOpenBunpo(g.id)}>
          Xem thẻ đầy đủ →
        </button>
      </div>
    );
  }
  const v = findVocabById(q.id);
  if (!v) return null;
  return (
    <div className="quiz-detail">
      {v.hanViet.length > 0 ? (
        <div className="quiz-detail-row">
          <b>Hán Việt:</b> {formatHanViet(v.hanViet)}
        </div>
      ) : null}
      {v.meaningVi ? (
        <div className="quiz-detail-row">
          <b>Nghĩa:</b> {v.meaningVi}
        </div>
      ) : null}
      {v.reading ? (
        <div className="quiz-detail-row">
          <b>Cách đọc:</b> {v.reading}
        </div>
      ) : null}
      {v.mnemonic.length > 0 ? (
        <div className="quiz-detail-row">
          <b>Mẹo nhớ:</b> {v.mnemonic.join(" / ")}
        </div>
      ) : null}
      {v.example ? (
        <div className="quiz-detail-row">
          {v.example}
          {v.exampleVi ? (
            <>
              <br />
              <span className="muted">{v.exampleVi}</span>
            </>
          ) : null}
        </div>
      ) : null}
      <button className="quiz-detail-link" onClick={() => open.onOpenVocab(v.id)}>
        Xem thẻ đầy đủ →
      </button>
    </div>
  );
}

function PlayView({
  session,
  onBack,
  setMode,
  ...open
}: {
  session: QuizSession;
  onBack: () => void;
  setMode: (m: QuizMode) => void;
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
    setMode({ kind: "result", session });
  }

  async function goTo(newIndex: number) {
    const newSession = { ...session, currentIndex: newIndex };
    await saveQuizSession(newSession);
    setMode({ kind: "play", session: newSession });
  }

  return (
    <>
      <header className="toolbar">
        <button className="icon-btn" title="Về menu" onClick={onBack}>
          ←
        </button>
        <span className="counter">
          Câu {idx + 1} / {session.questions.length}
        </span>
        <button
          className="icon-btn"
          title="Nộp bài, xem kết quả"
          onClick={() => {
            if (!allAnswered && !confirm(`Còn ${session.answers.filter((a) => a === null).length} câu chưa trả lời. Vẫn nộp bài?`)) {
              return;
            }
            finish();
          }}
        >
          ✓
        </button>
      </header>

      <div className="quiz-grid">
        {session.questions.map((question, i) => {
          const classes = ["quiz-grid-cell"];
          if (i === idx) classes.push("quiz-grid-cell-current");
          const stateClass = cellStateClass(session, i);
          const isMastered = progressMap ? bucketFor(progressMap[question.id]) === "mastered" : false;
          if (stateClass) classes.push(stateClass);
          else if (isMastered) classes.push("quiz-grid-cell-mastered");
          return (
            <button
              key={question.id}
              className={classes.join(" ")}
              title={!stateClass && isMastered ? "Đã thuộc từ trước" : ""}
              onClick={() => goTo(i)}
            >
              {i + 1}
            </button>
          );
        })}
      </div>

      <main className="quiz-question">
        <div className="level-badge" data-level={q.level}>
          {q.level}
        </div>
        <div className="quiz-prompt-label">{q.promptLabel}</div>
        <div className={`quiz-prompt ${q.prompt.length > 6 ? "quiz-prompt-long" : ""}`}>{q.prompt}</div>
        <div className="quiz-choices">
          {q.choices.map((c, i) => {
            const classes = ["quiz-choice"];
            if (q.kind === "kanji" && c.text.length === 1) classes.push("quiz-choice-char");
            if (answered !== null) {
              if (c.correct) classes.push("quiz-choice-correct");
              else if (i === answered) classes.push("quiz-choice-wrong");
            }
            return (
              <button
                key={i}
                className={classes.join(" ")}
                disabled={answered !== null}
                onClick={async () => {
                  await recordAnswer(q.id, c.correct, q.mode, requiredDirectionsFor(q));
                  const newAnswers = [...session.answers];
                  newAnswers[idx] = i;
                  const newSession = { ...session, answers: newAnswers };
                  await saveQuizSession(newSession);
                  setMode({ kind: "play", session: newSession });
                }}
              >
                {c.text}
              </button>
            );
          })}
        </div>
        {answered !== null ? <QuestionDetail q={q} {...open} /> : null}
      </main>

      <footer className="nav">
        <button disabled={idx === 0} onClick={() => goTo(idx - 1)}>
          ← Câu trước
        </button>
        <button
          onClick={() => {
            if (isLast) {
              finish();
              return;
            }
            goTo(idx + 1);
          }}
        >
          {isLast ? "Xem kết quả" : "Câu sau →"}
        </button>
      </footer>
    </>
  );
}

function ResultView({
  session,
  onBack,
  setMode,
}: {
  session: QuizSession;
  onBack: () => void;
  setMode: (m: QuizMode) => void;
}) {
  const total = session.questions.length;
  const score = session.answers.filter((a, i) => a !== null && session.questions[i].choices[a].correct).length;
  const unanswered = session.answers.filter((a) => a === null).length;
  const pct = total > 0 ? Math.round((score / total) * 100) : 0;

  return (
    <>
      <header className="toolbar">
        <button className="icon-btn" title="Về menu" onClick={onBack}>
          ←
        </button>
        <span className="counter">Kết quả</span>
      </header>
      <main className="quiz-result">
        <div className="quiz-result-score">
          {score} / {total}
        </div>
        <div className="quiz-result-pct">
          {pct}% đúng{unanswered > 0 ? ` · ${unanswered} câu chưa trả lời` : ""}
        </div>
        <button
          className="primary-action-btn"
          onClick={async () => {
            const settings = await loadQuizSettings();
            setMode({ kind: "setup", settings });
          }}
        >
          Làm lại
        </button>
        <div className="quiz-result-review-label">Bấm vào 1 câu để xem lại chi tiết</div>
        <div className="quiz-review-list">
          {session.questions.map((q, i) => {
            const a = session.answers[i];
            const correct = a !== null && q.choices[a].correct;
            const stateClass = a === null ? "" : correct ? "quiz-review-item-correct" : "quiz-review-item-wrong";
            const status = a === null ? "Chưa trả lời" : correct ? "Đúng" : "Sai";
            return (
              <button
                key={q.id}
                className={`quiz-review-item ${stateClass}`}
                onClick={() => setMode({ kind: "play", session: { ...session, currentIndex: i } })}
              >
                <span className="quiz-review-num">{i + 1}</span>
                <span className="quiz-review-prompt">{q.prompt}</span>
                <span className="quiz-review-status">{status}</span>
              </button>
            );
          })}
        </div>
      </main>
    </>
  );
}
