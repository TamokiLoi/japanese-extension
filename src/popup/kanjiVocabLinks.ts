// Cross-references between the Kanji and Vocab datasets, computed once at
// module load (cheap: ~1120 vocab words × a few characters each). Powers
// the bidirectional "từ vựng chứa chữ này" / "chữ Hán trong từ này" links
// on both screens.
import { ALL_KANJI } from "./kanjiState.ts";
import { ALL_VOCAB, type VocabCard } from "./vocabState.ts";

const KANJI_ID_BY_CHAR = new Map(ALL_KANJI.map((k) => [k.character, k.id]));

export function kanjiIdForChar(char: string): string | undefined {
  return KANJI_ID_BY_CHAR.get(char);
}

const VOCAB_BY_KANJI_CHAR = new Map<string, VocabCard[]>();
for (const v of ALL_VOCAB) {
  const seenChars = new Set<string>();
  for (const ch of v.word) {
    if (seenChars.has(ch) || !KANJI_ID_BY_CHAR.has(ch)) continue;
    seenChars.add(ch);
    const list = VOCAB_BY_KANJI_CHAR.get(ch);
    if (list) list.push(v);
    else VOCAB_BY_KANJI_CHAR.set(ch, [v]);
  }
}

const RELATED_VOCAB_LIMIT = 8;

export function vocabForKanjiChar(char: string): { shown: VocabCard[]; total: number } {
  const all = VOCAB_BY_KANJI_CHAR.get(char) ?? [];
  return { shown: all.slice(0, RELATED_VOCAB_LIMIT), total: all.length };
}
