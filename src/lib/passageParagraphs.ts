import type { ReadingBodySegment } from "../types/reading.ts";

export interface PassageParagraphRange {
  text: string;
  start: number;
  end: number;
}

// Keep source offsets so furigana and underlined exam phrases still point to
// the original passage after its visual paragraphs have been separated.
export function splitPassageParagraphs(text: string): PassageParagraphRange[] {
  const ranges: PassageParagraphRange[] = [];
  const separator = /\r?\n[\t ]*\r?\n/gu;
  let cursor = 0;
  for (const match of text.matchAll(separator)) {
    const start = match.index ?? cursor;
    const raw = text.slice(cursor, start);
    const leading = raw.length - raw.trimStart().length;
    const trailing = raw.length - raw.trimEnd().length;
    if (raw.trim()) ranges.push({ text: raw.trim(), start: cursor + leading, end: start - trailing });
    cursor = start + match[0].length;
  }
  const tail = text.slice(cursor);
  const tailLeading = tail.length - tail.trimStart().length;
  const tailTrailing = tail.length - tail.trimEnd().length;
  if (tail.trim()) ranges.push({ text: tail.trim(), start: cursor + tailLeading, end: text.length - tailTrailing });

  return ranges.flatMap((paragraph) => {
    const lines = [...paragraph.text.matchAll(/[^\r\n]+/gu)].map((match) => ({
      text: match[0],
      start: match.index ?? 0,
    }));
    if (lines.length < 2 || lines.length > 12 || paragraph.text.includes("|")) return [paragraph];

    const isStructuredLine = (line: string) =>
      /^\s*(?:[-*•・※]|\(?\d+\)?[.)、]|(?:日時|日\s*時|場所|料金|電話|営業時間|開室時間|連絡先|参加方法|持ち物|対象|申込)[：:])/u.test(line);
    if (lines.some(({ text: line }) => isStructuredLine(line))) return [paragraph];

    const longLines = lines.filter(({ text: line }) => line.trim().length >= 50).length;
    const hasShortTitle = lines[0].text.trim().length <= 40 && !/[。！？!?」』）)]\s*$/u.test(lines[0].text.trim());
    const candidateBreakLines = lines.slice(hasShortTitle ? 1 : 0, -1);
    const sentenceEndedLines = candidateBreakLines.filter(({ text: line }) => /[。！？!?」』）)]\s*$/u.test(line.trim())).length;
    const hasParagraphLikeBreaks = candidateBreakLines.length === 0
      ? hasShortTitle
      : sentenceEndedLines === candidateBreakLines.length;
    if (!hasParagraphLikeBreaks || longLines < Math.ceil(lines.length / 2)) return [paragraph];

    return lines.map(({ text: line, start }) => {
      const leading = line.length - line.trimStart().length;
      const trailing = line.length - line.trimEnd().length;
      return {
        text: line.trim(),
        start: paragraph.start + start + leading,
        end: paragraph.start + start + line.length - trailing,
      };
    });
  });
}

export function sliceReadingBody(body: readonly ReadingBodySegment[], start: number, end: number) {
  const result: { text: string; furigana: string | null; offset: number }[] = [];
  let offset = 0;
  for (const segment of body) {
    const segmentStart = offset;
    const segmentEnd = offset + segment.text.length;
    offset = segmentEnd;
    const from = Math.max(start, segmentStart);
    const to = Math.min(end, segmentEnd);
    if (from >= to) continue;
    const omittedPrefix = segment.text.slice(0, from - segmentStart);
    const omittedSuffix = segment.text.slice(to - segmentStart);
    result.push({
      text: segment.text.slice(from - segmentStart, to - segmentStart),
      furigana: omittedPrefix.trim() || omittedSuffix.trim() ? null : segment.furigana,
      offset: from,
    });
  }
  return result;
}
