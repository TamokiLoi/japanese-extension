import { useEffect, useMemo, useState } from "react";
import type { Kanji } from "../../types/kanji.ts";
import { ALL_KANJI, AVAILABLE_LEVELS } from "../kanjiState.ts";
import { ALL_VOCAB, AVAILABLE_SOURCES, SOURCE_LABELS, type VocabCard } from "../vocabState.ts";
import { loadProgressMap, bucketFor, countBuckets, type ProgressBucket, type ProgressMap } from "../progressState.ts";
import { ExpandTabButton } from "../TabMode.tsx";
import { LevelDot } from "../LevelDot.tsx";
import { formatHanViet } from "../../hanVietFormat.ts";

type StatsContentType = "kanji" | "vocab";
type BucketFilter = ProgressBucket | "all";

const BUCKET_LABELS: Record<ProgressBucket, string> = {
  mastered: "Đã thuộc",
  learning: "Đang học",
  flagged: "Cần ôn lại",
  new: "Chưa học",
};

// Order the summary cards appear in -- worst-first so "cần ôn lại" catches
// the eye right after the overview, ahead of the (usually huge) "chưa học".
const BUCKET_CARD_ORDER: ProgressBucket[] = ["mastered", "learning", "flagged", "new"];

const MAX_LIST_ITEMS = 150;

export function StatsScreen({
  onBack,
  onOpenKanji,
  onOpenVocab,
}: {
  onBack: () => void;
  onOpenKanji: (kanjiId: string) => void;
  onOpenVocab: (vocabId: string) => void;
}) {
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
          label: level,
          isKanjiLevel: true as const,
          level,
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

  if (!map || !buckets) {
    return (
      <>
        <header className="toolbar">
          <button className="icon-btn" title="Về menu" onClick={onBack}>
            ←
          </button>
          <span className="counter">Thống kê</span>
          <ExpandTabButton screenHash="stats" />
        </header>
      </>
    );
  }

  return (
    <>
      <header className="toolbar">
        <button className="icon-btn" title="Về menu" onClick={onBack}>
          ←
        </button>
        <span className="counter">Thống kê</span>
        <ExpandTabButton screenHash="stats" />
      </header>

      <section className="quiz-setup-group stats-content-toggle">
        <div className="quiz-radio-row">
          <label className="quiz-radio">
            <input
              type="radio"
              name="stats-content-type"
              checked={contentType === "kanji"}
              onChange={() => {
                setContentType("kanji");
                setBucket("all");
              }}
            />
            Kanji
          </label>
          <label className="quiz-radio">
            <input
              type="radio"
              name="stats-content-type"
              checked={contentType === "vocab"}
              onChange={() => {
                setContentType("vocab");
                setBucket("all");
              }}
            />
            Từ vựng
          </label>
        </div>
      </section>

      <section className="stat-cards">
        {BUCKET_CARD_ORDER.map((b) => (
          <button
            key={b}
            className={`stat-card stat-card-${b} ${bucket === b ? "stat-card-active" : ""}`}
            onClick={() => setBucket((prev) => (prev === b ? "all" : b))}
          >
            <span className="stat-card-count">{buckets[b]}</span>
            <span className="stat-card-label">{BUCKET_LABELS[b]}</span>
          </button>
        ))}
      </section>

      <section className="stat-groups">
        {groupBars.map((g) => (
          <GroupBarRow key={g.key} label={g.label} isKanjiLevel={g.isKanjiLevel} groupItems={g.groupItems} map={map} />
        ))}
      </section>

      <section className="stat-list-header">
        <span>
          {bucket === "all" ? "Tất cả" : BUCKET_LABELS[bucket]} ({filtered.length})
        </span>
        {bucket !== "all" ? (
          <button className="stat-clear-filter" onClick={() => setBucket("all")}>
            Xoá bộ lọc ✕
          </button>
        ) : null}
      </section>

      <div className="stat-list">
        {filtered.length === 0 ? (
          <p className="empty">Không có mục nào.</p>
        ) : (
          filtered
            .slice(0, MAX_LIST_ITEMS)
            .map((item) => (
              <StatListItem
                key={item.id}
                item={item}
                map={map}
                kind={contentType}
                onOpen={() => (contentType === "kanji" ? onOpenKanji(item.id) : onOpenVocab(item.id))}
              />
            ))
        )}
        {filtered.length > MAX_LIST_ITEMS ? (
          <p className="stat-list-more">…và {filtered.length - MAX_LIST_ITEMS} mục khác.</p>
        ) : null}
      </div>
    </>
  );
}

function GroupBarRow({
  label,
  isKanjiLevel,
  groupItems,
  map,
}: {
  label: string;
  isKanjiLevel: boolean;
  groupItems: (Kanji | VocabCard)[];
  map: ProgressMap;
}) {
  const total = groupItems.length;
  const mastered = groupItems.filter((item) => bucketFor(map[item.id]) === "mastered").length;
  const pct = total > 0 ? Math.round((mastered / total) * 100) : 0;
  return (
    <div className="stat-group-row">
      <span className="stat-group-label">
        {isKanjiLevel ? <LevelDot level={label as Kanji["level"]} /> : null}
        {label}
      </span>
      <span className="stat-group-bar-wrap">
        <span className="stat-group-bar" style={{ width: `${pct}%` }}></span>
      </span>
      <span className="stat-group-pct">{pct}%</span>
      <span className="stat-group-num">
        {mastered}/{total}
      </span>
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

  if (kind === "kanji") {
    const k = item as Kanji;
    const meaning = k.meanings.vi[0] ?? k.meanings.viDraft?.[0] ?? k.meanings.en[0] ?? "";
    return (
      <button className={`stat-list-item stat-list-item-${bucket}`} onClick={onOpen}>
        <span className="stat-list-item-char">{k.character}</span>
        <span className="stat-list-item-body">
          <span className="stat-list-item-title">
            {formatHanViet(k.hanViet)}
            <span className="muted"> · {meaning}</span>
          </span>
          <span className="stat-list-item-stat">{statLine}</span>
        </span>
        <LevelDot level={k.level} />
      </button>
    );
  }

  const v = item as VocabCard;
  return (
    <button className={`stat-list-item stat-list-item-${bucket}`} onClick={onOpen}>
      <span className="stat-list-item-char">{v.word}</span>
      <span className="stat-list-item-body">
        <span className="stat-list-item-title">
          {v.reading ? `${v.reading} · ` : ""}
          {v.meaningVi}
        </span>
        <span className="stat-list-item-stat">{statLine}</span>
      </span>
      <LevelDot level={v.level} />
    </button>
  );
}
