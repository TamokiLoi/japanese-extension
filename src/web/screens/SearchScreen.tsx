import { useMemo, useState } from "react";
import { ALL_KANJI } from "../../popup/kanjiState.ts";
import { ALL_VOCAB } from "../../popup/vocabState.ts";
import { ALL_BUNPO } from "../../popup/bunpoState.ts";
import { useDebouncedValue } from "../../popup/useDebouncedValue.ts";
import { formatHanViet } from "../../hanVietFormat.ts";
import type { JlptLevel } from "../../types/kanji.ts";
import { PageHeader } from "../components/PageHeader.tsx";
import { LevelDot } from "../lib/levelColors.tsx";

const MAX_RESULTS = 40;

interface SearchResult {
  kind: "kanji" | "vocab" | "bunpo";
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

function searchBunpo(q: string): SearchResult[] {
  return ALL_BUNPO.filter((g) => g.pattern.toLowerCase().includes(q) || g.meaningVi.toLowerCase().includes(q)).map((g) => ({
    kind: "bunpo" as const,
    id: g.id,
    level: g.level,
    primary: g.pattern,
    secondary: "",
    meaning: g.meaningVi,
  }));
}

const KIND_LABELS: Record<SearchResult["kind"], string> = {
  kanji: "Kanji",
  vocab: "Từ vựng",
  bunpo: "Ngữ pháp",
};

const KIND_COLOR: Record<SearchResult["kind"], string> = {
  kanji: "border-amber-300 bg-amber-50 text-amber-700",
  vocab: "border-sky-300 bg-sky-50 text-sky-700",
  bunpo: "border-violet-300 bg-violet-50 text-violet-700",
};

export function SearchScreen({
  onOpenKanji,
  onOpenVocab,
  onOpenBunpo,
}: {
  onOpenKanji: (kanjiId: string) => void;
  onOpenVocab: (vocabId: string) => void;
  onOpenBunpo: (bunpoId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [activeKinds, setActiveKinds] = useState<SearchResult["kind"][]>(["kanji", "vocab", "bunpo"]);
  const debouncedQuery = useDebouncedValue(query, 150);

  const q = debouncedQuery.trim().toLowerCase();
  const results = useMemo(() => {
    if (!q) return [];
    const all: SearchResult[] = [];
    if (activeKinds.includes("kanji")) all.push(...searchKanji(q));
    if (activeKinds.includes("vocab")) all.push(...searchVocab(q));
    if (activeKinds.includes("bunpo")) all.push(...searchBunpo(q));
    return all.slice(0, MAX_RESULTS);
  }, [q, activeKinds]);

  function toggleKind(kind: SearchResult["kind"]) {
    setActiveKinds((prev) => {
      if (prev.includes(kind)) {
        const next = prev.filter((k) => k !== kind);
        return next.length > 0 ? next : prev;
      }
      return [...prev, kind];
    });
  }

  function handleOpen(r: SearchResult) {
    if (r.kind === "kanji") onOpenKanji(r.id);
    else if (r.kind === "vocab") onOpenVocab(r.id);
    else onOpenBunpo(r.id);
  }

  return (
    <div className="mx-auto max-w-4xl px-2.5 py-2 md:px-8 md:py-6">
      <PageHeader title="Tra cứu" subtitle={q ? `${results.length} kết quả` : undefined} />

      <input
        type="text"
        autoFocus
        placeholder="Nhập chữ Hán, từ, Hán Việt, nghĩa..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="mt-4 w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm"
      />

      <div className="mt-3 flex flex-wrap gap-2">
        {(Object.keys(KIND_LABELS) as SearchResult["kind"][]).map((kind) => {
          const active = activeKinds.includes(kind);
          return (
            <button
              key={kind}
              onClick={() => toggleKind(kind)}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${active ? KIND_COLOR[kind] : "border-neutral-200 text-neutral-400"}`}
            >
              {KIND_LABELS[kind]}
            </button>
          );
        })}
      </div>

      {!q ? (
        <p className="mt-6 text-neutral-400">
          Nhập để tìm trong {ALL_KANJI.length} Kanji, {ALL_VOCAB.length} từ vựng và {ALL_BUNPO.length} mẫu ngữ pháp.
        </p>
      ) : results.length === 0 ? (
        <p className="mt-6 text-neutral-400">Không tìm thấy gì.</p>
      ) : (
        <div className="mt-4 flex flex-col gap-2">
          {results.map((r) => (
            <button
              key={`${r.kind}-${r.id}`}
              onClick={() => handleOpen(r)}
              className="flex items-center gap-3 rounded-xl border border-neutral-200 bg-white px-4 py-3 text-left hover:border-rose-200 hover:bg-rose-50/40"
            >
              <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold ${KIND_COLOR[r.kind]}`}>
                {KIND_LABELS[r.kind]}
              </span>
              <span className="flex shrink-0 items-center text-xs font-semibold text-neutral-400">
                <LevelDot level={r.level} />
                {r.level}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold text-neutral-800">
                  {r.primary}
                  {r.secondary ? <span className="ml-1.5 font-normal text-neutral-400">{r.secondary}</span> : null}
                </div>
                <div className="truncate text-sm text-neutral-500">{r.meaning || "—"}</div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
