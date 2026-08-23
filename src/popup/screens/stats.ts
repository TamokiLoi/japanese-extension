import type { Kanji, JlptLevel } from "../../types/kanji.ts";
import { ALL_KANJI, AVAILABLE_LEVELS } from "../kanjiState.ts";
import { ALL_VOCAB, AVAILABLE_SOURCES, SOURCE_LABELS, type VocabCard } from "../vocabState.ts";
import {
  loadProgressMap,
  bucketFor,
  countBuckets,
  type ProgressBucket,
  type ProgressMap,
} from "../progressState.ts";
import { expandToTabButtonHtml, wireExpandToTabButton } from "../tabMode.ts";
import { levelDotHtml } from "../levelColors.ts";
import { formatHanViet } from "../../hanVietFormat.ts";

type StatsContentType = "kanji" | "vocab";
type BucketFilter = ProgressBucket | "all";

interface StatsScreenState {
  contentType: StatsContentType;
  bucket: BucketFilter;
}

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

export function renderStatsScreen(app: HTMLElement, onBack: () => void, onOpenKanji: (kanjiId: string) => void, onOpenVocab: (vocabId: string) => void) {
  paint(app, { contentType: "kanji", bucket: "all" }, onBack, onOpenKanji, onOpenVocab);
}

async function paint(
  app: HTMLElement,
  state: StatsScreenState,
  onBack: () => void,
  onOpenKanji: (kanjiId: string) => void,
  onOpenVocab: (vocabId: string) => void,
) {
  const map = await loadProgressMap();
  const items: (Kanji | VocabCard)[] = state.contentType === "kanji" ? ALL_KANJI : ALL_VOCAB;
  const buckets = countBuckets(items, map);

  const groupBars =
    state.contentType === "kanji"
      ? AVAILABLE_LEVELS.map((level) => groupBarRow(levelDotHtml(level) + level, ALL_KANJI.filter((k) => k.level === level), map))
      : AVAILABLE_SOURCES.map((source) => groupBarRow(SOURCE_LABELS[source], ALL_VOCAB.filter((v) => v.source === source), map));

  const filtered = items
    .filter((item) => state.bucket === "all" || bucketFor(map[item.id]) === state.bucket)
    .sort((a, b) => (map[b.id]?.lastSeenAt ?? 0) - (map[a.id]?.lastSeenAt ?? 0));

  app.innerHTML = `
    <header class="toolbar">
      <button id="back" class="icon-btn" title="Về menu">←</button>
      <span class="counter">Thống kê</span>
      ${expandToTabButtonHtml()}
    </header>

    <section class="quiz-setup-group stats-content-toggle">
      <div class="quiz-radio-row">
        <label class="quiz-radio">
          <input type="radio" name="stats-content-type" value="kanji" ${state.contentType === "kanji" ? "checked" : ""} />
          Kanji
        </label>
        <label class="quiz-radio">
          <input type="radio" name="stats-content-type" value="vocab" ${state.contentType === "vocab" ? "checked" : ""} />
          Từ vựng
        </label>
      </div>
    </section>

    <section class="stat-cards">
      ${BUCKET_CARD_ORDER.map(
        (bucket) => `
        <button class="stat-card stat-card-${bucket} ${state.bucket === bucket ? "stat-card-active" : ""}" data-bucket="${bucket}">
          <span class="stat-card-count">${buckets[bucket]}</span>
          <span class="stat-card-label">${BUCKET_LABELS[bucket]}</span>
        </button>
      `,
      ).join("")}
    </section>

    <section class="stat-groups">${groupBars.join("")}</section>

    <section class="stat-list-header">
      <span>${state.bucket === "all" ? "Tất cả" : BUCKET_LABELS[state.bucket]} (${filtered.length})</span>
      ${state.bucket !== "all" ? `<button id="stat-clear-filter" class="stat-clear-filter">Xoá bộ lọc ✕</button>` : ""}
    </section>

    <div class="stat-list">
      ${
        filtered.length === 0
          ? `<p class="empty">Không có mục nào.</p>`
          : filtered
              .slice(0, MAX_LIST_ITEMS)
              .map((item) => statListItemHtml(item, map, state.contentType))
              .join("")
      }
      ${filtered.length > MAX_LIST_ITEMS ? `<p class="stat-list-more">…và ${filtered.length - MAX_LIST_ITEMS} mục khác.</p>` : ""}
    </div>
  `;

  document.getElementById("back")!.addEventListener("click", onBack);
  wireExpandToTabButton("stats");

  app.querySelectorAll<HTMLInputElement>('input[name="stats-content-type"]').forEach((input) => {
    input.addEventListener("change", () => {
      paint(app, { contentType: input.value as StatsContentType, bucket: "all" }, onBack, onOpenKanji, onOpenVocab);
    });
  });

  app.querySelectorAll<HTMLButtonElement>(".stat-card").forEach((btn) => {
    btn.addEventListener("click", () => {
      const bucket = btn.dataset.bucket as ProgressBucket;
      const nextBucket: BucketFilter = state.bucket === bucket ? "all" : bucket;
      paint(app, { ...state, bucket: nextBucket }, onBack, onOpenKanji, onOpenVocab);
    });
  });

  document.getElementById("stat-clear-filter")?.addEventListener("click", () => {
    paint(app, { ...state, bucket: "all" }, onBack, onOpenKanji, onOpenVocab);
  });

  app.querySelectorAll<HTMLButtonElement>(".stat-list-item").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.id!;
      if (state.contentType === "kanji") onOpenKanji(id);
      else onOpenVocab(id);
    });
  });
}

function groupBarRow(label: string, groupItems: (Kanji | VocabCard)[], map: ProgressMap): string {
  const total = groupItems.length;
  const mastered = groupItems.filter((item) => bucketFor(map[item.id]) === "mastered").length;
  const pct = total > 0 ? Math.round((mastered / total) * 100) : 0;
  return `
    <div class="stat-group-row">
      <span class="stat-group-label">${label}</span>
      <span class="stat-group-bar-wrap"><span class="stat-group-bar" style="width:${pct}%"></span></span>
      <span class="stat-group-pct">${pct}%</span>
      <span class="stat-group-num">${mastered}/${total}</span>
    </div>
  `;
}

function statListItemHtml(item: Kanji | VocabCard, map: ProgressMap, kind: StatsContentType): string {
  const progress = map[item.id];
  const bucket = bucketFor(progress);
  const statLine = progress
    ? `${progress.correctCount} đúng · ${progress.wrongCount} sai`
    : "Chưa làm quiz lần nào";

  if (kind === "kanji") {
    const k = item as Kanji;
    const meaning = k.meanings.vi[0] ?? k.meanings.viDraft?.[0] ?? k.meanings.en[0] ?? "";
    return `
      <button class="stat-list-item stat-list-item-${bucket}" data-id="${k.id}">
        <span class="stat-list-item-char">${k.character}</span>
        <span class="stat-list-item-body">
          <span class="stat-list-item-title">${formatHanViet(k.hanViet)}<span class="muted"> · ${meaning}</span></span>
          <span class="stat-list-item-stat">${statLine}</span>
        </span>
        ${levelDotHtml(k.level)}
      </button>
    `;
  }

  const v = item as VocabCard;
  return `
    <button class="stat-list-item stat-list-item-${bucket}" data-id="${v.id}">
      <span class="stat-list-item-char">${v.word}</span>
      <span class="stat-list-item-body">
        <span class="stat-list-item-title">${v.reading ? `${v.reading} · ` : ""}${v.meaningVi}</span>
        <span class="stat-list-item-stat">${statLine}</span>
      </span>
      ${levelDotHtml(v.level)}
    </button>
  `;
}
