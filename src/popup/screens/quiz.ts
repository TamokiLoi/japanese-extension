import {
  buildKanjiQuiz,
  buildVocabQuiz,
  loadQuizSettings,
  saveQuizSettings,
  loadQuizSession,
  saveQuizSession,
  clearQuizSession,
  isSessionUnfinished,
  QUESTION_COUNT_OPTIONS,
  type QuizQuestion,
  type QuizContentType,
  type QuizSettings,
  type QuizSession,
  type VocabQuizMode,
} from "../quizState.ts";
import { recordAnswer } from "../progressState.ts";
import { loadViewerState as loadKanjiViewerState, findKanjiById } from "../kanjiState.ts";
import { loadViewerState as loadVocabViewerState, findVocabById, SOURCE_LABELS } from "../vocabState.ts";

export async function renderQuizScreen(
  app: HTMLElement,
  onBack: () => void,
  onOpenKanji: (kanjiId: string) => void,
  onOpenVocab: (vocabId: string) => void,
) {
  const existing = await loadQuizSession();
  if (existing && isSessionUnfinished(existing)) {
    paintResumePrompt(app, onBack, onOpenKanji, onOpenVocab, existing);
    return;
  }
  const settings = await loadQuizSettings();
  await paintSetup(app, settings, onBack, onOpenKanji, onOpenVocab);
}

function paintResumePrompt(
  app: HTMLElement,
  onBack: () => void,
  onOpenKanji: (kanjiId: string) => void,
  onOpenVocab: (vocabId: string) => void,
  session: QuizSession,
) {
  const answeredCount = session.answers.filter((a) => a !== null).length;
  app.innerHTML = `
    <header class="toolbar">
      <button id="back" class="icon-btn" title="Về menu">←</button>
      <span class="counter">Quiz</span>
    </header>
    <section class="quiz-setup">
      <p class="quiz-filter-note">Bạn có 1 bài quiz đang làm dở (${answeredCount}/${session.questions.length} câu đã trả lời).</p>
      <button id="resume" class="primary-action-btn">Tiếp tục</button>
      <button id="restart" class="secondary-action-btn">Bắt đầu bài mới</button>
    </section>
  `;
  document.getElementById("back")!.addEventListener("click", onBack);
  document.getElementById("resume")!.addEventListener("click", () => {
    paintPlay(app, session, onBack, onOpenKanji, onOpenVocab);
  });
  document.getElementById("restart")!.addEventListener("click", async () => {
    await clearQuizSession();
    const settings = await loadQuizSettings();
    await paintSetup(app, settings, onBack, onOpenKanji, onOpenVocab);
  });
}

async function paintSetup(
  app: HTMLElement,
  settings: QuizSettings,
  onBack: () => void,
  onOpenKanji: (kanjiId: string) => void,
  onOpenVocab: (vocabId: string) => void,
  error?: string,
) {
  const kanjiState = await loadKanjiViewerState();
  const vocabState = await loadVocabViewerState();
  const kanjiFilterText = kanjiState.selectedLevels.join(", ") || "—";
  const vocabFilterText = vocabState.selectedSources.map((s) => SOURCE_LABELS[s]).join(", ") || "—";

  app.innerHTML = `
    <header class="toolbar">
      <button id="back" class="icon-btn" title="Về menu">←</button>
      <span class="counter">Quiz</span>
    </header>

    <section class="quiz-setup">
      <div class="quiz-setup-group">
        <div class="quiz-setup-label">Nội dung</div>
        <div class="quiz-radio-row">
          <label class="quiz-radio">
            <input type="radio" name="content-type" value="kanji" ${settings.contentType === "kanji" ? "checked" : ""} />
            Kanji
          </label>
          <label class="quiz-radio">
            <input type="radio" name="content-type" value="vocab" ${settings.contentType === "vocab" ? "checked" : ""} />
            Từ vựng
          </label>
        </div>
      </div>

      <div class="quiz-setup-group" id="vocab-mode-group" style="${settings.contentType === "vocab" ? "" : "display:none"}">
        <div class="quiz-setup-label">Dạng câu hỏi</div>
        <div class="quiz-radio-row">
          <label class="quiz-radio">
            <input type="radio" name="vocab-mode" value="meaning" ${settings.vocabMode === "meaning" ? "checked" : ""} />
            Đoán nghĩa
          </label>
          <label class="quiz-radio">
            <input type="radio" name="vocab-mode" value="reading" ${settings.vocabMode === "reading" ? "checked" : ""} />
            Đoán cách đọc
          </label>
        </div>
      </div>

      <div class="quiz-setup-group">
        <div class="quiz-setup-label">Số câu hỏi</div>
        <select id="question-count">
          ${QUESTION_COUNT_OPTIONS.map(
            (n) => `<option value="${n}" ${n === settings.questionCount ? "selected" : ""}>${n} câu</option>`,
          ).join("")}
        </select>
      </div>

      <p class="quiz-filter-note">
        Dùng bộ lọc đang chọn ở màn ${settings.contentType === "kanji" ? "Kanji" : "Từ vựng"}:
        <b>${settings.contentType === "kanji" ? kanjiFilterText : vocabFilterText}</b>
      </p>

      ${error ? `<p class="quiz-error">${error}</p>` : ""}

      <button id="start" class="primary-action-btn">Bắt đầu</button>
    </section>
  `;

  document.getElementById("back")!.addEventListener("click", onBack);

  app.querySelectorAll<HTMLInputElement>('input[name="content-type"]').forEach((input) => {
    input.addEventListener("change", async () => {
      const newSettings: QuizSettings = { ...settings, contentType: input.value as QuizContentType };
      await saveQuizSettings(newSettings);
      await paintSetup(app, newSettings, onBack, onOpenKanji, onOpenVocab);
    });
  });

  app.querySelectorAll<HTMLInputElement>('input[name="vocab-mode"]').forEach((input) => {
    input.addEventListener("change", async () => {
      const newSettings: QuizSettings = { ...settings, vocabMode: input.value as VocabQuizMode };
      await saveQuizSettings(newSettings);
      await paintSetup(app, newSettings, onBack, onOpenKanji, onOpenVocab);
    });
  });

  document.getElementById("question-count")!.addEventListener("change", async (e) => {
    const questionCount = Number((e.target as HTMLSelectElement).value);
    await saveQuizSettings({ ...settings, questionCount });
  });

  document.getElementById("start")!.addEventListener("click", async () => {
    const questionCount = Number((document.getElementById("question-count") as HTMLSelectElement).value);
    const questions =
      settings.contentType === "kanji"
        ? await buildKanjiQuiz(questionCount)
        : await buildVocabQuiz(settings.vocabMode, questionCount);
    if (questions.length === 0) {
      await paintSetup(
        app,
        settings,
        onBack,
        onOpenKanji,
        onOpenVocab,
        "Không đủ dữ liệu để tạo câu hỏi với bộ lọc hiện tại — hãy chọn thêm level/nguồn ở màn tương ứng.",
      );
      return;
    }
    const session: QuizSession = {
      questions,
      answers: questions.map(() => null),
      currentIndex: 0,
    };
    await saveQuizSession(session);
    await paintPlay(app, session, onBack, onOpenKanji, onOpenVocab);
  });
}

function cellStateClass(session: QuizSession, index: number): string {
  const answerIndex = session.answers[index];
  if (answerIndex === null) return "";
  return session.questions[index].choices[answerIndex].correct ? "quiz-grid-cell-correct" : "quiz-grid-cell-wrong";
}

function detailHtml(q: QuizQuestion): string {
  if (q.kind === "kanji") {
    const k = findKanjiById(q.id);
    if (!k) return "";
    return `
      <div class="quiz-detail">
        ${k.hanViet.length > 0 ? `<div class="quiz-detail-row"><b>Hán Việt:</b> ${k.hanViet.join(", ")}</div>` : ""}
        ${k.readings.on.length > 0 || k.readings.kun.length > 0 ? `<div class="quiz-detail-row"><b>Âm đọc:</b> ${[...k.readings.on, ...k.readings.kun].join("、")}</div>` : ""}
        ${k.mnemonic ? `<div class="quiz-detail-row"><b>Mẹo nhớ:</b> ${k.mnemonic}</div>` : ""}
        <button class="quiz-detail-link" data-kind="kanji" data-id="${k.id}">Xem thẻ đầy đủ →</button>
      </div>
    `;
  }
  const v = findVocabById(q.id);
  if (!v) return "";
  return `
    <div class="quiz-detail">
      ${v.reading ? `<div class="quiz-detail-row"><b>Cách đọc:</b> ${v.reading}</div>` : ""}
      ${v.hanViet.length > 0 ? `<div class="quiz-detail-row"><b>Hán Việt:</b> ${v.hanViet.join(", ")}</div>` : ""}
      ${v.mnemonic.length > 0 ? `<div class="quiz-detail-row"><b>Mẹo nhớ:</b> ${v.mnemonic.join(" / ")}</div>` : ""}
      ${v.example ? `<div class="quiz-detail-row">${v.example}${v.exampleVi ? `<br /><span class="muted">${v.exampleVi}</span>` : ""}</div>` : ""}
      <button class="quiz-detail-link" data-kind="vocab" data-id="${v.id}">Xem thẻ đầy đủ →</button>
    </div>
  `;
}

async function paintPlay(
  app: HTMLElement,
  session: QuizSession,
  onBack: () => void,
  onOpenKanji: (kanjiId: string) => void,
  onOpenVocab: (vocabId: string) => void,
) {
  const idx = session.currentIndex;
  const q = session.questions[idx];
  const answered = session.answers[idx];
  const allAnswered = session.answers.every((a) => a !== null);
  const isLast = idx === session.questions.length - 1;

  const gridCells = session.questions
    .map((_, i) => {
      const classes = ["quiz-grid-cell"];
      if (i === idx) classes.push("quiz-grid-cell-current");
      const stateClass = cellStateClass(session, i);
      if (stateClass) classes.push(stateClass);
      return `<button class="${classes.join(" ")}" data-index="${i}">${i + 1}</button>`;
    })
    .join("");

  app.innerHTML = `
    <header class="toolbar">
      <button id="back" class="icon-btn" title="Về menu">←</button>
      <span class="counter">Câu ${idx + 1} / ${session.questions.length}</span>
      <button id="finish" class="icon-btn" title="Nộp bài, xem kết quả">✓</button>
    </header>

    <div class="quiz-grid">${gridCells}</div>

    <main class="quiz-question">
      <div class="level-badge" data-level="${q.level}">${q.level}</div>
      <div class="quiz-prompt-label">${q.promptLabel}</div>
      <div class="quiz-prompt">${q.prompt}</div>
      <div class="quiz-choices">
        ${q.choices
          .map((c, i) => {
            const classes = ["quiz-choice"];
            if (answered !== null) {
              if (c.correct) classes.push("quiz-choice-correct");
              else if (i === answered) classes.push("quiz-choice-wrong");
            }
            return `<button class="${classes.join(" ")}" data-index="${i}" ${answered !== null ? "disabled" : ""}>${c.text}</button>`;
          })
          .join("")}
      </div>
      ${answered !== null ? detailHtml(q) : ""}
    </main>

    <footer class="nav">
      <button id="prev" ${idx === 0 ? "disabled" : ""}>← Câu trước</button>
      <button id="next">${isLast ? "Xem kết quả" : "Câu sau →"}</button>
    </footer>
  `;

  document.getElementById("back")!.addEventListener("click", onBack);

  app.querySelectorAll<HTMLButtonElement>(".quiz-grid-cell").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const newSession = { ...session, currentIndex: Number(btn.dataset.index) };
      await saveQuizSession(newSession);
      await paintPlay(app, newSession, onBack, onOpenKanji, onOpenVocab);
    });
  });

  if (answered === null) {
    app.querySelectorAll<HTMLButtonElement>(".quiz-choice").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const chosenIndex = Number(btn.dataset.index);
        const chosen = q.choices[chosenIndex];
        await recordAnswer(q.id, chosen.correct);
        const newAnswers = [...session.answers];
        newAnswers[idx] = chosenIndex;
        const newSession = { ...session, answers: newAnswers };
        await saveQuizSession(newSession);
        await paintPlay(app, newSession, onBack, onOpenKanji, onOpenVocab);
      });
    });
  }

  document.querySelector(".quiz-detail-link")?.addEventListener("click", (e) => {
    const el = e.currentTarget as HTMLButtonElement;
    if (el.dataset.kind === "kanji") onOpenKanji(el.dataset.id!);
    else onOpenVocab(el.dataset.id!);
  });

  document.getElementById("prev")!.addEventListener("click", async () => {
    if (idx === 0) return;
    const newSession = { ...session, currentIndex: idx - 1 };
    await saveQuizSession(newSession);
    await paintPlay(app, newSession, onBack, onOpenKanji, onOpenVocab);
  });

  document.getElementById("next")!.addEventListener("click", async () => {
    if (isLast) {
      await finishQuiz(app, session, onBack, onOpenKanji, onOpenVocab);
      return;
    }
    const newSession = { ...session, currentIndex: idx + 1 };
    await saveQuizSession(newSession);
    await paintPlay(app, newSession, onBack, onOpenKanji, onOpenVocab);
  });

  document.getElementById("finish")!.addEventListener("click", async () => {
    if (!allAnswered && !confirm(`Còn ${session.answers.filter((a) => a === null).length} câu chưa trả lời. Vẫn nộp bài?`)) {
      return;
    }
    await finishQuiz(app, session, onBack, onOpenKanji, onOpenVocab);
  });
}

async function finishQuiz(
  app: HTMLElement,
  session: QuizSession,
  onBack: () => void,
  onOpenKanji: (kanjiId: string) => void,
  onOpenVocab: (vocabId: string) => void,
) {
  await clearQuizSession();
  paintResult(app, session, onBack, onOpenKanji, onOpenVocab);
}

function paintResult(
  app: HTMLElement,
  session: QuizSession,
  onBack: () => void,
  onOpenKanji: (kanjiId: string) => void,
  onOpenVocab: (vocabId: string) => void,
) {
  const total = session.questions.length;
  const score = session.answers.filter((a, i) => a !== null && session.questions[i].choices[a].correct).length;
  const unanswered = session.answers.filter((a) => a === null).length;
  const pct = total > 0 ? Math.round((score / total) * 100) : 0;

  const wrongEntries = session.questions
    .map((q, i) => ({ q, a: session.answers[i] }))
    .filter(({ a, q }) => a !== null && !q.choices[a].correct);

  app.innerHTML = `
    <header class="toolbar">
      <button id="back" class="icon-btn" title="Về menu">←</button>
      <span class="counter">Kết quả</span>
    </header>
    <main class="quiz-result">
      <div class="quiz-result-score">${score} / ${total}</div>
      <div class="quiz-result-pct">${pct}% đúng${unanswered > 0 ? ` · ${unanswered} câu chưa trả lời` : ""}</div>
      <button id="retry" class="primary-action-btn">Làm lại</button>
      ${
        wrongEntries.length > 0
          ? `<button id="review-toggle" class="secondary-action-btn">Xem lại ${wrongEntries.length} câu sai</button>`
          : ""
      }
      <div id="review-list" class="quiz-review-list" style="display:none">
        ${wrongEntries
          .map(
            ({ q, a }) => `
          <div class="quiz-review-item">
            <div class="quiz-review-prompt">${q.promptLabel}: <b>${q.prompt}</b></div>
            <div class="quiz-review-chosen">Bạn chọn: ${q.choices[a!].text}</div>
            <div class="quiz-review-correct">Đáp án đúng: ${q.choices.find((c) => c.correct)!.text}</div>
          </div>
        `,
          )
          .join("")}
      </div>
    </main>
  `;
  document.getElementById("back")!.addEventListener("click", onBack);
  document.getElementById("retry")!.addEventListener("click", async () => {
    const settings = await loadQuizSettings();
    await paintSetup(app, settings, onBack, onOpenKanji, onOpenVocab);
  });
  document.getElementById("review-toggle")?.addEventListener("click", () => {
    const list = document.getElementById("review-list")!;
    const btn = document.getElementById("review-toggle")!;
    const showing = list.style.display !== "none";
    list.style.display = showing ? "none" : "flex";
    btn.textContent = showing ? `Xem lại ${wrongEntries.length} câu sai` : "Ẩn danh sách câu sai";
  });
}
