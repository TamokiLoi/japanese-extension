import { useMemo, useState } from "react";
import { Plus, Search } from "lucide-react";
import { isRomaji, toHiragana, toKatakana } from "wanakana";
import { ALL_KANJI } from "../../popup/kanjiState.ts";
import { ALL_VOCAB } from "../../popup/vocabState.ts";
import { ALL_BUNPO } from "../../popup/bunpoState.ts";
import { buildKanjiHanVietReadings, matchesComposedHanViet } from "../../lib/vocabhanvietsearch.ts";
import { useDebouncedValue } from "../../popup/useDebouncedValue.ts";
import { formatHanViet } from "../../hanVietFormat.ts";
import type { JlptLevel } from "../../types/kanji.ts";
import { LevelDot } from "../lib/levelColors.tsx";
import { NewVocabCorrectionSheet } from "../components/NewVocabCorrectionSheet.tsx";
import { Button } from "../components/ui/button.tsx";

const MAX_RESULTS = 40;
const SEARCH_KIND_ORDER: SearchResult["kind"][] = ["vocab", "kanji", "bunpo"];
const KANJI_HAN_VIET = buildKanjiHanVietReadings(ALL_KANJI);

// Search kana in both directions: a Katakana query ("チカチカ") should find
// Hiragana data ("ちかちか") and vice versa. Romaji is also expanded to both
// kana forms while the original query is retained for meanings and Han Viet.
function queryVariants(q: string): string[] {
  if (!q) return [];

  // Keep the original query and add both kana forms. For romaji, force the
  // conversion; for Japanese text, preserve non-kana characters while
  // normalising any hiragana/katakana in the query.
  const options = isRomaji(q) ? { passRomaji: false } : { passRomaji: true };
  return [...new Set([q, toHiragana(q, options).toLowerCase(), toKatakana(q, options).toLowerCase()])];
}

function matchesAny(text: string, variants: string[]): boolean {
  return variants.some((variant) => text.includes(variant));
}

// Kun-yomi readings store okurigana markers ("ひと.つ", "ひと-") that a
// plain search query never contains -- stripped before matching so e.g.
// typing "ひとつ"/"hitotsu" actually finds 一, instead of silently failing
// for the majority of kun readings that use these markers.
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
  hanViet?: string;
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

// Verbs store their dictionary form as `word`, but a user typing a
// conjugated form ("持ち帰ろう") won't substring-match that -- also check
// the precomputed conjugation table when present (see VerbConjugations)
// instead of only the dictionary form.
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
      matchesComposedHanViet(v.word, q, KANJI_HAN_VIET) ||
      matchesConjugation(v, variants),
  ).map((v) => ({
    kind: "vocab" as const,
    id: v.id,
    level: v.level,
    primary: v.word,
    secondary: v.reading ?? "",
    meaning: v.meaningVi,
    hanViet: formatHanViet(v.hanViet, ""),
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

const KIND_CARD_COLOR: Record<SearchResult["kind"], string> = {
  kanji: "border-amber-200 bg-amber-50/50 hover:border-amber-300 hover:bg-amber-50",
  vocab: "border-sky-200 bg-sky-50/50 hover:border-sky-300 hover:bg-sky-50",
  bunpo: "border-violet-200 bg-violet-50/50 hover:border-violet-300 hover:bg-violet-50",
};

const KIND_LEVEL_COLOR: Record<SearchResult["kind"], string> = {
  kanji: "bg-amber-100 text-amber-800",
  vocab: "bg-sky-100 text-sky-800",
  bunpo: "bg-violet-100 text-violet-800",
};

export function SearchScreen({
  onOpenKanji,
  onOpenVocab,
  onOpenBunpo,
  popup = false,
}: {
  onOpenKanji: (kanjiId: string) => void;
  onOpenVocab: (vocabId: string) => void;
  onOpenBunpo: (bunpoId: string) => void;
  popup?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [activeKinds, setActiveKinds] = useState<SearchResult["kind"][]>(["vocab"]);
  const [newVocabOpen, setNewVocabOpen] = useState(false);
  const [savedWord, setSavedWord] = useState<string | null>(null);
  const debouncedQuery = useDebouncedValue(query, 150);

  const q = debouncedQuery.trim().toLowerCase();
  const variants = useMemo(() => queryVariants(q), [q]);
  const results = useMemo(() => {
    if (!q) return [];
    const all: SearchResult[] = [];
    for (const kind of SEARCH_KIND_ORDER) {
      if (activeKinds.includes(kind)) {
        if (kind === "vocab") all.push(...searchVocab(q, variants));
        else if (kind === "kanji") all.push(...searchKanji(q, variants));
        else all.push(...searchBunpo(q, variants));
      }
    }
    return all.slice(0, MAX_RESULTS);
  }, [q, variants, activeKinds]);

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

  function handleImageSearch(text: string) {
    setQuery(text);
    setActiveKinds(["vocab", "kanji", "bunpo"]);
  }

  return (
    <div
      className={`mx-auto max-w-6xl px-2.5 py-2 md:px-8 md:py-6 ${
        popup ? "max-h-[calc(100dvh-2rem)] overflow-y-auto md:max-h-none md:overflow-visible" : ""
      }`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px]" style={{ background: "#ffe4e6" }}>
            <Search size={20} className="text-rose-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-neutral-800">Tra cứu</h1>
            {q ? <p className="text-sm text-neutral-500">{results.length} kết quả</p> : null}
          </div>
        </div>
        <Button variant="outline" className="rounded-xl" onClick={() => setNewVocabOpen(true)}>
          <Plus size={15} /> <span className="hidden sm:inline">Thêm từ mới</span>
          <span className="sm:hidden">Thêm từ</span>
        </Button>
      </div>

      <input
        type="text"
        autoFocus
        placeholder="Nhập chữ Hán, từ, Hán Việt, nghĩa..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="mt-4 w-full rounded-2xl border border-neutral-200 px-3.5 py-2.5 text-sm"
      />

      {/* Image lookup POC is hidden until it is ready for release.
      <ImageLookupPanel onSearch={handleImageSearch} />
      */}

      <div className="mt-3 flex flex-wrap gap-2">
        {SEARCH_KIND_ORDER.map((kind) => {
          const active = activeKinds.includes(kind);
          return (
            <button
              key={kind}
              type="button"
              aria-pressed={active}
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
        <div className="mt-6 rounded-2xl border border-dashed border-neutral-200 bg-neutral-50/70 px-4 py-6 text-center">
          <p className="text-sm font-semibold text-neutral-600">Không tìm thấy “{query.trim()}” trong dữ liệu.</p>
          <p className="mt-1 text-xs text-neutral-400">Bạn có thể ghi lại từ này để bổ sung vào dữ liệu sau.</p>
          <Button className="mt-4" onClick={() => setNewVocabOpen(true)}>
            <Plus size={15} /> Thêm “{query.trim()}”
          </Button>
        </div>
      ) : (
        <div className={`mt-4 flex flex-col gap-2 ${popup ? "max-h-64 overflow-y-auto pr-1 md:max-h-none md:overflow-visible" : ""}`}>
          {results.map((r) => (
            <button
              key={`${r.kind}-${r.id}`}
              onClick={() => handleOpen(r)}
              className={`grid w-full grid-cols-[minmax(0,1fr)_auto] items-start gap-2 rounded-2xl border px-3 py-2.5 text-left transition-colors ${KIND_CARD_COLOR[r.kind]}`}
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-base font-semibold text-neutral-800">
                  {r.primary}
                  {r.secondary && r.kind !== "kanji" ? <span className="ml-2 text-sm font-normal text-neutral-500">{r.secondary}</span> : null}
                </div>
                <div className="mt-0.5 flex min-w-0 items-center gap-2 text-sm leading-5">
                  {r.kind === "vocab" && r.hanViet ? (
                    <span className="max-w-[42%] shrink-0 truncate font-bold uppercase tracking-wide text-neutral-700" title={r.hanViet}>
                      {r.hanViet}
                    </span>
                  ) : null}
                  {r.kind === "kanji" && r.secondary ? (
                    <span className="max-w-[42%] shrink-0 truncate font-bold uppercase tracking-wide text-neutral-700" title={r.secondary}>
                      {r.secondary}
                    </span>
                  ) : null}
                  <span className="min-w-0 flex-1 truncate text-neutral-600" title={r.meaning || "—"}>
                    {r.meaning || "—"}
                  </span>
                </div>
              </div>
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${KIND_LEVEL_COLOR[r.kind]}`}>{r.level}</span>
            </button>
          ))}
        </div>
      )}

      {savedWord ? (
        <div className="mt-4 rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700">
          Đã lưu “{savedWord}” vào danh sách góp ý dữ liệu.
        </div>
      ) : null}

      <NewVocabCorrectionSheet
        open={newVocabOpen}
        initialWord={query.trim()}
        onClose={() => setNewVocabOpen(false)}
        onSaved={(saved) => setSavedWord(saved.entityType === "vocab" ? saved.snapshot.word : null)}
      />
    </div>
  );
}
