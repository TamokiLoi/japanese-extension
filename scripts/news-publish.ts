// Append only explicitly reviewed private news drafts to the app dataset.
// Usage: node --experimental-strip-types scripts/news-publish.ts --ids draft-id[,draft-id...]

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ReadingDataset, ReadingPassage } from "../src/types/reading.ts";

const ROOT = join(import.meta.dirname, "..");
const DRAFTS = join(ROOT, "_scratch/news-drafts");
const DATA_PATH = join(ROOT, "src/data/reading-news.json");
const HAS_KANJI = /[\u3400-\u9fff々〆ヶ]/u;

interface Draft {
  collection: "news" | "custom";
  passage: ReadingPassage;
  rights?: { rightsVerified?: boolean };
  review: { approved: boolean; legalReviewed: boolean; qaReviewed: boolean; reviewer?: string; reviewedAt?: string };
}

function requestedIds(): string[] {
  const args = process.argv.slice(2);
  if (args.length !== 2 || args[0] !== "--ids") throw new Error("Usage: node --experimental-strip-types scripts/news-publish.ts --ids draft-id[,draft-id...]");
  const ids = [...new Set(args[1].split(",").map((id) => id.trim()).filter(Boolean))];
  if (!ids.length || ids.some((id) => !/^[a-z0-9-]+$/u.test(id))) throw new Error("--ids must contain one or more draft IDs (letters, numbers, and hyphens only)");
  return ids;
}

function validateDraft(id: string): ReadingPassage {
  const path = join(DRAFTS, `${id}.json`);
  if (!existsSync(path)) throw new Error(`Draft not found: ${id}`);
  const draft = JSON.parse(readFileSync(path, "utf8")) as Draft;
  if (draft.passage?.id !== id || !["news", "custom"].includes(draft.collection) || draft.passage.book !== draft.collection) throw new Error(`${id}: invalid draft identity or collection/book mismatch`);
  if (!draft.review?.approved || !draft.review.legalReviewed || !draft.review.qaReviewed || !draft.review.reviewer?.trim() || !draft.review.reviewedAt || Number.isNaN(Date.parse(draft.review.reviewedAt))) {
    throw new Error(`${id}: set review.approved, legalReviewed, qaReviewed, reviewer, and reviewedAt only after completing the review`);
  }
  const passage = draft.passage;
  if (passage.level !== "N3" || !["medium", "long"].includes(passage.length) || !passage.title?.trim() || !passage.source?.trim() || !Array.isArray(passage.body) || !passage.body.length) {
    if (!(passage.linkOnly && passage.sourceUrl && passage.body.length === 0 && passage.level === "N3" && ["medium", "long"].includes(passage.length) && passage.title?.trim() && passage.source?.trim())) {
      throw new Error(`${id}: missing required N3 passage fields or Japanese body text`);
    }
  }
  if (passage.linkOnly) {
    if (!passage.sourceUrl || passage.body.length !== 0 || passage.translationVi?.trim() || passage.sentencesVi?.length || passage.questions?.length) {
      throw new Error(`${id}: link-only items require a public sourceUrl and may contain only title/source metadata, not copied text, translations, or questions`);
    }
    return passage;
  }
  if (!draft.rights?.rightsVerified) throw new Error(`${id}: verify reuse rights or confirm original/public-domain status before publishing full text, including pasted text`);
  if (!passage.body.every((segment) => typeof segment.text === "string" && segment.text.trim() && (segment.furigana === null ? !HAS_KANJI.test(segment.text) : typeof segment.furigana === "string" && /^[\u3041-\u3096\u30a1-\u30faー]+$/u.test(segment.furigana)))) throw new Error(`${id}: invalid Japanese body/furigana segment or missing furigana for kanji`);
  if (!passage.translationVi.trim() || !Array.isArray(passage.sentencesVi) || !passage.sentencesVi.length || passage.sentencesVi.some((line) => !line.trim())) throw new Error(`${id}: Vietnamese passage and sentence translations are required`);
  const renderedSentenceCount = countRenderedSentences(passage.body);
  if (passage.sentencesVi.length !== renderedSentenceCount) throw new Error(`${id}: sentencesVi has ${passage.sentencesVi.length} entries for ${renderedSentenceCount} rendered Japanese sentence groups`);
  if (passage.sourceUrl && !/^https?:\/\//u.test(passage.sourceUrl)) throw new Error(`${id}: sourceUrl must be HTTP(S)`);
  return passage;
}

function countRenderedSentences(body: ReadingPassage["body"]): number {
  let count = 0;
  let current = "";
  for (const segment of body) {
    if ((segment.paragraphStart || segment.text.startsWith("\n")) && current) { count++; current = ""; }
    let text = segment.text.replace(/^\n+/u, "");
    while (text) {
      const end = text.search(/[。！？]/u);
      if (end < 0) { current += text; break; }
      let boundary = end + 1;
      while (boundary < text.length && /[」』）)]/u.test(text[boundary])) boundary++;
      current += text.slice(0, boundary);
      count++;
      current = "";
      text = text.slice(boundary);
    }
  }
  if (current.trim()) count++;
  return count;
}

function writeAtomic(path: string, value: unknown): void {
  const temp = `${path}.${process.pid}.tmp`;
  writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  renameSync(temp, path);
}

try {
  const ids = requestedIds();
  const incoming = ids.map(validateDraft);
  const dataset: ReadingDataset = existsSync(DATA_PATH) ? JSON.parse(readFileSync(DATA_PATH, "utf8")) as ReadingDataset : { passages: [] };
  if (!dataset || !Array.isArray(dataset.passages)) throw new Error("src/data/reading-news.json must be an object with a passages array");
  const present = new Set(dataset.passages.map((passage) => passage.id));
  const duplicate = incoming.find((passage) => present.has(passage.id));
  if (duplicate) throw new Error(`Dataset already contains ${duplicate.id}; nothing published`);
  mkdirSync(join(ROOT, "src/data"), { recursive: true });
  writeAtomic(DATA_PATH, { ...dataset, passages: [...dataset.passages, ...incoming] });
  console.log(`Published ${incoming.length} reviewed passage(s) to src/data/reading-news.json.`);
} catch (error) { console.error((error as Error).message); process.exitCode = 1; }
