// Same technique as readingLinks.ts (which itself mirrors vocabLinks.ts/
// bunpoLinks.ts): literal substring match against the app's own ALL_VOCAB/
// ALL_BUNPO dictionaries, so a learner can jump from "this word in the
// transcript looks hard" straight into studying it. No offline LLM pipeline
// needed -- this runs live against whatever transcript text is already
// loaded (see podcastTranscriptState.ts).
import type { PodcastTranscript } from "../types/podcast.ts";
import { ALL_VOCAB, type VocabCard } from "./vocabState.ts";
import { ALL_BUNPO } from "./bunpoState.ts";
import { extractMatchChunks } from "./bunpoLinks.ts";
import type { BunpoGrammarPoint } from "../types/bunpo.ts";

const MAX_VOCAB_MATCHES = 16;
const MAX_BUNPO_MATCHES = 10;

function transcriptText(transcript: PodcastTranscript): string {
  return transcript.segments.map((s) => s.text).join("");
}

// Same "literal substring, no conjugation handling" caveat as readingLinks.ts
// -- under-matches verbs/adjectives that appear conjugated in running
// speech, but every match found is real.
export function findVocabInTranscript(transcript: PodcastTranscript, limit = MAX_VOCAB_MATCHES): VocabCard[] {
  const text = transcriptText(transcript);
  const matches: VocabCard[] = [];
  for (const v of ALL_VOCAB) {
    if (!v.word) continue;
    if (text.includes(v.word)) {
      matches.push(v);
      if (matches.length >= limit) break;
    }
  }
  return matches;
}

export function findBunpoInTranscript(transcript: PodcastTranscript, limit = MAX_BUNPO_MATCHES): BunpoGrammarPoint[] {
  const text = transcriptText(transcript);
  const matches: BunpoGrammarPoint[] = [];
  for (const g of ALL_BUNPO) {
    const chunks = extractMatchChunks(g.pattern);
    if (chunks.length === 0) continue;
    if (chunks.every((c) => text.includes(c))) {
      matches.push(g);
      if (matches.length >= limit) break;
    }
  }
  return matches;
}
