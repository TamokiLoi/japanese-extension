import { useEffect, useMemo, useState } from "react";
import { BarChart3 } from "lucide-react";
import type { JlptLevel } from "../../types/kanji.ts";
import type { ReadingQuestionType } from "../../types/reading.ts";
import type { Screen } from "../../popup/App.tsx";
import { ALL_KANJI, AVAILABLE_LEVELS } from "../../popup/kanjiState.ts";
import { ALL_VOCAB, AVAILABLE_SOURCES, SOURCE_LABELS } from "../../popup/vocabState.ts";
import { ALL_BUNPO, AVAILABLE_LEVELS as BUNPO_LEVELS } from "../../popup/bunpoState.ts";
import { ALL_READING_QUESTIONS, findReadingById } from "../../popup/readingState.ts";
import {
  ALL_QUIZBOOK,
  AVAILABLE_BOOKS as QUIZBOOK_BOOKS,
  BOOK_LABELS as QUIZBOOK_BOOK_LABELS,
  CATEGORY_LABELS,
} from "../../popup/quizBookState.ts";
import { ALL_LISTENING, TASK_TYPE_LABELS, AVAILABLE_TASK_TYPES } from "../../popup/listeningState.ts";
import { dictationProgressId } from "../../popup/dictationState.ts";
import {
  loadProgressMap,
  bucketFor,
  countBuckets,
  BUCKET_ITEM_BORDER,
  type ProgressBucket,
  type ProgressMap,
} from "../../popup/progressState.ts";
import { formatHanViet } from "../../hanVietFormat.ts";
import { Card } from "../components/ui/card.tsx";
import { Progress } from "../components/ui/progress.tsx";
import { LevelDot, levelBadgeStyle } from "../lib/levelColors.tsx";

type StatsContentType = "kanji" | "vocab" | "bunpo" | "reading" | "quizbook" | "listening" | "dictation";
type BucketFilter = ProgressBucket | "all";

const CONTENT_TYPE_LABELS: Record<StatsContentType, string> = {
  kanji: "Kanji",
  vocab: "Từ vựng",
  bunpo: "Ngữ pháp",
  reading: "Đọc hiểu",
  quizbook: "Luyện đề",
  listening: "Luyện nghe",
  dictation: "Nghe chép chính tả",
};
const CONTENT_TYPE_ORDER: StatsContentType[] = ["kanji", "vocab", "bunpo", "reading", "quizbook", "listening", "dictation"];

const QUESTION_TYPE_LABELS: Record<ReadingQuestionType, string> = {
  detail: "Chi tiết",
  "main-idea": "Ý chính",
  inference: "Suy luận",
  "reference-vocab": "Từ/chỉ định trong bài",
  "info-search": "Tìm kiếm thông tin",
};
const QUESTION_TYPE_ORDER: ReadingQuestionType[] = ["detail", "main-idea", "inference", "reference-vocab", "info-search"];

// One normalized shape every content kind renders/filters/groups through --
// avoids a Kanji|VocabCard|BunpoGrammarPoint|... union leaking into every
// function below just to read a char/title/level out of 5 differently
// shaped source records.
interface StatEntry {
  id: string;
  level: JlptLevel;
  char: string;
  title: string;
  // Where clicking this entry should navigate -- differs from `id` only for
  // Reading, where progress is tracked per-question but there's no
  // per-question screen to open, just the passage it belongs to.
  navScreen: Screen;
  navId: string;
}

function buildEntries(contentType: StatsContentType): StatEntry[] {
  if (contentType === "kanji") {
    return ALL_KANJI.map((k) => ({
      id: k.id,
      level: k.level,
      char: k.character,
      title: `${formatHanViet(k.hanViet)} · ${k.meanings.vi[0] ?? k.meanings.viDraft?.[0] ?? k.meanings.en[0] ?? ""}`,
      navScreen: "kanji",
      navId: k.id,
    }));
  }
  if (contentType === "vocab") {
    return ALL_VOCAB.map((v) => ({
      id: v.id,
      level: v.level,
      char: v.word,
      title: `${v.reading ? `${v.reading} · ` : ""}${v.meaningVi}`,
      navScreen: "vocab",
      navId: v.id,
    }));
  }
  if (contentType === "bunpo") {
    return ALL_BUNPO.map((g) => ({
      id: g.id,
      level: g.level,
      char: g.pattern,
      title: g.meaningVi,
      navScreen: "bunpo",
      navId: g.id,
    }));
  }
  if (contentType === "reading") {
    return ALL_READING_QUESTIONS.map((q) => {
      const passage = findReadingById(q.passageId);
      const question = passage?.questions[q.questionIndex];
      return {
        id: q.id,
        level: q.level,
        char: q.questionType ? QUESTION_TYPE_LABELS[q.questionType] : `Câu ${q.questionIndex + 1}`,
        title: passage ? `${passage.title}${question ? ` — ${question.question}` : ""}` : q.id,
        navScreen: "reading",
        navId: q.passageId,
      };
    });
  }
  if (contentType === "quizbook") {
    return ALL_QUIZBOOK.map((q) => ({
      id: q.id,
      level: q.level,
      char: CATEGORY_LABELS[q.category],
      title: q.question || "(Thiếu đề bài do lỗi trích xuất dữ liệu gốc)",
      navScreen: "quizBook",
      navId: q.id,
    }));
  }
  if (contentType === "listening") {
    return ALL_LISTENING.map((q) => ({
      id: q.id,
      level: q.level,
      char: TASK_TYPE_LABELS[q.taskType].split(" -- ")[0],
      title: q.scenario || q.question,
      navScreen: "listening",
      navId: q.id,
    }));
  }
  // "dictation": same underlying pool as "listening", but a separately
  // tracked practice mode (see dictationProgressId) -- id is the prefixed
  // progress key, navId is the real question id ListeningHubScreen needs to
  // jump to.
  return ALL_LISTENING.map((q) => ({
    id: dictationProgressId(q.id),
    level: q.level,
    char: TASK_TYPE_LABELS[q.taskType].split(" -- ")[0],
    title: q.scenario || q.question,
    navScreen: "dictation",
    navId: q.id,
  }));
}

interface GroupBar {
  key: string;
  label: string;
  isLevel: boolean;
  ids: string[];
}

function buildGroupBars(contentType: StatsContentType): GroupBar[] {
  if (contentType === "kanji") {
    return AVAILABLE_LEVELS.map((level) => ({
      key: level,
      label: level as string,
      isLevel: true,
      ids: ALL_KANJI.filter((k) => k.level === level).map((k) => k.id),
    }));
  }
  if (contentType === "vocab") {
    return AVAILABLE_SOURCES.map((source) => ({
      key: source,
      label: SOURCE_LABELS[source],
      isLevel: false,
      ids: ALL_VOCAB.filter((v) => v.source === source).map((v) => v.id),
    }));
  }
  if (contentType === "bunpo") {
    return BUNPO_LEVELS.map((level) => ({
      key: level,
      label: level as string,
      isLevel: true,
      ids: ALL_BUNPO.filter((g) => g.level === level).map((g) => g.id),
    }));
  }
  if (contentType === "reading") {
    // Grouped by question type (chi tiết/ý chính/suy luận/...) rather than
    // by book -- "which dạng câu do I keep missing" is the signal worth
    // surfacing for exam prep; book-of-origin isn't actionable the same way.
    return QUESTION_TYPE_ORDER.filter((type) => ALL_READING_QUESTIONS.some((q) => q.questionType === type)).map((type) => ({
      key: type,
      label: QUESTION_TYPE_LABELS[type],
      isLevel: false,
      ids: ALL_READING_QUESTIONS.filter((q) => q.questionType === type).map((q) => q.id),
    }));
  }
  if (contentType === "quizbook") {
    return QUIZBOOK_BOOKS.map((book) => ({
      key: book,
      label: QUIZBOOK_BOOK_LABELS[book],
      isLevel: false,
      ids: ALL_QUIZBOOK.filter((q) => q.book === book).map((q) => q.id),
    }));
  }
  // "listening" and "dictation": grouped by dạng câu (kadai/point/gaiyou/
  // sokuji) -- which format someone struggles with is the actionable signal
  // here, same reasoning as Reading's group-by-question-type above.
  const idOf = contentType === "dictation" ? (id: string) => dictationProgressId(id) : (id: string) => id;
  return AVAILABLE_TASK_TYPES.map((t) => ({
    key: t,
    label: TASK_TYPE_LABELS[t].split(" -- ")[0],
    isLevel: false,
    ids: ALL_LISTENING.filter((q) => q.taskType === t).map((q) => idOf(q.id)),
  }));
}

const BUCKET_LABELS: Record<ProgressBucket, string> = {
  mastered: "Đã thuộc",
  learning: "Đang học",
  flagged: "Cần ôn lại",
  new: "Chưa học",
};
const BUCKET_CARD_ORDER: ProgressBucket[] = ["mastered", "learning", "flagged", "new"];
const BUCKET_CARD_COLOR: Record<ProgressBucket, string> = {
  mastered: "border-emerald-200 bg-emerald-50 text-emerald-700",
  learning: "border-amber-200 bg-amber-50 text-amber-700",
  flagged: "border-rose-200 bg-rose-50 text-rose-700",
  new: "border-neutral-200 bg-neutral-50 text-neutral-500",
};
const MAX_LIST_ITEMS = 150;

export function StatsScreen({
  onNavigate,
  targetId,
}: {
  onNavigate: (screen: Screen, id?: string) => void;
  // Reused as an entry-point preset rather than an item id: e.g. Reading's
  // "Câu sai cần ôn lại" button links here with targetId="reading" to land
  // straight on the reading tab, pre-filtered to "cần ôn lại" instead of the
  // default "kanji"/"all" view.
  targetId?: string;
}) {
  const [contentType, setContentType] = useState<StatsContentType>("kanji");
  const [bucket, setBucket] = useState<BucketFilter>("all");
  const [map, setMap] = useState<ProgressMap | null>(null);
  const bucketTargetId = targetId?.startsWith("bucket:") ? (targetId.slice(7) as ProgressBucket) : undefined;

  useEffect(() => {
    let cancelled = false;
    loadProgressMap().then((m) => {
      if (!cancelled) setMap(m);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!targetId) return;
    // Home's progress tiles ("Đã thuộc"/"Đang học"/...) span every content
    // type at once, so they link here as "bucket:<b>" to preset just the
    // bucket filter -- content type stays whatever it already was (default
    // "kanji") since there's no single combined list to land on.
    if (bucketTargetId) {
      setBucket(bucketTargetId);
      return;
    }
    if (!CONTENT_TYPE_ORDER.includes(targetId as StatsContentType)) return;
    setContentType(targetId as StatsContentType);
    setBucket("flagged");
  }, [targetId, bucketTargetId]);

  const entries = useMemo(() => buildEntries(contentType), [contentType]);
  const buckets = useMemo(() => (map ? countBuckets(entries, map) : null), [entries, map]);
  const groupBars = useMemo(() => buildGroupBars(contentType), [contentType]);

  const filtered = useMemo(() => {
    if (!map) return [];
    return entries
      .filter((entry) => bucket === "all" || bucketFor(map[entry.id]) === bucket)
      .sort((a, b) => (map[b.id]?.lastSeenAt ?? 0) - (map[a.id]?.lastSeenAt ?? 0));
  }, [entries, map, bucket]);

  if (!map || !buckets) return <div className="p-6 text-neutral-400">Đang tải...</div>;

  return (
    <div className="mx-auto max-w-4xl px-2.5 py-2 md:px-8 md:py-6">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px]" style={{ background: "#dbeafe" }}>
          <BarChart3 size={22} className="text-blue-600" />
        </div>
        <h1 className="text-2xl font-bold text-neutral-800">Thống kê</h1>
      </div>

      <div className="mt-4 flex flex-nowrap gap-2 overflow-x-auto pb-1">
        {CONTENT_TYPE_ORDER.map((ct) => (
          <button
            key={ct}
            onClick={() => {
              setContentType(ct);
              setBucket("all");
            }}
            className={`shrink-0 rounded-full border px-4 py-1.5 text-sm font-medium whitespace-nowrap ${
              contentType === ct ? "border-rose-300 bg-rose-50 text-rose-600" : "border-neutral-200 text-neutral-600"
            }`}
          >
            {CONTENT_TYPE_LABELS[ct]}
          </button>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        {BUCKET_CARD_ORDER.map((b) => (
          <button
            key={b}
            onClick={() => setBucket((prev) => (prev === b ? "all" : b))}
            className={`rounded-2xl border p-4 text-left transition-transform ${BUCKET_CARD_COLOR[b]} ${bucket === b ? "ring-2 ring-offset-1 ring-current" : ""}`}
          >
            <div className="text-2xl font-bold">{buckets[b]}</div>
            <div className="text-xs font-semibold">{BUCKET_LABELS[b]}</div>
          </button>
        ))}
      </div>

      <Card className="mt-6 gap-3 rounded-2xl border-neutral-200 p-5 ring-0">
        {groupBars.map((g) => {
          const total = g.ids.length;
          const mastered = g.ids.filter((id) => bucketFor(map[id]) === "mastered").length;
          const pct = total > 0 ? Math.round((mastered / total) * 100) : 0;
          return (
            <div key={g.key} className="flex items-center gap-3 text-sm">
              <span className="flex w-28 shrink-0 items-center gap-1 font-medium text-neutral-600">
                {g.isLevel ? <LevelDot level={g.label} /> : null}
                <span className="truncate">{g.label}</span>
              </span>
              <Progress value={pct} className="flex-1" />
              <span className="w-10 shrink-0 text-right text-xs font-semibold text-neutral-500">{pct}%</span>
              <span className="w-16 shrink-0 text-right text-xs text-neutral-400">
                {mastered}/{total}
              </span>
            </div>
          );
        })}
      </Card>

      <div className="mt-6 flex items-center justify-between">
        <span className="text-sm font-semibold text-neutral-600">
          {bucket === "all" ? "Tất cả" : BUCKET_LABELS[bucket]} ({filtered.length})
        </span>
        {bucket !== "all" ? (
          <button onClick={() => setBucket("all")} className="text-xs font-medium text-neutral-400 hover:text-neutral-600">
            Xoá bộ lọc ✕
          </button>
        ) : null}
      </div>

      <div className="mt-3 flex flex-col gap-1.5">
        {filtered.length === 0 ? (
          <p className="text-neutral-400">Không có mục nào.</p>
        ) : (
          filtered
            .slice(0, MAX_LIST_ITEMS)
            .map((entry) => (
              <StatListItem
                key={entry.id}
                entry={entry}
                map={map}
                onOpen={() => onNavigate(entry.navScreen, entry.navId)}
              />
            ))
        )}
        {filtered.length > MAX_LIST_ITEMS ? (
          <p className="mt-2 text-center text-xs text-neutral-400">…và {filtered.length - MAX_LIST_ITEMS} mục khác.</p>
        ) : null}
      </div>
    </div>
  );
}

function StatListItem({ entry, map, onOpen }: { entry: StatEntry; map: ProgressMap; onOpen: () => void }) {
  const progress = map[entry.id];
  const bucket = bucketFor(progress);
  const statLine = progress ? `${progress.correctCount} đúng · ${progress.wrongCount} sai` : "Chưa làm quiz lần nào";

  return (
    <button
      onClick={onOpen}
      className={`flex items-center gap-3 rounded-2xl border border-l-4 border-neutral-200 bg-white px-4 py-3.5 text-left hover:border-rose-200 hover:bg-rose-50/40 ${BUCKET_ITEM_BORDER[bucket]}`}
    >
      <span className="w-14 shrink-0 truncate text-lg font-semibold text-neutral-800">{entry.char}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm text-neutral-700">{entry.title}</span>
        <span className="block truncate text-xs text-neutral-400">{statLine}</span>
      </span>
      <span className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold" style={levelBadgeStyle(entry.level)}>
        {entry.level}
      </span>
    </button>
  );
}
