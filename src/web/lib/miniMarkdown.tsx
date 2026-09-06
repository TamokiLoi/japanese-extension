import type { ReactNode } from "react";

// Minimal markdown-to-JSX renderer for AI chat replies (headers, bold,
// italic, inline code, bullet/numbered lists, paragraphs) -- not full
// CommonMark, just enough that a Gemini/ChatGPT answer reads like real
// formatted chat text instead of raw "**bold**"/"### heading" symbols,
// without pulling in a markdown dependency for this one POC feature.
function renderInline(text: string): ReactNode[] {
  const parts: ReactNode[] = [];
  const regex = /(\*\*(.+?)\*\*|`(.+?)`|\*(.+?)\*)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;
  while ((match = regex.exec(text))) {
    if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index));
    if (match[2] !== undefined) parts.push(<b key={key++}>{match[2]}</b>);
    else if (match[3] !== undefined)
      parts.push(
        <code key={key++} className="rounded bg-black/10 px-1 py-0.5 text-[0.85em]">
          {match[3]}
        </code>,
      );
    else if (match[4] !== undefined) parts.push(<i key={key++}>{match[4]}</i>);
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return parts;
}

export function MiniMarkdown({ text }: { text: string }) {
  const lines = text.split("\n");
  const blocks: ReactNode[] = [];
  let listItems: string[] = [];
  let listOrdered = false;

  function flushList() {
    if (listItems.length === 0) return;
    const items = listItems;
    blocks.push(
      listOrdered ? (
        <ol key={blocks.length} className="list-decimal space-y-0.5 pl-5">
          {items.map((it, i) => (
            <li key={i}>{renderInline(it)}</li>
          ))}
        </ol>
      ) : (
        <ul key={blocks.length} className="list-disc space-y-0.5 pl-5">
          {items.map((it, i) => (
            <li key={i}>{renderInline(it)}</li>
          ))}
        </ul>
      ),
    );
    listItems = [];
  }

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    const headerMatch = line.match(/^(#{1,4})\s+(.*)$/);
    const ulMatch = line.match(/^[-*]\s+(.*)$/);
    const olMatch = line.match(/^\d+\.\s+(.*)$/);
    if (headerMatch) {
      flushList();
      const level = headerMatch[1].length;
      blocks.push(
        <div key={blocks.length} className={`mt-2 first:mt-0 ${level <= 2 ? "text-sm font-bold" : "text-sm font-semibold"}`}>
          {renderInline(headerMatch[2])}
        </div>,
      );
    } else if (ulMatch) {
      if (listOrdered) flushList();
      listOrdered = false;
      listItems.push(ulMatch[1]);
    } else if (olMatch) {
      if (!listOrdered) flushList();
      listOrdered = true;
      listItems.push(olMatch[1]);
    } else if (line.trim() === "") {
      flushList();
    } else {
      flushList();
      blocks.push(
        <p key={blocks.length} className="mt-1.5 first:mt-0">
          {renderInline(line)}
        </p>,
      );
    }
  }
  flushList();
  return <div>{blocks}</div>;
}
