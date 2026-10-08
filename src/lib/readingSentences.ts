import type { ReadingBodySegment } from "../types/reading.ts";

// Breaks one segment's text into one piece per sentence (plus a piece
// boundary right before each "\n"). A segment's furigana is NOT necessarily
// for its whole text -- in this dataset a segment routinely spans multiple
// sentences with the furigana reading only the one kanji word right at its
// end (e.g. "に入れないこと。\n入れるときは管理人" carries furigana for just
// 管理人, the trailing word) -- so cutting is always safe as long as the
// reading travels with whichever piece it actually belongs to.
const CLOSING_PUNCT = /[」』）)]/;
function splitPlainText(text: string): string[] {
  const pieces: string[] = [];
  let buf = "";
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch === "\n" && buf.length > 0) {
      pieces.push(buf);
      buf = "";
    }
    buf += ch;
    if (ch === "。" || ch === "！" || ch === "？") {
      // Absorb an immediately-following closing quote/paren/bracket (「...」。
      // style dialogue) into this same piece instead of leaving it to
      // wrongly open the next one.
      while (i + 1 < text.length && CLOSING_PUNCT.test(text[i + 1])) {
        i++;
        buf += text[i];
      }
      pieces.push(buf);
      buf = "";
    }
    i++;
  }
  if (buf) pieces.push(buf);
  return pieces;
}

// Groups body segments into sentences (up to and including one ending in
// 。！？) -- the same grouping scripts/translate-reading-sentences.ts uses to
// derive what to send to the translator, so `sentencesVi[i]` always lines up
// with splitBodyIntoSentences(body)[i]. Any trailing text with no terminator
// (rare -- a passage not ending in punctuation) forms one last group.
//
// A "\n" only closes the current group when it sits at the very START of a
// body *segment's own* raw text (segment.text.startsWith("\n")) -- that's
// how a heading like "使用方法" is followed by the numbered "①..." text, or
// how a flyer's separate label lines ("あて先：...", "件名：...") are laid
// out in this dataset, and really is a deliberate line break. A "\n" that
// shows up *mid-segment* instead (splitPlainText cutting seg.text at an
// embedded "\n") is PDF line-wrap noise, not a real boundary -- sometimes
// falling mid-word (e.g. "でもい" + "\nいです" -- literally through the
// middle of "いい") -- so it must NOT force a break, or the two halves of
// one sentence end up as separate incomplete "sentences". Stripping the
// leading "\n" off a non-genuine break just re-joins the words cleanly.
const SENTENCE_END = /[。！？]$/;
export function splitBodyIntoSentences(body: ReadingBodySegment[]): ReadingBodySegment[][] {
  const groups: ReadingBodySegment[][] = [];
  let current: ReadingBodySegment[] = [];
  let paragraphStartPending = false;
  function addPiece(text: string, furigana: string | null, genuineBreak: boolean) {
    if (genuineBreak && current.length > 0) {
      groups.push(current);
      current = [];
    }
    // The boundary is retained as metadata, so the leading linebreak itself
    // should not become a visible blank line in the sentence renderer.
    const cleanText = text.replace(/^\n+/, "");
    if (!cleanText && furigana === null) {
      paragraphStartPending ||= genuineBreak;
      return;
    }
    current.push({ text: cleanText, furigana, ...(genuineBreak || paragraphStartPending ? { paragraphStart: true } : {}) });
    paragraphStartPending = false;
    if (SENTENCE_END.test(cleanText)) {
      groups.push(current);
      current = [];
    }
  }
  for (const seg of body) {
    const pieces = splitPlainText(seg.text);
    const segStartsWithNewline = seg.text.startsWith("\n");
    // The furigana reading applies to a kanji word within this segment,
    // which -- per how this dataset is structured -- always sits in the
    // trailing piece (a segment never starts mid-word right after a kanji
    // compound and then continues into an earlier sentence). Every earlier
    // piece carries no reading of its own.
    const startsParagraph = seg.paragraphStart === true || segStartsWithNewline;
    pieces.forEach((piece, i) => addPiece(piece, i === pieces.length - 1 ? seg.furigana : null, i === 0 && startsParagraph));
  }
  if (current.length > 0) groups.push(current);
  return groups;
}

export interface TranslatedReadingUnit {
  segments: ReadingBodySegment[];
  translation: string;
}

function hasUnclosedQuote(text: string): boolean {
  let depth = 0;
  for (const character of text) {
    if (character === "「" || character === "『") depth++;
    if (character === "」" || character === "』") depth = Math.max(0, depth - 1);
  }
  return depth > 0;
}

// Some source translations were generated for a quote and its attribution as
// separate entries (「...。 / 」と言った。), or cut midway through a
// multi-sentence quote. Keep the stored alignment intact, then show those
// entries together so the speaker stays with the quote.
export function translatedReadingUnits(body: ReadingBodySegment[], translations: string[]): TranslatedReadingUnit[] {
  const groups = splitBodyIntoSentences(body);
  const units = groups.map((segments, index) => ({ segments, translation: translations[index] ?? "" }));
  if (groups.length !== translations.length) return units;

  const merged: TranslatedReadingUnit[] = [];
  for (const unit of units) {
    const previous = merged[merged.length - 1];
    const previousText = previous?.segments.map((segment) => segment.text).join("") ?? "";
    if (previous && hasUnclosedQuote(previousText) && !unit.segments[0]?.paragraphStart) {
      previous.segments.push(...unit.segments);
      previous.translation = [previous.translation.trim(), unit.translation.trim()].filter(Boolean).join(" ");
    } else {
      merged.push({ segments: [...unit.segments], translation: unit.translation });
    }
  }
  return merged;
}
