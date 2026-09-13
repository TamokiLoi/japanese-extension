import type { JlptLevel } from "./kanji.ts";

// Shared across every channel (not a per-channel thing like CHANNEL_LEVELS
// in podcastState.ts) -- content *topic* varies episode to episode
// regardless of source channel, unlike level which a channel tends to stay
// consistent within. Derived from a real 61-title sample spread across
// bitesize's whole catalog (see scripts/categorize-podcast-episodes.ts) --
// expect to extend this list, not replace it, once a second channel's
// content doesn't fit any existing label well.
export const PODCAST_CATEGORIES = [
  "Văn hóa & Đời sống Nhật Bản",
  "Học tiếng Nhật & Ngữ pháp",
  "Trải nghiệm cá nhân & Câu chuyện",
  "Du lịch & Khám phá thế giới",
  "Xã hội & Suy ngẫm",
  "Công việc & Phát triển bản thân",
] as const;

export type PodcastCategory = (typeof PODCAST_CATEGORIES)[number];

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
  //
  // Only set from a real transcript (scripts/classify-podcast-level.ts),
  // never guessed from the title alone -- level is about how hard the
  // actual spoken Japanese is, which a title can't tell you and a wrong
  // guess would actively mislead a JLPT learner. Episodes without one fall
  // back to their channel's CHANNEL_LEVELS default (podcastState.ts).
  level?: JlptLevel;
  // Gemini-assigned from title+description, one of PODCAST_CATEGORIES --
  // see scripts/categorize-podcast-episodes.ts. Topic is a much lower-
  // stakes guess than level, so title/description is good enough signal.
  category?: PodcastCategory;
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
