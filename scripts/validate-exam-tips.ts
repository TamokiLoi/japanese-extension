import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { n3ReadingLessons, n3ReadingCoverage } from "../src/web/data/examTips/n3Reading.ts";
import { n3ListeningLessons, n3ListeningCoverage } from "../src/web/data/examTips/n3Listening.ts";
import type { ExamTipsBlock, ExamTipsLesson, ExamTipsSlideCoverage } from "../src/web/data/examTips/types.ts";

const expectedSlides = { "reading-tips": 43, "fast-reading": 21, "listening-tips": 45 } as const;
const lessons: ExamTipsLesson[] = [...n3ReadingLessons, ...n3ListeningLessons];
const coverage: ExamTipsSlideCoverage[] = [...n3ReadingCoverage, ...n3ListeningCoverage];
const errors: string[] = [];
const lessonIds = new Set<string>();
const coverageBySource = new Map<string, ExamTipsSlideCoverage>();

for (const lesson of lessons) {
  if (lessonIds.has(lesson.id)) errors.push(`duplicate lesson id: ${lesson.id}`);
  lessonIds.add(lesson.id);
  if (!lesson.sourceSlides.length) errors.push(`${lesson.id}: missing source slide references`);
}

for (const entry of coverage) {
  const key = `${entry.deck}:${entry.slide}`;
  if (coverageBySource.has(key)) errors.push(`duplicate slide coverage: ${key}`);
  coverageBySource.set(key, entry);
  if (entry.slide < 1 || entry.slide > (expectedSlides[entry.deck] ?? 0)) errors.push(`slide out of range: ${key}`);
  if (["converted", "merged"].includes(entry.disposition) && !entry.lessonId) errors.push(`${key}: ${entry.disposition} slide has no lesson id`);
  if (entry.lessonId && !lessonIds.has(entry.lessonId)) {
    // Lesson list is fully loaded before coverage validation below; defer this check.
  }
}

for (const [deck, count] of Object.entries(expectedSlides)) {
  for (let slide = 1; slide <= count; slide++) {
    if (!coverageBySource.has(`${deck}:${slide}`)) errors.push(`unaccounted source slide: ${deck}:${slide}`);
  }
  const actual = coverage.filter((entry) => entry.deck === deck).length;
  if (actual !== count) errors.push(`${deck}: expected ${count} coverage rows, got ${actual}`);
}

for (const entry of coverage) {
  if (entry.lessonId && !lessonIds.has(entry.lessonId)) errors.push(`${entry.deck}:${entry.slide}: unknown lesson id ${entry.lessonId}`);
}

for (const lesson of lessons) {
  for (const ref of lesson.sourceSlides) {
    const entry = coverageBySource.get(`${ref.deck}:${ref.slide}`);
    if (!entry) errors.push(`${lesson.id}: missing coverage for ${ref.deck}:${ref.slide}`);
    else if (entry.lessonId !== lesson.id) errors.push(`${lesson.id}: coverage points to ${entry.lessonId ?? "no lesson"} for ${ref.deck}:${ref.slide}`);
  }
  for (const [index, block] of lesson.blocks.entries()) validateBlock(lesson, block, index);
}

function validateBlock(lesson: ExamTipsLesson, block: ExamTipsBlock, index: number): void {
  if (block.type === "exercise" && block.answerIndex !== undefined) {
    if (!block.choices?.length) errors.push(`${lesson.id}:${index}: answerIndex requires choices`);
    else if (!Number.isInteger(block.answerIndex) || block.answerIndex < 0 || block.answerIndex >= block.choices.length) errors.push(`${lesson.id}:${index}: answerIndex out of bounds`);
    if (!block.evidence?.trim()) errors.push(`${lesson.id}:${index}: auto-graded answer requires source evidence`);
    if (block.selfCheck) errors.push(`${lesson.id}:${index}: self-check exercise must not be auto-graded`);
  }
  if (block.type === "table" && block.rows.some((row) => row.length !== block.headers.length)) errors.push(`${lesson.id}:${index}: table column count does not match headers`);
  if (block.type === "media" && !/^[\w-]{11}$/.test(block.youtubeId)) errors.push(`${lesson.id}:${index}: invalid YouTube video id`);
  if (block.type === "image") {
    if (!block.src.startsWith("assets/exam-tips/n3/")) errors.push(`${lesson.id}:${index}: image path is not scoped to exam tips N3: ${block.src}`);
    else if (!existsSync(resolve("public", block.src))) errors.push(`${lesson.id}:${index}: missing image asset ${block.src}`);
  }
}

if (errors.length) {
  console.error(`Exam tips validation failed (${errors.length} issue${errors.length === 1 ? "" : "s"}):`);
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log(`Exam tips data valid: ${lessons.length} lessons; ${coverage.length}/${Object.values(expectedSlides).reduce((sum, count) => sum + count, 0)} source slides accounted; all source refs, answers, tables, and image assets checked.`);
}
