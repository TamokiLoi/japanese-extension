import { useEffect, useMemo, useState } from "react";
import { BookOpen, ChevronLeft, ChevronRight, Search } from "lucide-react";
import { RADICAL_CARDS, radicalForCharacter, type RadicalCardRecord } from "../../data/radicalCards.ts";
import { ALL_KANJI } from "../../popup/kanjiState.ts";
import { Card } from "../components/ui/card.tsx";
import { Button } from "../components/ui/button.tsx";

function normalize(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("vi");
}

function radicalSearchText(radical: RadicalCardRecord): string {
  return [
    radical.number,
    radical.strokes,
    radical.character,
    radical.nameHanViet,
    radical.meaning,
    radical.description,
    ...radical.variants,
  ].join(" ");
}

export function RadicalLibraryScreen({
  initialCharacter,
  onOpenKanji,
}: {
  initialCharacter?: string | null;
  onOpenKanji: (character: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [selectedCharacter, setSelectedCharacter] = useState(() => radicalForCharacter(initialCharacter)?.character ?? RADICAL_CARDS[0]?.character ?? "一");

  useEffect(() => {
    const initial = radicalForCharacter(initialCharacter);
    if (initial) setSelectedCharacter(initial.character);
  }, [initialCharacter]);

  const filteredRadicals = useMemo(() => {
    const needle = normalize(query.trim());
    if (!needle) return RADICAL_CARDS;
    return RADICAL_CARDS.filter((radical) => normalize(radicalSearchText(radical)).includes(needle));
  }, [query]);

  const selected = filteredRadicals.find((radical) => radical.character === selectedCharacter) ?? filteredRadicals[0] ?? null;
  const selectedIndex = selected ? filteredRadicals.findIndex((radical) => radical.character === selected.character) : -1;
  const existingKanji = selected
    ? ALL_KANJI.find((kanji) => kanji.character === selected.character || selected.variants.includes(kanji.character))
    : undefined;
  const groupedRadicals = useMemo(() => {
    const groups = new Map<number, RadicalCardRecord[]>();
    for (const radical of filteredRadicals) groups.set(radical.strokes, [...(groups.get(radical.strokes) ?? []), radical]);
    return [...groups.entries()].sort(([a], [b]) => a - b);
  }, [filteredRadicals]);

  function selectRadical(radical: RadicalCardRecord) {
    setSelectedCharacter(radical.character);
  }

  function moveSelection(direction: -1 | 1) {
    const next = filteredRadicals[selectedIndex + direction];
    if (next) setSelectedCharacter(next.character);
  }

  return (
    <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
      <section className="order-2 min-w-0 lg:order-1" aria-label="Danh sách 214 bộ thủ">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <label className="flex min-w-[220px] flex-1 items-center gap-2 rounded-xl border border-neutral-200 bg-white px-3 py-2.5 text-neutral-400 shadow-sm">
            <Search size={16} aria-hidden="true" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Tìm bộ, Hán Việt hoặc nghĩa…"
              aria-label="Tìm bộ thủ"
              className="min-w-0 flex-1 bg-transparent text-sm text-neutral-800 outline-none placeholder:text-neutral-400"
            />
          </label>
          <span className="shrink-0 rounded-full bg-neutral-100 px-3 py-2 text-xs font-semibold text-neutral-500">
            {filteredRadicals.length} / {RADICAL_CARDS.length} bộ
          </span>
        </div>

        {filteredRadicals.length === 0 ? (
          <p className="rounded-xl border border-dashed border-neutral-300 p-5 text-center text-sm text-neutral-500">Không tìm thấy bộ thủ phù hợp.</p>
        ) : (
          <div className="space-y-4">
            {groupedRadicals.map(([strokes, radicals]) => (
              <section key={strokes} aria-label={`${strokes} nét`}>
                <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-400">{strokes} nét</h2>
                <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-7">
                  {radicals.map((radical) => {
                    const active = selected?.character === radical.character;
                    return (
                      <button
                        key={radical.number}
                        type="button"
                        onClick={() => selectRadical(radical)}
                        aria-pressed={active}
                        aria-label={`Bộ ${radical.number}: ${radical.character}, ${radical.nameHanViet}`}
                        className={`min-w-0 rounded-xl border px-1.5 py-2 text-center transition-colors ${active ? "border-rose-300 bg-rose-50 text-rose-700 shadow-sm" : "border-neutral-200 bg-white text-neutral-700 hover:border-rose-200 hover:bg-rose-50/50"}`}
                      >
                        <strong className="block font-serif text-2xl leading-none">{radical.character}</strong>
                        <span className="mt-1 block truncate text-[10px] font-semibold">{radical.nameHanViet}</span>
                        <span className="block text-[9px] text-neutral-400">#{radical.number}</span>
                      </button>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
      </section>

      <aside className="order-1 min-w-0 lg:order-2 lg:sticky lg:top-4 lg:self-start">
        {selected ? (
          <Card className="gap-0 overflow-hidden rounded-2xl border-neutral-200 p-0 shadow-sm">
            <div className="flex items-center gap-4 border-b border-neutral-100 bg-gradient-to-br from-rose-50 to-white p-4 sm:p-5">
              <div className="grid h-20 w-20 shrink-0 place-items-center rounded-2xl border border-rose-200 bg-white font-serif text-5xl text-rose-700 shadow-sm">
                {selected.character}
              </div>
              <div className="min-w-0">
                <span className="inline-flex rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-neutral-500 ring-1 ring-neutral-200">
                  Bộ {selected.number} · {selected.strokes} nét
                </span>
                <h2 className="mt-2 text-lg font-bold text-neutral-900">{selected.nameHanViet}</h2>
                <p className="text-sm text-neutral-500">{selected.meaning}</p>
              </div>
            </div>

            <div className="space-y-3 p-4 sm:p-5">
              <p className="whitespace-pre-line text-sm leading-relaxed text-neutral-700">{selected.description}</p>
              {selected.variants.length > 0 ? (
                <div className="flex flex-wrap items-center gap-1.5 text-xs text-neutral-500">
                  <span>Dạng khác:</span>
                  {selected.variants.map((variant) => <span key={variant} className="rounded-md border border-neutral-200 bg-neutral-50 px-2 py-1 font-serif text-base text-neutral-700">{variant}</span>)}
                </div>
              ) : null}
              {selected.needsReview ? (
                <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-800" title={selected.reviewNote}>
                  Một vài chi tiết trong nguồn đang chờ đối chiếu.
                </p>
              ) : null}
              {existingKanji ? (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-sky-100 bg-sky-50/70 p-3">
                  <div className="text-xs text-sky-800"><strong>Đã có thẻ Kanji</strong><span className="ml-1 text-sky-600">{existingKanji.level}</span></div>
                  <Button size="sm" variant="outline" onClick={() => onOpenKanji(existingKanji.character)}>
                    <BookOpen size={14} /> Mở thẻ
                  </Button>
                </div>
              ) : null}
              <div className="flex items-center justify-between border-t border-neutral-100 pt-3">
                <Button size="sm" variant="outline" disabled={selectedIndex <= 0} onClick={() => moveSelection(-1)}>
                  <ChevronLeft size={15} /> Trước
                </Button>
                <span className="text-xs text-neutral-400">{selectedIndex + 1} / {filteredRadicals.length}</span>
                <Button size="sm" variant="outline" disabled={selectedIndex < 0 || selectedIndex >= filteredRadicals.length - 1} onClick={() => moveSelection(1)}>
                  Tiếp <ChevronRight size={15} />
                </Button>
              </div>
            </div>
          </Card>
        ) : (
          <p className="rounded-xl border border-dashed border-neutral-300 p-5 text-center text-sm text-neutral-500">Chọn một bộ thủ để xem thông tin.</p>
        )}
      </aside>
    </div>
  );
}
