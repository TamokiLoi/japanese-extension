import { useMemo, useRef, useState } from "react";
import { isRomaji, toHiragana, toKatakana } from "wanakana";
import { ALL_KANJI } from "../kanjiState.ts";
import { ALL_VOCAB } from "../vocabState.ts";
import { ALL_BUNPO } from "../bunpoState.ts";
import { ExpandTabButton } from "../TabMode.tsx";
import { LevelDot } from "../LevelDot.tsx";
import { useDebouncedValue } from "../useDebouncedValue.ts";
import { formatHanViet } from "../../hanVietFormat.ts";
import type { JlptLevel } from "../../types/kanji.ts";

const MAX_RESULTS = 40;
const SEARCH_KIND_ORDER: SearchResult["kind"][] = ["vocab", "kanji", "bunpo"];

// See src/web/screens/SearchScreen.tsx's copy of this pair for the full
// rationale -- kept duplicated rather than shared since this popup screen
// is its own independent implementation of the same feature.
function queryVariants(q: string): string[] {
  if (!q) return [];
  const options = isRomaji(q) ? { passRomaji: false } : { passRomaji: true };
  return [...new Set([q, toHiragana(q, options).toLowerCase(), toKatakana(q, options).toLowerCase()])];
}

function matchesAny(text: string, variants: string[]): boolean {
  return variants.some((variant) => text.includes(variant));
}

// See src/web/screens/SearchScreen.tsx's identical helper -- kun-yomi
// readings store okurigana markers ("ひと.つ", "ひと-") a search query never
// contains, so they're stripped before matching.
function matchesReading(reading: string, variants: string[]): boolean {
  return matchesAny(reading.replace(/[.\-]/g, ""), variants);
}

interface SearchResult {
  kind: "kanji" | "vocab" | "bunpo";
  id: string;
  level: JlptLevel;
  primary: string;
  secondary: string;
  meaning: string;
}

function searchKanji(q: string, variants: string[]): SearchResult[] {
  return ALL_KANJI.filter(
    (k) =>
      variants.some((variant) => variant.includes(k.character)) ||
      k.hanViet.some((h) => h.toLowerCase().includes(q)) ||
      k.meanings.vi.some((m) => m.toLowerCase().includes(q)) ||
      (k.meanings.viDraft ?? []).some((m) => m.toLowerCase().includes(q)) ||
      k.meanings.en.some((m) => m.toLowerCase().includes(q)) ||
      k.readings.on.some((r) => matchesReading(r, variants)) ||
      k.readings.kun.some((r) => matchesReading(r, variants)),
  ).map((k) => ({
    kind: "kanji" as const,
    id: k.id,
    level: k.level,
    primary: k.character,
    secondary: formatHanViet(k.hanViet, ""),
    meaning: k.meanings.vi[0] ?? k.meanings.viDraft?.[0] ?? k.meanings.en[0] ?? "",
  }));
}

// See src/web/screens/SearchScreen.tsx's copy for the full rationale --
// verbs store their dictionary form as `word`, so a conjugated query
// ("持ち帰ろう") needs to also check the precomputed conjugation table.
function matchesConjugation(v: (typeof ALL_VOCAB)[number], variants: string[]): boolean {
  if (!v.conjugations) return false;
  return Object.values(v.conjugations).some(
    (form) => typeof form === "string" && matchesAny(form.toLowerCase(), variants),
  );
}

function searchVocab(q: string, variants: string[]): SearchResult[] {
  return ALL_VOCAB.filter(
    (v) =>
      variants.some((variant) => v.word.toLowerCase().includes(variant)) ||
      matchesAny((v.reading ?? "").toLowerCase(), variants) ||
      v.meaningVi.toLowerCase().includes(q) ||
      v.hanViet.some((h) => h.toLowerCase().includes(q)) ||
      matchesConjugation(v, variants),
  ).map((v) => ({
    kind: "vocab" as const,
    id: v.id,
    level: v.level,
    primary: v.word,
    secondary: v.reading ?? "",
    meaning: v.meaningVi,
  }));
}

function searchBunpo(q: string, variants: string[]): SearchResult[] {
  return ALL_BUNPO.filter((g) => matchesAny(g.pattern.toLowerCase(), variants) || g.meaningVi.toLowerCase().includes(q)).map((g) => ({
    kind: "bunpo" as const,
    id: g.id,
    level: g.level,
    primary: g.pattern,
    secondary: "",
    meaning: g.meaningVi,
  }));
}

export function SearchScreen({
  onBack,
  onOpenKanji,
  onOpenVocab,
  onOpenBunpo,
}: {
  onBack: () => void;
  onOpenKanji: (kanjiId: string) => void;
  onOpenVocab: (vocabId: string) => void;
  onOpenBunpo: (bunpoId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [activeKinds, setActiveKinds] = useState<SearchResult["kind"][]>(["vocab"]);
  const debouncedQuery = useDebouncedValue(query, 150);
  const inputRef = useRef<HTMLInputElement>(null);

  const q = debouncedQuery.trim().toLowerCase();
  const variants = useMemo(() => queryVariants(q), [q]);
  const results = useMemo(() => {
    if (!q) return [];
    const all: SearchResult[] = [];
    for (const kind of SEARCH_KIND_ORDER) {
      if (!activeKinds.includes(kind)) continue;
      if (kind === "vocab") all.push(...searchVocab(q, variants));
      else if (kind === "kanji") all.push(...searchKanji(q, variants));
      else all.push(...searchBunpo(q, variants));
    }
    return all.slice(0, MAX_RESULTS);
  }, [q, variants, activeKinds]);

  function toggleKind(kind: SearchResult["kind"]) {
    setActiveKinds((prev) => {
      if (prev.includes(kind)) {
        const next = prev.filter((k) => k !== kind);
        return next.length > 0 ? next : prev; // keep at least 1 kind active
      }
      return [...prev, kind];
    });
  }

  return (
    <>
      <header className="toolbar">
        <button className="icon-btn" title="Về menu" onClick={onBack}>
          ←
        </button>
        <span className="counter">{q ? `${results.length} kết quả` : "Tra cứu"}</span>
        <ExpandTabButton screenHash="search" />
      </header>

      <section className="jlpt-filter-row">
        <input
          ref={inputRef}
          type="text"
          placeholder="Nhập chữ Hán, từ, Hán Việt, nghĩa..."
          value={query}
          autoFocus
          onChange={(e) => setQuery(e.target.value)}
        />
      </section>

      <section className="search-kind-filter-row">
        {SEARCH_KIND_ORDER.map((kind) => (
          <button
            key={kind}
            type="button"
            aria-pressed={activeKinds.includes(kind)}
            className={`search-kind-chip ${KIND_CLASSES[kind]} ${activeKinds.includes(kind) ? "search-kind-chip-active" : ""}`}
            onClick={() => toggleKind(kind)}
          >
            {KIND_LABELS[kind]}
          </button>
        ))}
      </section>

      <main className="jlpt-list">
        {!q ? (
          <p className="empty">
            Nhập để tìm trong {ALL_KANJI.length} Kanji, {ALL_VOCAB.length} từ vựng và {ALL_BUNPO.length} mẫu ngữ pháp.
          </p>
        ) : results.length === 0 ? (
          <p className="empty">Không tìm thấy gì.</p>
        ) : (
          results.map((r) => (
            <SearchResultRow
              key={`${r.kind}-${r.id}`}
              r={r}
              onOpenKanji={onOpenKanji}
              onOpenVocab={onOpenVocab}
              onOpenBunpo={onOpenBunpo}
            />
          ))
        )}
      </main>
    </>
  );
}

const KIND_LABELS: Record<SearchResult["kind"], string> = {
  kanji: "Kanji",
  vocab: "Từ vựng",
  bunpo: "Ngữ pháp",
};

const KIND_CLASSES: Record<SearchResult["kind"], string> = {
  kanji: "search-tag-kanji",
  vocab: "search-tag-vocab",
  bunpo: "search-tag-bunpo",
};

function SearchResultRow({
  r,
  onOpenKanji,
  onOpenVocab,
  onOpenBunpo,
}: {
  r: SearchResult;
  onOpenKanji: (id: string) => void;
  onOpenVocab: (id: string) => void;
  onOpenBunpo: (id: string) => void;
}) {
  function handleClick() {
    if (r.kind === "kanji") onOpenKanji(r.id);
    else if (r.kind === "vocab") onOpenVocab(r.id);
    else onOpenBunpo(r.id);
  }
  return (
    <div className="jlpt-entry search-result" onClick={handleClick}>
      <span className={`search-tag ${KIND_CLASSES[r.kind]}`}>{KIND_LABELS[r.kind]}</span>
      <span className="search-tag-level">
        <LevelDot level={r.level} />
        {r.level}
      </span>
      <div className="jlpt-entry-word">
        {r.primary}
        {r.secondary ? <span className="muted"> {r.secondary}</span> : null}
      </div>
      <div className="jlpt-entry-meaning">{r.meaning || "—"}</div>
    </div>
  );
}
