import type { CSSProperties } from "react";
import type { JlptLevel } from "../../types/kanji.ts";

// Reuses the --level-n5-bg/-text etc. CSS custom properties style.css
// already defines (always loaded, on both builds) instead of duplicating
// the color scale in Tailwind -- one source of truth for "what color is
// N3" app-wide.
export function levelBadgeStyle(level: JlptLevel | string): CSSProperties {
  const key = level.toLowerCase();
  return {
    backgroundColor: `var(--level-${key}-bg)`,
    color: `var(--level-${key}-text)`,
  };
}

export function levelDotStyle(level: JlptLevel | string): CSSProperties {
  return { backgroundColor: `var(--level-${level.toLowerCase()}-text)` };
}

export function LevelDot({ level }: { level: JlptLevel | string }) {
  return <span className="mr-1 inline-block size-2 rounded-full align-middle" style={levelDotStyle(level)} />;
}
