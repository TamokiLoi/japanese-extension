import { useEffect, useRef, useState, type CSSProperties } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  BookMarked,
  Check,
  CheckCircle2,
  Layers,
  RotateCcw,
  Shuffle,
  XCircle,
} from "lucide-react";
import {
  ALL_VOCAB,
  getVocabExamples,
  getVocabMnemonic,
  AVAILABLE_SOURCES as VOCAB_SOURCES,
  SOURCE_LABELS as VOCAB_SOURCE_LABELS,
  type VocabCard,
  type VocabSource,
} from "../../popup/vocabState.ts";
import { ALL_KANJI, AVAILABLE_LEVELS as KANJI_LEVELS } from "../../popup/kanjiState.ts";
import {
  ALL_BUNPO_SENSES,
  AVAILABLE_SOURCES as BUNPO_SOURCES,
  SOURCE_LABELS as BUNPO_SOURCE_LABELS,
} from "../../popup/bunpoState.ts";
import type { BunpoStudyItem } from "../../popup/bunpoCatalog.ts";
import type { Kanji, JlptLevel } from "../../types/kanji.ts";
import { formatHanViet } from "../../hanVietFormat.ts";
import { KANJI_STUDY_SETS } from "../../data/kanjiStudySets.ts";
import { markViewed } from "../../popup/progressState.ts";
import {
  loadFlashcardProgress,
  saveFlashcardProgress,
  type FlashcardProgress,
  type FlashcardStatus,
} from "../../popup/flashcardState.ts";
import week1Raw from "../../data/fpt-n3-kanji-week-1.json";
import week2Raw from "../../data/fpt-n3-kanji-week-2.json";
import week3Raw from "../../data/fpt-n3-kanji-week-3.json";
import week4Raw from "../../data/fpt-n3-kanji-week-4.json";
import week5Raw from "../../data/fpt-n3-kanji-week-5.json";
import week6Raw from "../../data/fpt-n3-kanji-week-6.json";
import { Button } from "../components/ui/button.tsx";
import { PageHeader } from "../components/PageHeader.tsx";

interface FptWeekDataset {
  week: number;
  words: { word: string; lessonIds: string[] }[];
}

type FlashcardCategoryId = "vocab" | "kanji" | "grammar";
type StatusFilter = "all" | FlashcardStatus;

interface FlashcardItem {
  id: string;
  /** Shared progress key used by the vocabulary/kanji/grammar study screens. */
  progressId: string;
  statusKey: string;
  front: string;
  frontLabel: string;
  primaryLabel: string;
  primary: string;
  secondaryLabel?: string;
  secondary?: string;
  details: string[];
  levels: string[];
  chapters: { number: number; title?: string }[];
}

interface FlashcardDeck {
  id: string;
  title: string;
  description: string;
  cards: FlashcardItem[];
  accent: string;
}

interface FlashcardCollection {
  id: string;
  title: string;
  description: string;
  accent: string;
  cards: FlashcardItem[];
  decks: FlashcardDeck[];
}

interface FlashcardCategory {
  id: FlashcardCategoryId;
  label: string;
  description: string;
  icon: typeof Layers;
  baseCards: FlashcardItem[];
  collections: FlashcardCollection[];
}

interface UnitGroup {
  id: string;
  title: string;
  description: string;
  cards: FlashcardItem[];
}

const WEEK_DATASETS = [week1Raw, week2Raw, week3Raw, week4Raw, week5Raw, week6Raw] as unknown as FptWeekDataset[];
const JLPT_LEVEL_ORDER: JlptLevel[] = ["N5", "N4", "N3", "N2", "N1"];
const WEEK_ACCENTS = ["#e11d48", "#ea580c", "#059669", "#7c3aed", "#2563eb", "#db2777"];
const FPT_WORD_CARDS = new Map(
  ALL_VOCAB.filter((card) => card.sources.includes("fpt-n3-tango")).map((card) => [card.word, card]),
);

function toVocabFlashcard(card: VocabCard): FlashcardItem {
  const details = [
    card.partOfSpeech || "",
    card.hanViet.length > 0 ? "Hán Việt: " + formatHanViet(card.hanViet) : "",
    ...getVocabMnemonic(card).map((hint) => "Mẹo nhớ: " + hint),
    ...getVocabExamples(card).map((example, index) => `Ví dụ ${index + 1}: ${example.jp}${example.vi ? " — " + example.vi : ""}`),
  ].filter(Boolean);
  return {
    id: "vocab:" + card.id,
    progressId: card.id,
    statusKey: "vocab:" + card.id,
    front: card.word,
    frontLabel: "Từ vựng",
    primaryLabel: "Cách đọc",
    primary: card.reading || "Chưa có cách đọc",
    secondaryLabel: "Nghĩa",
    secondary: card.meaningVi || "Chưa có nghĩa",
    details,
    levels: [card.level],
    chapters: [],
  };
}

function toKanjiFlashcard(kanji: Kanji): FlashcardItem {
  const details = [
    kanji.mnemonic ? "Mẹo nhớ: " + kanji.mnemonic : "",
    kanji.readings.on.length > 0 ? "Âm On: " + kanji.readings.on.join("、") : "",
    kanji.readings.kun.length > 0 ? "Âm Kun: " + kanji.readings.kun.join("、") : "",
    kanji.words.length > 0 ? "Từ ví dụ: " + kanji.words.slice(0, 4).join("、") : "",
  ].filter(Boolean);
  return {
    id: "kanji:" + kanji.id,
    progressId: kanji.id,
    statusKey: "kanji:" + kanji.id,
    front: kanji.character,
    frontLabel: "Kanji",
    primaryLabel: "Hán Việt",
    primary: formatHanViet(kanji.hanViet, "Chưa có Hán Việt"),
    secondaryLabel: "Nghĩa",
    secondary: kanji.meanings.vi.join(" · ") || "Chưa có nghĩa",
    details,
    levels: [kanji.level],
    chapters: [],
  };
}

function toGrammarFlashcard(item: BunpoStudyItem): FlashcardItem {
  const details = [
    item.sense.formula ? "Cấu trúc: " + item.sense.formula : "",
    item.sense.usage ? "Cách dùng: " + item.sense.usage : "",
    ...item.sense.examples.slice(0, 2).map((example) => example.jp + (example.vi ? " — " + example.vi : "")),
  ].filter(Boolean);
  return {
    id: "grammar:" + item.id,
    progressId: item.id,
    statusKey: "grammar:" + item.id,
    front: item.pattern,
    frontLabel: "Ngữ pháp",
    primaryLabel: "Ý nghĩa",
    primary: item.meaningVi || "Chưa có nghĩa",
    secondaryLabel: item.sense.formula ? "Cấu trúc" : undefined,
    secondary: item.sense.formula,
    details,
    levels: item.levels,
    chapters: item.chapters.map((chapter) => ({ number: chapter.chapter, title: chapter.chapterTitle })),
  };
}

function makeDeck(id: string, title: string, description: string, cards: FlashcardItem[], accent: string): FlashcardDeck {
  return { id, title, description, cards, accent };
}

function levelGroups(cards: FlashcardItem[]): UnitGroup[] {
  const levels = JLPT_LEVEL_ORDER.filter((level) => cards.some((card) => card.levels.includes(level)));
  if (levels.length <= 1) return [];
  return levels.map((level) => ({
    id: "level-" + level,
    title: level,
    description: "Các thẻ thuộc cấp " + level + ".",
    cards: cards.filter((card) => card.levels.includes(level)),
  }));
}

function chapterGroups(cards: FlashcardItem[]): UnitGroup[] {
  const chapters = Array.from(
    new Set(cards.flatMap((card) => card.chapters.map((chapter) => chapter.number))),
  ).sort((a, b) => a - b);
  return chapters.map((number) => {
    const first = cards.flatMap((card) => card.chapters).find((chapter) => chapter.number === number);
    const title = first?.title || "Chương " + number;
    return {
      id: "chapter-" + number,
      title: "Chương " + number + (first?.title ? " · " + first.title : ""),
      description: "Các mẫu ngữ pháp thuộc " + title + ".",
      cards: cards.filter((card) => card.chapters.some((chapter) => chapter.number === number)),
    };
  });
}

function makeCollection(
  id: string,
  title: string,
  description: string,
  cards: FlashcardItem[],
  accent: string,
  unitGroups: UnitGroup[] = [],
): FlashcardCollection {
  const allDeck = makeDeck(id + ":all", "Toàn bộ " + title, description, cards, accent);
  const unitDecks = unitGroups.map((group, index) =>
    makeDeck(id + ":" + group.id, group.title, group.description, group.cards, WEEK_ACCENTS[index % WEEK_ACCENTS.length]),
  );
  return { id, title, description, accent, cards, decks: [allDeck, ...unitDecks] };
}

function fptCardsFor(words: FptWeekDataset["words"]): FlashcardItem[] {
  const seen = new Set<string>();
  return words.flatMap(({ word }) => {
    if (seen.has(word)) return [];
    seen.add(word);
    // The source list has the malformed spelling 客様; the vocabulary card
    // uses the standard お客様, but both should resolve to the same item.
    const card = FPT_WORD_CARDS.get(word) ?? (word === "客様" ? FPT_WORD_CARDS.get("お客様") : undefined);
    return card ? [toVocabFlashcard(card)] : [];
  });
}

function categoryForVocab(): FlashcardCategory {
  const allVocabCards = ALL_VOCAB.map(toVocabFlashcard);
  const allVocabCollection = makeCollection(
    "vocab:all",
    "Toàn bộ từ vựng",
    "Từ vựng đã có trong app, có thể chia theo cấp JLPT.",
    allVocabCards,
    "#e11d48",
    levelGroups(allVocabCards),
  );

  const sourceCollections = VOCAB_SOURCES
    .filter((source) => ALL_VOCAB.some((card) => card.sources.includes(source)))
    .sort((left, right) => left === "fpt-n3-tango" ? -1 : right === "fpt-n3-tango" ? 1 : 0)
    .map((source: VocabSource, index) => {
      const sourceCards = ALL_VOCAB.filter((card) => card.sources.includes(source)).map(toVocabFlashcard);
      if (source === "fpt-n3-tango") {
        const fptWeeks = WEEK_DATASETS.map((week, weekIndex) => ({
          id: "week-" + week.week,
          title: "Tuần " + week.week,
          description: "Danh sách từ của tuần " + week.week + " theo tài liệu gốc.",
          cards: fptCardsFor(week.words),
        }));
        return makeCollection(
          "vocab:fpt-n3-tango",
          VOCAB_SOURCE_LABELS[source],
          "Bộ 680 từ được chia thành 6 tuần để ôn theo tài liệu.",
          fptCardsFor(WEEK_DATASETS.flatMap((week) => week.words)),
          WEEK_ACCENTS[0],
          fptWeeks.map((group) => ({ ...group })),
        );
      }
      return makeCollection(
        "vocab:" + source,
        VOCAB_SOURCE_LABELS[source],
        "Từ vựng trong bộ " + VOCAB_SOURCE_LABELS[source] + ".",
        sourceCards,
        WEEK_ACCENTS[(index + 1) % WEEK_ACCENTS.length],
        levelGroups(sourceCards),
      );
    });

  return {
    id: "vocab",
    label: "Từ vựng",
    description: "Chọn nguồn học, sau đó chọn toàn bộ bộ hoặc chia theo tuần/cấp độ.",
    icon: Layers,
    baseCards: allVocabCards,
    collections: [allVocabCollection, ...sourceCollections],
  };
}

function categoryForKanji(): FlashcardCategory {
  const cards = ALL_KANJI.map(toKanjiFlashcard);
  const fptSet = KANJI_STUDY_SETS["FPT-Soumatome-334"];
  const fptIds = new Set<string>(fptSet.ids);
  const fptCards = ALL_KANJI.filter((kanji) => fptIds.has(kanji.id)).map(toKanjiFlashcard);
  const groups = KANJI_LEVELS.map((level) => ({
    id: "level-" + level,
    title: level,
    description: "Kanji cấp " + level + ".",
    cards: cards.filter((card) => card.levels.includes(level)),
  }));
  return {
    id: "kanji",
    label: "Kanji",
    description: "Chọn FPT-Soumatome-334 hoặc học Kanji theo cấp JLPT.",
    icon: BookMarked,
    baseCards: cards,
    collections: [
      makeCollection(
        "kanji:FPT-Soumatome-334",
        fptSet.label,
        "Danh sách Kanji FPT-Soumatome đã có bộ lọc trong màn hình Kanji.",
        fptCards,
        "#e11d48",
      ),
      makeCollection(
        "kanji:jlpt",
        "Kanji theo cấp JLPT",
        "Ôn mặt chữ, Hán Việt, nghĩa và cách đọc.",
        cards,
        "#7c3aed",
        groups,
      ),
    ],
  };
}

function categoryForGrammar(): FlashcardCategory {
  const allGrammarCards = ALL_BUNPO_SENSES.map(toGrammarFlashcard);
  const allGrammarCollection = makeCollection(
    "grammar:all",
    "Toàn bộ ngữ pháp",
    "Các nghĩa ngữ pháp canonical đã có trong app, chia theo cấp JLPT.",
    allGrammarCards,
    "#2563eb",
    levelGroups(allGrammarCards),
  );
  const sourceCollections = BUNPO_SOURCES.map((source, index) => {
    const sourceItems = ALL_BUNPO_SENSES.filter((item) => item.sources.includes(source));
    const cards = sourceItems.map(toGrammarFlashcard);
    const groups = source === "theo-chuong" ? chapterGroups(cards) : levelGroups(cards);
    return makeCollection(
      "grammar:" + source,
      BUNPO_SOURCE_LABELS[source],
      source === "theo-chuong"
        ? "Lộ trình ngữ pháp app, có thể học toàn bộ hoặc theo chương."
        : "Các thẻ ngữ pháp thuộc nguồn " + BUNPO_SOURCE_LABELS[source] + ".",
      cards,
      WEEK_ACCENTS[(index + 2) % WEEK_ACCENTS.length],
      groups,
    );
  });
  return {
    id: "grammar",
    label: "Ngữ pháp",
    description: "Chọn nguồn/tài liệu, rồi học toàn bộ, theo cấp JLPT hoặc theo chương nếu có.",
    icon: BookOpen,
    baseCards: allGrammarCards,
    collections: [allGrammarCollection, ...sourceCollections],
  };
}

const CATEGORIES: FlashcardCategory[] = [
  categoryForVocab(),
  categoryForKanji(),
  categoryForGrammar(),
];

const STATUS_FILTERS: { id: StatusFilter; label: string }[] = [
  { id: "all", label: "Tất cả" },
  { id: "not-yet", label: "Chưa thuộc" },
  { id: "known", label: "Đã thuộc" },
];

const FLASHCARD_COUNT_OPTIONS: { value: number | "all"; label: string }[] = [
  { value: 10, label: "10 thẻ" },
  { value: 20, label: "20 thẻ" },
  { value: 30, label: "30 thẻ" },
  { value: 50, label: "50 thẻ" },
  { value: 100, label: "100 thẻ" },
  { value: 200, label: "200 thẻ" },
  { value: "all", label: "Toàn bộ" },
];

function cardsForStatus(cards: FlashcardItem[], filter: StatusFilter, progress: FlashcardProgress): FlashcardItem[] {
  if (filter === "all") return cards;
  return cards.filter((card) => (progress[card.statusKey] ?? "not-yet") === filter);
}

function statusCounts(cards: FlashcardItem[], progress: FlashcardProgress) {
  const known = cards.filter((card) => progress[card.statusKey] === "known").length;
  return { known, notYet: cards.length - known };
}

function shuffleCards(cards: FlashcardItem[]): FlashcardItem[] {
  const result = [...cards];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const other = Math.floor(Math.random() * (index + 1));
    [result[index], result[other]] = [result[other], result[index]];
  }
  return result;
}

export function FlashcardScreen() {
  const [categoryId, setCategoryId] = useState<FlashcardCategoryId>("vocab");
  const [selectedCollectionId, setSelectedCollectionId] = useState<string | null>(null);
  const [sessionDeck, setSessionDeck] = useState<FlashcardDeck | null>(null);
  const [cards, setCards] = useState<FlashcardItem[]>([]);
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [shuffleOnStart, setShuffleOnStart] = useState(false);
  const [flashcardCount, setFlashcardCount] = useState<number | "all">(20);
  // Start a study session with items still needing review; mastered cards
  // remain available through the explicit "Tất cả" / "Đã thuộc" filters.
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("not-yet");
  const [flashcardProgress, setFlashcardProgress] = useState<FlashcardProgress>({});
  const [progressLoaded, setProgressLoaded] = useState(false);
  const [progressSaveFailed, setProgressSaveFailed] = useState(false);
  const [dragOffsetX, setDragOffsetX] = useState(0);
  const [swipeExitStatus, setSwipeExitStatus] = useState<FlashcardStatus | null>(null);
  const progressRef = useRef<FlashcardProgress>({});
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const pointerStartXRef = useRef<number | null>(null);
  const suppressCardClickRef = useRef(false);

  useEffect(() => {
    let isMounted = true;
    void loadFlashcardProgress()
      .then((saved) => {
        if (!isMounted) return;
        progressRef.current = saved;
        setFlashcardProgress(saved);
      })
      .catch(() => undefined)
      .finally(() => {
        if (isMounted) setProgressLoaded(true);
      });
    return () => {
      isMounted = false;
    };
  }, []);

  const category = CATEGORIES.find((item) => item.id === categoryId) ?? CATEGORIES[0];
  const selectedCollection = category.collections.find((item) => item.id === selectedCollectionId) ?? null;
  const categoryBaseCards = category.baseCards;
  const categoryCounts = statusCounts(categoryBaseCards, flashcardProgress);
  const selectedCollectionCounts = selectedCollection
    ? statusCounts(selectedCollection.cards, flashcardProgress)
    : categoryCounts;
  const current = cards[index];
  const currentStatus = current ? flashcardProgress[current.statusKey] : undefined;

  // Reveal is the meaningful study action: it updates the shared item-level
  // activity used by Home and the common study-day log used by the streak.
  useEffect(() => {
    if (!revealed || !current) return;
    void markViewed(current.progressId);
  }, [current?.progressId, revealed]);

  function chooseCategory(nextCategory: FlashcardCategoryId) {
    setCategoryId(nextCategory);
    setSelectedCollectionId(null);
    setSessionDeck(null);
    setCards([]);
    setCompleted(false);
  }

  function startDeck(deck: FlashcardDeck) {
    const filteredCards = cardsForStatus(deck.cards, statusFilter, flashcardProgress);
    if (filteredCards.length === 0) return;
    const isFptTango = selectedCollection?.id === "vocab:fpt-n3-tango";
    const orderedCards = shuffleOnStart ? shuffleCards(filteredCards) : filteredCards;
    const cardsForSession = isFptTango || flashcardCount === "all"
      ? orderedCards
      : orderedCards.slice(0, flashcardCount);
    setSessionDeck(deck);
    setCards(cardsForSession);
    setIndex(0);
    setRevealed(false);
    setCompleted(false);
  }

  function leaveSession() {
    setSessionDeck(null);
    setCards([]);
    setIndex(0);
    setRevealed(false);
    setCompleted(false);
  }

  function backToCollections() {
    leaveSession();
    setSelectedCollectionId(null);
  }

  function nextCard() {
    if (!revealed) return;
    if (index >= cards.length - 1) {
      setCompleted(true);
      return;
    }
    setIndex((value) => value + 1);
    setRevealed(false);
  }

  function previousCard() {
    if (index === 0) return;
    setIndex((value) => value - 1);
    setRevealed(false);
    setCompleted(false);
  }

  function markCurrent(status: FlashcardStatus) {
    if (!current) return;
    const updated = { ...progressRef.current, [current.statusKey]: status };
    progressRef.current = updated;
    setFlashcardProgress(updated);
    setProgressSaveFailed(false);
    saveQueueRef.current = saveQueueRef.current
      .then(() => saveFlashcardProgress(updated))
      .catch(() => {
        setProgressSaveFailed(true);
      });

    if (index >= cards.length - 1) {
      setCompleted(true);
      return;
    }
    setIndex((value) => value + 1);
    setRevealed(false);
  }

  const categoryLabel = category.label;

  if (sessionDeck && current) {
    const progress = Math.round(((index + (completed ? 1 : 0)) / cards.length) * 100);
    return (
      <div className="mx-auto max-w-4xl px-3 py-3 md:px-8 md:py-6">
        <PageHeader
          title="Flashcard"
          subtitle={sessionDeck.title + " · " + (index + 1) + " / " + cards.length}
          icon={{ img: "icon-vocab.png", bg: "#ffedd5" }}
          action={
            <Button type="button" variant="outline" disabled={Boolean(swipeExitStatus)} onClick={leaveSession}>
              <ArrowLeft size={15} /> <span className="hidden sm:inline">Chọn phần khác</span>
            </Button>
          }
        />

        <div className="mt-5">
          <div className="flex items-center justify-between text-xs text-neutral-500">
            <span>{sessionDeck.title}</span>
            <span>{completed ? cards.length : index + 1} / {cards.length}</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-neutral-100">
            <div className="h-full rounded-full bg-rose-500 transition-all" style={{ width: (completed ? 100 : progress) + "%" }} />
          </div>

          <div
            className="mt-5 touch-pan-y"
            onPointerDown={(event) => {
              if (event.button !== 0 || swipeExitStatus) return;
              pointerStartXRef.current = event.clientX;
              setDragOffsetX(0);
              event.currentTarget.setPointerCapture(event.pointerId);
            }}
            onPointerMove={(event) => {
              const startX = pointerStartXRef.current;
              if (!revealed || startX === null || swipeExitStatus) return;
              const offset = Math.max(-120, Math.min(120, event.clientX - startX));
              setDragOffsetX(offset);
            }}
            onPointerUp={(event) => {
              const startX = pointerStartXRef.current;
              pointerStartXRef.current = null;
              if (!revealed || startX === null || swipeExitStatus) {
                setDragOffsetX(0);
                return;
              }
              const distance = event.clientX - startX;
              if (Math.abs(distance) < 72) {
                setDragOffsetX(0);
                return;
              }
              suppressCardClickRef.current = true;
              window.setTimeout(() => {
                suppressCardClickRef.current = false;
              }, 500);
              setDragOffsetX(Math.max(-120, Math.min(120, distance)));
              setSwipeExitStatus(distance > 0 ? "known" : "not-yet");
            }}
            onPointerCancel={() => {
              pointerStartXRef.current = null;
              setDragOffsetX(0);
            }}
          >
            <button
              type="button"
              disabled={Boolean(swipeExitStatus)}
              aria-pressed={revealed}
              onAnimationEnd={(event) => {
                if (event.target !== event.currentTarget || !swipeExitStatus) return;
                const status = swipeExitStatus;
                setSwipeExitStatus(null);
                setDragOffsetX(0);
                markCurrent(status);
              }}
              onClick={() => {
                if (suppressCardClickRef.current || swipeExitStatus) {
                  suppressCardClickRef.current = false;
                  return;
                }
                setRevealed((value) => !value);
              }}
              style={{
                "--flashcard-drag-x": `${dragOffsetX}px`,
                "--flashcard-drag-angle": `${dragOffsetX * 0.08}deg`,
              } as CSSProperties}
              className={[
                "flashcard-swipe-card flashcard-flip-scene relative block w-full rounded-3xl bg-transparent p-0 text-center focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-rose-100",
                dragOffsetX !== 0 && !swipeExitStatus ? "flashcard-swipe-dragging" : "",
                swipeExitStatus === "known" ? "flashcard-swipe-exit-right" : "",
                swipeExitStatus === "not-yet" ? "flashcard-swipe-exit-left" : "",
              ].filter(Boolean).join(" ")}
            >
              <span className={`flashcard-flip-inner${revealed ? " is-revealed" : ""}`}>
                <span aria-hidden={revealed} className="flashcard-face flashcard-face-front">
                  <span className="text-xs font-semibold tracking-[0.18em] text-neutral-400 uppercase">{current.frontLabel}</span>
                  <span className="mt-5 text-5xl font-bold text-neutral-800 sm:text-6xl">{current.front}</span>
                  <span className="mt-7 rounded-full bg-white/80 px-4 py-2 text-sm text-neutral-500 shadow-sm">
                    Tự nhớ đáp án rồi chạm để lật thẻ
                  </span>
                </span>
                <span aria-hidden={!revealed} className="flashcard-face flashcard-face-back">
                  <span className="text-xs font-semibold tracking-[0.18em] text-neutral-400 uppercase">{current.primaryLabel}</span>
                  <span className="mt-3 max-w-2xl text-2xl font-bold text-rose-600 sm:text-3xl">{current.primary}</span>
                  {current.secondary ? (
                    <>
                      <span className="mt-5 h-px w-16 bg-rose-200" />
                      <span className="mt-4 text-xs font-semibold tracking-[0.12em] text-neutral-400 uppercase">{current.secondaryLabel}</span>
                      <span className="mt-2 max-w-2xl text-lg font-semibold text-neutral-800">{current.secondary}</span>
                    </>
                  ) : null}
                  {current.details.length > 0 ? (
                    <span className="mt-4 block max-w-2xl space-y-1.5 text-left text-sm leading-relaxed text-neutral-600">
                      {current.details.map((detail, detailIndex) => <span key={detailIndex} className="block">{detail}</span>)}
                    </span>
                  ) : null}
                  <span className="mt-7 text-xs text-neutral-400">Vuốt phải: đã thuộc · Vuốt trái: cần ôn</span>
                </span>
              </span>
              {Math.abs(dragOffsetX) > 16 ? (
                <span
                  aria-hidden="true"
                  style={{ opacity: Math.min(1, Math.abs(dragOffsetX) / 90) }}
                  className={dragOffsetX > 0
                    ? "pointer-events-none absolute left-5 top-5 z-10 rounded-xl border-2 border-emerald-500 px-3 py-1.5 text-lg font-bold text-emerald-600"
                    : "pointer-events-none absolute right-5 top-5 z-10 rounded-xl border-2 border-amber-500 px-3 py-1.5 text-lg font-bold text-amber-600"}
                >
                  {dragOffsetX > 0 ? "✓ ĐÃ THUỘC" : "CẦN ÔN ✕"}
                </span>
              ) : null}
            </button>
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-center gap-2 text-xs">
            {currentStatus === "known" ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-3 py-1.5 font-medium text-emerald-700"><CheckCircle2 size={14} /> Đã thuộc</span>
            ) : currentStatus === "not-yet" ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-3 py-1.5 font-medium text-amber-700"><XCircle size={14} /> Cần ôn</span>
            ) : (
              <span className="rounded-full bg-neutral-100 px-3 py-1.5 text-neutral-500">Chưa đánh dấu</span>
            )}
            <span className="text-neutral-400">· {categoryCounts.known} đã thuộc, {categoryCounts.notYet} cần ôn trong mục {categoryLabel}</span>
          </div>

          {completed ? (
            <div className="mt-4 flex flex-col items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-center sm:flex-row sm:justify-between sm:text-left">
              <div>
                <p className="font-semibold text-emerald-800">Đã xem hết bộ thẻ này!</p>
                <p className="mt-0.5 text-sm text-emerald-700">Bạn có thể học lại hoặc chọn một phần khác.</p>
              </div>
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={() => startDeck(sessionDeck)}>
                  <RotateCcw size={15} /> Học lại
                </Button>
                <Button type="button" onClick={leaveSession}>Chọn phần khác</Button>
              </div>
            </div>
          ) : null}

          <div className="mt-4 flex items-center justify-between gap-2">
            <Button type="button" variant="outline" disabled={index === 0 || Boolean(swipeExitStatus)} onClick={previousCard}>
              <ArrowLeft size={15} /> Trước
            </Button>
            <Button type="button" variant={revealed ? "default" : "secondary"} disabled={Boolean(swipeExitStatus)} onClick={() => setRevealed(true)}>
              <BookOpen size={15} /> {revealed ? "Đã xem đáp án" : "Hiện đáp án"}
            </Button>
            <Button type="button" disabled={!revealed || completed || Boolean(swipeExitStatus)} onClick={nextCard}>
              {index === cards.length - 1 ? <><Check size={15} /> Hoàn tất</> : <>Tiếp <ArrowRight size={15} /></>}
            </Button>
          </div>
          {revealed && !completed ? (
            <div className="mt-4 grid grid-cols-2 gap-3">
              <Button type="button" variant="outline" disabled={Boolean(swipeExitStatus)} className="border-amber-200 text-amber-700 hover:bg-amber-50" onClick={() => markCurrent("not-yet")}>
                <XCircle size={16} /> Chưa thuộc
              </Button>
              <Button type="button" disabled={Boolean(swipeExitStatus)} className="bg-emerald-600 text-white hover:bg-emerald-700" onClick={() => markCurrent("known")}>
                <CheckCircle2 size={16} /> Đã thuộc
              </Button>
            </div>
          ) : null}
          <p className="mt-3 text-center text-xs text-neutral-400">Đánh dấu được lưu trên thiết bị này. Vuốt phải để đánh dấu đã thuộc, vuốt trái để đưa vào cần ôn.</p>
          {progressSaveFailed ? <p role="status" className="mt-2 text-center text-xs text-rose-600">Không lưu được trạng thái flashcard. Hãy thử lại hoặc kiểm tra bộ nhớ trình duyệt.</p> : null}
        </div>
      </div>
    );
  }

  const headerSubtitle = selectedCollection
    ? selectedCollection.title + " · " + selectedCollection.cards.length + " thẻ"
    : categoryLabel + " · " + category.collections.length + " bộ học";
  const filterCounts = selectedCollectionCounts;

  return (
    <div className="mx-auto max-w-5xl px-3 py-3 md:px-8 md:py-6">
      <PageHeader
        title="Flashcard"
        subtitle={headerSubtitle}
        icon={{ img: "icon-vocab.png", bg: "#ffedd5" }}
        action={
          selectedCollection ? (
            <Button type="button" variant="outline" onClick={backToCollections}>
              <ArrowLeft size={15} /> <span className="hidden sm:inline">Chọn bộ khác</span>
            </Button>
          ) : undefined
        }
      />

      <div className="mt-5 grid grid-cols-3 gap-2 rounded-2xl border border-neutral-200 bg-neutral-100 p-1.5">
        {CATEGORIES.map((item) => {
          const Icon = item.icon;
          const active = categoryId === item.id;
          return (
            <button
              key={item.id}
              type="button"
              aria-pressed={active}
              onClick={() => chooseCategory(item.id)}
              className={active
                ? "flex items-center justify-center gap-1.5 rounded-xl bg-white px-2 py-3 text-sm font-semibold text-rose-700 shadow-sm sm:gap-2 sm:px-4"
                : "flex items-center justify-center gap-1.5 rounded-xl px-2 py-3 text-sm font-medium text-neutral-600 transition hover:bg-white/70 sm:gap-2 sm:px-4"}
            >
              <Icon size={16} />
              {item.label}
            </button>
          );
        })}
      </div>

      <section className="mt-4 rounded-2xl border border-rose-100 bg-gradient-to-r from-rose-50 to-orange-50 p-4 md:p-5">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-rose-600 shadow-sm">
            <Layers size={19} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="font-semibold text-neutral-800">
              {selectedCollection ? "Chọn phần trong " + selectedCollection.title : "Chọn bộ " + categoryLabel + " để học"}
            </h2>
            <p className="mt-1 text-sm leading-relaxed text-neutral-600">
              {selectedCollection ? selectedCollection.description : category.description}
            </p>
          </div>
        </div>
        <label className="mt-4 flex cursor-pointer items-center gap-2 text-sm text-neutral-600">
          <input
            type="checkbox"
            checked={shuffleOnStart}
            onChange={(event) => setShuffleOnStart(event.target.checked)}
            className="h-4 w-4 accent-rose-600"
          />
          Xáo trộn thứ tự khi bắt đầu
          <Shuffle size={14} className="text-neutral-400" />
        </label>
        {selectedCollection && selectedCollection.id !== "vocab:fpt-n3-tango" ? (
          <label className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/80 bg-white/70 px-3 py-2.5 text-sm text-neutral-700">
            <span>
              <span className="block font-medium">Số thẻ mỗi lượt</span>
              <span className="mt-0.5 block text-xs text-neutral-500">Chọn số lượng trước khi bắt đầu học.</span>
            </span>
            <select
              aria-label="Số thẻ mỗi lượt flashcard"
              value={flashcardCount}
              onChange={(event) => setFlashcardCount(event.target.value === "all" ? "all" : Number(event.target.value))}
              className="min-w-32 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm font-medium text-neutral-700 outline-none focus:border-rose-300 focus:ring-2 focus:ring-rose-100"
            >
              {FLASHCARD_COUNT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
        ) : null}
        <div className="mt-4 border-t border-rose-100 pt-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-medium text-neutral-700">Lọc theo mức độ nhớ</span>
            <span className="text-xs text-neutral-500">{filterCounts.known} đã thuộc · {filterCounts.notYet} chưa thuộc / cần ôn</span>
          </div>
          <div className="mt-2 grid grid-cols-3 gap-2 rounded-xl bg-white/70 p-1">
            {STATUS_FILTERS.map((filter) => (
              <button
                key={filter.id}
                type="button"
                aria-pressed={statusFilter === filter.id}
                onClick={() => setStatusFilter(filter.id)}
                className={statusFilter === filter.id
                  ? "rounded-lg bg-white px-3 py-2 text-sm font-medium text-rose-700 shadow-sm"
                  : "rounded-lg px-3 py-2 text-sm font-medium text-neutral-600 transition hover:bg-white/70"}
              >
                {filter.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      {!progressLoaded ? (
        <p role="status" className="mt-5 text-center text-sm text-neutral-500">Đang tải trạng thái học…</p>
      ) : null}

      {!selectedCollection ? (
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {category.collections.map((collection) => {
            const counts = statusCounts(collection.cards, flashcardProgress);
            const available = cardsForStatus(collection.cards, statusFilter, flashcardProgress);
            return (
              <button
                key={collection.id}
                type="button"
                disabled={!progressLoaded || available.length === 0}
                onClick={() => setSelectedCollectionId(collection.id)}
                className="group flex min-h-32 items-center justify-between gap-4 rounded-2xl border border-neutral-200 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-rose-200 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50"
              >
                <div className="min-w-0">
                  <span
                    className="inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold"
                    style={{ color: collection.accent, backgroundColor: collection.accent + "14" }}
                  >
                    {collection.cards.length + " THẺ"}
                  </span>
                  <h3 className="mt-2 font-semibold text-neutral-800">{collection.title}</h3>
                  <p className="mt-1 text-xs leading-relaxed text-neutral-500">{collection.description}</p>
                  <p className="mt-2 text-xs font-medium text-neutral-600">
                    {counts.known} đã thuộc · {counts.notYet} chưa thuộc
                  </p>
                </div>
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-rose-50 text-rose-600 transition group-hover:bg-rose-600 group-hover:text-white">
                  <ArrowRight size={17} />
                </span>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {selectedCollection.decks.map((deck) => {
            const counts = statusCounts(deck.cards, flashcardProgress);
            const available = cardsForStatus(deck.cards, statusFilter, flashcardProgress);
            const cardsInSession = selectedCollection.id === "vocab:fpt-n3-tango" || flashcardCount === "all"
              ? available.length
              : Math.min(available.length, flashcardCount);
            return (
              <button
                key={deck.id}
                type="button"
                disabled={!progressLoaded || available.length === 0}
                onClick={() => startDeck(deck)}
                className="group flex min-h-32 items-center justify-between gap-4 rounded-2xl border border-neutral-200 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-rose-200 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50"
              >
                <div className="min-w-0">
                  <span
                    className="inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold"
                    style={{ color: deck.accent, backgroundColor: deck.accent + "14" }}
                  >
                    {deck.id.endsWith(":all") ? "TOÀN BỘ BỘ" : categoryLabel.toUpperCase()}
                  </span>
                  <h3 className="mt-2 font-semibold text-neutral-800">{deck.title}</h3>
                  <p className="mt-1 text-xs leading-relaxed text-neutral-500">{deck.description}</p>
                  <p className="mt-2 text-xs font-medium text-neutral-600">
                    {cardsInSession} thẻ trong lượt này · {counts.known} đã thuộc · {counts.notYet} chưa thuộc
                  </p>
                </div>
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-rose-50 text-rose-600 transition group-hover:bg-rose-600 group-hover:text-white">
                  <ArrowRight size={17} />
                </span>
              </button>
            );
          })}
        </div>
      )}

      <p className="mt-4 text-center text-xs text-neutral-400">
        Chưa đánh dấu được tính vào nhóm “Chưa thuộc”. Trạng thái được lưu trên trình duyệt này và có thể chuyển bằng sao lưu dữ liệu.
      </p>
    </div>
  );
}
