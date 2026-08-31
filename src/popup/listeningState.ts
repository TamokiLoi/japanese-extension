// listening-poc.json: 1 hand-picked demo item, Gemini-scripted + Gemini TTS
// (kept as a sanity-check fixture, not real book content).
// listening-soumatome-n3.json: real questions from Nihongo Sou Matome N3
// Choukai's answer+script booklet -- real printed answers (not AI-inferred)
// and real audio (ripped from the book's own CDs, hosted as GitHub Release
// assets referenced by audioUrl -- not bundled into the repo/extension, see
// scripts/extract-soumatome-listening.ts for how this was built). Only items
// whose question had a printed 4-option (or 3, for 発話表現/即時応答) text
// answer were extracted; picture-based-option items were skipped.
import listeningPocRaw from "../data/listening-poc.json";
import listeningSoumatomeRaw from "../data/listening-soumatome-n3.json";
import type { ListeningDataset, ListeningQuestion } from "../types/listening.ts";

const pocDataset = listeningPocRaw as unknown as ListeningDataset;
const soumatomeDataset = listeningSoumatomeRaw as unknown as ListeningDataset;

export const ALL_LISTENING: ListeningQuestion[] = [...soumatomeDataset.questions, ...pocDataset.questions];

const LISTENING_BY_ID = new Map(ALL_LISTENING.map((q) => [q.id, q]));
export function findListeningById(id: string): ListeningQuestion | undefined {
  return LISTENING_BY_ID.get(id);
}

export const TASK_TYPE_LABELS = {
  kadai: "課題理解 -- việc cần làm",
  point: "ポイント理解 -- trọng điểm",
  gaiyou: "概要理解 -- khái quát",
  sokuji: "発話表現・即時応答 -- phản xạ nhanh",
} as const;
