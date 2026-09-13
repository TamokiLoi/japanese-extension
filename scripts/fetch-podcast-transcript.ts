// Fetches ONE podcast episode's real (human-written, not auto-generated)
// Japanese caption track and writes it to
// src/data/podcast-transcripts/<videoId>.json as a PodcastTranscript.
//
// Why yt-dlp instead of a plain fetch() (like fetch-podcast-episodes.ts
// uses for metadata): YouTube's caption endpoint now requires a session-
// bound anti-bot token that a bare HTTP request (even from a real browser
// tab, tested directly) can't produce -- confirmed by hand before writing
// this script. yt-dlp is the actively-maintained tool that keeps working
// around YouTube's changes here, so this shells out to it instead of
// reimplementing that cat-and-mouse game ourselves.
//
// Requires Python + yt-dlp installed once: `pip install yt-dlp`
// Usage: node --experimental-strip-types scripts/fetch-podcast-transcript.ts <videoId>
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { PodcastTranscript } from "../src/types/podcast.ts";

const ROOT = join(import.meta.dirname, "..");
const OUT_DIR = join(ROOT, "src/data/podcast-transcripts");

interface Json3Event {
  tStartMs: number;
  segs?: { utf8: string }[];
}

function main() {
  const videoId = process.argv[2];
  if (!videoId) {
    console.error("Usage: fetch-podcast-transcript.ts <videoId>");
    process.exit(1);
  }

  mkdirSync(OUT_DIR, { recursive: true });
  const tmpPrefix = join(ROOT, "_scratch", `transcript-${videoId}`);
  const tmpFile = `${tmpPrefix}.ja.json3`;

  console.log(`Downloading captions for ${videoId} via yt-dlp...`);
  execFileSync(
    "python",
    [
      "-m",
      "yt_dlp",
      "--write-subs",
      "--sub-langs",
      "ja",
      "--skip-download",
      "--sub-format",
      "json3",
      "-o",
      tmpPrefix,
      `https://www.youtube.com/watch?v=${videoId}`,
    ],
    { stdio: "inherit" },
  );

  if (!existsSync(tmpFile)) {
    console.error(`yt-dlp did not produce ${tmpFile} -- this episode may have no Japanese captions at all.`);
    process.exit(1);
  }

  const raw = JSON.parse(readFileSync(tmpFile, "utf8")) as { events?: Json3Event[] };
  const events = (raw.events ?? []).filter((e) => e.segs && e.segs.length > 0);

  const transcript: PodcastTranscript = {
    episodeId: videoId,
    segments: events.map((e) => ({
      startSec: Math.round((e.tStartMs / 1000) * 10) / 10,
      text: e.segs!.map((s) => s.utf8).join("").replace(/\n/g, " ").trim(),
    })).filter((s) => s.text !== ""),
  };

  const outFile = join(OUT_DIR, `${videoId}.json`);
  writeFileSync(outFile, JSON.stringify(transcript, null, 2) + "\n");
  rmSync(tmpFile);
  console.log(`Wrote ${transcript.segments.length} segments -> ${outFile}`);
}

main();
