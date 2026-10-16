export interface FuriganaAnnotation {
  word: string;
  reading: string;
}

interface PositionedAnnotation {
  start: number;
  end: number;
  annotation: FuriganaAnnotation;
}

const HAS_KANJI = /[\u3400-\u9fff々〆ヶ]/u;
const FOLLOWING_KANJI_ALLOWED = new Set(["以", "未", "目"]);
const PEOPLE_READINGS: Record<string, string> = {
  "1": "ひとり", "2": "ふたり", "3": "さんにん", "4": "よにん", "5": "ごにん",
  "6": "ろくにん", "7": "ななにん", "8": "はちにん", "9": "きゅうにん", "10": "じゅうにん",
  "20": "にじゅうにん", "30": "さんじゅうにん", "40": "よんじゅうにん", "50": "ごじゅうにん",
  "60": "ろくじゅうにん", "70": "ななじゅうにん", "80": "はちじゅうにん", "90": "きゅうじゅうにん",
  "一": "ひとり", "二": "ふたり", "三": "さんにん", "四": "よにん", "五": "ごにん",
  "六": "ろくにん", "七": "ななにん", "八": "はちにん", "九": "きゅうにん", "十": "じゅうにん",
  "十一": "じゅういちにん", "十二": "じゅうににん", "十三": "じゅうさんにん", "十四": "じゅうよにん",
  "十五": "じゅうごにん", "十六": "じゅうろくにん", "十七": "じゅうななにん", "十八": "じゅうはちにん",
  "十九": "じゅうきゅうにん", "二十": "にじゅうにん",
};

/** Normalize the context-stable 人 counter readings (e.g. 1人=ひとり, 2人=ふたり). */
export function normalizePeopleCounterReadings(source: string, annotations: FuriganaAnnotation[]): FuriganaAnnotation[] {
  const positioned: PositionedAnnotation[] = [];
  let cursor = 0;
  for (const annotation of annotations) {
    if (!annotation || typeof annotation.word !== "string" || typeof annotation.reading !== "string" || !annotation.word) continue;
    const start = source.indexOf(annotation.word, cursor);
    if (start < 0) continue;
    const end = start + annotation.word.length;
    positioned.push({ start, end, annotation });
    cursor = end;
  }

  const counterPattern = /([0-9]+|[一二三四五六七八九十]+)人(目)?/gu;
  for (const match of source.matchAll(counterPattern)) {
    const count = match[1];
    const baseReading = PEOPLE_READINGS[count];
    if (!baseReading || match.index === undefined) continue;
    const start = match.index;
    const end = start + match[0].length;
    const followingKanji = source[end];
    if (followingKanji && HAS_KANJI.test(followingKanji) && !FOLLOWING_KANJI_ALLOWED.has(followingKanji)) continue;

    const numericCount = /^[0-9]+$/u.test(count);
    const word = numericCount ? match[0].slice(count.length) : match[0];
    const annotationStart = numericCount ? start + count.length : start;
    const reading = baseReading + (match[2] ? "め" : "");
    const overlaps = positioned.filter(({ start: itemStart, end: itemEnd }) => annotationStart < itemEnd && end > itemStart);
    // Only replace annotations wholly contained by this counter. If the model
    // grouped the counter with surrounding kanji, keep that larger annotation;
    // deleting it would silently leave the surrounding source unannotated.
    if (overlaps.some(({ start: itemStart, end: itemEnd }) => itemStart < annotationStart || itemEnd > end)) continue;
    for (let index = positioned.length - 1; index >= 0; index--) {
      if (annotationStart <= positioned[index].start && end >= positioned[index].end) positioned.splice(index, 1);
    }
    positioned.push({ start: annotationStart, end, annotation: { word, reading } });
  }

  return positioned.sort((left, right) => left.start - right.start).map(({ annotation }) => annotation);
}
