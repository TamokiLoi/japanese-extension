import radicalDatasetRaw from "./radicals-214.json";

export type RadicalCardRecord = {
  number: number;
  strokes: number;
  character: string;
  nameHanViet: string;
  meaning: string;
  description: string;
  variants: string[];
  needsReview: boolean;
  reviewNote?: string;
};

const radicalDataset = radicalDatasetRaw as unknown as {
  version: number;
  source: string;
  radicals: RadicalCardRecord[];
};

export const RADICAL_CARDS = [...radicalDataset.radicals].sort((a, b) => a.number - b.number);
export const RADICAL_BY_CHARACTER = new Map<string, RadicalCardRecord>();

for (const radical of RADICAL_CARDS) {
  RADICAL_BY_CHARACTER.set(radical.character, radical);
  for (const variant of radical.variants) RADICAL_BY_CHARACTER.set(variant, radical);
}

export function radicalForCharacter(character: string | null | undefined): RadicalCardRecord | undefined {
  return character ? RADICAL_BY_CHARACTER.get(character) : undefined;
}
