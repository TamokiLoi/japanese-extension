import n5n4n2Raw from "../../data/bunpo-memory-n5-n4-n2.json";
import n3Raw from "../../data/bunpo-memory-n3.json";

interface BunpoMemoryCueRecord {
  grammarId: string;
  senseId: string;
  pattern: string;
  meaningVi: string;
  tip: string;
}

const records = [
  ...(n5n4n2Raw as { tips: BunpoMemoryCueRecord[] }).tips,
  ...(n3Raw as { tips: BunpoMemoryCueRecord[] }).tips,
];

const cueBySenseId = new Map(records.map((record) => [`${record.grammarId}:${record.senseId}`, record.tip.trim()]));

export function getBunpoMemoryCue(grammarId: string, senseId: string): string | undefined {
  const cue = cueBySenseId.get(`${grammarId}:${senseId}`);
  return cue || undefined;
}
