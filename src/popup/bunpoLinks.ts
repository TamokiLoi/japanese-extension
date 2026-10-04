import bunpoN3RelatedRaw from "../data/bunpo-n3-related.json";
import type { BunpoGrammarPoint, BunpoRelatedKind, BunpoRelatedGrammar } from "../types/bunpo.ts";
import type { ReadingPassage } from "../types/reading.ts";
import type { QuizBookQuestion } from "../types/quizBook.ts";
import { ALL_READING } from "./readingState.ts";
import { ALL_QUIZBOOK } from "./quizBookState.ts";
import { ALL_BUNPO } from "./bunpoState.ts";

// compareWith entries are validated at generation time to only reference a
// pattern string that really exists in the same-level data (see _scratch/
// build_bunpo_compare.py) -- this just resolves that string back to a card
// to link to. Picks the first match within the same level in case a pattern
// string happens to repeat across levels.
export function findBunpoByPattern(pattern: string, level: BunpoGrammarPoint["level"]): BunpoGrammarPoint | undefined {
  return ALL_BUNPO.find((g) => g.pattern === pattern && g.level === level);
}

interface RelatedGrammarIndex {
  grammarPatterns: Array<{ pattern: string; related: BunpoRelatedGrammar[] }>;
}

const N3_RELATED_BY_PATTERN = new Map(
  (bunpoN3RelatedRaw as RelatedGrammarIndex).grammarPatterns.map((entry) => [entry.pattern, entry.related]),
);

export interface ResolvedBunpoReference {
  target: BunpoGrammarPoint;
  relation: BunpoRelatedKind;
  note: string;
}

export function findRelatedBunpo(g: BunpoGrammarPoint): ResolvedBunpoReference[] {
  if (g.level !== "N3") return [];

  const byId = new Map<string, ResolvedBunpoReference>();
  for (const reference of N3_RELATED_BY_PATTERN.get(g.pattern) ?? []) {
    const target = findBunpoByPattern(reference.pattern, "N3");
    if (!target || target.id === g.id) continue;
    byId.set(target.id, { target, relation: reference.relation, note: reference.note });
  }
  for (const reference of g.compareWith ?? []) {
    const target = findBunpoByPattern(reference.pattern, "N3");
    if (!target || target.id === g.id) continue;
    byId.set(target.id, { target, relation: "confusable", note: reference.note });
  }
  return [...byId.values()];
}

// Same fuzzy chunk-substring test as findMatchingReadingPassages/
// findMatchingQuizBookQuestions below, but for a single piece of text
// (typically just a DeThi grammar question's correct-option text, not the
// whole sentence -- the surrounding sentence is full of common incidental
// words that are themselves real but unrelated patterns, e.g. について/
// と思う, which turn an otherwise clean match into a false ambiguity)
// instead of scanning a whole corpus -- and stricter: only returns a card when
// exactly one catalog pattern matches. A raw exam option almost never
// equals a catalog `pattern` string literally (patterns are dictionary-style,
// often bundling several related forms into one entry, e.g.
// "〜てあげる・〜てもらう・〜てくれる"), so literal equality would essentially
// never fire; this chunk-based test is the established substitute already
// used elsewhere in this file. Ambiguous (0 or 2+) matches return undefined
// rather than guessing, since an auto-flag caller has no human to disambiguate.
export function findBunpoForText(text: string, level: BunpoGrammarPoint["level"]): BunpoGrammarPoint | undefined {
  const matches = ALL_BUNPO.filter((g) => {
    if (g.level !== level) return false;
    const chunks = extractMatchChunks(g.pattern);
    return chunks.length > 0 && textContainsAllChunks(text, chunks);
  });
  return matches.length === 1 ? matches[0] : undefined;
}

const MAX_MATCHES = 5;

// Turns a grammar pattern like "〜ば〜ほど" or "〜そうだ（伝聞）" into the plain-kana
// chunks worth searching for in real text -- strips parenthetical notes
// (they're Vietnamese/meta, not part of the literal pattern), splits on the
// "〜" placeholder tildes, and drops any chunk too short to be a meaningful
// substring match. Measured against the real reading/quizbook data: a
// 2-char minimum still let common particles like "から"/"でも" match 30-60%
// of all passages (pure noise, not a real "this grammar is used here"
// signal); requiring >=3 chars cuts nearly all of that while still
// resolving ~110/240 patterns to at least one real match.
export function extractMatchChunks(pattern: string): string[] {
  const withoutNotes = pattern.replace(/（[^）]*）/g, "");
  return withoutNotes
    .split("〜")
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.length >= 3);
}

function textContainsAllChunks(text: string, chunks: string[]): boolean {
  return chunks.every((chunk) => text.includes(chunk));
}

export function findMatchingReadingPassages(g: BunpoGrammarPoint, limit = MAX_MATCHES): ReadingPassage[] {
  const chunks = extractMatchChunks(g.pattern);
  if (chunks.length === 0) return [];
  const matches: ReadingPassage[] = [];
  for (const passage of ALL_READING) {
    const text = passage.body.map((seg) => seg.text).join("");
    if (textContainsAllChunks(text, chunks)) {
      matches.push(passage);
      if (matches.length >= limit) break;
    }
  }
  return matches;
}

export function findMatchingQuizBookQuestions(g: BunpoGrammarPoint, limit = MAX_MATCHES): QuizBookQuestion[] {
  const chunks = extractMatchChunks(g.pattern);
  if (chunks.length === 0) return [];
  const pool = ALL_QUIZBOOK.filter((q) => q.category === "bunpou");
  const matches: QuizBookQuestion[] = [];
  for (const q of pool) {
    const text = `${q.question} ${q.options.join(" ")}`;
    if (textContainsAllChunks(text, chunks)) {
      matches.push(q);
      if (matches.length >= limit) break;
    }
  }
  return matches;
}

export interface ParsedUsage {
  source: string;
  jp: string;
  vi: string;
}

// Merged Shinkanzen/TRY! N3 entries store "usage" as "[Nguồn] <giải thích
// tiếng Nhật>\n<bản dịch tiếng Việt>" -- split it out so the two languages
// render as visually distinct blocks instead of one dense paragraph.
// Entries authored directly in Vietnamese (theo-chuong originals without a
// merge) don't match this shape and fall back to plain rendering.
export function parseUsage(usage: string): ParsedUsage | null {
  const m = usage.match(/^\[([^\]]+)\]\s*([^\n]+)\n([\s\S]+)$/);
  if (!m) return null;
  return { source: m[1], jp: m[2], vi: m[3] };
}

// Some older grammar records still store a compact form in `usage`. Keep
// those visible under Công thức, while requiring a notation token at the
// start so Vietnamese explanations beginning with V/N/A aren't misclassified.
export function isGrammarFormula(usage: string): boolean {
  const value = usage.trim();
  if (!value || value.includes("\n") || /[。.!?！？]/u.test(value) || /^\[[^\]]+\]/u.test(value)) return false;
  const notationPrefixes = [
    "V辞書形", "Vます形", "Vて形", "Vた形", "Vない形", "V意向形", "V普通形", "V可能形",
    "V命令形", "V禁止形", "V受身形", "V使役形", "V仮定形", "Vて", "Vた", "Vる", "Vない", "Vます",
    "V-", "V/", "V／", "V +", "V＋", "V (", "V(", "V thể", "V từ", "V thường", "V ý", "V mệnh",
    "V/A", "V/N", "V/A/N", "V/Adj", "N +", "N＋", "N /", "N/", "N／", "N-", "N1", "N2", "N3",
    "Nの", "Nに", "Nが", "Nは", "Nを", "Nで", "A-", "Aい", "Aな", "A +", "A＋", "いA", "なA",
    "普通形", "普通体", "名詞", "動詞", "形容詞", "辞書形", "て形", "た形", "ない形",
  ];
  return notationPrefixes.some((prefix) => value.startsWith(prefix));
}

// Put slash-separated grammar-title alternatives on separate lines. Keep the slash
// at the end of the preceding alternative so it doesn't look like a stray mark.
// Preserve compact pairs such as お／ご, Vれる／られる, and やすい／にくい.
export function splitGrammarFormula(formula: string): string[] {
  const trimmedFormula = formula.trim();
  const slashCount = (trimmedFormula.match(/[\/／]/gu) ?? []).length;
  if (slashCount === 1 && trimmedFormula.length <= 32) return [trimmedFormula];

  const parts = formula.split(/([/／])/u);
  const lines: string[] = [];
  let current = "";
  for (let i = 0; i < parts.length; i += 1) {
    const part = parts[i]!;
    if (part === "/" || part === "／") {
      const left = current.trim();
      const right = (parts[i + 1] ?? "").trim();
      const compactPair =
        (/^お$/u.test(left) && /^ご(?:[＋+\s]|$)/u.test(right)) ||
        (/(?:V)?れる$/u.test(left) && /^られる(?:[＋+\s]|$)/u.test(right)) ||
        (/やすい$/u.test(left) && /^にくい(?:[＋+\s]|$)/u.test(right));
      if (compactPair) {
        current += "／";
        continue;
      }
      if (current.trim()) lines.push(`${current.trim()} ／`);
      current = "";
      continue;
    }
    current += part;
  }
  if (current.trim()) lines.push(current.trim());
  return lines.length > 0 ? lines : [trimmedFormula];
}

// Formula cards keep slash-separated alternatives inline. Normalize source
// whitespace so legacy line breaks don't split a short formula unexpectedly.
export function formatGrammarFormulaInline(formula: string): string {
  return formula
    .replace(/[\r\n]+/gu, " ")
    .replace(/\s*([/／])\s*/gu, " ／ ")
    .replace(/\s+/gu, " ")
    .trim();
}

export interface ExampleFragment {
  text: string;
  highlighted: boolean;
}

// Lower than extractMatchChunks's >=3 floor -- this only drives a visual
// highlight (a soft hint), not a content-matching filter, so a slightly
// too-eager match is much cheaper here than in findMatchingReadingPassages/
// findMatchingQuizBookQuestions above.
const MIN_HIGHLIGHT_CHUNK_LEN = 2;

// Japanese example sentences conjugate the pattern (e.g. pattern "〜ように
// なる" but the example uses "…読めるようになった") so a literal full-chunk
// substring match against the example fails for a large fraction of
// patterns. Recover most of those by right-trimming the chunk down to
// MIN_HIGHLIGHT_CHUNK_LEN and taking the longest prefix that does appear.
function resolveChunkInExample(chunk: string, example: string): string | null {
  for (let len = chunk.length; len >= MIN_HIGHLIGHT_CHUNK_LEN; len--) {
    const candidate = chunk.slice(0, len);
    if (example.includes(candidate)) return candidate;
  }
  return null;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Splits an example sentence into fragments, marking the substring(s) that
// correspond to the grammar pattern as highlighted. Returns the whole
// sentence as a single non-highlighted fragment if nothing resolves (some
// patterns are phrased too differently from their example to recover a
// substring match at all) -- callers can render the result unconditionally.
export function highlightPatternInExample(example: string, pattern: string): ExampleFragment[] {
  const chunks = extractMatchChunks(pattern);
  const resolved = [...new Set(chunks.map((c) => resolveChunkInExample(c, example)).filter((c): c is string => c !== null))];
  if (resolved.length === 0) return [{ text: example, highlighted: false }];

  const sorted = resolved.slice().sort((a, b) => b.length - a.length);
  const re = new RegExp(`(${sorted.map(escapeRegExp).join("|")})`, "g");
  return example
    .split(re)
    .filter((s) => s.length > 0)
    .map((s) => ({ text: s, highlighted: resolved.includes(s) }));
}
