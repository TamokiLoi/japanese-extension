import tinhtuRaw from "../data/vocab-tanoshii-tinhtu-n3.json";
import dongtuRaw from "../data/vocab-tanoshii-dongtu-n4.json";
import mimikaraRaw from "../data/vocab-tanoshii-mimikara-n3.json";
import dongnghiaRaw from "../data/vocab-tanoshii-dongnghia-n3.json";
import tangoN3Raw from "../data/vocab-tango-n3.json";
import tangoN4Raw from "../data/vocab-tango-n4.json";
import tangoN5Raw from "../data/vocab-tango-n5.json";
import tangoN2Raw from "../data/vocab-tango-n2.json";
import tangoN1Raw from "../data/vocab-tango-n1.json";
import tuLayRaw from "../data/vocab-tu-lay.json";
import trangtu91Raw from "../data/vocab-trangtu-91.json";
import dongtu200Raw from "../data/vocab-dongtu-200.json";
import dongtuHinxu280Raw from "../data/vocab-dongtu-280-hinxu.json";
import dongtuExtraRaw from "../data/vocab-dongtu-extra-n3n4.json";
import tuGhepDongtuRaw from "../data/vocab-tu-ghep-dongtu.json";
import tangoNewRaw from "../data/vocab-tango-new.json";
import doicapTudongtuRaw from "../data/vocab-doicap-tudongtu.json";
import dongnghiaKoseiRaw from "../data/vocab-dongnghia-n3-kosei.json";
import jlptN3DethiRaw from "../data/vocab-jlpt-n3-dethi.json";
import fptN3TangoMissingRaw from "../data/vocab-fpt-n3-tango-missing.json";
import fptN3TangoWeek1Raw from "../data/fpt-n3-kanji-week-1.json";
import fptN3TangoWeek2Raw from "../data/fpt-n3-kanji-week-2.json";
import fptN3TangoWeek3Raw from "../data/fpt-n3-kanji-week-3.json";
import fptN3TangoWeek4Raw from "../data/fpt-n3-kanji-week-4.json";
import fptN3TangoWeek5Raw from "../data/fpt-n3-kanji-week-5.json";
import fptN3TangoWeek6Raw from "../data/fpt-n3-kanji-week-6.json";
import fptN3TangoExamplesA from "../data/fpt-n3-tango-examples-a.json";
import fptN3TangoExamplesB from "../data/fpt-n3-tango-examples-b.json";
import fptN3TangoMnemonicsRaw from "../data/fpt-n3-tango-mnemonics.json";
import kanjiLookAndLearnVocabRaw from "../data/vocab-kanji-look-and-learn.json";
import type {
  TanoshiiVocabDataset,
  MimikaraDataset,
  TanoshiiSynonymDataset,
  TransitivityPairDataset,
  VerbConjugations,
  VerbFormDetail,
  VocabPos,
} from "../types/vocab.ts";
import type { JlptLevel } from "../types/kanji.ts";
import type { ProgressFilter } from "./progressState.ts";
import { storageGet, storageSet } from "../platform/storage";
import { getJmdictReadingVariants } from "../lib/jmdictVocabReading.ts";
import { getVocabReadingLabels } from "../lib/vocabReading.ts";

export type VocabSource =
  | "tinhtu-n3"
  | "dongtu"
  | "mimikara-n3"
  | "dongnghia-n3"
  | "tango-n3"
  | "tango-n4"
  | "tango-n5"
  | "tango-n2"
  | "tango-n1"
  | "tu-lay"
  | "trangtu-91"
  | "tu-ghep-dongtu"
  | "tango-new"
  | "doicap-tudongtu"
  | "dongnghia-n3-kosei"
  | "jlpt-n3-dethi"
  | "fpt-n3-tango"
  | "kll-n5n4"
  | "kll-n3n2"
  | "kll-n2n1";

export interface VocabCard {
  id: string;
  word: string;
  reading: string | null;
  level: JlptLevel;
  partOfSpeech?: VocabPos;
  // Cùng 1 từ có thể xuất hiện ở nhiều bộ (vd vừa có trong Mimikara vừa có
  // trong Tango bổ sung) -- khi đó mergeDuplicateVocab() gộp lại thành 1
  // thẻ duy nhất, liệt kê đủ các nguồn ở đây thay vì tạo thẻ trùng lặp cho
  // mỗi nguồn (giống cách BunpoGrammarPoint.sources đã làm).
  sources: VocabSource[];
  hanViet: string[];
  meaningVi: string;
  mnemonic: string[];
  example: string | null;
  exampleVi: string | null;
  additionalExamples?: { jp: string; vi: string }[];
  synonym: { word: string; reading: string | null } | null;
  // Đối cặp tự động từ/tha động từ (vd 開く <-> 開ける) -- chỉ set khi từ
  // này nằm trong bộ "100 cặp tự-tha động từ" (xem fromTransitivityPairs).
  pairVerb: { word: string; reading: string | null } | null;
  // Chỉ áp dụng cho các nguồn động từ (tra cứu từ mazii.net / suy ra lúc convert).
  verbGroup?: string | null;
  transitivity?: string | null;
  verbForms?: VerbFormDetail[];
  conjugations?: VerbConjugations;
  // Nghĩa tiếng Anh -- có ở nguồn nào giữ lại field này trong dữ liệu gốc
  // (tango-new: từ mượn katakana, xem fromTanoshiiVocab; mimikara-n3: nghĩa
  // từ jisho.org, xem fromMimikara). Optional vì hầu hết nguồn khác không có.
  english?: string;
}

export interface VocabReadingVariant {
  reading: string;
  meaningVi: string;
  english?: string;
  jmdictEnglish?: string;
  jmdictId?: string;
  appCard?: VocabCard;
  examples?: { jp: string; vi: string }[];
  mnemonic?: string[];
}

export const SOURCE_LABELS: Record<VocabSource, string> = {
  "tinhtu-n3": "Tính từ N3",
  dongtu: "Động từ N3-N4",
  "mimikara-n3": "Mimikara N3",
  "dongnghia-n3": "Từ đồng nghĩa N3",
  "tango-n3": "Tango N3",
  "tango-n4": "Tango N4",
  "tango-n5": "Tango N5",
  "tango-n2": "Tango N2",
  "tango-n1": "Tango N1",
  "tu-lay": "Từ láy",
  "trangtu-91": "Trạng từ thường dùng",
  "tu-ghep-dongtu": "Động từ ghép",
  "tango-new": "Tango bổ sung",
  "doicap-tudongtu": "100 cặp Tự-Tha động từ",
  "dongnghia-n3-kosei": "Từ đồng nghĩa N3 (Kosei)",
  "jlpt-n3-dethi": "JLPT-N3",
  "fpt-n3-tango": "FPT-N3-Tango",
  "kll-n5n4": "Kanji Look and Learn N5–N4",
  "kll-n3n2": "Kanji Look and Learn N3–N2",
  "kll-n2n1": "Kanji Look and Learn N2–N1",
};

// Order sources are listed/filtered in throughout the vocab screen.
export const AVAILABLE_SOURCES: VocabSource[] = [
  "mimikara-n3",
  "dongtu",
  "tinhtu-n3",
  "dongnghia-n3",
  "tango-n3",
  "tango-n4",
  "tango-n5",
  "tango-n2",
  "tango-n1",
  "tu-lay",
  "trangtu-91",
  "tu-ghep-dongtu",
  "tango-new",
  "doicap-tudongtu",
  "dongnghia-n3-kosei",
  "jlpt-n3-dethi",
  "fpt-n3-tango",
  "kll-n5n4",
  "kll-n3n2",
  "kll-n2n1",
];

// Gộp hiển thị cho bộ lọc "Nguồn" -- KHÔNG đổi VocabSource gốc (vẫn giữ
// nguyên để tra cứu/backfill/hiển thị badge nguồn ở chi tiết từ), chỉ gộp
// vài nguồn có tính chất "cùng 1 việc, khác lát cắt" thành 1 chip để đỡ
// rối: 5 bộ Tango theo từng cấp độ (đã có bộ lọc Cấp độ lo việc đó rồi) và
// 2 bộ "Từ đồng nghĩa N3" (2 tác giả khác nhau, gần như không trùng từ --
// xem _scratch, 0/150 trùng word+reading -- nên gộp thành 1 lựa chọn thay
// vì 2 chip trông như trùng lặp).
export interface VocabSourceGroup {
  id: string;
  label: string;
  sources: VocabSource[];
}

const TANGO_LEVEL_SOURCES: VocabSource[] = ["tango-n3", "tango-n4", "tango-n5", "tango-n2", "tango-n1"];
const DONGNGHIA_SOURCES: VocabSource[] = ["dongnghia-n3", "dongnghia-n3-kosei"];

export const SOURCE_GROUPS: VocabSourceGroup[] = (() => {
  const seen = new Set<VocabSource>();
  const groups: VocabSourceGroup[] = [];
  for (const source of AVAILABLE_SOURCES) {
    if (seen.has(source)) continue;
    if (TANGO_LEVEL_SOURCES.includes(source)) {
      groups.push({ id: "group-tango-level", label: "Tango (theo cấp độ)", sources: TANGO_LEVEL_SOURCES });
      TANGO_LEVEL_SOURCES.forEach((s) => seen.add(s));
    } else if (DONGNGHIA_SOURCES.includes(source)) {
      groups.push({ id: "group-dongnghia", label: "Từ đồng nghĩa N3", sources: DONGNGHIA_SOURCES });
      DONGNGHIA_SOURCES.forEach((s) => seen.add(s));
    } else {
      groups.push({ id: source, label: SOURCE_LABELS[source], sources: [source] });
      seen.add(source);
    }
  }
  return groups;
})();

const tinhtuDataset = tinhtuRaw as unknown as TanoshiiVocabDataset;
const dongtuDataset = dongtuRaw as unknown as TanoshiiVocabDataset;
const mimikaraDataset = mimikaraRaw as unknown as MimikaraDataset;
const dongnghiaDataset = dongnghiaRaw as unknown as TanoshiiSynonymDataset;
const doicapTudongtuDataset = doicapTudongtuRaw as unknown as TransitivityPairDataset;
const dongnghiaKoseiDataset = dongnghiaKoseiRaw as unknown as TanoshiiSynonymDataset;
// OCR-derived from personal JLPT vocab-book PDFs (see
// assets/data/tango/_ocr_workspace/) rather than hand-authored like the
// tanoshii sets above -- kept as its own source/label so a user who spots
// an OCR slip knows which set it came from, instead of it being silently
// blended into the tanoshii sources.
const tangoN3Dataset = tangoN3Raw as unknown as TanoshiiVocabDataset;
const tangoN4Dataset = tangoN4Raw as unknown as TanoshiiVocabDataset;
const tangoN5Dataset = tangoN5Raw as unknown as TanoshiiVocabDataset;
const tangoN2Dataset = tangoN2Raw as unknown as TanoshiiVocabDataset;
const tangoN1Dataset = tangoN1Raw as unknown as TanoshiiVocabDataset;
const tuLayDataset = tuLayRaw as unknown as TanoshiiVocabDataset;
const trangtu91Dataset = trangtu91Raw as unknown as TanoshiiVocabDataset;
// "dongtu" gộp 3 nguồn động từ N3-N4 (tanoshii N4, 200 động từ Thu Hương,
// 280 động từ Hinxu Tanoshii) thành 1 nhóm chung -- đã dedup theo
// kanji+reading giữa 3 file lúc convert (xem meta.notes trong từng file),
// nên coi các entry này là rời rạc, không trùng lặp nhau khi gộp ở đây.
const dongtu200Dataset = dongtu200Raw as unknown as TanoshiiVocabDataset;
const dongtuHinxu280Dataset = dongtuHinxu280Raw as unknown as TanoshiiVocabDataset;
const dongtuExtraDataset = dongtuExtraRaw as unknown as TanoshiiVocabDataset;
const tuGhepDongtuDataset = tuGhepDongtuRaw as unknown as TanoshiiVocabDataset;
const tangoNewDataset = tangoNewRaw as unknown as TanoshiiVocabDataset;
// Từ vựng quét ra từ 13 đề N3 thật (2019-2025) -- xuất hiện trong câu hỏi/đáp
// án phần 文字・語彙 nhưng chưa có ở bất kỳ nguồn nào khác (kể cả dạng な/する).
const jlptN3DethiDataset = jlptN3DethiRaw as unknown as TanoshiiVocabDataset;
const fptN3TangoMissingDataset = fptN3TangoMissingRaw as unknown as TanoshiiVocabDataset;
type KanjiLookAndLearnVocabDataset = {
  words: {
    id: string;
    word: string;
    reading: string;
    level: JlptLevel;
    source: Extract<VocabSource, "kll-n5n4" | "kll-n3n2" | "kll-n2n1">;
    hanViet: string[];
    meaningVi: string;
  }[];
};
const kanjiLookAndLearnVocabDataset = kanjiLookAndLearnVocabRaw as KanjiLookAndLearnVocabDataset;

function fromKanjiLookAndLearnVocab(dataset: KanjiLookAndLearnVocabDataset): VocabCard[] {
  return dataset.words.map((word) => ({
    id: word.id,
    word: word.word,
    reading: word.reading,
    level: word.level,
    partOfSpeech: "Khác",
    sources: [word.source],
    hanViet: word.hanViet,
    meaningVi: word.meaningVi,
    mnemonic: [],
    example: null,
    exampleVi: null,
    synonym: null,
    pairVerb: null,
  }));
}

type FptN3TangoWeek = { words: { word: string }[] };
type FptN3TangoExample = { jp: string; vi: string };
type FptN3TangoExampleMap = Record<string, FptN3TangoExample[]>;
type FptN3TangoMnemonicMap = Record<string, string>;
const FPT_N3_TANGO_WORD_ALIASES: Record<string, string> = { "客様": "お客様" };
function canonicalizeFptN3TangoWord(word: string): string {
  return FPT_N3_TANGO_WORD_ALIASES[word] ?? word;
}
const FPT_N3_TANGO_WORDS = new Set(
  [
    fptN3TangoWeek1Raw,
    fptN3TangoWeek2Raw,
    fptN3TangoWeek3Raw,
    fptN3TangoWeek4Raw,
    fptN3TangoWeek5Raw,
    fptN3TangoWeek6Raw,
  ]
    .flatMap((week) => (week as FptN3TangoWeek).words)
    .map(({ word }) => canonicalizeFptN3TangoWord(word)),
);
function canonicalizeFptWordMap<T>(map: Record<string, T>): Record<string, T> {
  return Object.fromEntries(Object.entries(map).map(([word, value]) => [canonicalizeFptN3TangoWord(word), value]));
}
const FPT_N3_TANGO_EXAMPLES = canonicalizeFptWordMap<FptN3TangoExample[]>({
  ...(fptN3TangoExamplesA as FptN3TangoExampleMap),
  ...(fptN3TangoExamplesB as FptN3TangoExampleMap),
});
const FPT_N3_TANGO_MNEMONICS = canonicalizeFptWordMap<string>(fptN3TangoMnemonicsRaw as FptN3TangoMnemonicMap);

// The FPT sentence bank is indexed by spelling, while the vocabulary viewer
// now exposes one tab per reading. These source-order indexes keep each
// sentence with the reading it actually demonstrates. Empty arrays explicitly
// prevent a sentence for a neighboring reading from leaking into this tab.
const FPT_N3_TANGO_EXAMPLE_READINGS: Record<string, Record<string, number[]>> = {
  "両親": { "りょうしん": [0, 1], "ふたおや": [0, 1] },
  "君": { "きみ": [0, 1], "くん": [] },
  "塩": { "しお": [0, 1], "えん": [] },
  "心": { "こころ": [0, 1], "しん": [] },
  "昨夜": { "ゆうべ": [0, 1], "さくや": [0, 1] },
  "昨日": { "きのう": [0, 1], "さくじつ": [0, 1] },
  "汚す": { "よごす": [0, 1], "けがす": [] },
  "着替える": { "きがえる": [0, 1], "きかえる": [0, 1] },
  "石": { "いし": [0, 1], "こく": [] },
  "米": { "こめ": [0, 1], "べい": [] },
  "表": { "ひょう": [0], "おもて": [1] },
  "角": { "かど": [0, 1], "すみ": [] },
};

const FPT_N3_TANGO_MNEMONIC_READINGS: Record<string, string[]> = {
  "両親": ["りょうしん", "ふたおや"],
  "君": ["きみ"],
  "塩": ["しお", "えん"],
  "心": ["こころ", "しん"],
  "昨夜": ["ゆうべ", "さくや"],
  "昨日": ["きのう", "さくじつ"],
  "汚す": ["よごす"],
  "着替える": ["きがえる", "きかえる"],
  "石": ["いし"],
  "米": ["こめ"],
  "表": ["ひょう"],
  "角": ["かど"],
};

// These examples came from source cards whose reading field lists alternatives
// with ・. Once those become separate tabs, retain the sentence only where its
// natural in-context reading agrees with the tab.
const COMPOSITE_READING_EXAMPLE_INDEXES: Record<string, Record<string, number[]>> = {
  "四": { "し": [0], "よん": [] },
  "七": { "しち": [], "なな": [] },
  "九": { "く": [0], "きゅう": [] },
  "後": { "ご": [], "あと": [0] },
  "内": { "うち": [], "ない": [0] },
};

function addFptTangoExamples(card: VocabCard, hasMultipleReadings: boolean): VocabCard {
  if (!card.sources.includes("fpt-n3-tango")) return card;
  // FPT marks counters and suffixes with ～; generated usage sentences use
  // concrete forms (e.g. 三冊, 二十歳), so match the lexical suffix itself.
  const target = card.word.replace(/[～〜]/g, "");
  // Treat the curated FPT pair as authoritative. Legacy dictionary examples
  // can contain OCR debris or fragments, and must not count toward the two
  // full-sentence examples shown on the vocabulary card and flashcard.
  const examplesForWord = FPT_N3_TANGO_EXAMPLES[card.word] ?? [];
  const readingIndexes = FPT_N3_TANGO_EXAMPLE_READINGS[card.word];
  const allowedIndexes = hasMultipleReadings && readingIndexes
    ? new Set(getVocabReadingLabels(card.word, card.reading).flatMap((reading) => readingIndexes[reading] ?? []))
    : undefined;
  const examples = examplesForWord
    .flatMap((example, index) => {
      const cleaned = { jp: example.jp.trim(), vi: example.vi.trim() };
      const valid = (cleaned.jp.includes(card.word) || (target && cleaned.jp.includes(target)))
        && cleaned.vi
        && /[。！？!?]$/.test(cleaned.jp);
      return valid && (!allowedIndexes || allowedIndexes.has(index)) ? [cleaned] : [];
    })
    .filter((example, index, all) => all.findIndex((candidate) => candidate.jp === example.jp) === index)
    .slice(0, 2);
  if (hasMultipleReadings && readingIndexes) {
    if (examples.length === 0) return card;
    return {
      ...card,
      example: examples[0].jp,
      exampleVi: examples[0].vi,
      additionalExamples: examples.slice(1),
    };
  }
  if (examples.length < 2) return card;
  return {
    ...card,
    example: examples[0].jp,
    exampleVi: examples[0].vi,
    additionalExamples: [examples[1]],
  };
}

function fromTanoshiiVocab(source: VocabSource, dataset: TanoshiiVocabDataset): VocabCard[] {
  return dataset.words.map((w) => ({
    id: w.id,
    word: w.word,
    reading: w.reading,
    level: w.level,
    partOfSpeech: w.partOfSpeech,
    sources: [source],
    hanViet: w.hanViet,
    meaningVi: w.meaningVi,
    mnemonic: w.mnemonic,
    example: w.example,
    exampleVi: w.exampleVi,
    synonym: null,
    pairVerb: null,
    verbGroup: w.verbGroup,
    transitivity: w.transitivity,
    verbForms: w.verbForms,
    conjugations: w.conjugations,
    english: w.english,
  }));
}

function fromMimikara(dataset: MimikaraDataset): VocabCard[] {
  return dataset.words.map((w) => ({
    id: w.id,
    word: w.word,
    reading: w.reading,
    level: w.level,
    sources: ["mimikara-n3"],
    hanViet: w.hanViet,
    meaningVi: w.meaningVi,
    mnemonic: w.mnemonic,
    example: w.example,
    exampleVi: w.exampleVi,
    synonym: null,
    pairVerb: null,
    partOfSpeech: w.partOfSpeech,
    verbGroup: w.verbGroup,
    transitivity: w.transitivity,
    verbForms: w.verbForms,
    english: w.english,
  }));
}

function fromDongnghia(source: VocabSource, dataset: TanoshiiSynonymDataset): VocabCard[] {
  return dataset.pairs.map((p) => ({
    id: p.id,
    word: p.word,
    reading: p.wordReading,
    level: p.level,
    sources: [source],
    hanViet: [],
    meaningVi: p.meaningVi,
    mnemonic: [],
    example: null,
    exampleVi: null,
    synonym: { word: p.synonym, reading: p.synonymReading },
    pairVerb: null,
  }));
}

// Mỗi cặp tự-tha động từ sinh ra 2 VocabCard (1 cho mỗi vế), liên kết chéo
// nhau qua pairVerb -- nếu từ đã tồn tại ở nguồn khác (vd tango-n3),
// mergeDuplicateVocab() sẽ backfill pairVerb vào đúng thẻ đã có thay vì
// tạo thẻ trùng, nhờ key gộp là word+reading.
function fromTransitivityPairs(dataset: TransitivityPairDataset): VocabCard[] {
  const cards: VocabCard[] = [];
  for (const p of dataset.pairs) {
    cards.push({
      id: `${p.id}-jidoushi`,
      word: p.jidoushi,
      reading: p.jidoushiReading,
      level: p.level,
      partOfSpeech: "Động từ",
      sources: ["doicap-tudongtu"],
      hanViet: [],
      meaningVi: p.meaningVi,
      mnemonic: [],
      example: p.exampleJidoushi,
      exampleVi: p.exampleJidoushiVi,
      synonym: null,
      pairVerb: { word: p.tadoushi, reading: p.tadoushiReading },
      transitivity: "Tự động từ",
    });
    cards.push({
      id: `${p.id}-tadoushi`,
      word: p.tadoushi,
      reading: p.tadoushiReading,
      level: p.level,
      partOfSpeech: "Động từ",
      sources: ["doicap-tudongtu"],
      hanViet: [],
      meaningVi: p.meaningVi,
      mnemonic: [],
      example: p.exampleTadoushi,
      exampleVi: p.exampleTadoushiVi,
      synonym: null,
      pairVerb: { word: p.jidoushi, reading: p.jidoushiReading },
      transitivity: "Tha động từ",
    });
  }
  return cards;
}

// Cùng 1 từ (word+reading trùng khớp) có thể tới từ nhiều bộ khác nhau --
// gộp thành 1 thẻ duy nhất thay vì để trùng lặp trong danh sách/luyện tập.
// Thẻ đầu tiên gặp trong mảng đầu vào (theo thứ tự khai báo ở ALL_VOCAB bên
// dưới, Mimikara luôn đứng trước) làm "chính": giữ nguyên id/level của nó
// để không phá tiến độ học (mastered/flagged) đã lưu theo id đó, chỉ bổ
// sung field nào đang rỗng bằng field tương ứng từ các bản trùng khác (vd
// Mimikara thiếu example/mnemonic thì lấy từ Tango bổ sung, còn hanViet của
// Mimikara vẫn được giữ nếu Tango bổ sung không có).
function mergeDuplicateVocab(cards: VocabCard[]): VocabCard[] {
  const groups = new Map<string, VocabCard[]>();
  for (const c of cards) {
    const key = `${c.word}|${c.reading ?? ""}`;
    const group = groups.get(key);
    if (group) group.push(c);
    else groups.set(key, [c]);
  }

  const merged: VocabCard[] = [];
  for (const group of groups.values()) {
    if (group.length === 1) {
      merged.push(group[0]);
      continue;
    }
    const [primary, ...rest] = group;
    const pick = <T,>(get: (c: VocabCard) => T | null | undefined, isEmpty: (v: T) => boolean): T | undefined => {
      const primaryVal = get(primary);
      if (primaryVal != null && !isEmpty(primaryVal)) return primaryVal;
      for (const c of rest) {
        const v = get(c);
        if (v != null && !isEmpty(v)) return v;
      }
      return primaryVal ?? undefined;
    };
    merged.push({
      ...primary,
      sources: [...new Set(group.flatMap((c) => c.sources))],
      hanViet: pick((c) => c.hanViet, (v: string[]) => v.length === 0) ?? [],
      mnemonic: pick((c) => c.mnemonic, (v: string[]) => v.length === 0) ?? [],
      example: pick((c) => c.example, (v: string | null) => !v) ?? null,
      exampleVi: pick((c) => c.exampleVi, (v: string | null) => !v) ?? null,
      pairVerb: pick((c) => c.pairVerb, (v: { word: string; reading: string | null }) => !v) ?? null,
      partOfSpeech: pick((c) => c.partOfSpeech, (v: VocabPos) => !v || v === "Khác"),
      verbGroup: pick((c) => c.verbGroup, (v: string | null) => !v),
      transitivity: pick((c) => c.transitivity, (v: string | null) => !v),
      verbForms: pick((c) => c.verbForms, (v: VerbFormDetail[]) => !v || v.length === 0),
      conjugations: pick((c) => c.conjugations, (v: VerbConjugations) => !v || Object.keys(v).length === 0),
      english: pick((c) => c.english, (v: string) => !v),
    });
  }
  return merged;
}

const BASE_VOCAB: VocabCard[] = mergeDuplicateVocab([
  ...fromMimikara(mimikaraDataset),
  ...fromTanoshiiVocab("dongtu", dongtuDataset),
  ...fromTanoshiiVocab("dongtu", dongtu200Dataset),
  ...fromTanoshiiVocab("dongtu", dongtuHinxu280Dataset),
  ...fromTanoshiiVocab("dongtu", dongtuExtraDataset),
  ...fromTanoshiiVocab("tinhtu-n3", tinhtuDataset),
  ...fromDongnghia("dongnghia-n3", dongnghiaDataset),
  ...fromTanoshiiVocab("tango-n3", tangoN3Dataset),
  ...fromTanoshiiVocab("tango-n4", tangoN4Dataset),
  ...fromTanoshiiVocab("tango-n5", tangoN5Dataset),
  ...fromTanoshiiVocab("tango-n2", tangoN2Dataset),
  ...fromTanoshiiVocab("tango-n1", tangoN1Dataset),
  ...fromTanoshiiVocab("tu-lay", tuLayDataset),
  ...fromTanoshiiVocab("trangtu-91", trangtu91Dataset),
  ...fromTanoshiiVocab("tu-ghep-dongtu", tuGhepDongtuDataset),
  ...fromTanoshiiVocab("tango-new", tangoNewDataset),
  ...fromTransitivityPairs(doicapTudongtuDataset),
  ...fromDongnghia("dongnghia-n3-kosei", dongnghiaKoseiDataset),
  ...fromTanoshiiVocab("jlpt-n3-dethi", jlptN3DethiDataset),
]);

// Link the FPT-N3-Tango study list to existing vocabulary cards by spelling,
// keeping each card's original id and progress. Supplemental terms already
// present under the same spelling and reading are merged rather than shown as
// duplicate cards. Week membership remains in the six source files for weekly
// study UX.
const TAGGED_EXISTING_VOCAB = BASE_VOCAB.map((card) => {
  if (!FPT_N3_TANGO_WORDS.has(canonicalizeFptN3TangoWord(card.word))) return card;
  return { ...card, sources: [...new Set([...card.sources, "fpt-n3-tango" as const])] };
});

const FPT_N3_TANGO_SUPPLEMENTAL = fromTanoshiiVocab("fpt-n3-tango", fptN3TangoMissingDataset);

const MERGED_VOCAB = mergeDuplicateVocab([
  ...TAGGED_EXISTING_VOCAB,
  ...FPT_N3_TANGO_SUPPLEMENTAL,
  ...fromKanjiLookAndLearnVocab(kanjiLookAndLearnVocabDataset),
]);

const VOCAB_READING_LABELS_BY_WORD = new Map<string, Set<string>>();
for (const card of MERGED_VOCAB) {
  const readings = VOCAB_READING_LABELS_BY_WORD.get(card.word) ?? new Set<string>();
  for (const reading of getVocabReadingLabels(card.word, card.reading)) readings.add(reading);
  VOCAB_READING_LABELS_BY_WORD.set(card.word, readings);
}
for (const word of VOCAB_READING_LABELS_BY_WORD.keys()) {
  for (const variant of getJmdictReadingVariants(word)) {
    const readings = VOCAB_READING_LABELS_BY_WORD.get(word)!;
    readings.add(variant.reading);
  }
}
const MULTI_READING_WORDS = new Set(
  [...VOCAB_READING_LABELS_BY_WORD]
    .filter(([, readings]) => readings.size > 1)
    .map(([word]) => word),
);

export const ALL_VOCAB: VocabCard[] = MERGED_VOCAB.map((card) =>
  addFptTangoExamples(card, MULTI_READING_WORDS.has(card.word)),
);

const READING_VARIANTS_BY_WORD = new Map<string, Map<string, VocabReadingVariant>>();
for (const card of ALL_VOCAB) {
  if (!card.reading) continue;
  const variants = READING_VARIANTS_BY_WORD.get(card.word) ?? new Map<string, VocabReadingVariant>();
  for (const reading of getVocabReadingLabels(card.word, card.reading)) {
    const existing = variants.get(reading);
    if (existing) {
      existing.appCard ??= card;
      existing.meaningVi ||= card.meaningVi;
      existing.english ||= card.english;
    } else {
      variants.set(reading, {
        reading,
        meaningVi: card.meaningVi,
        english: card.english,
        appCard: card,
      });
    }
  }
  READING_VARIANTS_BY_WORD.set(card.word, variants);
}
for (const variant of [...new Set(ALL_VOCAB.map((card) => card.word))].flatMap((word) => getJmdictReadingVariants(word))) {
  const variants = READING_VARIANTS_BY_WORD.get(variant.word) ?? new Map<string, VocabReadingVariant>();
  const existing = variants.get(variant.reading);
  if (existing) {
    existing.jmdictEnglish = variant.glossEn;
    existing.jmdictId = variant.jmdictId;
  } else {
    variants.set(variant.reading, {
      reading: variant.reading,
      meaningVi: variant.meaningVi,
      jmdictEnglish: variant.glossEn,
      jmdictId: variant.jmdictId,
    });
  }
  READING_VARIANTS_BY_WORD.set(variant.word, variants);
}

for (const [word, readings] of Object.entries(FPT_N3_TANGO_EXAMPLE_READINGS)) {
  const variants = READING_VARIANTS_BY_WORD.get(word);
  const sourceExamples = FPT_N3_TANGO_EXAMPLES[word] ?? [];
  if (!variants) continue;
  for (const [reading, indexes] of Object.entries(readings)) {
    const variant = variants.get(reading);
    if (!variant) continue;
    variant.examples = indexes
      .map((index) => sourceExamples[index])
      .filter((example): example is FptN3TangoExample => !!example)
      .map((example) => ({ jp: example.jp.trim(), vi: example.vi.trim() }));
  }
}

for (const [word, readings] of Object.entries(COMPOSITE_READING_EXAMPLE_INDEXES)) {
  const variants = READING_VARIANTS_BY_WORD.get(word);
  if (!variants) continue;
  for (const [reading, indexes] of Object.entries(readings)) {
    const variant = variants.get(reading);
    if (!variant?.appCard) continue;
    variant.examples = getVocabExamples(variant.appCard).filter((_, index) => indexes.includes(index));
  }
}

for (const [word, allowedReadings] of Object.entries(FPT_N3_TANGO_MNEMONIC_READINGS)) {
  const variants = READING_VARIANTS_BY_WORD.get(word);
  const hint = FPT_N3_TANGO_MNEMONICS[word];
  if (!variants || !hint) continue;
  for (const variant of variants.values()) {
    variant.mnemonic = allowedReadings.includes(variant.reading) ? [hint] : [];
  }
}

export function getVocabReadingVariants(card: Pick<VocabCard, "word" | "reading">): VocabReadingVariant[] {
  const variants = READING_VARIANTS_BY_WORD.get(card.word);
  const defaultReading = getVocabReadingLabels(card.word, card.reading)[0];
  if (!variants) {
    return defaultReading ? getVocabReadingLabels(card.word, card.reading).map((reading) => ({ reading, meaningVi: "" })) : [];
  }
  return [...variants.values()].sort((a, b) => Number(b.reading === defaultReading) - Number(a.reading === defaultReading));
}

export function getVocabExamples(card: Pick<VocabCard, "example" | "exampleVi" | "additionalExamples">): FptN3TangoExample[] {
  const examples: FptN3TangoExample[] = [];
  const seen = new Set<string>();
  const candidates = [
    ...(card.example ? [{ jp: card.example, vi: card.exampleVi ?? "" }] : []),
    ...(card.additionalExamples ?? []),
  ];
  for (const example of candidates) {
    const jp = example.jp.trim();
    if (!jp || seen.has(jp)) continue;
    seen.add(jp);
    examples.push({ jp, vi: example.vi.trim() });
  }
  return examples;
}

export function getVocabMnemonic(
  card: Pick<VocabCard, "word" | "sources" | "mnemonic" | "reading">,
  selectedReading?: string,
): string[] {
  const reading = selectedReading ?? getVocabReadingLabels(card.word, card.reading)[0];
  const cardReadings = getVocabReadingLabels(card.word, card.reading);
  if (reading && cardReadings.length > 0 && !cardReadings.includes(reading)) return [];
  const fptHint = FPT_N3_TANGO_MNEMONICS[card.word];
  if (fptHint) {
    const allowedReadings = FPT_N3_TANGO_MNEMONIC_READINGS[card.word];
    if (allowedReadings) {
      if (allowedReadings.includes(reading ?? "")) return [fptHint];
    } else if (card.sources.includes("fpt-n3-tango")) {
      return [fptHint];
    }
  }
  // A couple of older vocabulary records stored this as a single string
  // despite the schema requiring an array. Normalize defensively so one bad
  // mnemonic cannot prevent the entire Flashcard screen from rendering.
  const mnemonic: unknown = card.mnemonic;
  if (Array.isArray(mnemonic)) {
    return mnemonic.filter((hint): hint is string => typeof hint === "string" && hint.trim().length > 0);
  }
  return typeof mnemonic === "string" && mnemonic.trim() ? [mnemonic] : [];
}

export function countForSource(source: VocabSource): number {
  return new Set(ALL_VOCAB.filter((v) => v.sources.includes(source)).map((v) => v.word)).size;
}

const LEVEL_ORDER: JlptLevel[] = ["N5", "N4", "N3", "N2", "N1"];
export const AVAILABLE_LEVELS: JlptLevel[] = LEVEL_ORDER.filter((level) => ALL_VOCAB.some((v) => v.level === level));

export function countForLevel(level: JlptLevel): number {
  return new Set(ALL_VOCAB.filter((v) => v.level === level).map((v) => v.word)).size;
}

const VOCAB_BY_ID = new Map(ALL_VOCAB.map((v) => [v.id, v]));
export function findVocabById(id: string): VocabCard | undefined {
  return VOCAB_BY_ID.get(id);
}

// Used to resolve a bare {word, reading} reference (pairVerb, synonym) back
// to the VocabCard/id that holds it, so it can be rendered as a jump link
// instead of inert text -- see resolveJumpState for the actual navigation.
const VOCAB_BY_WORD_READING = new Map(ALL_VOCAB.map((v) => [`${v.word}|${v.reading ?? ""}`, v]));
export function findVocabByWordReading(word: string, reading: string | null): VocabCard | undefined {
  return VOCAB_BY_WORD_READING.get(`${word}|${reading ?? ""}`);
}

export interface VocabViewerState {
  selectedSources: VocabSource[];
  selectedLevels: JlptLevel[];
  randomOrder: boolean;
  shuffleSeed: number;
  index: number;
  progressFilter: ProgressFilter;
  // "card": one word at a time (the study flow). "grid": an overview tile
  // per word in the current filter, colored by mastery bucket -- mirrors
  // kanjiState.ts's viewMode.
  viewMode: "card" | "grid";
}

const STORAGE_KEY = "vocabViewer";

export function defaultViewerState(): VocabViewerState {
  return {
    selectedSources: ["mimikara-n3", "dongtu", "tinhtu-n3", "tango-n3", "tango-n4", "tango-n5"],
    selectedLevels: [...AVAILABLE_LEVELS],
    randomOrder: false,
    shuffleSeed: Date.now(),
    index: 0,
    progressFilter: "all",
    viewMode: "card",
  };
}

export async function loadViewerState(): Promise<VocabViewerState> {
  const saved = await storageGet<Partial<VocabViewerState>>(STORAGE_KEY);
  const fallback = defaultViewerState();
  const selectedSources = (saved?.selectedSources ?? fallback.selectedSources).filter((s) =>
    AVAILABLE_SOURCES.includes(s),
  );
  const selectedLevels = (saved?.selectedLevels ?? fallback.selectedLevels).filter((l) => AVAILABLE_LEVELS.includes(l));
  return {
    selectedSources: selectedSources.length > 0 ? selectedSources : fallback.selectedSources,
    selectedLevels: selectedLevels.length > 0 ? selectedLevels : fallback.selectedLevels,
    randomOrder: saved?.randomOrder ?? fallback.randomOrder,
    shuffleSeed: saved?.shuffleSeed ?? fallback.shuffleSeed,
    index: saved?.index ?? fallback.index,
    progressFilter: saved?.progressFilter ?? fallback.progressFilter,
    viewMode: saved?.viewMode ?? fallback.viewMode,
  };
}

export async function saveViewerState(state: VocabViewerState): Promise<void> {
  await storageSet(STORAGE_KEY, state);
}

// Same deterministic PRNG approach as kanjiState.ts -- kept as a separate
// copy rather than a shared import so each screen's state module stays
// self-contained.
function mulberry32(seed: number): () => number {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seededShuffle<T>(items: T[], seed: number): T[] {
  const rand = mulberry32(seed);
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function matchesFilters(v: VocabCard, state: VocabViewerState): boolean {
  return v.sources.some((s) => state.selectedSources.includes(s)) && state.selectedLevels.includes(v.level);
}

export function getOrderedList(state: VocabViewerState): VocabCard[] {
  const filtered = ALL_VOCAB.filter((v) => matchesFilters(v, state));
  return state.randomOrder ? seededShuffle(filtered, state.shuffleSeed) : filtered;
}

// A spelling with multiple readings is one study card with reading tabs.
// The first eligible entry remains the representative so its saved viewer
// order and progress ID stay stable; alternate reading cards remain attached
// through getVocabReadingVariants() and keep their own progress IDs.
export function groupVocabCardsBySpelling(cards: VocabCard[]): VocabCard[] {
  const seen = new Set<string>();
  return cards.filter((card) => {
    if (seen.has(card.word)) return false;
    seen.add(card.word);
    return true;
  });
}

// Used when jumping to a specific vocab card from elsewhere (a "chữ Hán
// này xuất hiện trong" link on a Kanji card, a search result). Widens the
// current source/level filter to include the target's if excluded, and
// clears the progress filter so it can't hide the very card being jumped
// to. Returns null if the id doesn't exist in the dataset at all.
export function resolveJumpState(state: VocabViewerState, targetId: string): VocabViewerState | null {
  const target = findVocabById(targetId);
  if (!target) return null;
  const missingSources = target.sources.filter((s) => !state.selectedSources.includes(s));
  const missingLevel = state.selectedLevels.includes(target.level) ? [] : [target.level];
  const newState: VocabViewerState = {
    ...state,
    selectedSources: missingSources.length === 0 ? state.selectedSources : [...state.selectedSources, ...missingSources],
    selectedLevels: missingLevel.length === 0 ? state.selectedLevels : [...state.selectedLevels, ...missingLevel],
    progressFilter: "all",
    viewMode: "card",
  };
  const list = getOrderedList(newState);
  const index = list.findIndex((v) => v.id === targetId);
  if (index === -1) return null;
  return { ...newState, index };
}

// Used by reminder notifications (both the real periodic alarm and the
// "Thu ngay" test button) so they only ever show a word from the sources
// the user currently has selected in the vocab viewer, instead of all
// sources -- mirrors kanjiState.ts's pickReminderKanji.
export async function pickReminderVocab(): Promise<VocabCard> {
  const state = await loadViewerState();
  const pool = ALL_VOCAB.filter((v) => matchesFilters(v, state));
  const list = pool.length > 0 ? pool : ALL_VOCAB;
  return list[Math.floor(Math.random() * list.length)];
}
