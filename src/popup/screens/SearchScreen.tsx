import { useMemo, useRef, useState } from "react";
import { isRomaji, toHiragana } from "wanakana";
import { ALL_KANJI } from "../kanjiState.ts";
import { ALL_VOCAB } from "../vocabState.ts";
import { ALL_BUNPO } from "../bunpoState.ts";
import { ExpandTabButton } from "../TabMode.tsx";
import { LevelDot } from "../LevelDot.tsx";
import { useDebouncedValue } from "../useDebouncedValue.ts";
import { formatHanViet } from "../../hanVietFormat.ts";
import type { JlptLevel } from "../../types/kanji.ts";

const MAX_RESULTS = 40;

// See src/web/screens/SearchScreen.tsx's copy of this pair for the full
// rationale -- kept duplicated rather than shared since this popup screen
// is its own independent implementation of the same feature.
function romajiVariant(q: string): string | null {
  if (!q || !isRomaji(q)) return null;
  const kana = toHiragana(q, { passRomaji: false });
  return kana !== q ? kana : null;
}

function matchesAny(text: string, q: string, qKana: string | null): boolean {
  return text.includes(q) || (qKana !== null && text.includes(qKana));
}

interface SearchResult {
  kind: "kanji" | "vocab" | "bunpo";
  id: string;
  level: JlptLevel;
  primary: string;
  secondary: string;
  meaning: string;
}

function searchKanji(q: string, qKana: string | null): SearchResult[] {
  return ALL_KANJI.filter(
    (k) =>
      q.includes(k.character) ||
      k.hanViet.some((h) => h.toLowerCase().includes(q)) ||
      k.meanings.vi.some((m) => m.toLowerCase().includes(q)) ||
      (k.meanings.viDraft ?? []).some((m) => m.toLowerCase().includes(q)) ||
      k.meanings.en.some((m) => m.toLowerCase().includes(q)) ||
      k.readings.on.some((r) => matchesAny(r, q, qKana)) ||
      k.readings.kun.some((r) => matchesAny(r, q, qKana)),
  ).map((k) => ({
    kind: "kanji" as const,
    id: k.id,
    level: k.level,
    primary: k.character,
    secondary: formatHanViet(k.hanViet, ""),
    meaning: k.meanings.vi[0] ?? k.meanings.viDraft?.[0] ?? k.meanings.en[0] ?? "",
  }));
}

function searchVocab(q: string, qKana: string | null): SearchResult[] {
  return ALL_VOCAB.filter(
    (v) =>
      v.word.toLowerCase().includes(q) ||
      matchesAny((v.reading ?? "").toLowerCase(), q, qKana) ||
      v.meaningVi.toLowerCase().includes(q) ||
      v.hanViet.some((h) => h.toLowerCase().includes(q)),
  ).map((v) => ({
    kind: "vocab" as const,
    id: v.id,
    level: v.level,
    primary: v.word,
    secondary: v.reading ?? "",
    meaning: v.meaningVi,
  }));
}

function searchBunpo(q: string, qKana: string | null): SearchResult[] {
  return ALL_BUNPO.filter((g) => matchesAny(g.pattern.toLowerCase(), q, qKana) || g.meaningVi.toLowerCase().includes(q)).map((g) => ({
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
  const [activeKinds, setActiveKinds] = useState<SearchResult["kind"][]>(["kanji", "vocab", "bunpo"]);
  const debouncedQuery = useDebouncedValue(query, 150);
  const inputRef = useRef<HTMLInputElement>(null);

  const q = debouncedQuery.trim().toLowerCase();
  const qKana = useMemo(() => romajiVariant(q), [q]);
  const results = useMemo(() => {
    if (!q) return [];
    const all: SearchResult[] = [];
    if (activeKinds.includes("kanji")) all.push(...searchKanji(q, qKana));
    if (activeKinds.includes("vocab")) all.push(...searchVocab(q, qKana));
    if (activeKinds.includes("bunpo")) all.push(...searchBunpo(q, qKana));
    return all.slice(0, MAX_RESULTS);
  }, [q, qKana, activeKinds]);

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
        {(Object.keys(KIND_LABELS) as SearchResult["kind"][]).map((kind) => (
          <button
            key={kind}
            type="button"
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
