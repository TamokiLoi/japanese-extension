import jlptHistoryRaw from "../data/vocab-tanoshii-jlpt-n3-history.json";
import type { JlptHistoryDataset, JlptHistoryEntry } from "../types/vocab.ts";

const dataset = jlptHistoryRaw as unknown as JlptHistoryDataset;
export const ALL_JLPT_HISTORY: JlptHistoryEntry[] = dataset.entries;

// Exam sittings in chronological order (e.g. "2010/7", "2010/12", ...),
// derived from the data itself rather than hardcoded so it stays correct
// if the source PDF is ever extended with newer sittings.
// Newest sitting first -- more relevant for exam prep than reading oldest-first.
export const EXAM_PERIODS: string[] = [...new Set(ALL_JLPT_HISTORY.map((e) => e.year))].reverse();
