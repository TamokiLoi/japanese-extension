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

// Keep non-verb references compact; every relevant verb is included because
// conjugated verbs carry much of a reading passage's meaning.
const MAX_VOCAB_MATCHES = 12;

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
  "ところ",
]);

function isKanaOnly(word: string): boolean {
  return /^[ぁ-ゖァ-ヺー]+$/u.test(word);
}

function isUsefulVocabReference(v: VocabCard): boolean {
  const word = v.word.trim();
  const normalizedWord = word.replace(/[、。！？!?.,，．]+$/u, "");
  if (word.length < 2 || READING_REFERENCE_STOPWORDS.has(normalizedWord)) return false;
  if (/^[0-9０-９]+[、,]/u.test(word)) return false;
  if (!/[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u.test(word)) return false;
  // Short kana-only entries are overwhelmingly particles or fragments (e.g.
  // いる inside 思います). Keep content-bearing verb なる, but omit the rest.
  if (isKanaOnly(word) && word.length <= 2 && !(word === "なる" && isVerbReference(v))) return false;
  return true;
}

const UNCLASSIFIED_TANGO_SOURCES = new Set(["tango-n3", "tango-n4", "tango-n5"]);
const UNCLASSIFIED_NONVERB_WORDS = new Set([
  "向こう", "多く", "近く", "早く", "遅く", "長く", "短く", "高く", "安く", "遠く", "大きく", "小さく",
]);

function isUnclassifiedTangoVerb(v: VocabCard): boolean {
  const word = v.word.trim();
  return (
    (!v.partOfSpeech || v.partOfSpeech === "Khác") &&
    v.sources.some((source) => UNCLASSIFIED_TANGO_SOURCES.has(source)) &&
    /[\p{Script=Han}\p{Script=Katakana}]/u.test(word) &&
    !/(?:ます|です)$/u.test(word) &&
    !UNCLASSIFIED_NONVERB_WORDS.has(word) &&
    (word.endsWith("する") || /[うくぐすつぬぶむる]$/u.test(word))
  );
}

function isVerbReference(v: VocabCard): boolean {
  // Tango N5 leaves なる tagged as "Khác", without a kanji spelling.
  return (
    v.partOfSpeech === "Động từ" ||
    v.word.trim() === "なる" ||
    Boolean(v.verbGroup || v.transitivity || v.conjugations || v.pairVerb) ||
    isUnclassifiedTangoVerb(v)
  );
}

function isContentWordReference(v: VocabCard): boolean {
  if (v.partOfSpeech === "Danh từ" || v.partOfSpeech === "Trạng từ") return true;
  // Some imported JLPT lists have incomplete POS tags. Kanji terms without a
  // known non-content POS are usually nouns, so keep them in the content pool.
  return (!v.partOfSpeech || v.partOfSpeech === "Khác") && /[一-龯々]/u.test(v.word);
}

function vocabReferenceScore(v: VocabCard, passageLevel: JlptLevel, text: string, forms: Set<string>): number {
  const levelBonus = (LEVEL_RANK[v.level] - LEVEL_RANK[passageLevel]) * 6;
  const kanjiBonus = [...v.word].filter((char) => /[一-龯々]/u.test(char)).length * 6;
  const lengthBonus = Math.min(v.word.length, 8) * 2;
  const contentPosBonus = v.partOfSpeech === "Danh từ" ? 8 : v.partOfSpeech === "Trạng từ" ? 6 : 0;
  // Repetition in the passage is a stronger clue to topical importance than
  // JLPT difficulty alone; still use specificity and level to break ties.
  const occurrenceBonus = Math.min(
    [...forms].reduce((count, form) => count + countOccurrences(text, form), 0),
    5,
  ) * 14;
  const sourceBonus = v.sources.some((source) =>
    ["mimikara-n3", "tango-n1", "tango-n2", "tango-n3", "jlpt-n3-dethi"].includes(source),
  )
    ? 3
    : 0;
  return levelBonus + kanjiBonus + lengthBonus + contentPosBonus + occurrenceBonus + sourceBonus;
}

function countOccurrences(text: string, form: string): number {
  let count = 0;
  let index = 0;
  while ((index = text.indexOf(form, index)) !== -1) {
    count++;
    index += form.length;
  }
  return count;
}

function grammarReferenceScore(g: BunpoGrammarPoint, passageLevel: JlptLevel, chunks: string[]): number {
  const level = LEVEL_RANK[g.level];
  const target = LEVEL_RANK[passageLevel];
  const difficulty = level >= target ? 100 + level * 18 : level * 18 - 80;
  const matchedLength = chunks.reduce((total, chunk) => total + chunk.length, 0);
  return difficulty + Math.min(matchedLength, 12) * 4 + Math.min(g.pattern.length, 12);
}

type VerbConjugationType = "godan" | "ichidan" | "suru" | "kuru";

const GODAN_ENDINGS: Record<string, { a: string; i: string; e: string; o: string; te: string; ta: string }> = {
  う: { a: "わ", i: "い", e: "え", o: "お", te: "って", ta: "った" },
  く: { a: "か", i: "き", e: "け", o: "こ", te: "いて", ta: "いた" },
  ぐ: { a: "が", i: "ぎ", e: "げ", o: "ご", te: "いで", ta: "いだ" },
  す: { a: "さ", i: "し", e: "せ", o: "そ", te: "して", ta: "した" },
  つ: { a: "た", i: "ち", e: "て", o: "と", te: "って", ta: "った" },
  ぬ: { a: "な", i: "に", e: "ね", o: "の", te: "んで", ta: "んだ" },
  ぶ: { a: "ば", i: "び", e: "べ", o: "ぼ", te: "んで", ta: "んだ" },
  む: { a: "ま", i: "み", e: "め", o: "も", te: "んで", ta: "んだ" },
  る: { a: "ら", i: "り", e: "れ", o: "ろ", te: "って", ta: "った" },
};

// Godan verbs that would otherwise be mistaken for Ichidan by the い/え-row heuristic;
// なる is untagged as a verb in the Tango N5 source.
const ICHIDAN_RU_READING_ENDINGS = new Set("いきぎしじちぢにひびぴみりえけげせぜてでねへべぺめれ");

const GODAN_RU_EXCEPTIONS = new Set([
  "入る", "走る", "帰る", "返る", "切る", "知る", "要る", "減る", "滑る", "散る",
  "握る", "焦る", "限る", "参る", "混じる", "交じる", "蹴る", "喋る", "照る", "練る", "なる",
]);

function getVerbConjugationType(v: VocabCard): VerbConjugationType | null {
  const word = v.word.trim();
  const group = v.verbGroup ?? "";
  if (word === "来る" || word === "くる" || v.reading === "くる") return "kuru";
  if (group.includes("Nhóm 3") || word.endsWith("する") || (v.conjugations?.masu === "します" && v.conjugations.te === "して")) {
    return "suru";
  }
  if (group.includes("Nhóm 2")) return word.endsWith("る") ? "ichidan" : null;
  if (group.includes("Nhóm 1")) return GODAN_ENDINGS[word.slice(-1)] ? "godan" : null;
  if (word.endsWith("る")) {
    const reading = v.reading?.split(/[・／]/u)[0]?.trim() ?? "";
    if (GODAN_RU_EXCEPTIONS.has(word)) return "godan";
    const readingBeforeRu = [...reading].at(-2);
    if (readingBeforeRu && ICHIDAN_RU_READING_ENDINGS.has(readingBeforeRu)) return "ichidan";
    return reading ? "godan" : "ichidan";
  }
  if (GODAN_ENDINGS[word.slice(-1)]) return "godan";
  return null;
}

function addForms(forms: Set<string>, stem: string, endings: string[]) {
  for (const ending of endings) forms.add(`${stem}${ending}`);
}

function getVocabReferenceForms(v: VocabCard): Set<string> {
  const word = v.word.trim();
  const forms = new Set([word]);
  if (!isVerbReference(v)) return forms;

  const type = getVerbConjugationType(v);
  if (type === "suru") {
    const root = word.endsWith("する") ? word.slice(0, -2) : word;
    addForms(forms, root, [
      "する", "します", "しました", "しません", "しませんでした", "して", "した", "しない", "しなく", "しなかった",
      "すれば", "したら", "しよう", "しろ", "するな", "できる", "できない", "される", "されて", "された", "されない",
      "させる", "させて", "させた", "させない", "させられる",
    ]);
  } else if (type === "kuru") {
    const root = word.endsWith("くる") || word.endsWith("来る") ? word.slice(0, -2) : "";
    addForms(forms, root, [
      "来る", "来ます", "来ました", "来ません", "来て", "来た", "来ない", "来なく", "来なかった",
      "来られる", "来られない", "来られなく", "来れば", "来たら", "来よう", "来い",
      "きます", "きて", "きた", "こない", "こなく", "こなかった",
    ]);
  } else if (type === "ichidan") {
    const stem = word.endsWith("る") ? word.slice(0, -1) : "";
    addForms(forms, stem, [
      "ます", "ました", "ません", "ませんでした", "て", "た", "ない", "なく", "なかった", "れば", "たら", "よう", "ろ", "るな",
      "られる", "られます", "られて", "られた", "られない", "られなく", "られなかった",
      "させる", "させます", "させて", "させた", "させない", "させなく",
    ]);
  } else if (type === "godan") {
    const ending = GODAN_ENDINGS[word.slice(-1)];
    if (ending) {
      const stem = word.slice(0, -1);
      const te = word === "行く" ? "って" : ending.te;
      const ta = word === "行く" ? "った" : ending.ta;
      const aStem = `${stem}${ending.a}`;
      const iStem = `${stem}${ending.i}`;
      const eStem = `${stem}${ending.e}`;
      const oStem = `${stem}${ending.o}`;
      addForms(forms, iStem, ["ます", "ました", "ません", "ませんでした"]);
      addForms(forms, stem, [te, ta]);
      addForms(forms, aStem, ["ない", "なく", "なかった", "れる", "れます", "れて", "れた", "れない", "れなく", "れなかった", "せる", "せて", "せた", "せない"]);
      addForms(forms, eStem, ["る", "ます", "て", "た", "ない", "なく", "なかった", "ば"]);
      addForms(forms, oStem, ["う"]);
      forms.add(`${word}な`);
    }
  }

  // Most sources have full conjugation tables; use them when available. Some
  // suru-verbs store only the generic suffix (します/して), handled above.
  const prefix = word.slice(0, -1);
  for (const conjugation of Object.values(v.conjugations ?? {})) {
    if (conjugation && (conjugation.startsWith(word) || (prefix && conjugation.startsWith(prefix)))) {
      forms.add(conjugation);
    }
  }
  return new Set([...forms].filter((form) => form.length >= 2));
}

export function getVocabReferenceTerms(v: VocabCard): string[] {
  return [...getVocabReferenceForms(v)];
}

interface VocabReferenceEntry {
  vocab: VocabCard;
  forms: Set<string>;
  isVerb: boolean;
}

interface VocabReferenceMatch {
  forms: Set<string>;
  spans: { start: number; end: number }[];
}

const VOCAB_REFERENCES_BY_FORM = new Map<string, VocabReferenceEntry[]>();
let MAX_VOCAB_REFERENCE_FORM_LENGTH = 0;
for (const vocab of ALL_VOCAB) {
  if (!isUsefulVocabReference(vocab)) continue;
  const entry = { vocab, forms: getVocabReferenceForms(vocab), isVerb: isVerbReference(vocab) };
  for (const form of entry.forms) {
    const references = VOCAB_REFERENCES_BY_FORM.get(form);
    if (references) references.push(entry);
    else VOCAB_REFERENCES_BY_FORM.set(form, [entry]);
    MAX_VOCAB_REFERENCE_FORM_LENGTH = Math.max(MAX_VOCAB_REFERENCE_FORM_LENGTH, form.length);
  }
}

function passageText(passage: Pick<ReadingPassage, "body">): string {
  return passage.body.map((seg) => seg.text).join("");
}

// Index the passage once against precomputed dictionary and conjugated forms,
// then list every matched verb before content nouns/adverbs. Less specific
// parts of speech only fill any remaining non-verb slots.
export function findVocabInPassage(passage: Pick<ReadingPassage, "body" | "level">, limit = MAX_VOCAB_MATCHES): VocabCard[] {
  const text = passageText(passage);
  const matched = new Map<VocabReferenceEntry, VocabReferenceMatch>();
  for (let start = 0; start < text.length; start++) {
    const maxEnd = Math.min(text.length, start + MAX_VOCAB_REFERENCE_FORM_LENGTH);
    for (let end = start + 2; end <= maxEnd; end++) {
      const form = text.slice(start, end);
      const references = VOCAB_REFERENCES_BY_FORM.get(form);
      if (!references) continue;
      for (const reference of references) {
        const match = matched.get(reference);
        if (match) {
          match.forms.add(form);
          match.spans.push({ start, end });
        } else {
          matched.set(reference, { forms: new Set([form]), spans: [{ start, end }] });
        }
      }
    }
  }

  const sortByRelevance = (a: [VocabReferenceEntry, VocabReferenceMatch], b: [VocabReferenceEntry, VocabReferenceMatch]) =>
    vocabReferenceScore(b[0].vocab, passage.level, text, b[1].forms) -
      vocabReferenceScore(a[0].vocab, passage.level, text, a[1].forms) ||
    b[0].vocab.word.length - a[0].vocab.word.length;
  const allCandidates = [...matched.entries()];
  const candidates = allCandidates.filter(([entry, match]) => {
    if (entry.isVerb || (entry.vocab.partOfSpeech && entry.vocab.partOfSpeech !== "Khác")) return true;
    return !match.spans.every((span) =>
      allCandidates.some(([other, otherMatch]) =>
        other.isVerb && other !== entry && otherMatch.spans.some((otherSpan) => otherSpan.start === span.start && otherSpan.end > span.end),
      ),
    );
  });
  const matchedVerbWords = new Set(candidates.filter(([entry]) => entry.isVerb).map(([entry]) => entry.vocab.word.trim()));
  const hasRedundantParticlePrefix = (entry: VocabReferenceEntry) => {
    const word = entry.vocab.word.trim();
    return ["が", "を", "は", "に", "へ", "で", "と", "も"].some(
      (particle) => word.startsWith(particle) && matchedVerbWords.has(word.slice(particle.length)),
    );
  };
  const verbs = candidates.filter(([entry]) => entry.isVerb && !hasRedundantParticlePrefix(entry)).sort(sortByRelevance);
  const contentWords = candidates.filter(([entry]) => !entry.isVerb && isContentWordReference(entry.vocab)).sort(sortByRelevance);
  const otherWords = candidates.filter(([entry]) => !entry.isVerb && !isContentWordReference(entry.vocab)).sort(sortByRelevance);
  const remainingSlots = Math.max(0, limit - contentWords.length);
  return [
    ...verbs,
    ...contentWords.slice(0, limit),
    ...otherWords.slice(0, remainingSlots),
  ].map(([entry]) => entry.vocab);
}

export function findBunpoInPassage(passage: Pick<ReadingPassage, "body" | "level">): BunpoGrammarPoint[] {
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
    .map(({ grammar }) => grammar);
}
