// Real per-episode transcripts, fetched one at a time by hand via
// scripts/fetch-podcast-transcript.ts + translate-podcast-transcript.ts --
// NOT every episode has a file here (see src/data/podcast-transcripts/),
// unlike podcast-bitesize.json which covers the whole catalog at once.
//
// import.meta.glob (Vite-only, not available in the Chrome-extension popup
// build's plain esbuild path -- fine, since PodcastScreen is Web Dashboard
// only) means adding another episode's transcript later is just "drop the
// JSON file in", no code change here, and each file is its own lazy-loaded
// chunk instead of bloating the main bundle as the number of transcripts
// grows.
import type { PodcastTranscript } from "../types/podcast.ts";

const transcriptModules = import.meta.glob<{ default: PodcastTranscript }>("../data/podcast-transcripts/*.json");

export async function loadTranscript(episodeId: string): Promise<PodcastTranscript | null> {
  const key = Object.keys(transcriptModules).find((k) => k.endsWith(`/${episodeId}.json`));
  if (!key) return null;
  const mod = await transcriptModules[key]();
  return mod.default;
}
