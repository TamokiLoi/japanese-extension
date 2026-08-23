// Small shared helper so the N5→N1 color coding (cool = easy, warm = hard)
// stays visually consistent everywhere a level shows up: the level badge on
// Kanji/Vocab cards, the level checkboxes on the Kanji screen, and search
// results. Colors themselves live in style.css as CSS custom properties
// (--level-n5-text etc.) keyed off a `data-level` attribute -- this module
// just emits that attribute/markup consistently.
import type { JlptLevel } from "../types/kanji.ts";

export function levelDotHtml(level: JlptLevel): string {
  return `<span class="level-dot" data-level="${level}"></span>`;
}
