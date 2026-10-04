import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { collectJlptReading } from "../src/lib/jlptReading.ts";
import { splitBodyIntoSentences } from "../src/lib/readingSentences.ts";
import type { DeThiDataset } from "../src/types/dethi.ts";

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8")) as T;
}

const dataset = readJson<DeThiDataset>("../src/data/dethi-n3-cac-nam.json");
const examIds = ["cacnam-n3-2025-07", "cacnam-n3-2026-07"];
const reading = collectJlptReading([dataset]);

for (const examId of examIds) {
  const exam = dataset.exams.find(item => item.id === examId);
  assert.ok(exam, `Missing ${examId}`);
  const paper = exam.papers.find(item => item.id === "bunpou-dokkai");
  assert.ok(paper, `Missing reading paper for ${examId}`);
  const readingQuestions = paper.questions.filter(item => item.number >= 19 && item.number <= 38);
  assert.equal(readingQuestions.length, 20, `${examId}: reading question count`);
  for (const question of readingQuestions) {
    const passageOnlyCloze = examId === "cacnam-n3-2025-07" && question.number >= 19 && question.number <= 22;
    if (!passageOnlyCloze) assert.ok(question.questionVi?.trim(), `${examId}/Q${question.number}: questionVi`);
    assert.equal(question.optionsVi?.length, question.options.length, `${examId}/Q${question.number}: optionsVi`);
    assert.ok(question.optionsVi?.every(item => item.trim()), `${examId}/Q${question.number}: empty optionsVi`);
  }
  if (examId === "cacnam-n3-2025-07") {
    for (const question of readingQuestions.filter(item => item.number >= 19 && item.number <= 22)) {
      assert.equal(question.question, "", `${examId}/Q${question.number}: cloze card must not repeat the whole passage`);
      assert.equal(question.questionVi, "", `${examId}/Q${question.number}: cloze translation must stay with the passage`);
    }
    for (const question of readingQuestions.filter(item => item.number >= 23 && item.number <= 36)) {
      assert.ok(question.question.length < 180, `${examId}/Q${question.number}: question still includes the passage`);
      assert.equal(question.questionFurigana?.map(item => item.text).join(""), question.question, `${examId}/Q${question.number}: prompt furigana alignment`);
    }
  }

  const passages = reading.filter(item => item.id.includes(examId));
  assert.equal(passages.length, 9, `${examId}: expected 9 reading passages`);
  for (const passage of passages) {
    const units = splitBodyIntoSentences(passage.body);
    assert.equal(passage.sentencesVi?.length, units.length, `${passage.title}: translation alignment`);
    assert.ok(passage.sentencesVi?.every(item => item.trim()), `${passage.title}: empty sentence translation`);
    assert.ok(passage.translationVi.trim(), `${passage.title}: full translation missing`);
  }

  const listening = exam.papers.find(item => item.id === "choukai");
  assert.ok(listening, `${examId}: missing listening paper`);
  assert.equal(listening.questions.length, 28, `${examId}: listening question count`);
  const practicePath = `../src/data/listening-dethi-n3-${examId.slice(-7)}.json`;
  const practice = readJson<{ questions: Array<{
    correctIndex: number; turns: Array<{ text: string; textVi: string }>;
    options: string[]; optionsVi: string[]; optionExplanations: string[];
  }> }>(practicePath).questions;
  assert.equal(practice.length, 28, `${examId}: listening practice count`);
  for (let index = 0; index < 28; index++) {
    const source = listening.questions[index];
    const converted = practice[index];
    const expectedOptionCount = source.optionsImage ? source.optionCount ?? 0 : source.options.length;
    assert.equal(converted.correctIndex, source.correctIndex, `${examId}/Q${index + 1}: answer mismatch`);
    assert.ok(converted.correctIndex >= 0 && converted.correctIndex < expectedOptionCount, `${examId}/Q${index + 1}: answer index outside choices`);
    assert.ok(Math.abs(converted.audioStartSec - source.audioStartSec) < 0.5, `${examId}/Q${index + 1}: audio start mismatch`);
    assert.ok(converted.audioStartSec < converted.audioEndSec, `${examId}/Q${index + 1}: invalid audio range`);
    if (index + 1 < 28) assert.ok(converted.audioEndSec < practice[index + 1].audioStartSec, `${examId}/Q${index + 1}: audio overlaps next question`);
    assert.ok(converted.questionVi?.trim(), `${examId}/Q${index + 1}: missing question translation`);
    assert.ok(converted.explanation?.trim(), `${examId}/Q${index + 1}: missing explanation`);
    if (source.optionsImage) assert.ok(existsSync(new URL(`../${source.optionsImage}`, import.meta.url)), `${examId}/Q${index + 1}: missing options image`);
    if (source.optionsImage) {
      assert.equal(converted.optionsImage, source.optionsImage, `${examId}/Q${index + 1}: options image mismatch`);
      assert.equal(converted.options.length, 0, `${examId}/Q${index + 1}: image question should not duplicate text options`);
      assert.equal(converted.optionsVi.length, 0, `${examId}/Q${index + 1}: image question should not duplicate translated options`);
    } else {
      assert.equal(converted.options.length, expectedOptionCount, `${examId}/Q${index + 1}: options count mismatch`);
      assert.equal(converted.optionsVi.length, expectedOptionCount, `${examId}/Q${index + 1}: optionsVi count mismatch`);
    }
    assert.equal(converted.optionExplanations.length, expectedOptionCount, `${examId}/Q${index + 1}: option explanation count mismatch`);
    assert.ok(converted.turns?.length, `${examId}/Q${index + 1}: missing transcript`);
    assert.ok(converted.turns.every(turn => turn.text.trim() && turn.textVi.trim()), `${examId}/Q${index + 1}: incomplete transcript translation`);
  }
}

console.log("PASS: N3 July 2025/2026 reading and listening coverage, translations, answer parity.");
