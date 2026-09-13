// Fetches public episode metadata (title, thumbnail, duration, publish date)
// for one YouTube channel via the official YouTube Data API v3, and writes it
// to src/data/podcast-<channel>.json in the PodcastDataset shape. Run by hand
// whenever a channel's episode list needs refreshing -- the shipped app never
// calls the YouTube API itself, it only reads this committed static JSON
// (same reasoning as the listening-*.json datasets: no API key/quota needed
// by end users, content still works offline).
//
// Usage: node --experimental-strip-types scripts/fetch-podcast-episodes.ts
//
// Needs a free YouTube Data API v3 key (Google Cloud Console -> enable
// "YouTube Data API v3" -> Credentials -> API key), saved as
// _scratch/.env.youtube:
//   YOUTUBE_API_KEY=xxxxx
// (_scratch/ is gitignored -- same convention as _scratch/.env.gemini.)
//
// level is intentionally left unset here -- YouTube metadata alone can't
// tell you a JLPT level, that's a manual pass over the output JSON afterward.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { PodcastDataset, PodcastEpisode } from "../src/types/podcast.ts";

const ROOT = join(import.meta.dirname, "..");

// One entry per seeded channel -- add more here (and re-run) to bring in
// another channel; each writes its own src/data/podcast-<slug>.json so
// datasets never collide or need merging by hand.
const CHANNELS: { slug: string; handle: string }[] = [
  { slug: "bitesize", handle: "@the_bitesize_japanese_podcast" },
  { slug: "yuyu", handle: "@yuyunihongopodcast" },
  { slug: "haruno", handle: "@harunonihongo" },
  { slug: "teppei", handle: "@nihongoconteppei" },
];

function readApiKey(): string {
  const text = readFileSync(join(ROOT, "_scratch/.env.youtube"), "utf8");
  const match = text.match(/YOUTUBE_API_KEY=(\S+)/);
  if (!match) throw new Error("No YOUTUBE_API_KEY found in _scratch/.env.youtube");
  return match[1];
}

// "PT1H2M10S" -> 3730. Almost always this ISO-8601 subset (no years/months/
// weeks for a video length) -- but a handful of items (Shorts, premieres,
// members-only posts) come back as the bare date-only "P0D" instead, which
// this subset can't express. Rather than crash the whole channel fetch on
// one weird item, treat anything unparseable as 0s and note it -- those are
// almost never real long-form podcast episodes anyway.
function parseIso8601Duration(iso: string): number {
  const match = iso.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (!match) {
    console.warn(`  (unrecognized duration "${iso}", treating as 0s)`);
    return 0;
  }
  const [, h, m, s] = match;
  return Number(h ?? 0) * 3600 + Number(m ?? 0) * 60 + Number(s ?? 0);
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

async function fetchUploadsPlaylistId(apiKey: string, handle: string): Promise<string> {
  const url = `https://www.googleapis.com/youtube/v3/channels?part=contentDetails&forHandle=${encodeURIComponent(
    handle,
  )}&key=${apiKey}`;
  const data = await fetchJson<{ items: { contentDetails: { relatedPlaylists: { uploads: string } } }[] }>(url);
  const item = data.items[0];
  if (!item) throw new Error(`No channel found for handle ${handle}`);
  return item.contentDetails.relatedPlaylists.uploads;
}

async function fetchAllVideoIds(apiKey: string, uploadsPlaylistId: string): Promise<string[]> {
  const ids: string[] = [];
  let pageToken: string | undefined;
  do {
    const url =
      `https://www.googleapis.com/youtube/v3/playlistItems?part=contentDetails&maxResults=50` +
      `&playlistId=${uploadsPlaylistId}&key=${apiKey}` +
      (pageToken ? `&pageToken=${pageToken}` : "");
    const data = await fetchJson<{
      items: { contentDetails: { videoId: string } }[];
      nextPageToken?: string;
    }>(url);
    ids.push(...data.items.map((i) => i.contentDetails.videoId));
    pageToken = data.nextPageToken;
  } while (pageToken);
  return ids;
}

interface VideoDetails {
  id: string;
  snippet: { title: string; description: string; publishedAt: string; thumbnails: { high?: { url: string }; medium?: { url: string } } };
  contentDetails: { duration: string };
}

// videos.list only accepts up to 50 ids per call, so the id list from
// fetchAllVideoIds() needs chunking before this.
async function fetchVideoDetails(apiKey: string, ids: string[]): Promise<VideoDetails[]> {
  const out: VideoDetails[] = [];
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50);
    const url = `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails&id=${chunk.join(",")}&key=${apiKey}`;
    const data = await fetchJson<{ items: VideoDetails[] }>(url);
    out.push(...data.items);
  }
  return out;
}

async function fetchChannelEpisodes(apiKey: string, channel: { slug: string; handle: string }): Promise<PodcastEpisode[]> {
  const uploadsPlaylistId = await fetchUploadsPlaylistId(apiKey, channel.handle);
  const videoIds = await fetchAllVideoIds(apiKey, uploadsPlaylistId);
  const details = await fetchVideoDetails(apiKey, videoIds);
  return details
    .map((v) => ({
      id: v.id,
      channel: channel.slug,
      title: v.snippet.title,
      publishedAt: v.snippet.publishedAt,
      durationSec: parseIso8601Duration(v.contentDetails.duration),
      thumbnailUrl: v.snippet.thumbnails.high?.url ?? v.snippet.thumbnails.medium?.url ?? "",
      description: v.snippet.description || undefined,
    }))
    // Drops the rare "P0D"-duration item (a past livestream placeholder,
    // not a real episode -- e.g. titled just "...のライブ") rather than
    // shipping a 0:00 entry with nothing to actually play.
    .filter((e) => e.durationSec > 0);
}

async function main() {
  const apiKey = readApiKey();
  for (const channel of CHANNELS) {
    const episodes = await fetchChannelEpisodes(apiKey, channel);
    const dataset: PodcastDataset = { episodes };
    const outFile = join(ROOT, "src/data", `podcast-${channel.slug}.json`);
    writeFileSync(outFile, JSON.stringify(dataset, null, 2) + "\n");
    console.log(`Wrote ${episodes.length} episodes -> ${outFile}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
