import { useEffect, useMemo, useState } from "react";
import { storageGet, storageSet } from "../../platform/storage.ts";
import { FPT_SOMATOME_MNEMONICS } from "../../data/kanjiStudySets.ts";
import { KANJI_MAP_MNEMONIC_SOURCES, KANJI_MAP_MNEMONICS } from "../../data/kanjiMapMnemonics.ts";
import type { KanjiMapMnemonicTip } from "../../data/kanjiMapMnemonics.ts";
import type { Kanji } from "../../types/kanji.ts";

const STORAGE_KEY = "kanjiMnemonicSourceChoices";

type MnemonicOption = {
  id: string;
  label: string;
  text: string;
  kind?: KanjiMapMnemonicTip["kind"];
  transcription?: KanjiMapMnemonicTip["transcription"];
  sourceEdition?: KanjiMapMnemonicTip["sourceEdition"];
  ocrConfidence?: number;
  source?: string;
  reference?: string;
  visualNote?: boolean;
  tone: "app" | "soumatome" | "b1" | "b2" | "b3";
};

export function KanjiMnemonicChoice({ kanji }: { kanji: Kanji }) {
  const [choices, setChoices] = useState<Record<string, string>>({});
  const [bookMnemonics, setBookMnemonics] = useState<Record<string, KanjiMapMnemonicTip[]>>({});
  useEffect(() => {
    let active = true;
    void storageGet<Record<string, string>>(STORAGE_KEY).then((saved) => {
      if (active && saved && typeof saved === "object") setChoices(saved);
    });
    void import("../../data/kanjiMapBookMnemonics.ts").then(({ KANJI_MAP_BOOK_MNEMONICS }) => {
      if (active) setBookMnemonics(KANJI_MAP_BOOK_MNEMONICS);
    }).catch(() => {});
    return () => { active = false; };
  }, []);

  const options = useMemo(() => {
    const result: MnemonicOption[] = [];
    if (kanji.mnemonic?.trim()) {
      result.push({ id: "app", label: "Mẹo app", text: kanji.mnemonic.trim(), source: "Mẹo đang có trong app", tone: "app" });
    }
    const fallback = FPT_SOMATOME_MNEMONICS[kanji.character as keyof typeof FPT_SOMATOME_MNEMONICS];
    if (fallback && !result.some((option) => option.text === fallback)) {
      result.push({ id: "app-soumatome", label: "FPT Soumatome", text: fallback, source: "Gợi ý bổ sung hiện có trong app", tone: "soumatome" });
    }
    const tips = [
      ...(KANJI_MAP_MNEMONICS[kanji.character] ?? []),
      ...(bookMnemonics[kanji.character] ?? []),
    ];
    for (const tip of tips) {
      const source = KANJI_MAP_MNEMONIC_SOURCES[tip.book];
      const isOldN5N4Tip = tip.book === "b1" && tip.sourceEdition === "original";
      result.push({
        id: tip.id,
        label: `${isOldN5N4Tip ? "Bản cũ · N5–N4" : source.label} #${tip.entry}`,
        text: tip.text,
        kind: tip.kind,
        transcription: tip.transcription,
        sourceEdition: tip.sourceEdition,
        ocrConfidence: tip.ocrConfidence,
        source: `${isOldN5N4Tip ? "Kanji Look and Learn · N5–N4 · bản gốc (mẹo đã có trong app)" : source.title} · mục ${tip.entry}`,
        tone: tip.book,
        reference: tip.printedPage
          ? `PDF trang ${tip.pdfPage} · trang in ${tip.printedPage}`
          : `PDF trang ${tip.pdfPage}`,
        visualNote: tip.kind === "visual-note",
      });
    }
    return result;
  }, [bookMnemonics, kanji.character, kanji.mnemonic]);

  if (options.length === 0) return null;

  const active = options.find((option) => option.id === choices[kanji.character]) ?? options[0]!;
  const hasTextMnemonic = options.some((option) => !option.visualNote);
  function choose(id: string) {
    setChoices((previous) => {
      const next = { ...previous, [kanji.character]: id };
      void storageSet(STORAGE_KEY, next);
      return next;
    });
  }

  return (
    <section className="kanji-info-block kanji-mnemonic-choice" data-tone={active.tone} aria-label="Chọn mẹo nhớ Kanji">
      <div className="kanji-mnemonic-heading">
        <h3>{hasTextMnemonic ? "Mẹo nhớ" : "Ghi chú nguồn"}</h3>
        {options.length > 1 ? <span>{options.length} phương án</span> : null}
      </div>
      {options.length > 1 ? (
        <div className="kanji-mnemonic-options" role="group" aria-label="Nguồn mẹo nhớ">
          {options.map((option) => (
            <button
              type="button"
              key={option.id}
              aria-pressed={active.id === option.id}
              className={active.id === option.id ? "is-active" : ""}
              data-tone={option.tone}
              onClick={() => choose(option.id)}
            >
              {option.label}
            </button>
          ))}
        </div>
      ) : null}
      <p className="kanji-mnemonic-text">{active.text}</p>
      <div className="kanji-mnemonic-source">
        <span>{active.visualNote ? "Ghi chú hình minh họa" : "Nguồn"}: {active.source}</span>
        {active.reference ? <span>{active.reference}</span> : null}
        {active.kind === "paraphrase" ? (
          <span>{active.sourceEdition === "original" ? "Diễn giải cũ từ nguồn sách" : "Diễn giải tiếng Việt từ trang sách"}</span>
        ) : null}
        {active.kind === "excerpt" ? (
          <span>
            {active.sourceEdition === "original"
              ? "Mẹo cũ đã có trong app"
              : active.transcription === "visual-check"
                ? "Tiếng Việt đã đối chiếu trực tiếp với bản scan"
                : active.sourceEdition === "vietnamese-scan" && active.transcription === "ocr"
                  ? `OCR tiếng Việt từ bản scan${active.ocrConfidence ? ` · điểm nhận dạng ${Math.round(active.ocrConfidence * 100)}%` : ""} · nên đối chiếu`
              : "Câu gợi nhớ trong sách"}
          </span>
        ) : null}
      </div>
    </section>
  );
}
