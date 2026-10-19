import type { ListeningFuriganaAnnotation } from "../../types/listening.ts";

export type FuriganaAnnotation = ListeningFuriganaAnnotation;

const KANA_ONLY = /^[\u3041-\u3096\u30a1-\u30faー]+$/u;
const HAS_KANJI = /[\u3400-\u9fff々〆ヶ]/u;

export function FuriganaText({
  annotations,
  highlightWord,
  text,
  className,
}: {
  annotations?: FuriganaAnnotation[];
  highlightWord?: string;
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
      if (index < cursor || index < 0 || !HAS_KANJI.test(annotation.word) || !KANA_ONLY.test(annotation.reading)) {
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
  const renderText = (value: string, keyPrefix: string) => {
    if (!highlightWord || !value.includes(highlightWord)) return value;
    const highlightedParts = value.split(highlightWord);
    return highlightedParts.flatMap((part, index) => index < highlightedParts.length - 1
      ? [part, <strong key={`${keyPrefix}-highlight-${index}`} className="font-extrabold text-sky-900 dark:text-sky-200">{highlightWord}</strong>]
      : [part]);
  };

  return (
    <span className={className}>
      {parts.map((part, index) =>
        part.reading ? (
          <ruby key={`${part.text}-${index}`}>
            {renderText(part.text, `${part.text}-${index}`)}
            <rt className="text-[10px] font-normal text-neutral-400">{part.reading}</rt>
          </ruby>
        ) : (
          <span key={`${part.text}-${index}`}>{renderText(part.text, `${part.text}-${index}`)}</span>
        ),
      )}
    </span>
  );
}
