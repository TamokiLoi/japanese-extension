// Compatibility command: Reading now derives from canonical exam data at runtime.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { collectJlptReading, stableHash } from "../src/lib/jlptReading.ts";
import { splitBodyIntoSentences } from "../src/lib/readingSentences.ts";
import assert from "node:assert/strict";
import type { DeThiDataset } from "../src/types/dethi.ts";

const root = join(import.meta.dirname, "..");
const registry = readFileSync(join(root, "src/popup/dethiCatalog.ts"), "utf8");
const names = [...registry.matchAll(/import\s+\w+\s+from\s+["']\.\.\/data\/((?:dethi-n\d+-cac-nam|de-n3-set-\d+)\.json)["']/gu)].map(m => m[1]);
if (!names.length) throw new Error("No registered JLPT datasets");
const datasets = names.map(name => JSON.parse(readFileSync(join(root, "src/data", name), "utf8")) as DeThiDataset);
const passages = collectJlptReading(datasets);
for (const dataset of datasets) for (const exam of dataset.exams) for (const paper of exam.papers) {
  for (const q of paper.questions) {
    if (!q.readingPresentation) continue;
    const p = passages.find(p => p.id.startsWith(`jlpt-${exam.id}-${paper.id}-`) && p.questions.some(question => question.sourceNumber === q.number));
    if (!p || q.readingPresentation.bodySignature !== stableHash(JSON.stringify(p.body))) {
      throw new Error(`Stale reading presentation: ${exam.id}/${paper.id}/q${q.number}; realign after source edits.`);
    }
    if (q.readingPresentation.sentencesVi.length !== splitBodyIntoSentences(p.body).length) {
      throw new Error(`Reading translation count mismatch: ${exam.id}/${paper.id}/q${q.number}`);
    }
  }
}
for (const p of passages) {
  if (!p.body.map(s => s.text).join("").trim()) throw new Error(`Empty passage: ${p.id}`);
  const passageText = p.body.map(s => s.text).join("");
  for (const phrase of p.underlinedPhrases ?? []) {
    const first = passageText.indexOf(phrase);
    assert.notEqual(first, -1, `Missing passage underline: ${p.id}/${phrase}`);
    assert.equal(first, passageText.lastIndexOf(phrase), `Ambiguous passage underline: ${p.id}/${phrase}`);
  }
  for (const range of p.underlinedRanges ?? []) {
    assert.ok(Number.isInteger(range.start) && Number.isInteger(range.end) && range.start >= 0 && range.end > range.start && range.end <= passageText.length, `Invalid passage underline range: ${p.id}/${JSON.stringify(range)}`);
  }
  for (const q of p.questions) if (!Number.isInteger(q.correctIndex) || q.correctIndex < 0 || q.correctIndex >= q.options.length) {
    throw new Error(`Invalid answer: ${p.id}/q${q.sourceNumber}`);
  }
  for (const q of p.questions) if (q.underline && !q.question.includes(q.underline)) {
    throw new Error(`Question underline not found: ${p.id}/q${q.sourceNumber}`);
  }
}
const underlinedQuestionCount = passages.reduce((total, passage) => total + passage.questions.filter(question => question.underline).length, 0);
const underlinedPassageCount = passages.filter(passage => passage.underlinedPhrases?.length || passage.underlinedRanges?.length).length;
const passageMarkCount = passages.reduce((total, passage) => total + (passage.underlinedPhrases?.length ?? 0) + (passage.underlinedRanges?.length ?? 0), 0);
const sample = passages.find(passage => passage.examId === "cacnam-n3-2025-12" && passage.questions.some(question => question.sourceNumber === 23));
assert.equal(sample?.questions.find(question => question.sourceNumber === 23)?.underline, "やってみようと思った", "N3 T12/2025 q23 underline should be preserved");
const n3Q32 = passages.find(passage => passage.examId === "cacnam-n3-2020-12" && passage.questions.some(question => question.sourceNumber === 32));
assert.equal(n3Q32?.questions.find(question => question.sourceNumber === 32)?.underline, "②「ありがとう。」という言葉には、不思議な力があるなと思いました");
const n3Q32Target = "「ありがとう。」という言葉には、不思議な力があるなと思いました";
const n3Q32Text = n3Q32?.body.map(segment => segment.text).join("") ?? "";
assert.ok(n3Q32?.underlinedRanges?.some(range => n3Q32Text.slice(range.start, range.end) === `②${n3Q32Target}`));
const n3Q27 = passages.find(passage => passage.examId === "cacnam-n3-2026-07" && passage.questions.some(question => question.sourceNumber === 27));
assert.equal(n3Q27?.questions.find(question => question.sourceNumber === 27)?.underline, "「最後の一つ」と言わないようにした");
const n3Q27Text = n3Q27?.body.map(segment => segment.text).join("") ?? "";
assert.ok(n3Q27?.underlinedRanges?.some(range => n3Q27Text.slice(range.start, range.end) === "「最後の一つ」と言わないようにしました"));
const n3Q34 = passages.find(passage => passage.examId === "cacnam-n3-2026-07" && passage.questions.some(question => question.sourceNumber === 34));
assert.equal(n3Q34?.questions.find(question => question.sourceNumber === 34)?.underline, "同じ");
const n3Q34Text = n3Q34?.body.map(segment => segment.text).join("") ?? "";
assert.ok(n3Q34?.underlinedRanges?.some(range => n3Q34Text.slice(range.start, range.end) === "同じ"));
const n3Q35 = passages.find(passage => passage.examId === "cacnam-n3-2026-07" && passage.questions.some(question => question.sourceNumber === 35));
assert.equal(n3Q35?.questions.find(question => question.sourceNumber === 35)?.underline, "変化");
const n3Q35Text = n3Q35?.body.map(segment => segment.text).join("") ?? "";
assert.ok(n3Q35?.underlinedRanges?.some(range => range.start === n3Q35Text.indexOf("変化") && n3Q35Text.slice(range.start, range.end) === "変化"));
const n3Q33 = passages.find(passage => passage.examId === "cacnam-n3-2026-07" && passage.questions.some(question => question.sourceNumber === 33));
assert.equal(n3Q33?.questions.find(question => question.sourceNumber === 33)?.underline, "それを解決する");
const n3Q33Text = n3Q33?.body.map(segment => segment.text).join("") ?? "";
const n3Q33Start = n3Q33Text.indexOf("それ");
assert.ok(n3Q33Start >= 0 && n3Q33?.underlinedRanges?.some(range => range.start === n3Q33Start && n3Q33Text.slice(range.start, range.end) === "それ"));
const n3Q26 = passages.find(passage => passage.examId === "cacnam-n3-2025-07" && passage.questions.some(question => question.sourceNumber === 26));
assert.equal(n3Q26?.questions.find(question => question.sourceNumber === 26)?.underline, "「別のところが痛くなってきた。今度はそっちが悪いみたいだ。」");
const n3T7Q27 = passages.find(passage => passage.examId === "cacnam-n3-2025-07" && passage.questions.some(question => question.sourceNumber === 27));
assert.equal(n3T7Q27?.questions.find(question => question.sourceNumber === 27)?.underline, "例");
const n3T7Q27Text = n3T7Q27?.body.map(segment => segment.text).join("") ?? "";
const n3T7Q27TargetStart = n3T7Q27Text.indexOf("例", n3T7Q27Text.indexOf("例") + 1);
assert.ok(n3T7Q27TargetStart >= 0 && n3T7Q27?.underlinedRanges?.some(range => range.start === n3T7Q27TargetStart && n3T7Q27Text.slice(range.start, range.end) === "例"));
const n3T7Q34 = passages.find(passage => passage.examId === "cacnam-n3-2025-07" && passage.questions.some(question => question.sourceNumber === 34));
assert.equal(n3T7Q34?.questions.find(question => question.sourceNumber === 34)?.underline, "説明してくれた");
const n3T7Q34Text = n3T7Q34?.body.map(segment => segment.text).join("") ?? "";
assert.ok(!n3T7Q34?.underlinedPhrases?.includes("説明してくれた") && !n3T7Q34?.underlinedRanges?.some(range => n3T7Q34Text.slice(range.start, range.end) === "説明してくれた"));
const n1Q57 = passages.find(passage => passage.examId === "cacnam-n1-2026-07" && passage.questions.some(question => question.sourceNumber === 57));
assert.equal(n1Q57?.questions.find(question => question.sourceNumber === 57)?.underline, "子どもの要求");
const n1Q57Text = n1Q57?.body.map(segment => segment.text).join("") ?? "";
const n1Q57Start = n1Q57Text.indexOf("子どもの要求");
assert.ok(n1Q57Start >= 0 && n1Q57?.underlinedRanges?.some(range => range.start === n1Q57Start && n1Q57Text.slice(range.start, range.end) === "子どもの要求"));
const n1Q47 = passages.find(passage => passage.examId === "cacnam-n1-2026-07" && passage.questions.some(question => question.sourceNumber === 47));
assert.equal(n1Q47?.questions.find(question => question.sourceNumber === 47)?.underline, "逆説的なところ");
const n1Q47Text = n1Q47?.body.map(segment => segment.text).join("") ?? "";
assert.ok(!n1Q47?.underlinedPhrases?.includes("逆説的なところ") && !n1Q47?.underlinedRanges?.some(range => n1Q47Text.slice(range.start, range.end) === "逆説的なところ"));
const n3T1222Q28 = passages.find(passage => passage.examId === "cacnam-n3-2022-12" && passage.questions.some(question => question.sourceNumber === 28));
assert.equal(n3T1222Q28?.questions.find(question => question.sourceNumber === 28)?.underline, "また、ラジオを聞こうと思った");
const n3T1222Q28Text = n3T1222Q28?.body.map(segment => segment.text).join("") ?? "";
assert.ok(n3T1222Q28?.underlinedRanges?.some(range => n3T1222Q28Text.slice(range.start, range.end) === "また、ラジオを聞こうと思った"));
const n3D12Q33 = passages.find(passage => passage.examId === "cacnam-n3-2023-12" && passage.questions.some(question => question.sourceNumber === 33));
assert.equal(n3D12Q33?.questions.find(question => question.sourceNumber === 33)?.underline, "長い間乗っていなかった");
const n3D12Q33Text = n3D12Q33?.body.map(segment => segment.text).join("") ?? "";
assert.ok(n3D12Q33?.underlinedRanges?.some(range => n3D12Q33Text.slice(range.start, range.end) === "長い間乗っていなかった"));
const n3T1223Q28 = passages.find(passage => passage.examId === "cacnam-n3-2023-12" && passage.questions.some(question => question.sourceNumber === 28));
const n3T1223Q28Text = n3T1223Q28?.body.map(segment => segment.text).join("") ?? "";
assert.ok(n3T1223Q28?.underlinedRanges?.some(range => n3T1223Q28Text.slice(range.start, range.end) === "このときの私は逆だったのです"));
const n3D12Q31 = passages.find(passage => passage.examId === "cacnam-n3-2019-12" && passage.questions.some(question => question.sourceNumber === 31));
assert.equal(n3D12Q31?.questions.find(question => question.sourceNumber === 31)?.underline, "自分の思っている「右」を相手に正しく伝えるのは難しい");
const n3D12Q31Text = n3D12Q31?.body.map(segment => segment.text).join("") ?? "";
assert.ok(n3D12Q31?.underlinedRanges?.some(range => n3D12Q31Text.slice(range.start, range.end) === "自分の思っている「右」を相手に正しく伝えるのは難しい"));
const n3D12Q34 = passages.find(passage => passage.examId === "cacnam-n3-2019-12" && passage.questions.some(question => question.sourceNumber === 34));
assert.equal(n3D12Q34?.questions.find(question => question.sourceNumber === 34)?.underline, "面白いサイト");
const n3D12Q34Text = n3D12Q34?.body.map(segment => segment.text).join("") ?? "";
assert.ok(n3D12Q34?.underlinedRanges?.some(range => n3D12Q34Text.slice(range.start, range.end) === "面白いサイト"));
const n3D7Q36 = passages.find(passage => passage.examId === "cacnam-n3-2021-07" && passage.questions.some(question => question.sourceNumber === 36));
assert.equal(n3D7Q36?.questions.find(question => question.sourceNumber === 36)?.underline, "私が見たCM");
const n3D7Q36Text = n3D7Q36?.body.map(segment => segment.text).join("") ?? "";
assert.ok(n3D7Q36?.underlinedRanges?.some(range => n3D7Q36Text.slice(range.start, range.end) === "私が見たCM"));
const n3J7Q33 = passages.find(passage => passage.examId === "cacnam-n3-2019-07" && passage.questions.some(question => question.sourceNumber === 33));
assert.equal(n3J7Q33?.questions.find(question => question.sourceNumber === 33)?.underline, "このような応援");
const n3J7Q33Text = n3J7Q33?.body.map(segment => segment.text).join("") ?? "";
assert.ok(n3J7Q33?.underlinedRanges?.some(range => n3J7Q33Text.slice(range.start, range.end) === "このような応援"));
for (const [examId, questionNumber, target] of [
  ["cacnam-n3-2021-12", 30, "財布を開く"],
  ["cacnam-n3-2021-12", 31, "アドバイス"],
  ["cacnam-n3-2022-12", 30, "説明会"],
] as const) {
  const passage = passages.find(item => item.examId === examId && item.questions.some(question => question.sourceNumber === questionNumber));
  assert.equal(passage?.questions.find(question => question.sourceNumber === questionNumber)?.underline, target);
  const passageText = passage?.body.map(segment => segment.text).join("") ?? "";
  assert.ok(passage?.underlinedRanges?.some(range => passageText.slice(range.start, range.end) === target));
}
const annualExamCount = datasets.reduce((total, dataset) => total + dataset.exams.filter(exam => exam.source === "cac-nam").length, 0);
const mockExamCount = datasets.reduce((total, dataset) => total + dataset.exams.filter(exam => exam.source === "de-n3").length, 0);
console.log(`Validated ${annualExamCount} annual JLPT papers and ${mockExamCount} N3 practice sets, ${passages.length} reading passages / ${passages.reduce((n,p)=>n+p.questions.length,0)} questions; restored ${underlinedQuestionCount} prompt marks and ${passageMarkCount} passage marks across ${underlinedPassageCount} passages. No duplicate content file generated.`);
