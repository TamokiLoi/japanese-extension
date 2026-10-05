import assert from "node:assert/strict";
import { collectJlptReading, stableHash } from "../src/lib/jlptReading.ts";
import { splitBodyIntoSentences } from "../src/lib/readingSentences.ts";
import { inferReadingUnderline } from "../src/lib/jlptReadingAnnotations.ts";
import { readingPassageUnderline, readingPassageUnderlineRange } from "../src/lib/jlptReadingAnnotations.ts";
import type { DeThiDataset } from "../src/types/dethi.ts";

const body = [{ text: "題名\n本文です。次の文です。", furigana: null }];
assert.equal(
  inferReadingUnderline("やってみようと思ったとあるが、何をしようと思ったのか。", "今度、私もやってみようと思った。"),
  "やってみようと思った",
);
assert.equal(inferReadingUnderline("この言葉とあるが、何を意味するか。", "この言葉が大切だ。この言葉を学ぶ。"), undefined,
  "ambiguous or non-matching phrases must not be guessed");
assert.equal(inferReadingUnderline("①例とあるが、何についての例か。", "例えば、この例があります。"), undefined,
  "a circled reference marker must not make a repeated target look unique");
assert.equal(inferReadingUnderline("②オートバイの部品が壊れていたとあるが、どういうことか。", "②オートバイの部品が壊れていた。"), "オートバイの部品が壊れていた",
  "a circled reference marker outside the source underline must be omitted");
assert.equal(readingPassageUnderline("質問側の表現とあるが、何を意味するか。", "質問側の表現", "本文側の表現", "本文側の表現です。"), "本文側の表現");
assert.equal(readingPassageUnderline("質問側の表現とあるが、何を意味するか。", "質問側の表現", null, "本文側の表現です。"), undefined,
  "a source-verified prompt-only mark must not also mark the passage");
assert.equal(readingPassageUnderlineRange("①子どもの要求について、親はどうすればいいか。", "子どもの要求", "子どもの要求", "子どもの要求はここです。子どもの要求は別の箇所です。", 0)?.start, 0,
  "a repeated phrase must support targeting the source-marked occurrence");
assert.equal(readingPassageUnderlineRange("①子どもの要求について、親はどうすればいいか。", "子どもの要求", "子どもの要求", "子どもの要求はここです。子どもの要求は別の箇所です。"), undefined,
  "an ambiguous phrase must not be marked without an occurrence annotation");
const question = { number: 23, problemGroup: "問題4", question: "質問", underline: "質問", options: ["A", "B"], correctIndex: 1, points: 1,
  passage: body[0].text, passageFurigana: body, passageVi: "Bản dịch", questionVi: "Câu hỏi", optionsVi: ["Một", "Hai"], explanation: "Lý do",
  readingPresentation: { bodySignature: stableHash(JSON.stringify(body)), sentencesVi: ["Tiêu đề và câu đầu.", "Câu tiếp."] },
};
const dataset = { meta: { level: "N3" }, exams: [{ id: "cacnam-n3-2099-12", source: "cac-nam", examLabel: "N3 T12/2099", papers: [
  { id: "reading", label: "読解", questions: [question, { ...question, number: 24, passage: "（上記と同じ）", readingPresentation: undefined }] },
  { id: "listening", label: "聴解", questions: [question] },
] }] } as unknown as DeThiDataset;
const [p] = collectJlptReading([dataset]);
assert.equal(collectJlptReading([dataset]).length, 1);
assert.equal(p.questions.length, 2);
assert.equal(p.examId, "cacnam-n3-2099-12");
assert.equal(p.examLabel, "N3 T12/2099");
assert.deepEqual(p.questions.map(q => q.sourceNumber), [23, 24]);
assert.equal(p.questions[0].correctIndex, 1);
assert.equal(p.questions[0].underline, "質問");
assert.deepEqual(p.body, body);
assert.equal(p.sentencesVi?.length, splitBodyIntoSentences(body).length);
const originalId = p.id;
question.questionVi = "Đổi trong nguồn";
question.optionsVi[0] = "Đổi đáp án dịch";
question.explanation = "Đổi giải thích";
const updated = collectJlptReading([dataset])[0];
assert.equal(updated.id, originalId);
assert.equal(updated.questions[0].questionVi, "Đổi trong nguồn");
assert.equal(updated.questions[0].optionsVi[0], "Đổi đáp án dịch");
assert.equal(updated.questions[0].explanation, "Đổi giải thích");
updated.questions[0].options[0] = "View mutation";
assert.equal(question.options[0], "A");
body[0].text += "追加。";
assert.equal(collectJlptReading([dataset])[0].sentencesVi, undefined, "stale translations must not pair with a changed body");
dataset.exams[0].papers[0].questions[0].passage = "（同上）";
assert.throws(() => collectJlptReading([dataset]), /Unresolved shared-passage/);
console.log("PASS: shared passages, source propagation, stable progress IDs, array isolation, translation grouping/staleness, unresolved-marker guard.");
