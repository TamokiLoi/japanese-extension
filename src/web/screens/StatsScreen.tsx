import { useEffect, useMemo, useState } from "react";
import type { Kanji } from "../../types/kanji.ts";
import type { Screen } from "../../popup/App.tsx";
import { ALL_KANJI, AVAILABLE_LEVELS } from "../../popup/kanjiState.ts";
import { ALL_VOCAB, AVAILABLE_SOURCES, SOURCE_LABELS, type VocabCard } from "../../popup/vocabState.ts";
import { loadProgressMap, bucketFor, countBuckets, type ProgressBucket, type ProgressMap } from "../../popup/progressState.ts";
import { formatHanViet } from "../../hanVietFormat.ts";
import { Card } from "../components/ui/card.tsx";
import { Progress } from "../components/ui/progress.tsx";
import { LevelDot, levelBadgeStyle } from "../lib/levelColors.tsx";

type StatsContentType = "kanji" | "vocab";
type BucketFilter = ProgressBucket | "all";

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
const BUCKET_ITEM_BORDER: Record<ProgressBucket, string> = {
  mastered: "border-l-emerald-400",
  learning: "border-l-amber-400",
  flagged: "border-l-rose-400",
  new: "border-l-neutral-300",
};

const MAX_LIST_ITEMS = 150;

export function StatsScreen({ onNavigate }: { onNavigate: (screen: Screen, id?: string) => void }) {
  const [contentType, setContentType] = useState<StatsContentType>("kanji");
  const [bucket, setBucket] = useState<BucketFilter>("all");
  const [map, setMap] = useState<ProgressMap | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadProgressMap().then((m) => {
      if (!cancelled) setMap(m);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const items: (Kanji | VocabCard)[] = contentType === "kanji" ? ALL_KANJI : ALL_VOCAB;
  const buckets = useMemo(() => (map ? countBuckets(items, map) : null), [items, map]);

  const groupBars = useMemo(() => {
    if (!map) return [];
    return contentType === "kanji"
      ? AVAILABLE_LEVELS.map((level) => ({
          key: level,
          label: level as string,
          isKanjiLevel: true as const,
          groupItems: ALL_KANJI.filter((k) => k.level === level),
        }))
      : AVAILABLE_SOURCES.map((source) => ({
          key: source,
          label: SOURCE_LABELS[source],
          isKanjiLevel: false as const,
          groupItems: ALL_VOCAB.filter((v) => v.source === source),
        }));
  }, [contentType, map]);

  const filtered = useMemo(() => {
    if (!map) return [];
    return items
      .filter((item) => bucket === "all" || bucketFor(map[item.id]) === bucket)
      .sort((a, b) => (map[b.id]?.lastSeenAt ?? 0) - (map[a.id]?.lastSeenAt ?? 0));
  }, [items, map, bucket]);

  if (!map || !buckets) return <div className="p-6 text-neutral-400">Đang tải...</div>;

  return (
    <div className="mx-auto max-w-4xl px-2.5 py-2 md:px-8 md:py-6">
      <h1 className="text-2xl font-bold text-neutral-800">Thống kê</h1>

      <div className="mt-4 flex gap-2">
        {(["kanji", "vocab"] as StatsContentType[]).map((ct) => (
          <button
            key={ct}
            onClick={() => {
              setContentType(ct);
              setBucket("all");
            }}
            className={`rounded-full border px-4 py-1.5 text-sm font-medium ${
              contentType === ct ? "border-rose-300 bg-rose-50 text-rose-600" : "border-neutral-200 text-neutral-600"
            }`}
          >
            {ct === "kanji" ? "Kanji" : "Từ vựng"}
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

      <Card className="mt-6 gap-3 p-5">
        {groupBars.map((g) => {
          const total = g.groupItems.length;
          const mastered = g.groupItems.filter((item) => bucketFor(map[item.id]) === "mastered").length;
          const pct = total > 0 ? Math.round((mastered / total) * 100) : 0;
          return (
            <div key={g.key} className="flex items-center gap-3 text-sm">
              <span className="flex w-28 shrink-0 items-center gap-1 font-medium text-neutral-600">
                {g.isKanjiLevel ? <LevelDot level={g.label} /> : null}
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
            .map((item) => (
              <StatListItem
                key={item.id}
                item={item}
                map={map}
                kind={contentType}
                onOpen={() => onNavigate(contentType === "kanji" ? "kanji" : "vocab", item.id)}
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

function StatListItem({
  item,
  map,
  kind,
  onOpen,
}: {
  item: Kanji | VocabCard;
  map: ProgressMap;
  kind: StatsContentType;
  onOpen: () => void;
}) {
  const progress = map[item.id];
  const bucket = bucketFor(progress);
  const statLine = progress ? `${progress.correctCount} đúng · ${progress.wrongCount} sai` : "Chưa làm quiz lần nào";

  const char = kind === "kanji" ? (item as Kanji).character : (item as VocabCard).word;
  const level = item.level;
  let title: string;
  if (kind === "kanji") {
    const k = item as Kanji;
    const meaning = k.meanings.vi[0] ?? k.meanings.viDraft?.[0] ?? k.meanings.en[0] ?? "";
    title = `${formatHanViet(k.hanViet)} · ${meaning}`;
  } else {
    const v = item as VocabCard;
    title = `${v.reading ? `${v.reading} · ` : ""}${v.meaningVi}`;
  }

  return (
    <button
      onClick={onOpen}
      className={`flex items-center gap-3 rounded-lg border-l-4 bg-white px-3 py-2 text-left hover:bg-neutral-50 ${BUCKET_ITEM_BORDER[bucket]}`}
    >
      <span className="w-14 shrink-0 truncate text-lg font-semibold text-neutral-800">{char}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm text-neutral-700">{title}</span>
        <span className="block truncate text-xs text-neutral-400">{statLine}</span>
      </span>
      <span className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold" style={levelBadgeStyle(level)}>
        {level}
      </span>
    </button>
  );
}
