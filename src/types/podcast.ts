import type { JlptLevel } from "./kanji.ts";

export interface PodcastEpisode {
  // YouTube videoId -- globally unique, used directly as the id (no
  // prefixing needed, unlike dictation which shares Listening's id space).
  id: string;
  // Which source channel this came from -- drives the "Kênh" filter, same
  // pattern as ListeningQuestion.book.
  channel: string;
  title: string;
  titleVi?: string;
  // Manually tagged after skimming the title/description -- fetch-podcast-
  // episodes.ts never sets this, since YouTube metadata alone can't tell you
  // a JLPT level. Left unset (undefined) for episodes not yet tagged.
  level?: JlptLevel;
  publishedAt: string;
  durationSec: number;
  thumbnailUrl: string;
  description?: string;
}

export interface PodcastDataset {
  episodes: PodcastEpisode[];
}

// One real (human-written, not auto-generated) caption line, fetched via
// scripts/fetch-podcast-transcript.ts -- see src/data/podcast-transcripts/.
export interface PodcastTranscriptSegment {
  startSec: number;
  text: string;
  textVi?: string;
}

export interface PodcastTranscript {
  episodeId: string;
  segments: PodcastTranscriptSegment[];
}
