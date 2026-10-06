import bunpoTheoChuongRaw from "../../data/bunpo-n3-theo-chuong.json";
import type { BunpoDataset } from "../../types/bunpo.ts";
import type { BunpoMapGroup } from "./bunpoN5Map.ts";

const bunpoTheoChuong = bunpoTheoChuongRaw as unknown as BunpoDataset;

const N3_CHAPTER_COLORS = [
  "#e6a51b",
  "#e84c91",
  "#2596d2",
  "#8b5ac7",
  "#45a35b",
  "#e16d3d",
  "#2faaa2",
  "#d04f68",
  "#5676c8",
  "#ad7a25",
  "#bb63ba",
  "#4b9b76",
  "#d275a5",
  "#607d8b",
  "#7d67b0",
];

// N3's internal curriculum has explicit chapter and chapterTitle metadata.
// Use those fields as the map's groups and link every item through its exact
// card id; do not infer a category from a card's level or sources.
const groupsByChapter = new Map<number, BunpoMapGroup>();

for (const point of bunpoTheoChuong.grammarPoints) {
  if (point.level !== "N3" || point.chapter == null || !point.chapterTitle) continue;

  let group = groupsByChapter.get(point.chapter);
  if (!group) {
    group = {
      id: `n3-chapter-${point.chapter}`,
      label: `Chương ${point.chapter} · ${point.chapterTitle}`,
      shortLabel: `Ch. ${point.chapter}`,
      color: N3_CHAPTER_COLORS[(point.chapter - 1) % N3_CHAPTER_COLORS.length],
      items: [],
    };
    groupsByChapter.set(point.chapter, group);
  }

  group.items.push({
    id: point.id,
    label: point.pattern,
    hint: point.meaningVi,
    grammarId: point.id,
  });
}

export const BUNPO_N3_MAP_GROUPS = [...groupsByChapter.values()].sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
