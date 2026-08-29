// React counterpart to levelColors.ts's levelDotHtml -- kept as a separate
// component (not a replacement in place) until every screen that still
// calls levelDotHtml has migrated to React, at which point levelColors.ts
// gets deleted per the migration plan.
import type { JlptLevel } from "../types/kanji.ts";

export function LevelDot({ level }: { level: JlptLevel }) {
  return <span className="level-dot" data-level={level}></span>;
}
