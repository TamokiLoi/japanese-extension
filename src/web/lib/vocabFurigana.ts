import { ALL_VOCAB, type VocabCard } from "../../popup/vocabState.ts";

export interface VocabFuriganaAnnotation {
  word: string;
  reading: string;
}

type FuriganaTrieNode = {
  children: Map<string, FuriganaTrieNode>;
  reading?: string;
};

const HAS_KANJI = /[\u3400-\u9fff々〆ヶ]/u;
const VALID_READING = /^[\u3041-\u3096\u30a1-\u30faー]+$/u;

function createFuriganaTrie(): FuriganaTrieNode {
  const readingsByWord = new Map<string, Set<string>>();
  for (const card of ALL_VOCAB) {
    if (!card.reading || card.reading === card.word || !HAS_KANJI.test(card.word) || !VALID_READING.test(card.reading)) continue;
    const readings = readingsByWord.get(card.word) ?? new Set<string>();
    readings.add(card.reading);
    readingsByWord.set(card.word, readings);
  }

  const root: FuriganaTrieNode = { children: new Map() };
  for (const [word, readings] of readingsByWord) {
    // A spelling with multiple readings is ambiguous out of context. Leave it
    // unannotated unless it is the vocabulary card currently being viewed.
    if (readings.size !== 1) continue;
    let node = root;
    for (const character of word) {
      let child = node.children.get(character);
      if (!child) {
        child = { children: new Map() };
        node.children.set(character, child);
      }
      node = child;
    }
    node.reading = [...readings][0];
  }
  return root;
}

let vocabFuriganaTrie: FuriganaTrieNode | undefined;

/**
 * Add readings for the longest unambiguous vocabulary matches in a sentence.
 * The current card's own reading takes precedence for its spelling.
 */
export function getVocabFuriganaAnnotations(
  text: string,
  card: Pick<VocabCard, "word" | "reading">,
): VocabFuriganaAnnotation[] {
  const characters = [...text];
  const cardCharacters = [...card.word];
  const annotations: VocabFuriganaAnnotation[] = [];
  const trie = vocabFuriganaTrie ??= createFuriganaTrie();
  let cursor = 0;

  while (cursor < characters.length) {
    let node = trie;
    let best: { length: number; word: string; reading: string } | undefined;
    for (let end = cursor; end < characters.length; end += 1) {
      const child = node.children.get(characters[end]);
      if (!child) break;
      node = child;
      if (node.reading) {
        best = {
          length: end - cursor + 1,
          word: characters.slice(cursor, end + 1).join(""),
          reading: node.reading,
        };
      }
    }

    const currentCardMatches = card.reading
      && card.reading !== card.word
      && HAS_KANJI.test(card.word)
      && VALID_READING.test(card.reading)
      && cardCharacters.length > 0
      && characters.slice(cursor, cursor + cardCharacters.length).join("") === card.word;
    if (currentCardMatches && (!best || cardCharacters.length >= best.length)) {
      best = { length: cardCharacters.length, word: card.word, reading: card.reading };
    }

    if (best) {
      annotations.push({ word: best.word, reading: best.reading });
      cursor += best.length;
    } else {
      cursor += 1;
    }
  }

  return annotations;
}
