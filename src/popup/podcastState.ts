// The Bitesize Japanese Podcast episode metadata, fetched once via
// scripts/fetch-podcast-episodes.ts (YouTube Data API v3) and committed as
// static JSON -- same reasoning as listening-*.json: the shipped app never
// calls the YouTube API itself, it only reads this file, so no API key/quota
// is needed by end users and the episode list still works offline.
import podcastBitesizeRaw from "../data/podcast-bitesize.json";
import type { JlptLevel } from "../types/kanji.ts";
import { PODCAST_CATEGORIES, type PodcastCategory, type PodcastDataset, type PodcastEpisode } from "../types/podcast.ts";
import { storageGet, storageSet } from "../platform/storage";

const bitesizeDataset = podcastBitesizeRaw as unknown as PodcastDataset;

// Newest first -- a podcast feed reads chronologically backward, unlike the
// book-order listening datasets above it.
export const ALL_PODCAST_EPISODES: PodcastEpisode[] = [...bitesizeDataset.episodes].sort(
  (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime(),
);

const PODCAST_BY_ID = new Map(ALL_PODCAST_EPISODES.map((e) => [e.id, e]));
export function findPodcastById(id: string): PodcastEpisode | undefined {
  return PODCAST_BY_ID.get(id);
}

export const CHANNEL_LABELS: Record<string, string> = {
  bitesize: "The Bitesize Japanese Podcast",
};

// Tagged per-channel (not per-episode) -- the source channels are each
// consistently aimed at one level range across their whole catalog (per the
// user: "kênh này thì n3, n2"), and hand-tagging hundreds of individual
// episodes isn't worth it when the channel itself already tells you the
// level. episode.level (see PodcastEpisode) still exists for the rare case
// an individual episode needs to override its channel's default.
export const CHANNEL_LEVELS: Record<string, JlptLevel[]> = {
  bitesize: ["N3", "N2"],
};

export function getEpisodeLevels(e: PodcastEpisode): JlptLevel[] {
  return e.level ? [e.level] : (CHANNEL_LEVELS[e.channel] ?? []);
}

const CHANNEL_ORDER: string[] = ["bitesize"];
export const AVAILABLE_CHANNELS: string[] = CHANNEL_ORDER.filter((c) => ALL_PODCAST_EPISODES.some((e) => e.channel === c));

const LEVEL_ORDER: JlptLevel[] = ["N5", "N4", "N3", "N2", "N1"];
export const AVAILABLE_LEVELS: JlptLevel[] = LEVEL_ORDER.filter((l) =>
  ALL_PODCAST_EPISODES.some((e) => getEpisodeLevels(e).includes(l)),
);

// Shared across channels (see PODCAST_CATEGORIES in types/podcast.ts) --
// only the ones actually used in the data show up as filter options.
export const AVAILABLE_CATEGORIES: PodcastCategory[] = PODCAST_CATEGORIES.filter((c) =>
  ALL_PODCAST_EPISODES.some((e) => e.category === c),
);

export interface PodcastViewerState {
  selectedChannels: string[];
  selectedLevels: JlptLevel[];
  // Untagged episodes (category not yet run through
  // categorize-podcast-episodes.ts) always pass this filter -- same
  // "nothing to exclude them by" reasoning as the untagged-level case below.
  selectedCategories: PodcastCategory[];
  // Whether finishing an episode jumps straight into the next one in the
  // current filtered list -- a persisted playback preference, same spirit as
  // dictationState.ts's `autoAdvance` (which autoplays audio on a new
  // question, not auto-navigation -- this is the closer analogue: YouTube's
  // own "up next" autoplay).
  autoplayNext: boolean;
}

const VIEWER_STORAGE_KEY = "podcastViewer";

export function defaultViewerState(): PodcastViewerState {
  return {
    selectedChannels: [...AVAILABLE_CHANNELS],
    selectedLevels: [...AVAILABLE_LEVELS],
    selectedCategories: [...AVAILABLE_CATEGORIES],
    autoplayNext: true,
  };
}

export async function loadViewerState(): Promise<PodcastViewerState> {
  const saved = await storageGet<Partial<PodcastViewerState>>(VIEWER_STORAGE_KEY);
  const fallback = defaultViewerState();
  const selectedChannels = (saved?.selectedChannels ?? fallback.selectedChannels).filter((c) => AVAILABLE_CHANNELS.includes(c));
  const selectedLevels = (saved?.selectedLevels ?? fallback.selectedLevels).filter((l) => AVAILABLE_LEVELS.includes(l));
  const selectedCategories = (saved?.selectedCategories ?? fallback.selectedCategories).filter((c) => AVAILABLE_CATEGORIES.includes(c));
  return {
    selectedChannels: selectedChannels.length > 0 ? selectedChannels : fallback.selectedChannels,
    selectedLevels: selectedLevels.length > 0 ? selectedLevels : fallback.selectedLevels,
    selectedCategories: selectedCategories.length > 0 ? selectedCategories : fallback.selectedCategories,
    autoplayNext: saved?.autoplayNext ?? fallback.autoplayNext,
  };
}

export async function saveViewerState(state: PodcastViewerState): Promise<void> {
  await storageSet(VIEWER_STORAGE_KEY, state);
}

// Episodes whose channel has no CHANNEL_LEVELS entry (and no per-episode
// override) always pass the level filter -- there's nothing to exclude them
// by, so narrowing the level filter should never hide untagged content
// outright. Same reasoning for category: an episode not yet run through
// categorize-podcast-episodes.ts always passes the category filter.
export function getFilteredList(state: PodcastViewerState): PodcastEpisode[] {
  return ALL_PODCAST_EPISODES.filter((e) => {
    const levels = getEpisodeLevels(e);
    return (
      state.selectedChannels.includes(e.channel) &&
      (levels.length === 0 || levels.some((l) => state.selectedLevels.includes(l))) &&
      (!e.category || state.selectedCategories.includes(e.category))
    );
  });
}

// "Đã xem" tracking -- deliberately separate from progressState.ts's shared
// ItemProgress map, which models graded quiz answers (correct/wrong streaks,
// mastery). Watching a video has no right/wrong answer, so it gets its own
// tiny map instead of being force-fit into that model. id is the episode's
// own videoId, already globally unique -- no namespacing prefix needed
// (unlike dictationState.ts's "dict:" prefix, which exists specifically
// because Dictation reuses Listening's own ids in that same shared map).
export type PodcastProgressMap = Record<string, { watchedAt: number }>;

const PROGRESS_STORAGE_KEY = "podcastProgress";

export async function loadPodcastProgress(): Promise<PodcastProgressMap> {
  return (await storageGet<PodcastProgressMap>(PROGRESS_STORAGE_KEY)) ?? {};
}

export async function markWatched(id: string): Promise<void> {
  const map = await loadPodcastProgress();
  if (map[id]) return;
  await storageSet(PROGRESS_STORAGE_KEY, { ...map, [id]: { watchedAt: Date.now() } });
}

// "Yêu thích" -- separate from "đã xem": watched is automatic/one-way
// (set the moment you open an episode), favorite is a manual, reversible
// pick of episodes to come back to. Same tiny-map treatment as progress
// above, own storage key so the two never collide.
export type PodcastFavoriteMap = Record<string, true>;

const FAVORITE_STORAGE_KEY = "podcastFavorites";

export async function loadPodcastFavorites(): Promise<PodcastFavoriteMap> {
  return (await storageGet<PodcastFavoriteMap>(FAVORITE_STORAGE_KEY)) ?? {};
}

export async function toggleFavorite(id: string): Promise<PodcastFavoriteMap> {
  const map = await loadPodcastFavorites();
  const next = { ...map };
  if (next[id]) delete next[id];
  else next[id] = true;
  await storageSet(FAVORITE_STORAGE_KEY, next);
  return next;
}
