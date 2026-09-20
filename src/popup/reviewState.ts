import type { Kanji, JlptLevel } from "../types/kanji.ts";
import type { BunpoGrammarPoint } from "../types/bunpo.ts";
import { ALL_KANJI } from "./kanjiState.ts";
import { ALL_VOCAB, type VocabCard } from "./vocabState.ts";
import { ALL_BUNPO } from "./bunpoState.ts";
import { loadProgressMap, filterByProgress } from "./progressState.ts";
import { formatHanViet } from "../hanVietFormat.ts";
import { storageGet, storageSet, storageRemove } from "../platform/storage";
import { shuffle } from "./arrayUtils.ts";

export type ReviewContentType = "kanji" | "vocab" | "bunpo";
// "typed": user types the answer, auto-checked against expectedAnswers.
// "reveal": user reveals displayAnswer and self-grades ("Nhớ đúng"/"Chưa
// nhớ") -- used for Bunpo, whose meaningVi is often a long free-text
// phrase (see reviewState.ts's builder below) that isn't fair to exact-match.
export type ReviewAnswerFormat = "typed" | "reveal";

export interface ReviewQuestion {
  id: string;
  kind: ReviewContentType;
  // Same mode/direction vocabulary quizState.ts uses, so recordAnswer's
  // directionStreaks accumulate against the exact same keys Quiz already
  // writes -- review and quiz progress must not silently diverge.
  mode: string;
  level: JlptLevel;
  promptLabel: string;
  prompt: string;
  answerFormat: ReviewAnswerFormat;
  expectedAnswers: string[]; // only used when answerFormat === "typed"
  displayAnswer: string; // shown on reveal either way
}

export interface ReviewAnswerResult {
  text: string;
  correct: boolean;
}

export interface ReviewSession {
  questions: ReviewQuestion[];
  answers: (ReviewAnswerResult | null)[];
  currentIndex: number;
}


function kanjiMeaning(k: Kanji): string {
  return k.meanings.vi.length > 0 ? k.meanings.vi.join(", ") : (k.meanings.viDraft?.join(", ") ?? "");
}

// Randomizes between both KANJI_MASTERY_DIRECTIONS (quizState.ts), same as
// vocabToQuestion/bunpoToQuestion below -- previously always built "meaning"
// and never "character", so a kanji that had regressed specifically on the
// "character" direction (shown the meaning, recall the character) was never
// re-drilled by Review, leaving that direction's staleness undetected. Typed
// free-text isn't practical for "type the kanji character" (no IME
// assumption), so this direction uses "reveal" + self-grade instead, same
// reasoning as bunpoToQuestion's free-text answers below.
function kanjiToQuestion(k: Kanji): ReviewQuestion {
  const meanings = k.meanings.vi.length > 0 ? k.meanings.vi : (k.meanings.viDraft ?? []);
  const meaningText = `${formatHanViet(k.hanViet, "?")} — ${kanjiMeaning(k) || k.meanings.en.join(", ") || "?"}`;
  const mode = Math.random() < 0.5 ? "character" : "meaning";
  if (mode === "character") {
    return {
      id: k.id,
      kind: "kanji",
      mode: "character",
      level: k.level,
      promptLabel: "Nghĩa này ứng với chữ Hán nào?",
      prompt: meaningText,
      answerFormat: "reveal",
      expectedAnswers: [],
      displayAnswer: k.character,
    };
  }
  return {
    id: k.id,
    kind: "kanji",
    mode: "meaning",
    level: k.level,
    promptLabel: "Chữ Hán này nghĩa là gì? (gõ nghĩa hoặc Hán Việt)",
    prompt: k.character,
    answerFormat: "typed",
    expectedAnswers: [...k.hanViet, ...meanings, ...k.meanings.en],
    displayAnswer: meaningText,
  };
}

function vocabToQuestion(v: VocabCard): ReviewQuestion {
  const canAskReading = !!v.reading && v.reading !== v.word;
  const mode = canAskReading && Math.random() < 0.5 ? "reading" : "meaning";
  if (mode === "reading") {
    return {
      id: v.id,
      kind: "vocab",
      mode: "reading",
      level: v.level,
      promptLabel: "Từ này đọc là gì?",
      prompt: v.word,
      answerFormat: "typed",
      expectedAnswers: [v.reading as string],
      displayAnswer: v.reading as string,
    };
  }
  return {
    id: v.id,
    kind: "vocab",
    mode: "meaning",
    level: v.level,
    promptLabel: "Từ này nghĩa là gì?",
    prompt: v.word,
    answerFormat: "typed",
    // meaningVi is often several comma-separated synonyms (e.g. "cao tuổi,
    // lớn tuổi") -- split into separate acceptable answers like
    // kanjiToQuestion's hanViet/meanings arrays, so typing just ONE correct
    // synonym isn't marked wrong for not matching the whole joined string.
    expectedAnswers: v.meaningVi
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    displayAnswer: v.meaningVi,
  };
}

function bunpoToQuestion(g: BunpoGrammarPoint): ReviewQuestion {
  const mode = Math.random() < 0.5 ? "pattern" : "meaning";
  if (mode === "pattern") {
    return {
      id: g.id,
      kind: "bunpo",
      mode: "pattern",
      level: g.level,
      promptLabel: "Nghĩa này ứng với mẫu ngữ pháp nào?",
      prompt: g.meaningVi,
      answerFormat: "reveal",
      expectedAnswers: [],
      displayAnswer: g.pattern,
    };
  }
  return {
    id: g.id,
    kind: "bunpo",
    mode: "meaning",
    level: g.level,
    promptLabel: "Mẫu ngữ pháp này nghĩa là gì?",
    prompt: g.pattern,
    answerFormat: "reveal",
    expectedAnswers: [],
    displayAnswer: g.meaningVi,
  };
}

export async function buildReviewQuestions(): Promise<ReviewQuestion[]> {
  const map = await loadProgressMap();
  const dueKanji = filterByProgress(ALL_KANJI, map, "due");
  const dueVocab = filterByProgress(ALL_VOCAB, map, "due");
  const dueBunpo = filterByProgress(ALL_BUNPO, map, "due");
  return shuffle([
    ...dueKanji.map(kanjiToQuestion),
    ...dueVocab.map(vocabToQuestion),
    ...dueBunpo.map(bunpoToQuestion),
  ]);
}

// Strips Vietnamese diacritics and the grammar wave-dash so a review answer
// is checked on substance, not exact typing/IME fidelity -- see
// isCorrectAnswer's doc comment for why this is deliberately lenient.
function normalizeAnswer(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[〜～]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .trim()
    .replace(/\s+/g, " ");
}

// Exact match after normalization (no substring/partial credit) against any
// one of the acceptable answers. Diacritics are ignored entirely -- the
// goal is testing whether the user recalls the meaning/reading, not their
// ability to type Vietnamese tone marks correctly.
export function isCorrectAnswer(typed: string, expected: string[]): boolean {
  const norm = normalizeAnswer(typed);
  if (norm === "") return false;
  return expected.some((e) => normalizeAnswer(e) === norm);
}

const REVIEW_SESSION_KEY = "reviewSession";

export async function loadReviewSession(): Promise<ReviewSession | null> {
  return (await storageGet<ReviewSession>(REVIEW_SESSION_KEY)) ?? null;
}

export async function saveReviewSession(session: ReviewSession): Promise<void> {
  await storageSet(REVIEW_SESSION_KEY, session);
}

export async function clearReviewSession(): Promise<void> {
  await storageRemove(REVIEW_SESSION_KEY);
}

export function isReviewSessionUnfinished(session: ReviewSession): boolean {
  return session.answers.some((a) => a === null);
}
