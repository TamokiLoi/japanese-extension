// Compatibility command: Reading now derives from canonical exam data at runtime.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { collectJlptReading, stableHash } from "../src/lib/jlptReading.ts";
import { splitBodyIntoSentences } from "../src/lib/readingSentences.ts";
import type { DeThiDataset } from "../src/types/dethi.ts";

const root = join(import.meta.dirname, "..");
const registry = readFileSync(join(root, "src/popup/dethiCatalog.ts"), "utf8");
const names = [...registry.matchAll(/import\s+\w+\s+from\s+["']\.\.\/data\/(dethi-n\d+-cac-nam\.json)["']/gu)].map(m => m[1]);
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
  for (const q of p.questions) if (!Number.isInteger(q.correctIndex) || q.correctIndex < 0 || q.correctIndex >= q.options.length) {
    throw new Error(`Invalid answer: ${p.id}/q${q.sourceNumber}`);
  }
}
console.log(`Validated ${passages.length} live passages / ${passages.reduce((n,p)=>n+p.questions.length,0)} questions. No duplicate content file generated.`);
