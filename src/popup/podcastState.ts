// Each channel's episode metadata is its own dynamic import (Vite gives it
// its own chunk) instead of a static top-level import -- with 4 channels
// now totaling ~6900 episodes, statically importing all of them bloated the
// shared WebApp bundle every OTHER screen also had to download too (2.6MB
// -> 7.17MB just from adding 3 more channels). Dynamic import means the
// Podcast screen itself still has to fetch all 4 chunks up front (the
// merged list/search/filter needs every channel's data at once), but no
// other screen pays that cost anymore, and this scales to more channels
// without bloating anything outside Podcast itself.
import type { JlptLevel } from "../types/kanji.ts";
import { PODCAST_CATEGORIES, type PodcastCategory, type PodcastDataset, type PodcastEpisode } from "../types/podcast.ts";
import { storageGet, storageSet } from "../platform/storage";

const CHANNEL_DATA_LOADERS: Record<string, () => Promise<{ default: unknown }>> = {
  bitesize: () => import("../data/podcast-bitesize.json"),
  yuyu: () => import("../data/podcast-yuyu.json"),
  haruno: () => import("../data/podcast-haruno.json"),
  teppei: () => import("../data/podcast-teppei.json"),
};

export interface PodcastData {
  episodes: PodcastEpisode[];
  byId: Map<string, PodcastEpisode>;
}

let cachedData: Promise<PodcastData> | null = null;

// Cached -- remounting PodcastScreen (navigate away and back) reuses the
// same in-flight/resolved promise instead of re-fetching every JSON chunk
// again.
export function loadPodcastData(): Promise<PodcastData> {
  if (!cachedData) {
    cachedData = Promise.all(Object.values(CHANNEL_DATA_LOADERS).map((load) => load())).then((modules) => {
      const episodes = modules
        .flatMap((m) => (m.default as unknown as PodcastDataset).episodes)
        // Newest first -- a podcast feed reads chronologically backward,
        // unlike the book-order listening datasets elsewhere in this app.
        .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
      return { episodes, byId: new Map(episodes.map((e) => [e.id, e])) };
    });
  }
  return cachedData;
}

export const CHANNEL_LABELS: Record<string, string> = {
  bitesize: "The Bitesize Japanese Podcast",
  yuyu: "YUYUの日本語Podcast",
  haruno: "Haru no Nihongo",
  teppei: "Nihongo con Teppei",
};

// Tagged per-channel (not per-episode) -- the source channels are each
// consistently aimed at one level range across their whole catalog (per the
// user: "kênh này thì n3, n2"), and hand-tagging hundreds of individual
// episodes isn't worth it when the channel itself already tells you the
// level. episode.level (see PodcastEpisode) still exists for the rare case
// an individual episode needs to override its channel's default.
//
// yuyu: no level stated on every title, but one episode's own title asks
// "YUYUのPodcastはN3の学生まで？" (up to N3 students?) and several others say
// "intermedio" -- N4-N2 covers what that implies without over-narrowing.
// haruno: every single title ends in "...N2〜N1聴解【中級、上級】" -- the
// clearest-labeled channel of the four. teppei: well-known beginner/
// intermediate podcast community-wide, titles include "for beginners" --
// no per-episode tag though, so this is a broader community-reputation
// estimate rather than something read off the data like haruno's.
export const CHANNEL_LEVELS: Record<string, JlptLevel[]> = {
  bitesize: ["N3", "N2"],
  yuyu: ["N4", "N3", "N2"],
  haruno: ["N2", "N1"],
  teppei: ["N4", "N3"],
};

export function getEpisodeLevels(e: PodcastEpisode): JlptLevel[] {
  return e.level ? [e.level] : (CHANNEL_LEVELS[e.channel] ?? []);
}

const CHANNEL_ORDER: string[] = ["bitesize", "yuyu", "haruno", "teppei"];
const LEVEL_ORDER: JlptLevel[] = ["N5", "N4", "N3", "N2", "N1"];

// Computed from whatever episodes actually loaded, rather than static
// top-level constants -- data only exists once loadPodcastData() resolves,
// so "available" here means "present in this loaded set", checked fresh
// each time (cheap enough at a few thousand episodes, and avoids a second
// stale cache to keep in sync with cachedData above).
export interface PodcastAvailability {
  channels: string[];
  levels: JlptLevel[];
  categories: PodcastCategory[];
}

export function computeAvailability(episodes: PodcastEpisode[]): PodcastAvailability {
  return {
    channels: CHANNEL_ORDER.filter((c) => episodes.some((e) => e.channel === c)),
    levels: LEVEL_ORDER.filter((l) => episodes.some((e) => getEpisodeLevels(e).includes(l))),
    categories: PODCAST_CATEGORIES.filter((c) => episodes.some((e) => e.category === c)),
  };
}

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

export function defaultViewerState(available: PodcastAvailability): PodcastViewerState {
  return {
    selectedChannels: [...available.channels],
    selectedLevels: [...available.levels],
    selectedCategories: [...available.categories],
    autoplayNext: true,
  };
}

export async function loadViewerState(available: PodcastAvailability): Promise<PodcastViewerState> {
  const saved = await storageGet<Partial<PodcastViewerState>>(VIEWER_STORAGE_KEY);
  const fallback = defaultViewerState(available);
  const selectedChannels = (saved?.selectedChannels ?? fallback.selectedChannels).filter((c) => available.channels.includes(c));
  const selectedLevels = (saved?.selectedLevels ?? fallback.selectedLevels).filter((l) => available.levels.includes(l));
  const selectedCategories = (saved?.selectedCategories ?? fallback.selectedCategories).filter((c) => available.categories.includes(c));
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
export function getFilteredList(state: PodcastViewerState, episodes: PodcastEpisode[]): PodcastEpisode[] {
  return episodes.filter((e) => {
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
