import type { JlptLevel } from "./kanji.ts";
import type { ReadingBodySegment } from "./reading.ts";

export interface DeThiProblemGroup {
  label: string;
  questionCount: number;
  pointsPerQuestion: number;
  totalPoints: number;
}

export interface DeThiQuestion {
  number: number;
  problemGroup: string;
  question: string;
  options: string[];
  correctIndex: number;
  points: number;
  passage: string | null;
  // Optional -- most papers don't have this yet (see _scratch/build_dethi_
  // explanation.py). 1 câu tiếng Việt ngắn gọn giải thích vì sao đáp án đúng
  // là đúng (đọc/nghĩa cho câu chữ-từ vựng, mẫu ngữ pháp cho câu văn phạm,
  // trích ý đoạn văn cho câu đọc hiểu).
  explanation?: string;
  // Set only on 文字・語彙 問題1/2/4 (kanji reading, kanji writing, or
  // paraphrase) -- the exact substring of `question` that the real paper
  // prints underlined (the word being tested). UI renders it bold+underlined
  // instead of plain. Not used for 問題5 (usage): there `question` itself IS
  // the tested word, underlined wherever it occurs inside each of the 4
  // option sentences -- see `underlineForms` below for its inflected variants.
  underline?: string;
  // 問題5 only. `question` holds the tested word in dictionary/citation form,
  // but each option sentence uses it inflected (e.g. question "にぎる" appears
  // as "にぎった"/"にぎって" in the options) -- plain substring match on
  // `question` alone misses those. Lists the inflected surface forms actually
  // occurring across this question's 4 options so the UI can underline
  // whichever one matches each option. Absent when `question` itself already
  // occurs verbatim in every option (nouns, na-adjectives, i-adjectives used
  // attributively -- no conjugation needed).
  underlineForms?: string[];
  // Vietnamese translation of `question`, shown only in the post-submit
  // review view (not while taking the paper -- would give the answer away).
  // Populated for 問題1-4, where `question` is a full sentence. Not used for
  // 問題5, where `question` is just the bare tested word -- see `optionsVi`.
  questionVi?: string;
  // `question` split into segments with furigana, same shape/convention as
  // ReadingPassage.body (types/reading.ts) -- toggled on only in the
  // post-submit review view (real JLPT papers never print furigana; this is
  // purely a study aid). When present, a segment's `text` exactly matches
  // `underline`/`underlineForms` substrings so the UI can still bold+underline
  // the tested word while rendering ruby -- see QuestionText in DeThiScreen.
  // Optional: most questions don't have this yet, plain `question` text is
  // shown when absent regardless of the furigana toggle state.
  questionFurigana?: ReadingBodySegment[];
  // 問題5 only: Vietnamese translation of each of the 4 example-usage
  // sentences in `options` (parallel array, same order/length as `options`).
  optionsVi?: string[];
  // 問題5 only: furigana segments for each of the 4 example-usage sentences
  // in `options` (parallel array/shape to `optionsVi`) -- `question` itself
  // is just the bare tested word there, not a sentence, so furigana applies
  // to the options instead of `questionFurigana`. Same toggle/rendering
  // convention as `questionFurigana`.
  optionsFurigana?: ReadingBodySegment[][];
  // Context or prompt illustration for a listening question whose answer
  // choices are still text (for example, JLPT Mondai 4 situation pictures).
  questionImage?: string;
  // Set only on a 聴解 (listening) paper whose options are illustrations
  // rather than text (e.g. real JLPT Mondai1/4 picture choices) -- path
  // resolved via assetUrl(), same convention as ListeningQuestion.optionsImage
  // in types/listening.ts. When set, `options` is [] and the UI renders this
  // image with plain numbered buttons instead of text options.
  optionsImage?: string;
  // Number of numbered buttons to render under optionsImage (real JLPT
  // picture-choice items are always 4, but kept explicit rather than
  // hardcoded). Ignored when optionsImage is unset.
  optionCount?: number;
  // Seconds into the paper's shared `audioUrl` where this question's content
  // starts -- informational/seek-only. The real test plays audio once,
  // straight through; this does NOT pause/split playback per question, it's
  // just an optional "jump here" convenience while practicing.
  audioStartSec?: number;
}

export interface DeThiPaper {
  id: string;
  label: string;
  timeMinutes: number;
  totalPoints: number;
  problemGroups: DeThiProblemGroup[];
  questions: DeThiQuestion[];
  // Set only for a 聴解 paper: one continuous audio file covering every
  // question in this paper, played once straight through (matching how the
  // real test works) rather than split into per-question clips. Absent for
  // text-only papers (文字語彙/文法・読解).
  audioUrl?: string;
}

export interface DeThiExam {
  id: string;
  examLabel: string;
  // Which real-world source this exam came from -- drives grouping/labels in
  // ExamListView (see SOURCE_LABELS/SOURCE_ORDER in dethiState.ts) so the
  // IMO 26-đề set and the per-kỳ "de-thi-cac-nam" exams don't render as one
  // undifferentiated grid (they look confusingly similar: both real N3
  // exams, both labeled "N3-N"-ish, but from different books/years).
  source: string;
  papers: DeThiPaper[];
  // Book key into listeningState.ts's ALL_LISTENING (the `book` field on
  // ListeningQuestion) when this exam's real 聴解 audio has been converted
  // separately -- lets DeThiScreen link its "Nghe hiểu" card to the actual
  // Luyện nghe questions instead of always showing the "chưa có" placeholder.
  // Absent for exams (like the IMO set) that have no listening data at all.
  listeningBook?: string;
}

export interface DeThiDataset {
  meta: {
    schemaVersion: string;
    source: string;
    level: JlptLevel;
    examCount: number;
    notes: string;
  };
  exams: DeThiExam[];
}
