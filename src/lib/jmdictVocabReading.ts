import jmdictReadingVariantsRaw from "../data/vocab-reading-variants-jmdict.json";

export interface JmdictReadingVariant {
  word: string;
  reading: string;
  meaningVi: string;
  glossEn: string;
  jmdictId: string;
}

const variants = (jmdictReadingVariantsRaw as { variants: JmdictReadingVariant[] }).variants;
const variantsByWord = new Map<string, JmdictReadingVariant[]>();
for (const variant of variants) {
  const wordVariants = variantsByWord.get(variant.word) ?? [];
  wordVariants.push(variant);
  variantsByWord.set(variant.word, wordVariants);
}

export function getJmdictReadingVariants(word: string): JmdictReadingVariant[] {
  return variantsByWord.get(word) ?? [];
}
