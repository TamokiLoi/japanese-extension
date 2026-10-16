import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BookOpenText,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock3,
  ExternalLink,
  ListTree,
  Play,
  RotateCcw,
  X,
} from "lucide-react";
import { loadExamTipsProgress, recordExamTipsInteraction, saveExamTipsExerciseChoice, saveExamTipsPosition, setExamTipsLessonCompleted } from "../../popup/examTipsState.ts";
import { assetUrl } from "../../platform/assetUrl.ts";
import { PageHeader } from "../components/PageHeader.tsx";
import type { Screen } from "../../popup/screens.ts";
import type { ExamTipsBlock, ExamTipsLevel, ExamTipsLesson, ExamTipsProgress, ExamTipsSkill } from "../data/examTips/types.ts";

const LEVELS: ExamTipsLevel[] = ["N5", "N4", "N3", "N2", "N1"];
const LEVEL_TITLES: Record<ExamTipsLevel, string> = { N5: "Sắp có", N4: "Sắp có", N3: "Đang học", N2: "Sắp có", N1: "Sắp có" };

type TipRoute = { level: ExamTipsLevel; skill: ExamTipsSkill; lessonId?: string };
type LessonData = { lessons: ExamTipsLesson[] };

function readRoute(): TipRoute {
  const params = new URLSearchParams(location.search);
  const level = params.get("level");
  const skill = params.get("skill");
  return {
    level: LEVELS.includes(level as ExamTipsLevel) ? (level as ExamTipsLevel) : "N3",
    skill: skill === "listening" ? "listening" : "reading",
    lessonId: params.get("lesson") || undefined,
  };
}

function urlForRoute(route: TipRoute): string {
  const params = new URLSearchParams();
  params.set("level", route.level);
  params.set("skill", route.skill);
  if (route.lessonId) params.set("lesson", route.lessonId);
  return `${import.meta.env.BASE_URL}examTips?${params.toString()}`;
}

function lessonStatus(lesson: ExamTipsLesson, progress: ExamTipsProgress): "done" | "current" | "new" {
  if (progress.completedLessonIds.includes(lesson.id)) return "done";
  return progress.lastLessonId === lesson.id ? "current" : "new";
}

export function ExamTipsScreen({ onNavigate }: { onNavigate: (screen: Screen, id?: string) => void }) {
  const [route, setRoute] = useState<TipRoute>(readRoute);
  const [data, setData] = useState<LessonData | null>(null);
  const [progress, setProgress] = useState<ExamTipsProgress | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [showToc, setShowToc] = useState(false);
  const [checkedExercises, setCheckedExercises] = useState<Record<number, boolean>>({});
  const [imagePreview, setImagePreview] = useState<{ src: string; alt: string } | null>(null);
  const [playingVideos, setPlayingVideos] = useState<Record<string, boolean>>({});
  const [translations, setTranslations] = useState<Record<number, boolean>>({});
  const [selfChecks, setSelfChecks] = useState<Record<number, string>>({});
  const restoredLessonRef = useRef<string | null>(null);

  useEffect(() => {
    const onPopState = () => {
      setRoute(readRoute());
      setExpanded({});
      setCheckedExercises({});
      setTranslations({});
      setSelfChecks({});
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    let active = true;
    setData(null);
    setLoadError(null);
    if (route.level !== "N3") {
      setData({ lessons: [] });
      return () => { active = false; };
    }
    const load = route.skill === "reading"
      ? import("../data/examTips/n3Reading.ts").then((module) => module.n3ReadingLessons)
      : import("../data/examTips/n3Listening.ts").then((module) => module.n3ListeningLessons);
    void load.then((lessons) => {
      if (active) setData({ lessons });
    }).catch((error: unknown) => {
      if (active) setLoadError(error instanceof Error ? error.message : "Không thể tải nội dung mẹo thi.");
    });
    return () => { active = false; };
  }, [route.level, route.skill]);

  useEffect(() => {
    let active = true;
    void loadExamTipsProgress().then((saved) => { if (active) setProgress(saved); });
    return () => { active = false; };
  }, []);

  const lessons = data?.lessons ?? [];
  const lesson = useMemo(() => lessons.find((item) => item.id === route.lessonId), [lessons, route.lessonId]);
  const lastLesson = lessons.find((item) => item.id === progress?.lastLessonId);
  const lessonIndex = lesson ? lessons.findIndex((item) => item.id === lesson.id) : -1;

  useEffect(() => {
    if (!lesson || !progress || progress.lastLessonId !== lesson.id || restoredLessonRef.current === lesson.id) return;
    restoredLessonRef.current = lesson.id;
    const blockIndex = progress.lastBlockIndex ?? 0;
    requestAnimationFrame(() => document.getElementById(`exam-tip-block-${blockIndex}`)?.scrollIntoView({ block: "start" }));
  }, [lesson?.id, progress?.lastLessonId]);

  function navigateRoute(next: TipRoute, replace = false) {
    const href = urlForRoute(next);
    if (replace) history.replaceState(history.state, "", href);
    else history.pushState({ examTips: true }, "", href);
    setRoute(next);
    setExpanded({});
    setCheckedExercises({});
    setTranslations({});
    setSelfChecks({});
    setShowToc(false);
    window.scrollTo(0, 0);
  }

  function openLesson(item: ExamTipsLesson) {
    navigateRoute({ ...route, lessonId: item.id });
    void saveExamTipsPosition(route.level, route.skill, item.id, 0);
  }

  async function interact(blockIndex: number) {
    if (!lesson) return;
    await Promise.all([
      saveExamTipsPosition(route.level, route.skill, lesson.id, blockIndex),
      recordExamTipsInteraction(),
    ]);
    setProgress(await loadExamTipsProgress());
  }

  async function chooseExercise(blockIndex: number, choice: number | string) {
    if (!lesson) return;
    await saveExamTipsExerciseChoice(route.level, route.skill, lesson.id, blockIndex, choice);
    setProgress(await loadExamTipsProgress());
  }

  async function toggleComplete() {
    if (!lesson || !progress) return;
    const next = await setExamTipsLessonCompleted(route.level, route.skill, lesson.id, !progress.completedLessonIds.includes(lesson.id));
    setProgress(next);
  }

  function continueLesson() {
    if (lastLesson) openLesson(lastLesson);
    else if (lessons.length > 0) openLesson(lessons[0]);
  }

  if (route.lessonId && data && !lesson) {
    return (
      <div className="mx-auto max-w-5xl px-3 py-3 md:px-8 md:py-6">
        <PageHeader title="Mẹo làm bài thi" subtitle={`${route.level} · ${route.skill === "reading" ? "Đọc hiểu" : "Nghe hiểu"}`} />
        <section className="mt-6 rounded-2xl border-2 border-neutral-800 bg-[#fffdf9] p-5 shadow-[4px_4px_0_#262330]">
          <h2 className="text-lg font-bold">Không tìm thấy bài học này</h2>
          <p className="mt-2 text-sm text-neutral-600">Liên kết có thể đã cũ hoặc mã bài học không hợp lệ.</p>
          <button onClick={() => navigateRoute({ level: route.level, skill: route.skill })} className="mt-4 rounded-xl bg-neutral-900 px-4 py-2 text-sm font-semibold text-white">Về danh sách bài</button>
        </section>
      </div>
    );
  }

  if (lesson) {
    const done = progress?.completedLessonIds.includes(lesson.id) ?? false;
    const previous = lessons[lessonIndex - 1];
    const next = lessons[lessonIndex + 1];
    return (
      <div className="mx-auto max-w-6xl px-3 py-3 md:px-8 md:py-6">
        <PageHeader
          title="Mẹo làm bài thi N3"
          subtitle={`${route.skill === "reading" ? "Đọc hiểu" : "Nghe hiểu"} · Bài ${lessonIndex + 1}/${lessons.length}`}
          action={<button onClick={() => navigateRoute({ level: route.level, skill: route.skill })} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-neutral-200 bg-white px-3 text-sm font-semibold hover:bg-neutral-50"><ArrowLeft size={16} /> Chọn bài khác</button>}
        />
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-bold tracking-[.15em] text-rose-600">{route.skill === "reading" ? "ĐỌC HIỂU N3" : "NGHE HIỂU N3"}</p>
            <h1 className="mt-1 text-2xl font-extrabold leading-tight text-neutral-900 md:text-3xl">{lesson.title}</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-neutral-600">{lesson.summary}</p>
          </div>
          {lesson.minutes ? <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-sm text-neutral-600 ring-1 ring-neutral-200"><Clock3 size={15} /> khoảng {lesson.minutes} phút</span> : null}
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-2">
          <button onClick={() => setShowToc((value) => !value)} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-neutral-200 bg-white px-3 text-sm font-semibold"><ListTree size={16} /> Mục bài học <ChevronDown size={15} className={showToc ? "rotate-180" : ""} /></button>
          <button onClick={toggleComplete} className={`inline-flex min-h-10 items-center gap-2 rounded-xl px-4 text-sm font-bold ${done ? "bg-emerald-100 text-emerald-800" : "bg-rose-600 text-white hover:bg-rose-700"}`}>
            {done ? <CheckCircle2 size={17} /> : <Check size={17} />}{done ? "Đã học · Bấm để học lại" : "Đã học"}
          </button>
        </div>
        {showToc ? <nav aria-label="Mục trong bài" className="mt-3 grid gap-2 rounded-2xl border border-neutral-200 bg-white p-3 sm:grid-cols-2 lg:grid-cols-3">
          {lesson.blocks.map((block, index) => <button key={index} onClick={() => { document.getElementById(`exam-tip-block-${index}`)?.scrollIntoView({ behavior: "smooth", block: "start" }); void saveExamTipsPosition(route.level, route.skill, lesson.id, index); }} className="flex min-h-10 items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm hover:bg-rose-50"><span className="truncate">{blockTitle(block, index)}</span><ChevronRight size={15} className="shrink-0 text-neutral-400" /></button>)}
        </nav> : null}

        <div className="mt-4 grid gap-4">
          {lesson.blocks.map((block, index) => <div id={`exam-tip-block-${index}`} key={`${lesson.id}-${index}`} className="scroll-mt-24">
            <BlockView
              block={block}
              lessonId={lesson.id}
              blockIndex={index}
              expanded={expanded}
              translations={translations}
              playingVideos={playingVideos}
              checked={checkedExercises[index] === true}
              selected={progress?.exerciseChoices[`${lesson.id}:${index}`]}
              selfCheck={selfChecks[index]}
              onExpand={(key) => { setExpanded((current) => ({ ...current, [key]: !current[key] })); void interact(index); }}
              onToggleTranslation={() => { setTranslations((current) => ({ ...current, [index]: !current[index] })); void interact(index); }}
              onPlayVideo={() => setPlayingVideos((current) => ({ ...current, [`${lesson.id}:${index}`]: true }))}
              onImage={(src, alt) => setImagePreview({ src, alt })}
              onSelect={(choice) => { void chooseExercise(index, choice); setCheckedExercises((current) => ({ ...current, [index]: false })); }}
              onCheck={() => { setCheckedExercises((current) => ({ ...current, [index]: true })); void interact(index); }}
              onRetry={() => setCheckedExercises((current) => ({ ...current, [index]: false }))}
              onSelfCheck={(value) => setSelfChecks((current) => ({ ...current, [index]: value }))}
              onSaveSelfCheck={() => { const answer = selfChecks[index]?.trim(); if (answer) void chooseExercise(index, answer); }}
            />
          </div>)}
        </div>

        <div className="mt-5 flex items-center justify-between gap-3">
          <button disabled={!previous} onClick={() => previous && openLesson(previous)} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-neutral-200 bg-white px-4 text-sm font-semibold disabled:opacity-40"><ArrowLeft size={16} /> Bài trước</button>
          {route.skill === "reading" ? <button onClick={() => onNavigate("reading")} className="hidden rounded-xl border border-neutral-200 px-4 py-2 text-sm font-semibold md:block">Luyện đọc thêm</button> : <button onClick={() => onNavigate("listening")} className="hidden rounded-xl border border-neutral-200 px-4 py-2 text-sm font-semibold md:block">Luyện nghe thêm</button>}
          <button disabled={!next} onClick={() => next && openLesson(next)} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-rose-600 px-4 text-sm font-bold text-white disabled:opacity-40">Bài tiếp <ArrowRight size={16} /></button>
        </div>
        {route.skill === "reading" ? <button onClick={() => onNavigate("reading")} className="mt-3 w-full rounded-xl border border-neutral-200 bg-white px-4 py-2.5 text-sm font-semibold md:hidden">Luyện đọc thêm</button> : <button onClick={() => onNavigate("listening")} className="mt-3 w-full rounded-xl border border-neutral-200 bg-white px-4 py-2.5 text-sm font-semibold md:hidden">Luyện nghe thêm</button>}
        {imagePreview ? <div role="dialog" aria-modal="true" aria-label="Phóng to hình minh họa" className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 p-3" onClick={() => setImagePreview(null)}>
          <button aria-label="Đóng hình" className="absolute top-4 right-4 rounded-full bg-white p-2"><X size={20} /></button>
          <img src={assetUrl(imagePreview.src)} alt={imagePreview.alt} className="max-h-[92dvh] max-w-full rounded-xl object-contain" onClick={(event) => event.stopPropagation()} />
        </div> : null}
      </div>
    );
  }

  const completedCount = progress ? lessons.filter((item) => progress.completedLessonIds.includes(item.id)).length : 0;
  return (
    <div className="mx-auto max-w-6xl px-3 py-3 md:px-8 md:py-6">
      <PageHeader title="Mẹo làm bài thi" subtitle="Chiến lược đọc hiểu và nghe hiểu JLPT" icon={{ img: "icon-reading.png", bg: "#fff0cb" }} />

      <div className="mt-5 flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Chọn cấp độ JLPT">
        {LEVELS.map((level) => <button key={level} role="tab" aria-selected={route.level === level} disabled={level !== "N3"} onClick={() => navigateRoute({ level, skill: route.skill })} className={`min-w-[64px] rounded-xl border-2 px-4 py-2 text-sm font-extrabold ${route.level === level ? "border-neutral-900 bg-[#ffeb8a] text-neutral-900 shadow-[2px_2px_0_#262330]" : "border-neutral-200 bg-white text-neutral-500"} ${level !== "N3" ? "cursor-not-allowed opacity-55" : ""}`}>
          {level}<span className="mt-0.5 block text-[10px] font-medium">{LEVEL_TITLES[level]}</span>
        </button>)}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 rounded-2xl border border-neutral-200 bg-neutral-100 p-1.5" role="tablist" aria-label="Chọn kỹ năng">
        {(["reading", "listening"] as const).map((skill) => <button key={skill} role="tab" aria-selected={route.skill === skill} onClick={() => navigateRoute({ level: route.level, skill })} className={`flex min-h-11 items-center justify-center gap-2 rounded-xl px-3 text-sm font-bold transition ${route.skill === skill ? "bg-white text-rose-700 shadow-sm ring-1 ring-neutral-200" : "text-neutral-600 hover:bg-white/60"}`}>
          {skill === "reading" ? <BookOpenText size={17} /> : <Play size={16} />}{skill === "reading" ? "Đọc hiểu" : "Nghe hiểu"}
        </button>)}
      </div>

      {route.level !== "N3" ? <div className="mt-5 rounded-2xl border-2 border-dashed border-neutral-300 bg-neutral-50 p-6 text-center"><p className="font-bold">Nội dung {route.level} đang được biên soạn</p><p className="mt-1 text-sm text-neutral-500">Hiện đã có mẹo Đọc hiểu và Nghe hiểu N3.</p></div> : null}
      {loadError ? <p role="alert" className="mt-5 rounded-xl bg-rose-50 p-4 text-sm text-rose-700">{loadError}</p> : null}
      {route.level === "N3" && !data && !loadError ? <p className="mt-6 rounded-xl border border-neutral-200 bg-white p-5 text-sm text-neutral-500">Đang tải bài học…</p> : null}
      {route.level === "N3" && data ? <>
        {lastLesson && progress?.skill === route.skill ? <section className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border-2 border-neutral-800 bg-[#ffeb8a] p-4 shadow-[4px_4px_0_#262330]">
          <div><p className="text-xs font-extrabold tracking-wide">TIẾP TỤC HỌC</p><p className="mt-1 font-bold">{lastLesson.title}</p><p className="text-xs text-neutral-600">{completedCount} / {lessons.length} bài đã học</p></div>
          <button onClick={() => continueLesson()} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-neutral-900 px-4 text-sm font-bold text-white">Tiếp tục <ArrowRight size={16} /></button>
        </section> : null}

        <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-extrabold">{route.skill === "reading" ? "Bài mẹo Đọc hiểu N3" : "Bài mẹo Nghe hiểu N3"}</h2>
          <p className="text-sm text-neutral-500">{lessons.length} bài · {completedCount} đã học</p>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {lessons.map((item, index) => {
            const status = progress ? lessonStatus(item, progress) : "new";
            return <button key={item.id} onClick={() => openLesson(item)} className="group rounded-2xl border-2 border-neutral-800 bg-white p-4 text-left shadow-[3px_3px_0_#262330] transition hover:-translate-y-0.5 hover:shadow-[5px_5px_0_#262330]">
              <div className="flex items-start justify-between gap-2"><span className={`rounded-full px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide ${status === "done" ? "bg-emerald-100 text-emerald-800" : status === "current" ? "bg-amber-100 text-amber-900" : "bg-[#fbd0e1] text-rose-700"}`}>{status === "done" ? "Đã học" : status === "current" ? "Đang học" : `BÀI ${index + 1}`}</span><ChevronRight size={18} className="shrink-0 text-rose-600 transition group-hover:translate-x-1" /></div>
              <h3 className="mt-3 font-extrabold leading-snug">{item.title}</h3>
              <p className="mt-1 line-clamp-2 text-sm leading-5 text-neutral-600">{item.summary}</p>
              {item.minutes ? <div className="mt-3 text-xs text-neutral-500">{item.minutes} phút</div> : null}
            </button>;
          })}
        </div>
      </> : null}
    </div>
  );
}

function BlockView({
  block,
  lessonId,
  blockIndex,
  expanded,
  translations,
  playingVideos,
  checked,
  selected,
  selfCheck,
  onExpand,
  onToggleTranslation,
  onPlayVideo,
  onImage,
  onSelect,
  onCheck,
  onRetry,
  onSelfCheck,
  onSaveSelfCheck,
}: {
  block: ExamTipsBlock;
  lessonId: string;
  blockIndex: number;
  expanded: Record<string, boolean>;
  translations: Record<number, boolean>;
  playingVideos: Record<string, boolean>;
  checked: boolean;
  selected?: number | string;
  selfCheck?: string;
  onExpand: (key: string) => void;
  onToggleTranslation: () => void;
  onPlayVideo: () => void;
  onImage: (src: string, alt: string) => void;
  onSelect: (choice: number) => void;
  onCheck: () => void;
  onRetry: () => void;
  onSelfCheck: (value: string) => void;
  onSaveSelfCheck: () => void;
}) {
  const id = `${lessonId}-${blockIndex}`;
  switch (block.type) {
    case "text":
      return <section className="rounded-2xl border border-neutral-200 bg-white p-4 md:p-6">{block.title ? <h2 className="text-lg font-extrabold">{block.title}</h2> : null}<div className="mt-2 space-y-3 text-sm leading-7 text-neutral-700">{block.paragraphs.map((paragraph, index) => <p key={index}>{paragraph}</p>)}</div></section>;
    case "callout":
      return <aside className={`rounded-2xl border-2 border-neutral-800 p-4 shadow-[3px_3px_0_#262330] ${block.tone === "warning" ? "bg-[#fbd0e1]" : "bg-[#d7f1e6]"}`}><p className="text-xs font-extrabold tracking-[.12em]">{block.title}</p><p className="mt-1 text-sm leading-6">{block.text}</p></aside>;
    case "steps":
      return <section className="rounded-2xl border-2 border-neutral-800 bg-[#ffeb8a] p-4 shadow-[3px_3px_0_#262330] md:p-5"><h2 className="font-extrabold">{block.title}</h2><ol className="mt-3 grid gap-3 sm:grid-cols-2">{block.items.map((item, index) => <li key={index} className="rounded-xl border-2 border-neutral-800 bg-white p-3"><span className="inline-grid h-7 w-7 place-items-center rounded-lg border border-neutral-800 bg-[#e6dcff] text-sm font-extrabold">{index + 1}</span><h3 className="mt-2 font-bold">{item.title}</h3><p className="mt-1 text-sm leading-6 text-neutral-700">{item.text}</p></li>)}</ol></section>;
    case "comparison":
      return <section className="rounded-2xl border border-neutral-200 bg-[#faf7ed] p-4 md:p-6">{block.intro ? <p className="mb-4 text-sm leading-6 text-neutral-600">{block.intro}</p> : null}<div className="grid gap-4">{block.items.map((item, index) => {
        const open = expanded[`${id}-${index}`] === true;
        return <div key={index} className="tip-comparison-pair">
          <div className={`tip-comparison-source ${index % 2 === 0 ? "bg-[#ffeb8a]" : "bg-[#fbd0e1]"}`}>
            <p className="flex items-center gap-2 text-[11px] font-extrabold tracking-[.12em]"><span className="inline-grid h-6 w-6 place-items-center rounded-md border-2 border-neutral-800 bg-white text-xs">{String.fromCharCode(65 + index)}</span>{item.label}</p>
            <p className="mt-2 whitespace-pre-line text-base font-semibold leading-8 md:text-lg">{item.text}</p>
            {item.detail ? <>
              <button aria-expanded={open} onClick={() => onExpand(`${id}-${index}`)} className="tip-mobile-explain mt-3 flex min-h-10 w-full items-center justify-between border-t border-neutral-800/20 pt-2 text-left text-sm font-bold">Xem phân tích <ChevronDown size={16} className={open ? "rotate-180" : ""} /></button>
              {open ? <p className="tip-mobile-detail text-sm leading-6">{item.detail}</p> : null}
            </> : null}
          </div>
          <div className="tip-comparison-arrow" aria-hidden="true"><span>→</span></div>
          <div className="tip-comparison-analysis"><p className="text-[11px] font-extrabold tracking-[.12em]">PHÂN TÍCH · {item.label}</p><p className="mt-2 text-sm leading-6">{item.detail ?? item.text}</p></div>
        </div>;
      })}</div>{block.takeaway ? <div className="mt-4 rounded-xl border-2 border-neutral-800 bg-[#d7f1e6] p-3"><p className="text-xs font-extrabold tracking-wide">ĐIỂM CẦN NHỚ</p><p className="mt-1 text-sm leading-6">{block.takeaway}</p></div> : null}</section>;
    case "examples":
      return <section className="rounded-2xl border border-neutral-200 bg-[#faf7ed] p-4 md:p-6"><div className="mb-3 flex flex-wrap items-center justify-between gap-2">{block.title ? <h2 className="font-extrabold">{block.title}</h2> : <span />}{block.items.some((item) => item.vi) ? <button onClick={onToggleTranslation} className="min-h-9 rounded-lg border border-neutral-800 bg-white px-3 text-xs font-bold">{translations[blockIndex] ? "Ẩn bản dịch" : "Xem bản dịch"}</button> : null}</div><div className="grid gap-3">{block.items.map((item, index) => {
        const open = expanded[`${id}-${index}`] === true;
        return <div key={index} className="tip-comparison-pair">
          <article className={`tip-comparison-source ${index % 2 === 0 ? "bg-[#ffeb8a]" : "bg-[#fbd0e1]"}`}><p className="text-[11px] font-extrabold tracking-[.12em]">{item.title || `VÍ DỤ ${index + 1}`}</p><p lang="ja" className="mt-2 whitespace-pre-line text-base font-semibold leading-8 md:text-lg">{item.jp}</p>{translations[blockIndex] && item.vi ? <p className="mt-2 border-t border-neutral-800/20 pt-2 text-sm leading-6">{item.vi}</p> : null}{item.analysis ? <><button onClick={() => onExpand(`${id}-${index}`)} aria-expanded={open} className="tip-mobile-explain mt-3 flex min-h-10 w-full items-center justify-between border-t border-neutral-800/20 pt-2 text-left text-sm font-bold">Xem phân tích <ChevronDown size={15} className={open ? "rotate-180" : ""} /></button>{open ? <p className="tip-mobile-detail text-sm leading-6">{item.analysis}</p> : null}</> : null}</article>
          <div className="tip-comparison-arrow" aria-hidden="true"><span>→</span></div>
          <aside className="tip-comparison-analysis"><p className="text-[11px] font-extrabold tracking-[.12em]">PHÂN TÍCH</p><p className="mt-2 text-sm leading-6">{item.analysis ?? "Đọc cả hai vế và đối chiếu với câu hỏi."}</p></aside>
        </div>;
      })}</div></section>;
    case "passage":
      return <section className="rounded-2xl border-2 border-neutral-800 bg-white p-4 shadow-[3px_3px_0_#262330] md:p-6"><h2 className="font-extrabold">{block.title}</h2><p lang="ja" className="mt-3 whitespace-pre-line text-base leading-8 md:text-lg">{block.jp}</p>{block.vi ? <><button onClick={onToggleTranslation} className="mt-3 rounded-lg border border-neutral-300 px-3 py-2 text-sm font-semibold">{translations[blockIndex] ? "Ẩn bản dịch" : "Xem bản dịch"}</button>{translations[blockIndex] ? <p className="mt-2 text-sm leading-6 text-neutral-700">{block.vi}</p> : null}</> : null}{block.evidence ? <p className="mt-3 rounded-lg bg-[#d7f1e6] p-3 text-sm leading-6"><strong>Vị trí tìm ý:</strong> {block.evidence}</p> : null}</section>;
    case "table":
      return <section className="overflow-hidden rounded-2xl border-2 border-neutral-800 bg-white shadow-[3px_3px_0_#262330]"><h2 className="bg-[#e6dcff] px-4 py-3 font-extrabold">{block.title}</h2><div className="overflow-x-auto"><table className="w-full border-collapse text-left text-sm"><thead><tr>{block.headers.map((header, index) => <th key={index} className="border-b border-neutral-200 bg-neutral-50 px-3 py-2 font-extrabold">{header}</th>)}</tr></thead><tbody>{block.rows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, index) => <td key={index} className="border-b border-neutral-100 px-3 py-2 align-top leading-6">{cell}</td>)}</tr>)}</tbody></table></div></section>;
    case "image":
      return <figure className="overflow-hidden rounded-2xl border-2 border-neutral-800 bg-white p-2 shadow-[3px_3px_0_#262330]"><button type="button" onClick={() => onImage(block.src, block.alt)} className="block w-full cursor-zoom-in"><img src={assetUrl(block.src)} loading="lazy" alt={block.alt} className="max-h-[520px] w-full rounded-lg object-contain" /></button>{block.caption ? <figcaption className="px-2 py-2 text-sm text-neutral-600">{block.caption}</figcaption> : null}</figure>;
    case "exercise": {
      const selectedIndex = typeof selected === "number" ? selected : undefined;
      const answerMatches = checked && selectedIndex !== undefined && block.answerIndex !== undefined && selectedIndex === block.answerIndex;
      return <section className="rounded-2xl border-2 border-neutral-800 bg-[#e6dcff] p-4 shadow-[3px_3px_0_#262330] md:p-5"><div className="flex items-center gap-2"><span className="rounded-full border border-neutral-800 bg-white px-2 py-1 text-[10px] font-extrabold tracking-wide">THỬ SỨC</span><h2 className="font-extrabold">{block.prompt}</h2></div>{block.choices?.length ? <div role="radiogroup" className="mt-3 grid gap-2 sm:grid-cols-2">{block.choices.map((choice, index) => <button key={index} role="radio" aria-checked={selectedIndex === index} onClick={() => onSelect(index)} className={`min-h-11 rounded-xl border-2 px-3 py-2 text-left text-sm font-medium ${selectedIndex === index ? "border-neutral-900 bg-white ring-2 ring-rose-300" : "border-neutral-800/40 bg-white/70 hover:bg-white"}`}>{choice}</button>)}</div> : null}
        {block.selfCheck || block.answerIndex === undefined ? <div className="mt-3"><label className="block text-xs font-bold">Ghi lựa chọn / cách làm của bạn<input value={selfCheck ?? (typeof selected === "string" ? selected : "")} onChange={(event) => onSelfCheck(event.target.value)} placeholder="Ghi ngắn gọn hoặc từ khóa..." className="mt-1 min-h-10 w-full rounded-lg border border-neutral-300 bg-white px-3 text-sm outline-none focus:border-rose-400" /></label><p className="mt-2 text-xs text-neutral-600">Bài tự luyện; tài liệu nguồn không có đáp án đủ rõ để chấm tự động.</p><button disabled={!selfCheck?.trim()} onClick={() => { onSaveSelfCheck(); onCheck(); }} className="mt-2 min-h-10 rounded-xl bg-neutral-900 px-4 text-sm font-bold text-white disabled:opacity-40">Lưu và đối chiếu gợi ý</button></div> : null}
        {block.choices?.length && !block.selfCheck && block.answerIndex !== undefined ? <button disabled={selectedIndex === undefined} onClick={onCheck} className="mt-3 min-h-10 rounded-xl bg-neutral-900 px-4 text-sm font-bold text-white disabled:opacity-40">Kiểm tra đáp án</button> : null}
        {checked && block.answerIndex !== undefined ? <div role="status" className={`mt-3 rounded-xl p-3 text-sm leading-6 ${answerMatches ? "bg-emerald-100 text-emerald-900" : "bg-rose-100 text-rose-900"}`}><p className="font-extrabold">{answerMatches ? "Chính xác" : `Đáp án: ${block.choices?.[block.answerIndex] ?? ""}`}</p>{block.explanation ? <p className="mt-1">{block.explanation}</p> : null}{block.evidence ? <p className="mt-1"><strong>Căn cứ:</strong> {block.evidence}</p> : null}<button onClick={onRetry} className="mt-2 inline-flex items-center gap-1 text-xs font-bold underline"><RotateCcw size={13} /> Thử lại</button></div> : null}
        {checked && (block.selfCheck || block.answerIndex === undefined) ? <p role="status" className="mt-3 rounded-xl bg-white p-3 text-sm leading-6">{block.explanation || "Đối chiếu lựa chọn của bạn với phần gợi ý và tài liệu gốc."}{block.evidence ? <span className="mt-1 block"><strong>Căn cứ:</strong> {block.evidence}</span> : null}</p> : null}
      </section>;
    }
    case "media":
      return <section className="rounded-2xl border-2 border-neutral-800 bg-[#ffeb8a] p-4 shadow-[3px_3px_0_#262330]"><h2 className="font-extrabold">{block.title}</h2>{playingVideos[`${lessonId}:${blockIndex}`] ? <div className="mt-3 aspect-video overflow-hidden rounded-xl border-2 border-neutral-800 bg-black"><iframe src={`https://www.youtube-nocookie.com/embed/${encodeURIComponent(block.youtubeId)}?rel=0`} title={block.title} loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowFullScreen className="h-full w-full" /></div> : <button onClick={onPlayVideo} className="mt-3 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border-2 border-neutral-800 bg-white px-4 text-sm font-bold"><Play size={17} /> Tải và xem video YouTube</button>}<a href={`https://www.youtube.com/watch?v=${encodeURIComponent(block.youtubeId)}`} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold underline"><ExternalLink size={13} /> Mở YouTube nếu video không phát</a></section>;
  }
}

function blockTitle(block: ExamTipsBlock, index: number): string {
  if ("title" in block && block.title) return block.title;
  if (block.type === "comparison") return "Ví dụ và phân tích";
  if (block.type === "examples") return "Ví dụ";
  if (block.type === "exercise") return `Bài tập ${index + 1}`;
  if (block.type === "image") return block.caption || "Hình minh họa";
  if (block.type === "media") return block.title;
  return `Phần ${index + 1}`;
}
