import { useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Target,
  BookOpenText,
  MessageCircle,
  Sparkles,
  Users2,
  ListChecks,
  ArrowRight,
  Globe,
  Check,
  X,
  Images,
} from "lucide-react";
import { ALL_IT_BOOK_LESSONS, countForLesson } from "../../popup/itBookState.ts";
import type { ItBookLesson, ItBookTerm } from "../../types/itBook.ts";
import { Card } from "../components/ui/card.tsx";
import { PageHeader } from "../components/PageHeader.tsx";
import { QuestionPalette } from "../components/QuestionPalette.tsx";
import { useFloatingNav } from "../WebAppShell.tsx";

function TermCallout({ term }: { term: ItBookTerm }) {
  return (
    <div className="rounded-xl border border-sky-100 bg-sky-50 p-3.5">
      <div className="flex flex-wrap items-baseline gap-x-2">
        <span className="font-semibold text-sky-800">{term.term}</span>
        {term.termEn ? <span className="text-xs text-sky-600">{term.termEn}</span> : null}
        {term.termVi ? <span className="text-xs font-semibold text-sky-700">{term.termVi}</span> : null}
      </div>
      <p className="mt-1 text-sm leading-relaxed text-sky-900/80">{term.definitionVi}</p>
    </div>
  );
}

function Section({ icon: Icon, title, children }: { icon: typeof Target; title: string; children: React.ReactNode }) {
  return (
    <div className="mt-5">
      <div className="mb-2 flex items-center gap-1.5 text-xs font-bold tracking-wide text-neutral-400 uppercase">
        <Icon size={14} /> {title}
      </div>
      {children}
    </div>
  );
}

// Pairs a Japanese line with its Vietnamese translation (when the toggle is
// on and a translation exists -- older/not-yet-translated lessons just show
// the Japanese, same as before this feature existed).
function Bilingual({ jp, vi, showVi }: { jp: string; vi?: string; showVi: boolean }) {
  // A block-level wrapper as an <li>'s sole child pushes the list marker
  // onto its own line in `list-inside` -- an inline <span> instead lets the
  // marker sit flush with the first line of `jp` like plain text would;
  // this component is also used standalone (readingParagraphs), where a
  // span with a following block span reads identically.
  return (
    <span>
      {jp}
      {showVi && vi ? <span className="mt-0.5 block text-neutral-400 italic">{vi}</span> : null}
    </span>
  );
}

// The book's own quiz has no interactivity in print (đáp án ở phụ lục) --
// here each blank gets its own tappable word bank so it doubles as an actual
// self-check exercise instead of a read-only list. `quizAnswerKey[i]` is the
// 0-based index into quizOptions for quizQuestions[i]; state resets whenever
// the lesson changes (a lightweight per-visit drill, not a tracked session
// like the main Quiz screen).
function QuizPractice({ lesson }: { lesson: ItBookLesson }) {
  const [answers, setAnswers] = useState<Record<number, number>>({});

  if (lesson.quizQuestions.length === 0) return null;
  const hasKey = !!lesson.quizAnswerKey && lesson.quizAnswerKey.length === lesson.quizQuestions.length;
  const correctCount = hasKey ? Object.entries(answers).filter(([qi, oi]) => lesson.quizAnswerKey![Number(qi)] === oi).length : 0;

  return (
    <Section icon={ListChecks} title="Luyện từ vựng IT">
      {lesson.quizInstructions ? <p className="text-sm text-neutral-500">{lesson.quizInstructions}</p> : null}
      {hasKey ? (
        <p className="mt-1 text-xs font-semibold text-neutral-400">
          {Object.keys(answers).length}/{lesson.quizQuestions.length} đã chọn · {correctCount} đúng
        </p>
      ) : null}
      <div className="mt-3 space-y-4">
        {lesson.quizQuestions.map((q, qi) => {
          const picked = answers[qi];
          const answered = picked !== undefined;
          const correctIndex = hasKey ? lesson.quizAnswerKey![qi] : undefined;
          return (
            <div key={q.number}>
              <div className="text-sm text-neutral-800">
                <b className="text-neutral-400">{q.number}.</b> {q.text}
              </div>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {lesson.quizOptions.map((o, oi) => {
                  let cls = "border-neutral-200 text-neutral-600 hover:bg-neutral-50";
                  if (answered && hasKey) {
                    if (oi === correctIndex) cls = "border-emerald-300 bg-emerald-50 text-emerald-700";
                    else if (oi === picked) cls = "border-rose-300 bg-rose-50 text-rose-700";
                    else cls = "border-neutral-200 text-neutral-400 opacity-60";
                  } else if (answered && oi === picked) {
                    cls = "border-rose-300 bg-rose-50 text-rose-600";
                  }
                  return (
                    <button
                      key={o.letter}
                      disabled={answered}
                      onClick={() => setAnswers((a) => ({ ...a, [qi]: oi }))}
                      className={`rounded-lg border px-2.5 py-1 text-xs font-medium ${cls}`}
                    >
                      {answered && hasKey && oi === correctIndex ? <Check size={11} className="mr-1 inline" /> : null}
                      {answered && hasKey && oi === picked && oi !== correctIndex ? <X size={11} className="mr-1 inline" /> : null}
                      {o.text}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      {Object.keys(answers).length > 0 ? (
        <button onClick={() => setAnswers({})} className="mt-3 text-xs font-semibold text-rose-600 hover:underline">
          Làm lại
        </button>
      ) : null}
    </Section>
  );
}

// Diagrams/org-charts/screenshots in a lesson's 読解 don't survive text
// extraction (readingParagraphs turns tables into prose) -- this shows the
// original scanned pages as a visual backup. Collapsed by default (matches
// QuestionPalette's convention elsewhere: content-first, expand on demand)
// since most of the time the text above is enough on its own.
function PageImageGallery({ lesson }: { lesson: ItBookLesson }) {
  const [open, setOpen] = useState(false);
  if (lesson.pageImageCount === 0) return null;
  const base = `${import.meta.env.BASE_URL}images/it-book/lesson-${lesson.lessonNumber}/`;
  return (
    <div className="mt-4">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between rounded-2xl border border-neutral-200 bg-white px-4 py-2.5 text-left text-sm font-medium text-neutral-600 hover:bg-neutral-50"
      >
        <span className="flex items-center gap-1.5">
          <Images size={15} /> Ảnh trang sách gốc ({lesson.pageImageCount} trang)
        </span>
        <ChevronDown size={16} className={`shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open ? (
        <div className="mt-2 grid grid-cols-3 gap-1.5">
          {Array.from({ length: lesson.pageImageCount }, (_, i) => i + 1).map((n) => (
            <a key={n} href={`${base}${n}.jpg`} target="_blank" rel="noreferrer">
              <img src={`${base}${n}.jpg`} alt={`Trang ${n}`} loading="lazy" className="w-full rounded-lg border border-neutral-200 object-cover" />
            </a>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function LessonDetail({ lesson, showVi, onOpenVocab }: { lesson: ItBookLesson; showVi: boolean; onOpenVocab: () => void }) {
  const vocabCount = countForLesson(lesson.lessonNumber);
  return (
    <Card className="mt-3 gap-0 rounded-2xl border-neutral-200 p-6 ring-0">
      <div className="text-xs font-bold tracking-wide text-rose-500 uppercase">Bài {lesson.lessonNumber}</div>
      <div className="mt-1 text-2xl font-bold text-neutral-800">{lesson.titleVi}</div>
      <div className="mt-0.5 text-neutral-500">{lesson.title}</div>

      {vocabCount > 0 ? (
        <button
          onClick={onOpenVocab}
          className="mt-3 flex w-fit items-center gap-1.5 rounded-full border border-neutral-200 px-3 py-1.5 text-xs font-semibold text-neutral-600 hover:bg-neutral-50"
        >
          {vocabCount} từ vựng riêng của bài này <ArrowRight size={13} />
        </button>
      ) : null}

      <PageImageGallery lesson={lesson} />

      {lesson.goals.length > 0 ? (
        <Section icon={Target} title="Mục tiêu">
          <ul className="list-inside list-disc space-y-1 text-sm text-neutral-700">
            {lesson.goals.map((g, i) => (
              <li key={i}>{g}</li>
            ))}
          </ul>
        </Section>
      ) : null}

      {lesson.readingParagraphs.length > 0 ? (
        <Section icon={BookOpenText} title="Đọc hiểu">
          <div className="space-y-3 text-sm leading-relaxed text-neutral-800">
            {lesson.readingParagraphs.map((p, i) => (
              <Bilingual key={i} jp={p} vi={lesson.readingParagraphsVi?.[i]} showVi={showVi} />
            ))}
          </div>
        </Section>
      ) : null}

      {lesson.readingPoints.length > 0 ? (
        <div className="mt-3 space-y-2">
          {lesson.readingPoints.map((t, i) => (
            <TermCallout key={i} term={t} />
          ))}
        </div>
      ) : null}

      {lesson.practiceQuestions.length > 0 ? (
        <Section icon={ListChecks} title="Câu hỏi luyện tập">
          <ol className="list-inside list-decimal space-y-1 text-sm text-neutral-700">
            {lesson.practiceQuestions.map((q, i) => (
              <li key={i}>
                <Bilingual jp={q} vi={lesson.practiceQuestionsVi?.[i]} showVi={showVi} />
              </li>
            ))}
          </ol>
        </Section>
      ) : null}

      {lesson.groupDiscussion.length > 0 ? (
        <Section icon={Users2} title="Thảo luận nhóm">
          <ol className="list-inside list-decimal space-y-1 text-sm text-neutral-700">
            {lesson.groupDiscussion.map((q, i) => (
              <li key={i}>
                <Bilingual jp={q} vi={lesson.groupDiscussionVi?.[i]} showVi={showVi} />
              </li>
            ))}
          </ol>
        </Section>
      ) : null}

      {lesson.dialogueTurns.length > 0 ? (
        <Section icon={MessageCircle} title="Hội thoại mẫu">
          {lesson.dialogueBackground ? (
            <div className="mb-3 text-sm text-neutral-500 italic">
              <div>{lesson.dialogueBackground}</div>
              {showVi && lesson.dialogueBackgroundVi ? <div className="mt-0.5 text-neutral-400">{lesson.dialogueBackgroundVi}</div> : null}
            </div>
          ) : null}
          <div className="space-y-3">
            {lesson.dialogueTurns.map((t, i) => (
              <div key={i} className="rounded-xl bg-neutral-50 p-3.5 text-sm leading-relaxed">
                <span className="font-bold text-rose-600">{t.speaker}：</span>
                <span className="text-neutral-800">{t.text}</span>
                {showVi && t.textVi ? <div className="mt-1 border-l-2 border-neutral-300 pl-2.5 text-neutral-500 italic">{t.textVi}</div> : null}
              </div>
            ))}
          </div>
        </Section>
      ) : null}

      {lesson.dialoguePoints.length > 0 ? (
        <div className="mt-3 space-y-2">
          {lesson.dialoguePoints.map((t, i) => (
            <TermCallout key={i} term={t} />
          ))}
        </div>
      ) : null}

      {lesson.usefulPhrases.length > 0 ? (
        <Section icon={Sparkles} title="Mẫu câu hay dùng">
          <div className="space-y-2">
            {lesson.usefulPhrases.map((p, i) => (
              <div key={i} className="rounded-xl bg-amber-50 p-3 text-sm">
                <div className="font-semibold text-amber-900">{p.phrase}</div>
                <div className="mt-0.5 text-amber-700">{p.meaningVi}</div>
              </div>
            ))}
          </div>
        </Section>
      ) : null}

      {lesson.roleplayContent.length > 0 ? (
        <Section icon={Users2} title="Luyện hội thoại">
          {lesson.roleplayBackground ? (
            <div className="text-sm text-neutral-700">
              <Bilingual jp={lesson.roleplayBackground} vi={lesson.roleplayBackgroundVi} showVi={showVi} />
            </div>
          ) : null}
          {lesson.roleplayParticipants.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {lesson.roleplayParticipants.map((p, i) => (
                <span key={i} className="rounded-full border border-neutral-200 px-2.5 py-1 text-xs text-neutral-600">
                  {p}
                </span>
              ))}
            </div>
          ) : null}
          <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-neutral-700">
            {lesson.roleplayContent.map((c, i) => (
              <li key={i}>
                <Bilingual jp={c} vi={lesson.roleplayContentVi?.[i]} showVi={showVi} />
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      <QuizPractice lesson={lesson} />
    </Card>
  );
}

export function ItBookLessonsScreen({ onOpenVocab }: { onOpenVocab: (lesson: number) => void }) {
  const [index, setIndex] = useState(0);
  const [showVi, setShowVi] = useState(false);
  const lesson = ALL_IT_BOOK_LESSONS[index];

  useFloatingNav(true);

  return (
    <div className="mx-auto max-w-4xl px-2.5 py-2 md:px-8 md:py-6">
      <PageHeader title="Bài học IT" subtitle={`${index + 1} / ${ALL_IT_BOOK_LESSONS.length}`} icon={{ img: "icon-reading.png", bg: "#e0e7ff" }} />

      <div className="mt-4">
        <QuestionPalette
          summary={`Bài ${index + 1}/${ALL_IT_BOOK_LESSONS.length}: ${lesson?.titleVi ?? ""}`}
          onJump={setIndex}
          items={ALL_IT_BOOK_LESSONS.map((l, i) => ({
            id: String(l.lessonNumber),
            status: i === index ? "current" : "unanswered",
            title: l.titleVi,
          }))}
        />
      </div>

      <button
        onClick={() => setShowVi((v) => !v)}
        className={`mt-3 flex w-fit items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold ${
          showVi ? "border-rose-300 bg-rose-50 text-rose-600" : "border-neutral-200 text-neutral-600 hover:bg-neutral-50"
        }`}
      >
        <Globe size={13} /> {showVi ? "Ẩn bản dịch" : "Hiện bản dịch"}
      </button>

      <div className="mt-3 hidden items-center gap-2 md:flex">
        <button
          disabled={index === 0}
          onClick={() => setIndex((i) => i - 1)}
          className="flex items-center gap-1 rounded-full border border-neutral-200 px-3 py-1.5 text-sm text-neutral-600 disabled:opacity-40"
        >
          <ChevronLeft size={16} /> Trước
        </button>
        <button
          disabled={index >= ALL_IT_BOOK_LESSONS.length - 1}
          onClick={() => setIndex((i) => i + 1)}
          className="ml-auto flex items-center gap-1 rounded-full border border-neutral-200 px-3 py-1.5 text-sm text-neutral-600 disabled:opacity-40"
        >
          Tiếp <ChevronRight size={16} />
        </button>
      </div>

      {lesson ? <LessonDetail key={lesson.lessonNumber} lesson={lesson} showVi={showVi} onOpenVocab={() => onOpenVocab(lesson.lessonNumber)} /> : null}

      {index > 0 ? (
        <button
          onClick={() => setIndex((i) => i - 1)}
          aria-label="Trước"
          className="fixed bottom-36 left-4 z-20 flex h-10 w-10 items-center justify-center rounded-full bg-white text-neutral-600 shadow-lg ring-1 ring-neutral-200 active:bg-neutral-50 md:hidden"
        >
          <ChevronLeft size={18} />
        </button>
      ) : null}
      {index < ALL_IT_BOOK_LESSONS.length - 1 ? (
        <button
          onClick={() => setIndex((i) => i + 1)}
          aria-label="Tiếp"
          className="fixed right-4 bottom-36 z-20 flex h-10 w-10 items-center justify-center rounded-full bg-rose-600 text-white shadow-lg active:bg-rose-700 md:hidden"
        >
          <ChevronRight size={18} />
        </button>
      ) : null}
    </div>
  );
}
