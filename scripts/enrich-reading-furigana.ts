// Enrich registered Reading datasets with exact-source furigana. Results are
// cached locally and written only after strict source/order/kana/coverage checks.
// The API key and cache remain in ignored _scratch/.
//
// Usage:
//   node --experimental-strip-types scripts/enrich-reading-furigana.ts --dry-run
//   node --experimental-strip-types scripts/enrich-reading-furigana.ts --level N3

import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ReadingBodySegment, ReadingDataset, ReadingPassage } from "../src/types/reading.ts";
import { splitBodyIntoSentences } from "../src/lib/readingSentences.ts";
import { normalizePeopleCounterReadings } from "./furiganaCounterReadings.ts";

const ROOT = join(import.meta.dirname, "..");
const MODEL = "gemini-3.5-flash-lite";
const CACHE_VERSION = 2;
const DATA_FILES = [
  "src/data/reading-n3-shinkanzen.json",
  "src/data/reading-n3-speedmaster.json",
  "src/data/reading-n3-taisaku.json",
  "src/data/mocktest-n3-shinkanzen.json",
  "src/data/reading-n3-dokkai55.json",
  "src/data/reading-n3-dokkai115.json",
  "src/data/reading-news.json",
  "src/data/reading-ai-stories.json",
];
interface ManualReading { start: number; word: string; reading: string }
interface ManualReadingOverride { source: string; annotations: ManualReading[] }
// Exact-source corrections for a small set of stubborn N3 fields that the
// model repeatedly left incomplete. Offsets disambiguate repeated characters.
const MANUAL_READINGS: Record<string, ManualReadingOverride> = {
  "reading-shinkanzen-n3-045/q2/option0": { source: "いつもほど長く掃除をしなくてもよかったこと", annotations: [{ start: 5, word: "長く", reading: "ながく" }] },
  "reading-speedmaster-n3-027/q2/question": { source: "トラッキング現象を起こさないようにするために必要なことは何か。", annotations: [{ start: 9, word: "起こさない", reading: "おこさない" }] },
  "reading-speedmaster-n3-028/body/chunk8": { source: "\n公開日時：5月15日（土）・16日（日） 9:00～17:00", annotations: [{ start: 10, word: "日", reading: "にち" }] },
  "reading-speedmaster-n3-039/q2/option0": { source: "夫の親だけからお金をもらう世帯では、そのお金は子どもの教育費に使用", annotations: [{ start: 21, word: "金", reading: "かね" }] },
  "reading-speedmaster-n3-039/q2/option1": { source: "夫の親だけからお金をもらう世帯では、そのお金は生活費や教育費に使用", annotations: [{ start: 21, word: "金", reading: "かね" }] },
  "reading-speedmaster-n3-039/q2/option2": { source: "妻の親だけからお金をもらう世帯では、そのお金は子どもの教育費に使用", annotations: [{ start: 21, word: "金", reading: "かね" }] },
  "reading-speedmaster-n3-044/body/chunk16": { source: "一家に1枚配られる抽選券は、左右に同じものが2つ印刷されていて、両方に家の番号と名前を書いて切り離す。", annotations: [{ start: 5, word: "配られる", reading: "くばられる" }] },
  "reading-speedmaster-n3-053/body/chunk2": { source: "そこで、市から配られた「夜間、土曜日、休日診療のお知らせ」を見て、今から行ける病院を探すことにしました。", annotations: [{ start: 7, word: "配られた", reading: "くばられた" }] },
  "reading-speedmaster-n3-055/body/chunk17": { source: "15歳以上の人定員20人、費用＝12", annotations: [{ start: 2, word: "歳", reading: "さい" }] },
  "reading-speedmaster-n3-055/q0/question": { source: "ワンさんが申し込むことができるスポーツ教室はどれか。", annotations: [{ start: 5, word: "申し込む", reading: "もうしこむ" }] },
  "reading-speedmaster-n3-mock-03/body/chunk4": { source: "っくり冷やすので、その過程で、表面に目に見えないたくさんの傷ができ、力を加えると傷が広がって割れる。", annotations: [{ start: 40, word: "傷", reading: "きず" }, { start: 42, word: "広がって", reading: "ひろがって" }] },
  "reading-speedmaster-n3-mock-07/body/chunk24": { source: "\n案1日時：10月25日（土）午前11時〜午後3時", annotations: [{ start: 3, word: "日時", reading: "にちじ" }] },
  "reading-taisaku-n3-part1-12b/body/chunk10": { source: "それは、2人の間の距離が握手をするのに適した距離で、「おじぎの文化」の人たちよりも近いからです。", annotations: [{ start: 22, word: "距離", reading: "きょり" }] },
  "reading-taisaku-n3-part2-02/q2/option3": { source: "賞としてお金がもらえる人は、30人以上いる。", annotations: [{ start: 16, word: "人", reading: "さんじゅうにん" }] },
  "reading-taisaku-n3-part2-03/q1/option3": { source: "3割弱は、30%より少し多い。", annotations: [{ start: 10, word: "少し", reading: "すこし" }] },
  "reading-taisaku-n3-part2-05/q1/question": { source: "文章およびグラフから考えて、A〜Fの中で正しいものが2つある。正しいものの組み合わせはどれか。", annotations: [{ start: 31, word: "正しい", reading: "ただしい" }] },
  "mocktest-shinkanzen-n3-07/body/chunk1": { source: "先日、夏休みの旅行から帰ってきた同僚が、おみやげの菓子を全員に配っていた。", annotations: [{ start: 31, word: "配っていた", reading: "くばっていた" }] },
  "mocktest-shinkanzen-n3-07/body/chunk15": { source: "私も今度国へ帰ったら、おみやげを買ってきてみんなに配ろう。", annotations: [{ start: 25, word: "配ろう", reading: "くばろう" }] },
  "dokkai55-p2-15/body/chunk1": { source: "どうして無料ビジネスが成り立つのか。", annotations: [{ start: 11, word: "成り立つ", reading: "なりたつ" }] },
  "dokkai55-p2-15/q1/question": { source: "問2 どうして無料の保険が成り立つのか。", annotations: [{ start: 13, word: "成り立つ", reading: "なりたつ" }] },
  "dokkai55-p2-15/q2/option2": { source: "無料のサービスが成り立つ理由について", annotations: [{ start: 8, word: "成り立つ", reading: "なりたつ" }] },
  "dokkai55-p2-16/q0/question": { source: "問1 どうして長く付き合うことができなかったのか。", annotations: [{ start: 7, word: "長く", reading: "ながく" }] },
  "dokkai55-p3-02/q0/question": { source: "問1 最近増えている「直ぐに切れてしまう人」はどんな人だと言っているか。", annotations: [{ start: 26, word: "人", reading: "ひと" }] },
  "dokkai55-p3-03/body/chunk20": { source: "「お造り」と言われても外国人には何のことかわからないだろう。", annotations: [{ start: 6, word: "言われても", reading: "いわれても" }] },
  "dokkai55-p3-04/body/chunk18": { source: "自分を運がいいと考えるか、運が悪いと考えるかは人それぞれだ。", annotations: [{ start: 13, word: "運", reading: "うん" }, { start: 18, word: "考える", reading: "かんがえる" }] },
  "dokkai55-p3-06/body/chunk17": { source: "すると疲れすぎて疲れを知らせる部分まで働かなくなる。", annotations: [{ start: 8, word: "疲れ", reading: "つかれ" }] },
  "dokkai115-p1-36/body/chunk3": { source: "雑炊を配っていると、たくさんの人が「ありがとう」と言ってくれたり、頭を下げてくれたりした。", annotations: [{ start: 3, word: "配っている", reading: "くばっている" }] },
  "dokkai115-p2-17/body/chunk6": { source: "そこで塾に通って一貫校を目指すことにしたのだ。", annotations: [{ start: 5, word: "通って", reading: "かよって" }] },
  "dokkai115-p2-17/body/chunk8": { source: "、「少しでもお金を工面して通わせるべ", annotations: [{ start: 13, word: "通わせる", reading: "かよわせる" }] },
  "dokkai115-p3-01/body/chunk15": { source: "\nローマ字はエジプト文字から出たものです。", annotations: [{ start: 4, word: "字", reading: "じ" }] },
  "dokkai115-p3-01/body/chunk16": { source: "ローマ字が日本に伝わったのは十六世紀のことですが、日本語をローマ字で書き表すのは明治時代になってからです。", annotations: [{ start: 32, word: "字", reading: "じ" }] },
  "dokkai115-p3-17/body/chunk5": { source: "毎日毎日つまらない書類の整理ばかりさせられて、自分のしたい仕事はできません。", annotations: [{ start: 2, word: "毎日", reading: "まいにち" }] },
  "dokkai115-p4-03/body/chunk1": { source: "\n作 品 募 集", annotations: [{ start: 1, word: "作", reading: "さく" }, { start: 3, word: "品", reading: "ひん" }, { start: 5, word: "募", reading: "ぼ" }, { start: 7, word: "集", reading: "しゅう" }] },
  "dokkai115-p4-08/body/chunk15": { source: "200円、自転車約500円、電子レンジ約800円、ステレオ約1,400円。", annotations: [{ start: 12, word: "円", reading: "えん" }, { start: 19, word: "約", reading: "やく" }] },
  "dokkai115-p4-09/body/chunk1": { source: "\n館 内 ツ ア ー", annotations: [{ start: 1, word: "館", reading: "かん" }, { start: 3, word: "内", reading: "ない" }] },
  "dokkai115-p4-12/body/chunk10": { source: ")受信や発信ができない, 3)通話中に雑音が入る (以上については午前9時～午後5時対応)", annotations: [{ start: 35, word: "9時", reading: "くじ" }] },
  "dokkai115-p4-12/body/chunk16": { source: " 受付時間:午前9時～午後5時 (休業日: 土日祝, 年末年始), 携帯電話・PHS利用可能", annotations: [{ start: 8, word: "9時", reading: "くじ" }] },
  "dokkai115-p4-12/body/chunk19": { source: " 受付時間:午前9時～午後5時 (休", annotations: [{ start: 8, word: "9時", reading: "くじ" }] },
  "dokkai115-p4-15/body/chunk2": { source: "日本国際教育支援協会に、海外で受験する人は受験する国・地域の実施機関に、願書を提出して申し込みます。", annotations: [{ start: 25, word: "国", reading: "くに" }, { start: 27, word: "地域", reading: "ちいき" }] },
  "dokkai115-p4-15/body/chunk5": { source: "なお、申し込みの方法や願書などは、国・地域によって異なりますので、下の各ホームページを参照してください。", annotations: [{ start: 17, word: "国", reading: "くに" }, { start: 19, word: "地域", reading: "ちいき" }] },
  "dokkai115-p4-15/body/chunk10": { source: "特別措置については、受験を希望する国・地域の実施機関に問い合わせてください。", annotations: [{ start: 17, word: "国", reading: "くに" }, { start: 19, word: "地域", reading: "ちいき" }] },
};
const CACHE_PATH = join(ROOT, `_scratch/reading-furigana-cache-${MODEL}.json`);
const DELAY_MS = 6_000;
const BATCH_SIZE = 4;
const CONCURRENCY = 6;
const HAS_KANJI = /[\u3400-\u9fff々〆ヶ]/u;
const KANA_ONLY = /^[\u3041-\u3096\u30a1-\u30faー]+$/u;
const INVALID_RUBY_TEXT = /[\s、。！？!?・,，.（）()「」『』【】\n\r]/u;

type TargetKind = "body" | "question" | "option";
interface Target {
  id: string;
  file: string;
  kind: TargetKind;
  passageIndex: number;
  sourceStart?: number;
  questionIndex?: number;
  optionIndex?: number;
  source: string;
  context: string;
}
interface Annotation { word: string; reading: string }
interface Enrichment { id: string; annotations: Annotation[] }
interface CandidateTarget { target: Target; annotations: Annotation[] }
interface BatchValidation { accepted: Enrichment[]; rejected: { target: CandidateTarget; error: string; annotations: Annotation[] }[] }
interface PartialEnrichment { id: string; annotations: Annotation[] }
interface CacheEntry { version: number; source: string; context: string; sourceStart?: number; annotations: Annotation[]; partial?: boolean }
interface SourceFile { path: string; data: ReadingDataset }
type Cache = Record<string, CacheEntry>;

const lastRequestAt = new Map<string, number>();
const unavailableApiKeys = new Set<string>();
let requestCount = 0;

function atomicJson(path: string, value: unknown): void {
  const tempPath = `${path}.tmp`;
  writeFileSync(tempPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  renameSync(tempPath, path);
}

function readApiKeys(): string[] {
  const text = readFileSync(join(ROOT, "_scratch/.env.gemini"), "utf8");
  const keys = text.split(/\r?\n/u).flatMap((line) => {
    const match = line.trim().match(/^GEMINI_API_KEY(?:_[A-Z0-9_]+)?=(.*)$/u);
    if (!match) return [];
    let value = match[1].trim();
    if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    return value ? [value] : [];
  });
  if (!keys.length) throw new Error("No Gemini API keys found in _scratch/.env.gemini");
  return keys;
}

function sourceText(passage: ReadingPassage): string {
  return passage.body.map(({ text }) => text).join("");
}

function validSegments(source: string, segments: ReadingBodySegment[] | undefined): boolean {
  if (!segments?.length || segments.map(({ text }) => text).join("") !== source) return false;
  let offset = 0;
  for (const segment of segments) {
    if (typeof segment.text !== "string" || segment.text !== source.slice(offset, offset + segment.text.length)) return false;
    if (segment.furigana !== null) {
      if (!segment.furigana || !KANA_ONLY.test(segment.furigana) || !HAS_KANJI.test(segment.text)) return false;
      // A reading belongs to one word, never an entire sentence, line, or
      // phrase. This rejects the legacy Dokkai 55 shape where a trailing
      // word's reading was attached to a much longer text segment.
      if (segment.text.length > 20 || INVALID_RUBY_TEXT.test(segment.text)) return false;
    }
    offset += segment.text.length;
  }
  if (offset !== source.length) return false;
  const visible = new Array<boolean>(source.length).fill(false);
  offset = 0;
  for (const segment of segments) {
    if (segment.furigana) for (let index = offset; index < offset + segment.text.length; index++) visible[index] = true;
    offset += segment.text.length;
  }
  for (let index = 0; index < source.length; index++) {
    if (HAS_KANJI.test(source[index]) && !visible[index]) return false;
  }
  return true;
}

function hasKanji(source: string): boolean {
  return HAS_KANJI.test(source);
}

function splitBodyChunks(source: string, maxLength = 18): { start: number; text: string }[] {
  const chunks: { start: number; text: string }[] = [];
  const breakChars = ["。", "！", "？", "!", "?", "；"];
  const closingPunctuation = /[」』）)]/u;
  const includeClosers = (position: number) => {
    let end = position + 1;
    while (end < source.length && closingPunctuation.test(source[end])) end++;
    return end;
  };
  let start = 0;
  while (start < source.length) {
    let end = Math.min(source.length, start + maxLength);
    if (end < source.length) {
      const nextNewline = source.indexOf("\n", start + 1);
      if (nextNewline > start && nextNewline <= end) end = nextNewline;
      else {
        const minBreak = start + Math.floor(maxLength * 0.45);
        let best = -1;
        for (const character of breakChars) {
          const found = source.lastIndexOf(character, end - 1);
          if (found >= minBreak && found > best) best = found;
        }
        if (best >= 0) end = includeClosers(best);
        else {
          let next = -1;
          for (const character of [...breakChars, "\n"]) {
            const found = source.indexOf(character, end);
            if (found >= 0 && found < start + maxLength + 35 && (next < 0 || found < next)) next = found;
          }
          if (next >= 0) end = source[next] === "\n" ? next : includeClosers(next);
        }
      }
      if (end < source.length && end > 0 && /[\uD800-\uDBFF]/u.test(source[end - 1])) end++;
    }
    chunks.push({ start, text: source.slice(start, end) });
    start = end;
  }
  return chunks;
}

function collectTargets(level: string | undefined): { sources: SourceFile[]; targets: Target[] } {
  const sources = DATA_FILES.map((path) => ({ path, data: JSON.parse(readFileSync(join(ROOT, path), "utf8")) as ReadingDataset }));
  const targets: Target[] = [];
  for (const source of sources) {
    source.data.passages.forEach((passage, passageIndex) => {
      if (level && passage.level !== level) return;
      if (passage.linkOnly) return;
      const body = sourceText(passage);
      if (body.trim() && hasKanji(body) && !validSegments(body, passage.body)) {
        splitBodyChunks(body).forEach((chunk, chunkIndex) => {
          if (!hasKanji(chunk.text)) return;
          const nearby = body.slice(Math.max(0, chunk.start - 50), Math.min(body.length, chunk.start + chunk.text.length + 50));
          const context = `Book: ${passage.book}; title: ${passage.title}; source: ${passage.source}; nearby passage context: ${nearby}; related question context: ${passage.questions.map(({ question }) => question).join(" / ").slice(0, 300)}`;
          targets.push({
            id: `${passage.id}/body/chunk${chunkIndex}`, file: source.path, kind: "body", passageIndex, sourceStart: chunk.start, source: chunk.text, context,
          });
        });
      }
      passage.questions.forEach((question, questionIndex) => {
        const context = `Book: ${passage.book}; title: ${passage.title}; nearby passage: ${body.slice(0, 240)}; question: ${question.question}`;
        if (hasKanji(question.question) && !validSegments(question.question, question.questionFurigana)) {
          targets.push({ id: `${passage.id}/q${questionIndex}/question`, file: source.path, kind: "question", passageIndex, questionIndex, source: question.question, context });
        }
        question.options.forEach((option, optionIndex) => {
          if (hasKanji(option) && !validSegments(option, question.optionsFurigana?.[optionIndex])) {
            targets.push({ id: `${passage.id}/q${questionIndex}/option${optionIndex}`, file: source.path, kind: "option", passageIndex, questionIndex, optionIndex, source: option, context: `${context}; options: ${question.options.join(" / ")}` });
          }
        });
      });
    });
  }
  return { sources, targets };
}

function makePrompt(targets: CandidateTarget[], correction?: string): string {
  return [
    "Bạn là biên tập viên tiếng Nhật tạo furigana cho ứng dụng học JLPT.",
    "Trả về DUY NHẤT JSON array đủ phần tử, đúng thứ tự, giữ nguyên id.",
    "Mỗi source có existingAnnotations đã được xác minh. Giữ nguyên các annotation này và chỉ bổ sung từ/cụm từ cần thiết để phủ mọi vị trí trong missing; không lặp annotation đã có. word phải là chuỗi con liên tục, nguyên văn, không chồng lặp với annotation cũ trừ khi một từ mới cần bao phủ thêm kanji còn thiếu và chứa trọn annotation cũ bị giao nhau.",
    "reading chỉ dùng hiragana/katakana. Ưu tiên gộp cả okurigana vào từ, ví dụ 使って→つかって, 食べました→たべました, 矢印→やじるし, 方向→ほうこう, くり返し→くりかえし; không đưa trợ từ đứng riêng vào annotation.",
    "Dùng context để chọn cách đọc phù hợp nhưng không sửa source, không thêm, xóa, chuẩn hóa hay điền đáp án vào chỗ trống. Không annotation kana-only, số, Latin, dấu câu. Tập trung đúng các chữ/đoạn được liệt kê trong missing.",
    "Trường hợp tên riêng hoặc cách đọc không chắc chắn, vẫn chọn cách đọc nhiều khả năng nhất theo ngữ cảnh; validator sẽ cách ly các mục không hợp lệ để rà thủ công.",
    correction ? `Kết quả trước chưa hợp lệ: ${correction}. Sửa annotations và kiểm tra lại toàn bộ batch.` : "",
    JSON.stringify(targets.map(({ target, annotations }) => ({
      id: target.id, context: target.context, source: target.source, existingAnnotations: annotations,
      missing: missingKanji(target, annotations),
    }))),
  ].filter(Boolean).join("\n\n");
}

function buildSegments(target: Target, annotations: Annotation[]): { text: string; furigana: string | null; start: number; end: number }[] {
  annotations = normalizePeopleCounterReadings(target.source, annotations);
  let cursor = 0;
  const ranges: { start: number; end: number; reading: string }[] = [];
  for (const annotation of annotations) {
    if (!annotation || typeof annotation.word !== "string" || typeof annotation.reading !== "string" || !annotation.word || annotation.word.length > 20 || INVALID_RUBY_TEXT.test(annotation.word) || !KANA_ONLY.test(annotation.reading) || !HAS_KANJI.test(annotation.word)) {
      throw new Error(`${target.id}: invalid annotation`);
    }
    const start = target.source.indexOf(annotation.word, cursor);
    if (start < 0) throw new Error(`${target.id}: out-of-order or absent word ${JSON.stringify(annotation.word)}`);
    const end = start + annotation.word.length;
    ranges.push({ start, end, reading: annotation.reading });
    cursor = end;
  }
  for (let index = 0; index < target.source.length; index++) {
    if (!HAS_KANJI.test(target.source[index])) continue;
    if (!ranges.some(({ start, end }) => index >= start && index < end)) {
      throw new Error(`${target.id}: uncovered kanji ${JSON.stringify(target.source[index])} at ${index}; annotate it using its reading in context: ${target.source.slice(Math.max(0, index - 8), index + 10)}`);
    }
  }
  const segments: { text: string; furigana: string | null; start: number; end: number }[] = [];
  cursor = 0;
  for (const range of ranges) {
    if (range.start > cursor) segments.push({ text: target.source.slice(cursor, range.start), furigana: null, start: cursor, end: range.start });
    segments.push({ text: target.source.slice(range.start, range.end), furigana: range.reading, start: range.start, end: range.end });
    cursor = range.end;
  }
  if (cursor < target.source.length) segments.push({ text: target.source.slice(cursor), furigana: null, start: cursor, end: target.source.length });
  if (!segments.length) segments.push({ text: target.source, furigana: null, start: 0, end: target.source.length });
  if (segments.map(({ text }) => text).join("") !== target.source) throw new Error(`${target.id}: source text changed`);
  return segments;
}

function validPartialAnnotations(target: Target, annotations: unknown): Annotation[] {
  if (!Array.isArray(annotations)) return [];
  let cursor = 0;
  const valid: Annotation[] = [];
  for (const annotation of annotations) {
    if (!annotation || typeof annotation.word !== "string" || typeof annotation.reading !== "string" ||
      !annotation.word || annotation.word.length > 20 || INVALID_RUBY_TEXT.test(annotation.word) ||
      !KANA_ONLY.test(annotation.reading) || !HAS_KANJI.test(annotation.word)) continue;
    const start = target.source.indexOf(annotation.word, cursor);
    if (start < 0) continue;
    valid.push({ word: annotation.word, reading: annotation.reading });
    cursor = start + annotation.word.length;
  }
  return valid;
}

function mergePartialAnnotations(target: Target, previous: Annotation[], additions: unknown): Annotation[] {
  const existing = validPartialAnnotations(target, previous);
  const incoming = Array.isArray(additions) ? additions.filter((annotation): annotation is Annotation =>
    Boolean(annotation && typeof annotation.word === "string" && annotation.word && annotation.word.length <= 20 &&
      !INVALID_RUBY_TEXT.test(annotation.word) && typeof annotation.reading === "string" && KANA_ONLY.test(annotation.reading) && HAS_KANJI.test(annotation.word)),
  ) : [];
  const toRanges = (annotations: Annotation[]) => {
    let cursor = 0;
    return annotations.flatMap((annotation) => {
      const start = target.source.indexOf(annotation.word, cursor);
      if (start < 0) return [];
      cursor = start + annotation.word.length;
      return [{ start, end: cursor, annotation }];
    });
  };
  const ranges = toRanges(existing);
  let cursor = 0;
  for (const annotation of incoming) {
    let searchFrom = cursor;
    while (searchFrom < target.source.length) {
      const start = target.source.indexOf(annotation.word, searchFrom);
      if (start < 0) break;
      const candidate = { start, end: start + annotation.word.length, annotation };
      const overlaps = ranges.filter((range) => candidate.start < range.end && candidate.end > range.start);
      const hasUncoveredKanji = Array.from({ length: candidate.end - candidate.start }, (_, offset) => candidate.start + offset)
        .some((index) => HAS_KANJI.test(target.source[index]) && !ranges.some((range) => index >= range.start && index < range.end));
      const candidateContainsOverlaps = overlaps.every((range) => candidate.start <= range.start && candidate.end >= range.end);
      if (!overlaps.length || (hasUncoveredKanji && candidateContainsOverlaps)) {
        if (overlaps.length) {
          for (let index = ranges.length - 1; index >= 0; index--) {
            if (candidate.start < ranges[index].end && candidate.end > ranges[index].start) ranges.splice(index, 1);
          }
        }
        ranges.push(candidate);
        cursor = candidate.end;
        break;
      }
      // The model does not return positions for ordinary annotations. If its
      // word is repeated, skip occurrences already covered and place this
      // reading at the next uncovered matching source span.
      searchFrom = start + 1;
    }
  }
  return ranges.sort((left, right) => left.start - right.start).map(({ annotation }) => annotation);
}

function missingKanji(target: Target, annotations: Annotation[]): { position: number; character: string; context: string }[] {
  const ranges = (() => {
    let cursor = 0;
    return validPartialAnnotations(target, annotations).flatMap((annotation) => {
      const start = target.source.indexOf(annotation.word, cursor);
      if (start < 0) return [];
      cursor = start + annotation.word.length;
      return [{ start, end: cursor }];
    });
  })();
  const missing: { position: number; character: string; context: string }[] = [];
  for (let position = 0; position < target.source.length; position++) {
    const character = target.source[position];
    if (!HAS_KANJI.test(character) || ranges.some((range) => position >= range.start && position < range.end)) continue;
    missing.push({ position, character, context: target.source.slice(Math.max(0, position - 8), position + 10) });
  }
  return missing;
}

function isValidCacheEntry(target: Target, entry: CacheEntry | undefined): entry is CacheEntry {
  if (!entry || ![1, CACHE_VERSION].includes(entry.version) || entry.source !== target.source || entry.context !== target.context || entry.sourceStart !== target.sourceStart || !Array.isArray(entry.annotations)) return false;
  try {
    buildSegments(target, entry.annotations);
    return true;
  } catch {
    return false;
  }
}

function validCachedPartial(target: Target, entry: CacheEntry | undefined): Annotation[] {
  if (!entry || ![1, CACHE_VERSION].includes(entry.version) || entry.source !== target.source || entry.context !== target.context || entry.sourceStart !== target.sourceStart) return [];
  return validPartialAnnotations(target, entry.annotations);
}

function validResult(result: unknown, targets: CandidateTarget[]): BatchValidation {
  const resultById = new Map<string, unknown>();
  if (Array.isArray(result)) {
    for (const item of result) {
      if (item && typeof item === "object" && typeof (item as Enrichment).id === "string") {
        resultById.set((item as Enrichment).id, item);
      }
    }
  }
  const accepted: Enrichment[] = [];
  const rejected: BatchValidation["rejected"] = [];
  for (const candidateTarget of targets) {
    const { target } = candidateTarget;
    const item = resultById.get(target.id);
    if (!item || typeof item !== "object" || !Array.isArray((item as Enrichment).annotations)) {
      rejected.push({ target: candidateTarget, error: "missing/malformed item in JSON response", annotations: candidateTarget.annotations });
      continue;
    }
    const enrichment = item as Enrichment;
    const annotations = mergePartialAnnotations(target, candidateTarget.annotations, enrichment.annotations);
    try {
      buildSegments(target, annotations);
      accepted.push({ id: target.id, annotations });
    } catch (error) {
      const missing = missingKanji(target, annotations);
      rejected.push({ target: candidateTarget, error: `${(error as Error).message}; remaining=${JSON.stringify(missing)}`, annotations });
    }
  }
  return { accepted, rejected };
}

async function requestBatch(apiKeys: string[], targets: CandidateTarget[], correction?: string): Promise<BatchValidation> {
  let apiKey: string | undefined;
  for (let attempt = 0; attempt < apiKeys.length; attempt++) {
    const candidate = apiKeys[requestCount++ % apiKeys.length];
    if (!unavailableApiKeys.has(candidate)) { apiKey = candidate; break; }
  }
  if (!apiKey) throw new Error("No available Gemini API keys remain after failed requests");
  const now = Date.now();
  const scheduledAt = Math.max(now, (lastRequestAt.get(apiKey) ?? 0) + DELAY_MS);
  lastRequestAt.set(apiKey, scheduledAt);
  const waitMs = scheduledAt - now;
  if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs));
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
    method: "POST",
    headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: makePrompt(targets, correction) }] }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "ARRAY", items: {
            type: "OBJECT", properties: {
              id: { type: "STRING" },
              annotations: { type: "ARRAY", items: { type: "OBJECT", properties: { word: { type: "STRING" }, reading: { type: "STRING" } }, required: ["word", "reading"] } },
            }, required: ["id", "annotations"],
          },
        }, temperature: 0.1,
      },
    }),
    signal: AbortSignal.timeout(90_000),
  });
  if (!response.ok) {
    if ([401, 403, 404].includes(response.status)) unavailableApiKeys.add(apiKey);
    throw new Error(`Gemini HTTP ${response.status}: ${(await response.text()).slice(0, 400)}`);
  }
  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Gemini returned no JSON");
  return validResult(JSON.parse(text), targets);
}

async function generateBatch(apiKeys: string[], targets: CandidateTarget[]): Promise<{ accepted: Enrichment[]; partial: PartialEnrichment[]; failures: string[] }> {
  const accepted = new Map<string, Enrichment>();
  let remaining = targets;
  let correction: string | undefined;
  for (let attempt = 1; attempt <= 4 && remaining.length; attempt++) {
    try {
      const validation = await requestBatch(apiKeys, remaining, correction);
      validation.accepted.forEach((result) => accepted.set(result.id, result));
      remaining = validation.rejected.map(({ target, annotations }) => ({ target: target.target, annotations }));
      if (!remaining.length) break;
      correction = validation.rejected.map(({ target, error }) => `${target.target.id}: ${error}`).join("\n");
      console.warn(`Furigana repair attempt ${attempt}: ${remaining.length}/${targets.length} field(s) remain invalid.`);
    } catch (error) {
      correction = (error as Error).message;
      if (attempt === 4) break;
      console.warn(`Gemini request attempt ${attempt} failed (${correction.slice(0, 180)}); retrying.`);
    }
  }
  const failures = remaining.map(({ target }) => `${target.id}: ${correction ?? "furigana validation failed"}`);
  return { accepted: [...accepted.values()], partial: remaining.map(({ target, annotations }) => ({ id: target.id, annotations })), failures };
}

function markParagraphStarts(passage: ReadingPassage, built: ReturnType<typeof buildSegments>): ReadingBodySegment[] {
  const paragraphOffsets = new Set<number>();
  let oldOffset = 0;
  for (const segment of passage.body) {
    if (segment.paragraphStart === true || (segment.paragraphStart !== false && segment.text.startsWith("\n"))) paragraphOffsets.add(oldOffset);
    oldOffset += segment.text.length;
  }
  const marked: ReadingBodySegment[] = [];
  for (const segment of built) {
    const internalBoundaries = [...paragraphOffsets].filter((offset) => offset > segment.start && offset < segment.end).sort((a, b) => a - b);
    const starts = [segment.start, ...internalBoundaries, segment.end];
    const pieces = starts.slice(0, -1).map((start, index) => ({ start, end: starts[index + 1] }));
    const piecesWithKanji = pieces.filter(({ start, end }) => HAS_KANJI.test(segment.text.slice(start - segment.start, end - segment.start)));
    if (segment.furigana && piecesWithKanji.length !== 1) {
      throw new Error(`${passage.id}: a furigana annotation crosses an original paragraph boundary`);
    }
    for (const piece of pieces) {
      const text = segment.text.slice(piece.start - segment.start, piece.end - segment.start);
      const startsWithNewline = text.startsWith("\n");
      const isOriginalBoundary = paragraphOffsets.has(piece.start);
      marked.push({
        text,
        furigana: segment.furigana && HAS_KANJI.test(text) ? segment.furigana : null,
        ...(isOriginalBoundary ? { paragraphStart: true } : startsWithNewline ? { paragraphStart: false } : {}),
      });
    }
  }
  return marked;
}

function sentenceBoundaryDifference(left: ReadingBodySegment[], right: ReadingBodySegment[]): string | null {
  const sentences = (body: ReadingBodySegment[]) => splitBodyIntoSentences(body).map((group) => group.map(({ text }) => text).join(""));
  const before = sentences(left);
  const after = sentences(right);
  const firstDifferent = before.findIndex((line, index) => line !== after[index]);
  if (before.length === after.length && firstDifferent < 0) return null;
  const index = firstDifferent >= 0 ? firstDifferent : Math.min(before.length, after.length);
  return `sentence counts ${before.length}/${after.length}; first difference at ${index}: before=${JSON.stringify(before[index] ?? "<none>")}, after=${JSON.stringify(after[index] ?? "<none>")}`;
}

function parseArgs() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const listPending = args.includes("--list-pending");
  const levelIndex = args.indexOf("--level");
  const level = levelIndex >= 0 ? args[levelIndex + 1] : undefined;
  const limitIndex = args.indexOf("--limit");
  const limit = limitIndex >= 0 ? Number(args[limitIndex + 1]) : undefined;
  if (levelIndex >= 0 && !["N3", "N1"].includes(level ?? "")) throw new Error("--level must be N3 or N1");
  if (limitIndex >= 0 && (!Number.isInteger(limit) || (limit ?? 0) < 1)) throw new Error("--limit must be a positive number");
  if (dryRun && limit) throw new Error("--limit is only valid for a generation run");
  return { dryRun, listPending, level, limit };
}

async function main(): Promise<void> {
  const { dryRun, listPending, level, limit } = parseArgs();
  const { sources, targets: allTargets } = collectTargets(level);
  const cache: Cache = existsSync(CACHE_PATH) ? JSON.parse(readFileSync(CACHE_PATH, "utf8")) as Cache : {};
  let manualRepairs = 0;
  for (const target of allTargets) {
    const override = MANUAL_READINGS[target.id];
    if (!override) continue;
    if (target.source !== override.source) throw new Error(`${target.id}: manual reading source changed; review the override before applying it`);
    const ranges: { start: number; end: number; annotation: Annotation }[] = [];
    let existingCursor = 0;
    for (const annotation of validPartialAnnotations(target, cache[target.id]?.annotations)) {
      const start = target.source.indexOf(annotation.word, existingCursor);
      if (start < 0) continue;
      ranges.push({ start, end: start + annotation.word.length, annotation });
      existingCursor = start + annotation.word.length;
    }
    for (const annotation of override.annotations) {
      if (target.source.slice(annotation.start, annotation.start + annotation.word.length) !== annotation.word ||
        !HAS_KANJI.test(annotation.word) || !KANA_ONLY.test(annotation.reading)) {
        throw new Error(`${target.id}: invalid manual reading override ${JSON.stringify(annotation)}`);
      }
      const end = annotation.start + annotation.word.length;
      const overlaps = ranges.filter((range) => annotation.start < range.end && end > range.start);
      if (overlaps.length && overlaps.every((range) => range.start === annotation.start && range.end === end && range.annotation.reading === annotation.reading)) continue;
      const wouldDropKanji = overlaps.some((range) => Array.from({ length: range.end - range.start }, (_, offset) => range.start + offset)
        .some((position) => HAS_KANJI.test(target.source[position]) && (position < annotation.start || position >= end)));
      if (wouldDropKanji) {
        throw new Error(`${target.id}: manual reading override would discard another kanji annotation ${JSON.stringify(annotation)}`);
      }
      if (overlaps.length) {
        for (let index = ranges.length - 1; index >= 0; index--) {
          if (annotation.start < ranges[index].end && end > ranges[index].start) ranges.splice(index, 1);
        }
      }
      ranges.push({ start: annotation.start, end, annotation: { word: annotation.word, reading: annotation.reading } });
    }
    const annotations = ranges.sort((left, right) => left.start - right.start).map(({ annotation }) => annotation);
    buildSegments(target, annotations);
    cache[target.id] = { version: CACHE_VERSION, source: target.source, context: target.context, sourceStart: target.sourceStart, annotations };
    manualRepairs++;
  }
  if (manualRepairs && !dryRun) atomicJson(CACHE_PATH, cache);
  const pending = allTargets.filter((target) => !isValidCacheEntry(target, cache[target.id]));
  console.log(`Reading furigana (${level ?? "all"}): ${allTargets.length} missing/incomplete targets; ${pending.length} not cached.`);
  if (manualRepairs) console.log(`Applied ${manualRepairs} exact-source manual reading corrections to the resumable cache.`);
  for (const file of DATA_FILES) {
    const targets = allTargets.filter((target) => target.file === file);
    if (targets.length) console.log(`  ${file}: ${targets.length}`);
  }
  if (listPending) {
    for (const target of pending) {
      console.log(JSON.stringify({ id: target.id, source: target.source, missing: missingKanji(target, validCachedPartial(target, cache[target.id])) }));
    }
    return;
  }
  if (dryRun) return;
  const runTargets = limit ? pending.slice(0, limit) : pending;
  const apiKeys = readApiKeys();
  const runFailures: string[] = [];
  for (let start = 0; start < runTargets.length; start += BATCH_SIZE * CONCURRENCY) {
    const batches = Array.from({ length: CONCURRENCY }, (_, index) => runTargets.slice(start + index * BATCH_SIZE, start + (index + 1) * BATCH_SIZE)
      .map((target) => ({ target, annotations: validCachedPartial(target, cache[target.id]) }))
    ).filter((batch) => batch.length);
    const settled = await Promise.allSettled(batches.map((batch) => generateBatch(apiKeys, batch)));
    let completed = 0;
    settled.forEach((result, batchIndex) => {
      const batch = batches[batchIndex];
      if (result.status === "rejected") {
        runFailures.push((result.reason as Error)?.message ?? `${batch[0]?.target.id}: unknown generation error`);
        return;
      }
      result.value.failures.forEach((failure) => runFailures.push(failure));
      result.value.accepted.forEach((enrichment) => {
        const candidate = batch.find((item) => item.target.id === enrichment.id);
        const target = candidate?.target;
        if (!target) {
          runFailures.push(`${enrichment.id}: response was not part of the request batch`);
          return;
        }
        cache[target.id] = { version: CACHE_VERSION, source: target.source, context: target.context, sourceStart: target.sourceStart, annotations: enrichment.annotations };
        completed++;
      });
      result.value.partial.forEach((enrichment) => {
        const candidate = batch.find((item) => item.target.id === enrichment.id);
        const target = candidate?.target;
        if (target) cache[target.id] = { version: CACHE_VERSION, source: target.source, context: target.context, sourceStart: target.sourceStart, annotations: enrichment.annotations, partial: true };
      });
    });
    atomicJson(CACHE_PATH, cache);
    console.log(`Cached ${Math.min(start + completed, runTargets.length)}/${runTargets.length} targets (${requestCount} requests)`);
  }

  const applyTargets = allTargets.filter((target) => {
    return isValidCacheEntry(target, cache[target.id]);
  });
  const updatedPaths = new Set<string>();
  for (const source of sources) {
    const fileTargets = applyTargets.filter((candidate) => candidate.file === source.path);
    if (!fileTargets.length) continue;
    let changed = false;
    const bodyPassages = new Set(fileTargets.filter(({ kind }) => kind === "body").map(({ passageIndex }) => passageIndex));
    for (const passageIndex of bodyPassages) {
      const passageTargets = allTargets.filter((candidate) => candidate.file === source.path && candidate.kind === "body" && candidate.passageIndex === passageIndex);
      const hasEveryChunk = passageTargets.every((target) => {
        return isValidCacheEntry(target, cache[target.id]);
      });
      if (!hasEveryChunk) continue;
      const passage = source.data.passages[passageIndex];
      const fullSource = sourceText(passage);
      const generatedByStart = new Map(passageTargets.map((target) => [target.sourceStart!, target]));
      const built: { text: string; furigana: string | null; start: number; end: number }[] = [];
      for (const chunk of splitBodyChunks(fullSource)) {
        const target = generatedByStart.get(chunk.start);
        if (!hasKanji(chunk.text)) {
          built.push({ text: chunk.text, furigana: null, start: chunk.start, end: chunk.start + chunk.text.length });
          continue;
        }
        if (!target) throw new Error(`${passage.id}: no enrichment target for kanji body chunk at ${chunk.start}`);
        const entry = cache[target.id];
        const chunkSegments = buildSegments(target, entry.annotations);
        built.push(...chunkSegments.map((segment) => ({ ...segment, start: segment.start + chunk.start, end: segment.end + chunk.start })));
      }
      const before = passage.body;
      const after = markParagraphStarts(passage, built);
      const boundaryDifference = sentenceBoundaryDifference(before, after);
      if (boundaryDifference) {
        runFailures.push(`${passage.id}/body: furigana would change sentence/translation boundaries; source left untouched (${boundaryDifference})`);
        continue;
      }
      passage.body = after;
      changed = true;
    }
    for (const target of fileTargets.filter(({ kind }) => kind !== "body")) {
      const entry = cache[target.id];
      if (!isValidCacheEntry(target, entry)) throw new Error(`${target.id}: cached result no longer matches source`);
      const built = buildSegments(target, entry.annotations);
      const passage = source.data.passages[target.passageIndex];
      const question = passage.questions[target.questionIndex!];
      if (target.kind === "question") question.questionFurigana = built.map(({ text, furigana }) => ({ text, furigana }));
      else {
        question.optionsFurigana ??= question.options.map((option) => [{ text: option, furigana: null }]);
        while (question.optionsFurigana.length < question.options.length) {
          const missingOption = question.options[question.optionsFurigana.length];
          question.optionsFurigana.push([{ text: missingOption, furigana: null }]);
        }
        question.optionsFurigana[target.optionIndex!] = built.map(({ text, furigana }) => ({ text, furigana }));
      }
      changed = true;
    }
    if (changed) {
      atomicJson(join(ROOT, source.path), source.data);
      updatedPaths.add(source.path);
    }
  }
  console.log(`Applied ${applyTargets.length} exact-source furigana annotations across ${updatedPaths.size} Reading datasets.`);
  if (runFailures.length) {
    console.error(`${runFailures.length} batch(es) still need repair; successful annotations are cached and valid complete fields were applied:`);
    for (const failure of runFailures.slice(0, 40)) console.error(`- ${failure}`);
    if (runFailures.length > 40) console.error(`... ${runFailures.length - 40} more`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error((error as Error).stack ?? error);
  process.exitCode = 1;
});
