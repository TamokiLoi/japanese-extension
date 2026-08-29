import { useMemo, useRef, useState } from "react";
import { ALL_KANJI } from "../kanjiState.ts";
import { ALL_VOCAB } from "../vocabState.ts";
import { ExpandTabButton } from "../TabMode.tsx";
import { LevelDot } from "../LevelDot.tsx";
import { useDebouncedValue } from "../useDebouncedValue.ts";
import { formatHanViet } from "../../hanVietFormat.ts";
import type { JlptLevel } from "../../types/kanji.ts";

const MAX_RESULTS = 40;

interface SearchResult {
  kind: "kanji" | "vocab";
  id: string;
  level: JlptLevel;
  primary: string;
  secondary: string;
  meaning: string;
}

function searchKanji(q: string): SearchResult[] {
  return ALL_KANJI.filter(
    (k) =>
      q.includes(k.character) ||
      k.hanViet.some((h) => h.toLowerCase().includes(q)) ||
      k.meanings.vi.some((m) => m.toLowerCase().includes(q)) ||
      (k.meanings.viDraft ?? []).some((m) => m.toLowerCase().includes(q)) ||
      k.meanings.en.some((m) => m.toLowerCase().includes(q)) ||
      k.readings.on.some((r) => r.includes(q)) ||
      k.readings.kun.some((r) => r.includes(q)),
  ).map((k) => ({
    kind: "kanji" as const,
    id: k.id,
    level: k.level,
    primary: k.character,
    secondary: formatHanViet(k.hanViet, ""),
    meaning: k.meanings.vi[0] ?? k.meanings.viDraft?.[0] ?? k.meanings.en[0] ?? "",
  }));
}

function searchVocab(q: string): SearchResult[] {
  return ALL_VOCAB.filter(
    (v) =>
      v.word.toLowerCase().includes(q) ||
      (v.reading ?? "").toLowerCase().includes(q) ||
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

export function SearchScreen({
  onBack,
  onOpenKanji,
  onOpenVocab,
}: {
  onBack: () => void;
  onOpenKanji: (kanjiId: string) => void;
  onOpenVocab: (vocabId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebouncedValue(query, 150);
  const inputRef = useRef<HTMLInputElement>(null);

  const q = debouncedQuery.trim().toLowerCase();
  const results = useMemo(() => (q ? [...searchKanji(q), ...searchVocab(q)].slice(0, MAX_RESULTS) : []), [q]);

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

      <main className="jlpt-list">
        {!q ? (
          <p className="empty">
            Nhập để tìm trong {ALL_KANJI.length} Kanji và {ALL_VOCAB.length} từ vựng.
          </p>
        ) : results.length === 0 ? (
          <p className="empty">Không tìm thấy gì.</p>
        ) : (
          results.map((r) => (
            <SearchResultRow key={`${r.kind}-${r.id}`} r={r} onOpenKanji={onOpenKanji} onOpenVocab={onOpenVocab} />
          ))
        )}
      </main>
    </>
  );
}

function SearchResultRow({
  r,
  onOpenKanji,
  onOpenVocab,
}: {
  r: SearchResult;
  onOpenKanji: (id: string) => void;
  onOpenVocab: (id: string) => void;
}) {
  const kindLabel = r.kind === "kanji" ? "Kanji" : "Từ vựng";
  const kindClass = r.kind === "kanji" ? "search-tag-kanji" : "search-tag-vocab";
  return (
    <div
      className="jlpt-entry search-result"
      onClick={() => (r.kind === "kanji" ? onOpenKanji(r.id) : onOpenVocab(r.id))}
    >
      <span className={`search-tag ${kindClass}`}>{kindLabel}</span>
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
