import assert from "node:assert/strict";
import { collectJlptReading, stableHash } from "../src/lib/jlptReading.ts";
import { splitBodyIntoSentences } from "../src/lib/readingSentences.ts";
import type { DeThiDataset } from "../src/types/dethi.ts";

const body = [{ text: "題名\n本文です。次の文です。", furigana: null }];
const question = { number: 23, problemGroup: "問題4", question: "質問", options: ["A", "B"], correctIndex: 1, points: 1,
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
