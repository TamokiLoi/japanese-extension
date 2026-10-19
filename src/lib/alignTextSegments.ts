/**
 * Reconciles annotation segments with a source string when the only difference
 * is explicit line breaks. The source text remains authoritative; arbitrary
 * text mismatches are rejected so furigana is never attached to the wrong span.
 */
export function alignTextSegmentsToLineBreaks<T extends { text: string }>(
  segments: readonly (T | null | undefined)[] | null | undefined,
  text: string,
): T[] | null {
  if (!segments?.length) return null;
  const present = segments.filter((segment): segment is T => Boolean(segment));
  if (!present.length) return null;

  const annotatedText = present.map((segment) => segment.text).join("");
  if (annotatedText === text) return present;

  const withoutLineBreaks = (value: string) => value.replace(/[\r\n]/gu, "");
  if (withoutLineBreaks(annotatedText) !== withoutLineBreaks(text)) return null;

  const breakOffsets: number[] = [];
  let textOffset = 0;
  for (let index = 0; index < text.length; index++) {
    const character = text[index];
    if (character === "\r") continue;
    if (character === "\n") breakOffsets.push(textOffset);
    else textOffset++;
  }

  let segmentOffset = 0;
  let breakIndex = 0;
  return present.map((segment) => {
    const segmentText = withoutLineBreaks(segment.text);
    const start = segmentOffset;
    const end = start + segmentText.length;
    segmentOffset = end;

    const localBreaks: number[] = [];
    while (breakIndex < breakOffsets.length && breakOffsets[breakIndex] <= end) {
      const breakOffset = breakOffsets[breakIndex++];
      if (breakOffset >= start) localBreaks.push(breakOffset - start);
    }

    let alignedText = segmentText;
    for (const offset of localBreaks.reverse()) {
      alignedText = `${alignedText.slice(0, offset)}\n${alignedText.slice(offset)}`;
    }
    return { ...segment, text: alignedText };
  });
}
