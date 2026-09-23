export interface FuriganaAnnotation {
  /** Exact word or inflected word as it appears in the source sentence. */
  word: string;
  reading: string;
}

export function FuriganaText({
  annotations,
  text,
  className,
}: {
  annotations?: FuriganaAnnotation[];
  text?: string;
  className?: string;
}) {
  const parts: { text: string; reading: string }[] = [];
  let cursor = 0;
  let valid = true;
  if (!annotations?.length) {
    if (text) parts.push({ text, reading: "" });
  } else {
    for (const annotation of annotations) {
      const index = text?.indexOf(annotation.word, cursor) ?? -1;
      if (index < cursor || index < 0) {
        valid = false;
        break;
      }
      if (index > cursor) parts.push({ text: text!.slice(cursor, index), reading: "" });
      parts.push({ text: annotation.word, reading: annotation.reading });
      cursor = index + annotation.word.length;
    }
    if (valid && text && cursor < text.length) parts.push({ text: text.slice(cursor), reading: "" });
    if (!valid && text) parts.splice(0, parts.length, { text, reading: "" });
  }
  return (
    <span className={className}>
      {parts.map((part, index) =>
        part.reading ? (
          <ruby key={`${part.text}-${index}`}>
            {part.text}
            <rt className="text-[10px] font-normal text-neutral-400">{part.reading}</rt>
          </ruby>
        ) : (
          <span key={`${part.text}-${index}`}>{part.text}</span>
        ),
      )}
    </span>
  );
}
