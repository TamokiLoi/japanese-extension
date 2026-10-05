const REFERENCE_MARKER = /と(?:書いて|書かれて)?あるが|とありますが|と書いてありますが|と書かれているが|とあるのは|と言うのは|というのは|と言うが|というが/u;
const CIRCLED_QUESTION_NUMBER = /^[①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳]\s*/u;

function cleanCandidate(value: string): string {
  return value.trim().replace(/[、，,]$/u, "");
}

function referenceCandidates(question: string, passage: string | null): string[] {
  const marker = REFERENCE_MARKER.exec(question);
  if (!marker || marker.index === 0) return [];

  const raw = cleanCandidate(question.slice(0, marker.index));
  const candidates = new Set<string>([raw, cleanCandidate(raw.replace(CIRCLED_QUESTION_NUMBER, ""))]);

  // A prefatory phrase can precede the actual quotation being referenced
  // (e.g. 「患者が『…』と言うのはなぜか」). Keep both the whole prompt
  // prefix and quoted spans, then let exact source-text matching choose.
  for (const match of raw.matchAll(/[「『（(]([^」』）)]+)[」』）)]/gu)) {
    const full = cleanCandidate(match[0]);
    const inner = cleanCandidate(match[1]);
    if (inner) candidates.add(inner);
    if (full) candidates.add(full);
  }

  for (const candidate of [...candidates]) {
    for (const [open, close] of [["「", "」"], ["『", "』"], ["（", "）"], ["(", ")"]]) {
      if (candidate.startsWith(open) && candidate.endsWith(close)) {
        candidates.add(cleanCandidate(candidate.slice(open.length, -close.length)));
      }
    }
  }

  return [...candidates]
    // Do not treat the circled reference marker itself as underlined just
    // because its inclusion makes an otherwise repeated phrase unique.
    // Source-verified exceptions (for example N3 12/2020 q32) are explicit.
    .filter((candidate) => candidate.length >= 2 && !CIRCLED_QUESTION_NUMBER.test(candidate))
    // Circled reference numbers (①, ②, …) label the referred sentence; they
    // are normally outside the underline. Prefer the same candidate without
    // its marker when both spellings match the passage. Verified exceptions
    // can override this through an explicit `underline` field.
    .sort((left, right) => {
      const leftTextLength = cleanCandidate(left.replace(CIRCLED_QUESTION_NUMBER, "")).length;
      const rightTextLength = cleanCandidate(right.replace(CIRCLED_QUESTION_NUMBER, "")).length;
      if (leftTextLength !== rightTextLength) return rightTextLength - leftTextLength;
      const leftHasMarker = CIRCLED_QUESTION_NUMBER.test(left);
      const rightHasMarker = CIRCLED_QUESTION_NUMBER.test(right);
      if (leftHasMarker !== rightHasMarker) return leftHasMarker ? 1 : -1;
      return right.length - left.length;
    });
}

function uniquePassageMatch(candidates: readonly string[], passage: string): string | undefined {
  return candidates.find((candidate) => {
    const first = passage.indexOf(candidate);
    return first >= 0 && first === passage.lastIndexOf(candidate);
  });
}

/**
 * Resolve the phrase emphasized in the question prompt. Exact unique passage
 * matches disambiguate quoted references; when source wording differs, retain
 * the actual prompt prefix instead of silently dropping its visible mark.
 */
export function readingQuestionUnderline(question: string, explicitUnderline: string | undefined, passage: string | null): string | undefined {
  if (explicitUnderline) return explicitUnderline;
  return passage ? inferReadingUnderline(question, passage) : undefined;
}

/** Infer a question target only when its exact phrase occurs once in the passage. */
export function inferReadingUnderline(question: string, passage: string): string | undefined {
  return uniquePassageMatch(referenceCandidates(question, passage), passage);
}

/** Resolve the separately emphasized phrase in the source passage, if any. */
export function readingPassageUnderline(
  question: string,
  explicitQuestionUnderline: string | undefined,
  explicitPassageUnderline: string | null | undefined,
  passage: string | null,
  occurrence?: number,
): string | undefined {
  const range = readingPassageUnderlineRange(question, explicitQuestionUnderline, explicitPassageUnderline, passage, occurrence);
  return range && passage ? passage.slice(range.start, range.end) : undefined;
}

function occurrenceRange(text: string, phrase: string, occurrence: number): { start: number; end: number } | undefined {
  if (!Number.isInteger(occurrence) || occurrence < 0) return undefined;
  let from = 0;
  for (let index = 0; index <= occurrence; index++) {
    const start = text.indexOf(phrase, from);
    if (start < 0) return undefined;
    if (index === occurrence) return { start, end: start + phrase.length };
    from = start + 1;
  }
  return undefined;
}

export function readingPassageUnderlineRange(
  question: string,
  explicitQuestionUnderline: string | undefined,
  explicitPassageUnderline: string | null | undefined,
  passage: string | null,
  occurrence?: number,
): { start: number; end: number } | undefined {
  if (explicitPassageUnderline === null) return undefined;
  if (!passage) return undefined;

  const phrase = explicitPassageUnderline || (() => {
    const candidates = referenceCandidates(question, passage);
    if (explicitQuestionUnderline) candidates.unshift(explicitQuestionUnderline);
    return uniquePassageMatch(candidates, passage);
  })();
  if (!phrase) return undefined;
  if (occurrence !== undefined) return occurrenceRange(passage, phrase, occurrence);

  const start = passage.indexOf(phrase);
  return start >= 0 && start === passage.lastIndexOf(phrase) ? { start, end: start + phrase.length } : undefined;
}

export function readingPassageUnderlineRanges(
  questions: readonly { question: string; underline?: string; passageUnderline?: string | null; passageUnderlineOccurrence?: number }[],
  passage: string,
): { start: number; end: number }[] {
  const ranges = new Map<string, { start: number; end: number }>();
  for (const question of questions) {
    const range = readingPassageUnderlineRange(question.question, question.underline, question.passageUnderline, passage, question.passageUnderlineOccurrence);
    if (range) ranges.set(`${range.start}:${range.end}`, range);
  }
  return [...ranges.values()].sort((left, right) => left.start - right.start);
}
