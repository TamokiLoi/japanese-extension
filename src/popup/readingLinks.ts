// Reverse direction of vocabLinks.ts/bunpoLinks.ts: those find which reading
// passages use a given Vocab word/Bunpo pattern; this finds which of the
// app's own Vocab/Bunpo cards show up in a given passage, so a learner can
// jump straight from "this word in the passage looks hard" to studying it
// properly instead of re-typing it into Tra cứu.
import type { ReadingPassage } from "../types/reading.ts";
import { ALL_VOCAB, type VocabCard } from "./vocabState.ts";
import { ALL_BUNPO } from "./bunpoState.ts";
import { extractMatchChunks } from "./bunpoLinks.ts";
import type { BunpoGrammarPoint } from "../types/bunpo.ts";

const MAX_VOCAB_MATCHES = 16;
const MAX_BUNPO_MATCHES = 10;

function passageText(passage: ReadingPassage): string {
  return passage.body.map((seg) => seg.text).join("");
}

// Same "literal substring, no conjugation handling" caveat as vocabLinks.ts
// -- under-matches verbs/adjectives that appear conjugated in running text,
// but every match found is a real one, which is what matters for "here's a
// word from this passage worth reviewing."
export function findVocabInPassage(passage: ReadingPassage, limit = MAX_VOCAB_MATCHES): VocabCard[] {
  const text = passageText(passage);
  const matches: VocabCard[] = [];
  for (const v of ALL_VOCAB) {
    if (!v.word) continue;
    if (text.includes(v.word)) {
      matches.push(v);
      if (matches.length >= limit) break;
    }
  }
  return matches;
}

export function findBunpoInPassage(passage: ReadingPassage, limit = MAX_BUNPO_MATCHES): BunpoGrammarPoint[] {
  const text = passageText(passage);
  const matches: BunpoGrammarPoint[] = [];
  for (const g of ALL_BUNPO) {
    const chunks = extractMatchChunks(g.pattern);
    if (chunks.length === 0) continue;
    if (chunks.every((c) => text.includes(c))) {
      matches.push(g);
      if (matches.length >= limit) break;
    }
  }
  return matches;
}
