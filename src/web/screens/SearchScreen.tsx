import { useMemo, useState } from "react";
import { Plus, Search } from "lucide-react";
import { isRomaji, toHiragana } from "wanakana";
import { ALL_KANJI } from "../../popup/kanjiState.ts";
import { ALL_VOCAB } from "../../popup/vocabState.ts";
import { ALL_BUNPO } from "../../popup/bunpoState.ts";
import { useDebouncedValue } from "../../popup/useDebouncedValue.ts";
import { formatHanViet } from "../../hanVietFormat.ts";
import type { JlptLevel } from "../../types/kanji.ts";
import { LevelDot } from "../lib/levelColors.tsx";
import { NewVocabCorrectionSheet } from "../components/NewVocabCorrectionSheet.tsx";
import { Button } from "../components/ui/button.tsx";

const MAX_RESULTS = 40;

// Lets typing plain romaji ("watashi", "namae") find kanji/vocab whose
// reading is stored in hiragana ("わたし", "なまえ") -- everything else
// (Vietnamese meanings, kanji itself, already-kana input) keeps matching
// on the raw query exactly as before via q. Only attempt the conversion
// when the query actually looks like romaji; converting a Vietnamese query
// like "nam" would otherwise silently mangle it into kana ("なm") and lose
// the original match.
function romajiVariant(q: string): string | null {
  if (!q || !isRomaji(q)) return null;
  const kana = toHiragana(q, { passRomaji: false });
  return kana !== q ? kana : null;
}

function matchesAny(text: string, q: string, qKana: string | null): boolean {
  return text.includes(q) || (qKana !== null && text.includes(qKana));
}

// Kun-yomi readings store okurigana markers ("ひと.つ", "ひと-") that a
// plain search query never contains -- stripped before matching so e.g.
// typing "ひとつ"/"hitotsu" actually finds 一, instead of silently failing
// for the majority of kun readings that use these markers.
function matchesReading(reading: string, q: string, qKana: string | null): boolean {
  return matchesAny(reading.replace(/[.\-]/g, ""), q, qKana);
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
      k.readings.on.some((r) => matchesReading(r, q, qKana)) ||
      k.readings.kun.some((r) => matchesReading(r, q, qKana)),
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
function matchesConjugation(v: (typeof ALL_VOCAB)[number], q: string): boolean {
  if (!v.conjugations) return false;
  return Object.values(v.conjugations).some((form) => typeof form === "string" && form.toLowerCase().includes(q));
}

function searchVocab(q: string, qKana: string | null): SearchResult[] {
  return ALL_VOCAB.filter(
    (v) =>
      v.word.toLowerCase().includes(q) ||
      matchesAny((v.reading ?? "").toLowerCase(), q, qKana) ||
      v.meaningVi.toLowerCase().includes(q) ||
      v.hanViet.some((h) => h.toLowerCase().includes(q)) ||
      matchesConjugation(v, q),
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
  const [newVocabOpen, setNewVocabOpen] = useState(false);
  const [savedWord, setSavedWord] = useState<string | null>(null);
  const debouncedQuery = useDebouncedValue(query, 150);

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
    <div className="mx-auto max-w-6xl px-2.5 py-2 md:px-8 md:py-6">
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
        <div className="mt-6 rounded-2xl border border-dashed border-neutral-200 bg-neutral-50/70 px-4 py-6 text-center">
          <p className="text-sm font-semibold text-neutral-600">Không tìm thấy “{query.trim()}” trong dữ liệu.</p>
          <p className="mt-1 text-xs text-neutral-400">Bạn có thể ghi lại từ này để bổ sung vào dữ liệu sau.</p>
          <Button className="mt-4" onClick={() => setNewVocabOpen(true)}>
            <Plus size={15} /> Thêm “{query.trim()}”
          </Button>
        </div>
      ) : (
        <div className="mt-4 flex flex-col gap-2">
          {results.map((r) => (
            <button
              key={`${r.kind}-${r.id}`}
              onClick={() => handleOpen(r)}
              className="flex items-center gap-3 rounded-2xl border border-neutral-200 bg-white px-4 py-3.5 text-left hover:border-rose-200 hover:bg-rose-50/40"
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

      {savedWord ? (
        <div className="mt-4 rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700">
          Đã lưu “{savedWord}” vào danh sách góp ý dữ liệu.
        </div>
      ) : null}

      <NewVocabCorrectionSheet
        open={newVocabOpen}
        initialWord={query.trim()}
        onClose={() => setNewVocabOpen(false)}
        onSaved={(saved) => setSavedWord(saved.snapshot.word)}
      />
    </div>
  );
}
