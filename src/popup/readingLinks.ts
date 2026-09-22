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
import type { JlptLevel } from "../types/kanji.ts";

// The references panel is meant to help a learner review the words that are
// most useful for this passage, not to dump every substring found in the
// dictionary. Keep it compact enough to scan on mobile.
const MAX_VOCAB_MATCHES = 12;
const MAX_BUNPO_MATCHES = 10;

const LEVEL_RANK: Record<JlptLevel, number> = { N5: 0, N4: 1, N3: 2, N2: 3, N1: 4 };

// These are usually particles, conjunction fragments, or kana fragments that
// happen to be present inside a longer word. They add noise to a reading
// reference list without giving the learner a useful lookup target.
const READING_REFERENCE_STOPWORDS = new Set([
  "これ",
  "それ",
  "あれ",
  "また",
  "まだ",
  "ここ",
  "そこ",
  "とき",
  "もの",
  "こと",
  "よう",
  "ため",
]);

function isKanaOnly(word: string): boolean {
  return /^[ぁ-ゖァ-ヺー]+$/u.test(word);
}

function isUsefulVocabReference(v: VocabCard): boolean {
  const word = v.word.trim();
  if (word.length < 2 || READING_REFERENCE_STOPWORDS.has(word)) return false;
  // Short kana-only entries are overwhelmingly particles or a fragment of a
  // conjugated word (e.g. あわ inside あわてて). Keep longer kana words such
  // as できる and たまたま available, but omit the noisy 2-character ones.
  if (isKanaOnly(word) && word.length <= 2) return false;
  return true;
}

function vocabReferenceScore(v: VocabCard, passageLevel: JlptLevel): number {
  const level = LEVEL_RANK[v.level];
  const target = LEVEL_RANK[passageLevel];
  const difficulty = level >= target ? 100 + level * 18 : level * 18 - 80;
  const kanjiBonus = [...v.word].filter((char) => /[一-龯々]/u.test(char)).length * 12;
  const lengthBonus = Math.min(v.word.length, 8) * 3;
  // Mimikara/Tango and the JLPT exam set are generally more useful study
  // references than a broad synonym/verb supplement when ties occur.
  const sourceBonus = v.sources.some((source) =>
    ["mimikara-n3", "tango-n1", "tango-n2", "tango-n3", "jlpt-n3-dethi"].includes(source),
  )
    ? 5
    : 0;
  return difficulty + kanjiBonus + lengthBonus + sourceBonus;
}

function grammarReferenceScore(g: BunpoGrammarPoint, passageLevel: JlptLevel, chunks: string[]): number {
  const level = LEVEL_RANK[g.level];
  const target = LEVEL_RANK[passageLevel];
  const difficulty = level >= target ? 100 + level * 18 : level * 18 - 80;
  const matchedLength = chunks.reduce((total, chunk) => total + chunk.length, 0);
  return difficulty + Math.min(matchedLength, 12) * 4 + Math.min(g.pattern.length, 12);
}

function passageText(passage: ReadingPassage): string {
  return passage.body.map((seg) => seg.text).join("");
}

// Same "literal substring, no conjugation handling" caveat as vocabLinks.ts
// -- under-matches verbs/adjectives that appear conjugated in running text,
// but every match found is a real one, which is what matters for "here's a
// word from this passage worth reviewing."
export function findVocabInPassage(passage: ReadingPassage, limit = MAX_VOCAB_MATCHES): VocabCard[] {
  const text = passageText(passage);
  const candidates = ALL_VOCAB.filter((v) => isUsefulVocabReference(v) && text.includes(v.word));
  const difficultCandidates = candidates.filter((v) => LEVEL_RANK[v.level] >= LEVEL_RANK[passage.level]);
  const pool = difficultCandidates.length >= Math.min(limit, 8) ? difficultCandidates : candidates;
  return pool
    .sort((a, b) => vocabReferenceScore(b, passage.level) - vocabReferenceScore(a, passage.level) || b.word.length - a.word.length)
    .slice(0, limit);
}

export function findBunpoInPassage(passage: ReadingPassage, limit = MAX_BUNPO_MATCHES): BunpoGrammarPoint[] {
  const text = passageText(passage);
  const bestByPattern = new Map<string, { grammar: BunpoGrammarPoint; score: number }>();
  for (const g of ALL_BUNPO) {
    const chunks = extractMatchChunks(g.pattern);
    const meaningfulChunks = chunks.filter((chunk) => chunk.length >= 2);
    if (meaningfulChunks.length === 0 || !meaningfulChunks.every((chunk) => text.includes(chunk))) continue;
    const score = grammarReferenceScore(g, passage.level, meaningfulChunks);
    const key = g.pattern.replace(/\s+/gu, "").trim();
    const current = bestByPattern.get(key);
    if (!current || score > current.score) bestByPattern.set(key, { grammar: g, score });
  }
  return [...bestByPattern.values()]
    .sort((a, b) => b.score - a.score || b.grammar.pattern.length - a.grammar.pattern.length)
    .slice(0, limit)
    .map(({ grammar }) => grammar);
}
