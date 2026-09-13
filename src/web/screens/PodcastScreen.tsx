import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, ExternalLink, Globe, Heart, Search } from "lucide-react";
import {
  ALL_PODCAST_EPISODES,
  AVAILABLE_CHANNELS,
  AVAILABLE_LEVELS,
  CHANNEL_LABELS,
  findPodcastById,
  getEpisodeLevels,
  getFilteredList,
  loadViewerState,
  saveViewerState,
  loadPodcastProgress,
  markWatched,
  loadPodcastFavorites,
  toggleFavorite,
  type PodcastViewerState,
  type PodcastProgressMap,
  type PodcastFavoriteMap,
} from "../../popup/podcastState.ts";
import { pruneToggle } from "../../popup/filterUtils.ts";
import { loadTranscript } from "../../popup/podcastTranscriptState.ts";
import type { PodcastEpisode, PodcastTranscript } from "../../types/podcast.ts";
import type { JlptLevel } from "../../types/kanji.ts";
import { Card } from "../components/ui/card.tsx";
import { PageHeader } from "../components/PageHeader.tsx";
import { StatCard } from "../components/StatCard.tsx";
import { FilterBar, FilterTrigger } from "../components/FilterBar.tsx";
import { ActiveFilters } from "../components/ActiveFilters.tsx";
import { FilterSheet, FilterGroup, FilterChipOption } from "../components/FilterSheet.tsx";
import { levelBadgeStyle } from "../lib/levelColors.tsx";
import { loadYouTubeIframeApi, type YouTubePlayer } from "../lib/youtubeIframeApi.ts";
import { useFloatingNav } from "../WebAppShell.tsx";

// Same list/detail split as ListeningScreen.tsx, but the detail view embeds
// a YouTube player instead of AudioPlayer -- content is hosted by YouTube
// (youtube-nocookie.com, their standard public-embed domain), never
// downloaded or rehosted.
export function PodcastScreen({
  jumpToId,
  onCurrentItemChange,
}: {
  jumpToId?: string;
  onCurrentItemChange?: (id: string | undefined) => void;
} = {}) {
  const [currentId, setCurrentId] = useState<string | null>(jumpToId ?? null);
  const [state, setState] = useState<PodcastViewerState | null>(null);
  const [favorites, setFavorites] = useState<PodcastFavoriteMap>({});

  useEffect(() => {
    loadViewerState().then(setState);
    loadPodcastFavorites().then(setFavorites);
  }, []);

  useEffect(() => {
    onCurrentItemChange?.(currentId ?? undefined);
  }, [currentId, onCurrentItemChange]);

  async function mutate(partial: Partial<PodcastViewerState>) {
    if (!state) return;
    const next = { ...state, ...partial };
    await saveViewerState(next);
    setState(next);
  }

  async function handleToggleFavorite(id: string) {
    setFavorites(await toggleFavorite(id));
  }

  const current = currentId ? findPodcastById(currentId) : undefined;
  const filtered = state ? getFilteredList(state) : [];

  if (current && state) {
    return (
      <EpisodeView
        key={current.id}
        episode={current}
        filtered={filtered}
        autoplayNext={state.autoplayNext}
        onToggleAutoplay={(v) => mutate({ autoplayNext: v })}
        favorited={!!favorites[current.id]}
        onToggleFavorite={() => handleToggleFavorite(current.id)}
        onBack={() => setCurrentId(null)}
        onOpen={setCurrentId}
      />
    );
  }
  return (
    <ListView
      state={state}
      mutate={mutate}
      filtered={filtered}
      favorites={favorites}
      onToggleFavorite={handleToggleFavorite}
      onOpen={setCurrentId}
    />
  );
}

function ListView({
  state,
  mutate,
  filtered,
  favorites,
  onToggleFavorite,
  onOpen,
}: {
  state: PodcastViewerState | null;
  mutate: (partial: Partial<PodcastViewerState>) => void;
  filtered: PodcastEpisode[];
  favorites: PodcastFavoriteMap;
  onToggleFavorite: (id: string) => void;
  onOpen: (id: string) => void;
}) {
  const [filterOpen, setFilterOpen] = useState(false);
  const [progress, setProgress] = useState<PodcastProgressMap>({});
  const [query, setQuery] = useState("");
  // Not persisted -- an in-session narrowing tool, same spirit as
  // ListeningScreen's statusFilter (click a stat tile again to clear it).
  const [statusFilter, setStatusFilter] = useState<"watched" | "unwatched" | "favorite" | null>(null);

  useEffect(() => {
    loadPodcastProgress().then(setProgress);
  }, []);

  if (!state) return <div className="p-6 text-neutral-400">Đang tải...</div>;

  const allChannelsChecked = state.selectedChannels.length === AVAILABLE_CHANNELS.length;
  const allLevelsChecked = state.selectedLevels.length === AVAILABLE_LEVELS.length;
  const filterCount = (allChannelsChecked ? 0 : state.selectedChannels.length) + (allLevelsChecked ? 0 : state.selectedLevels.length);

  // Search narrows the channel/level-filtered universe; the stat tiles below
  // both show live counts of THAT narrowed universe and act as a further
  // watched/unwatched/favorite toggle on top of it.
  const q = query.trim().toLowerCase();
  const searched = q === "" ? filtered : filtered.filter((e) => e.title.toLowerCase().includes(q));
  const watchedCount = searched.filter((e) => !!progress[e.id]).length;
  const unwatchedCount = searched.length - watchedCount;
  const favoriteCount = searched.filter((e) => !!favorites[e.id]).length;
  const visible = searched.filter((e) => {
    if (statusFilter === "watched") return !!progress[e.id];
    if (statusFilter === "unwatched") return !progress[e.id];
    if (statusFilter === "favorite") return !!favorites[e.id];
    return true;
  });

  return (
    <div className="mx-auto max-w-3xl px-2.5 py-2 md:px-8 md:py-6">
      <PageHeader title="Podcast" subtitle={`${visible.length} tập`} />

      <div className="relative mt-4">
        <Search size={15} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-neutral-400" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Tìm theo tên tập..."
          className="w-full rounded-2xl border border-neutral-200 py-2.5 pr-3.5 pl-9 text-sm outline-none focus:border-rose-300"
        />
      </div>

      <div className="mt-3 grid grid-cols-3 gap-3">
        <StatCard
          label="Đã xem"
          value={watchedCount}
          tone="emerald"
          active={statusFilter === "watched"}
          onClick={() => setStatusFilter(statusFilter === "watched" ? null : "watched")}
        />
        <StatCard
          label="Chưa xem"
          value={unwatchedCount}
          active={statusFilter === "unwatched"}
          onClick={() => setStatusFilter(statusFilter === "unwatched" ? null : "unwatched")}
        />
        <StatCard
          label="Yêu thích"
          value={favoriteCount}
          tone="rose"
          active={statusFilter === "favorite"}
          onClick={() => setStatusFilter(statusFilter === "favorite" ? null : "favorite")}
        />
      </div>

      <FilterBar>
        <FilterTrigger count={filterCount} onClick={() => setFilterOpen(true)} />
      </FilterBar>

      <ActiveFilters
        chips={[
          ...(allChannelsChecked
            ? []
            : state.selectedChannels.map((c) => ({
                key: `channel-${c}`,
                label: CHANNEL_LABELS[c],
                onRemove: () => {
                  const next = state.selectedChannels.filter((x) => x !== c);
                  if (next.length === 0) return;
                  mutate({ selectedChannels: next });
                },
              }))),
          ...(allLevelsChecked
            ? []
            : state.selectedLevels.map((l) => ({
                key: `level-${l}`,
                label: l,
                onRemove: () => {
                  const next = state.selectedLevels.filter((x) => x !== l);
                  if (next.length === 0) return;
                  mutate({ selectedLevels: next });
                },
              }))),
        ]}
      />

      <FilterSheet
        open={filterOpen}
        onClose={() => setFilterOpen(false)}
        title="Bộ lọc podcast"
        onReset={() => mutate({ selectedChannels: [...AVAILABLE_CHANNELS], selectedLevels: [...AVAILABLE_LEVELS] })}
      >
        <FilterGroup title="Kênh">
          {AVAILABLE_CHANNELS.map((c) => {
            const checked = state.selectedChannels.includes(c);
            const count = ALL_PODCAST_EPISODES.filter((e) => {
              if (e.channel !== c) return false;
              const levels = getEpisodeLevels(e);
              return levels.length === 0 || levels.some((l) => state.selectedLevels.includes(l));
            }).length;
            return (
              <FilterChipOption
                key={c}
                label={`${CHANNEL_LABELS[c]} (${count})`}
                active={checked}
                onClick={() => {
                  const next = checked ? state.selectedChannels.filter((x) => x !== c) : [...new Set([...state.selectedChannels, c])];
                  if (next.length === 0) return;
                  const nextLevels = pruneToggle(state.selectedLevels, AVAILABLE_LEVELS, (l) =>
                    ALL_PODCAST_EPISODES.some((e) => next.includes(e.channel) && getEpisodeLevels(e).includes(l)),
                  );
                  mutate({ selectedChannels: next, selectedLevels: nextLevels });
                }}
              />
            );
          })}
        </FilterGroup>

        {AVAILABLE_LEVELS.length > 0 ? (
          <FilterGroup title="Cấp độ">
            {AVAILABLE_LEVELS.map((l) => {
              const checked = state.selectedLevels.includes(l);
              const count = ALL_PODCAST_EPISODES.filter(
                (e) => getEpisodeLevels(e).includes(l) && state.selectedChannels.includes(e.channel),
              ).length;
              return (
                <FilterChipOption
                  key={l}
                  label={`${l} (${count})`}
                  active={checked}
                  onClick={() => {
                    const next = checked ? state.selectedLevels.filter((x) => x !== l) : [...new Set([...state.selectedLevels, l])];
                    if (next.length === 0) return;
                    const nextChannels = pruneToggle(state.selectedChannels, AVAILABLE_CHANNELS, (c) =>
                      ALL_PODCAST_EPISODES.some((e) => {
                        if (e.channel !== c) return false;
                        const levels = getEpisodeLevels(e);
                        return levels.length === 0 || levels.some((x) => next.includes(x));
                      }),
                    );
                    mutate({ selectedLevels: next, selectedChannels: nextChannels });
                  }}
                />
              );
            })}
          </FilterGroup>
        ) : null}
      </FilterSheet>

      {visible.length === 0 ? (
        <p className="mt-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-600">
          {ALL_PODCAST_EPISODES.length === 0
            ? "Chưa có tập podcast nào -- chạy npm run podcast:fetch để tải danh sách tập."
            : "Không có tập nào khớp bộ lọc này."}
        </p>
      ) : (
        <div className="mt-3 flex flex-col gap-2">
          {visible.map((e) => {
            const watched = !!progress[e.id];
            const favorited = !!favorites[e.id];
            return (
              <button
                key={e.id}
                onClick={() => onOpen(e.id)}
                className="flex items-center gap-3 rounded-2xl border border-neutral-200 bg-white p-2.5 text-left hover:border-rose-200 hover:bg-rose-50/40"
              >
                <img src={e.thumbnailUrl} alt="" className="h-14 w-24 shrink-0 rounded-lg object-cover" />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold text-neutral-800">{e.title}</div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-neutral-500">
                    <span>{CHANNEL_LABELS[e.channel]}</span>
                    <span>·</span>
                    <span>{formatDuration(e.durationSec)}</span>
                    <span>·</span>
                    <span>{formatDate(e.publishedAt)}</span>
                    <LevelBadges levels={getEpisodeLevels(e)} />
                  </div>
                </div>
                <span
                  role="button"
                  title={favorited ? "Bỏ yêu thích" : "Yêu thích"}
                  onClick={(ev) => {
                    ev.stopPropagation();
                    onToggleFavorite(e.id);
                  }}
                  className={`shrink-0 ${favorited ? "text-rose-500" : "text-neutral-300 hover:text-neutral-500"}`}
                >
                  <Heart size={17} fill={favorited ? "currentColor" : "none"} />
                </span>
                {watched ? (
                  <span className="shrink-0 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-600">Đã xem</span>
                ) : null}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function EpisodeView({
  episode,
  filtered,
  autoplayNext,
  onToggleAutoplay,
  favorited,
  onToggleFavorite,
  onBack,
  onOpen,
}: {
  episode: PodcastEpisode;
  filtered: PodcastEpisode[];
  autoplayNext: boolean;
  onToggleAutoplay: (v: boolean) => void;
  favorited: boolean;
  onToggleFavorite: () => void;
  onBack: () => void;
  onOpen: (id: string) => void;
}) {
  useFloatingNav(true);
  const currentIndex = filtered.findIndex((e) => e.id === episode.id);
  const prevEpisode = currentIndex > 0 ? filtered[currentIndex - 1] : null;
  const nextEpisode = currentIndex >= 0 && currentIndex < filtered.length - 1 ? filtered[currentIndex + 1] : null;

  useEffect(() => {
    markWatched(episode.id);
  }, [episode.id]);

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const playerRef = useRef<YouTubePlayer | null>(null);
  // The object returned by `new YT.Player(...)` isn't actually usable yet --
  // getCurrentTime/seekTo/playVideo only start working once the iframe's
  // postMessage handshake completes and onReady fires (confirmed by hand:
  // calling getCurrentTime() before that throws "not a function"). Every
  // caller of playerRef below checks this first.
  const playerReadyRef = useRef(false);
  // Read by the onStateChange closure below, which is registered once per
  // episode (see the effect's [episode.id] dep) -- refreshing these via a
  // ref (instead of adding them as effect deps) means toggling "tự động
  // phát" or navigating never has to tear down and recreate the player,
  // which would restart the currently-playing video.
  const latestRef = useRef({ autoplayNext, nextEpisode, onOpen });
  useEffect(() => {
    latestRef.current = { autoplayNext, nextEpisode, onOpen };
  });

  useEffect(() => {
    let cancelled = false;
    loadYouTubeIframeApi().then(() => {
      const YT = window.YT;
      if (cancelled || !iframeRef.current || !YT) return;
      // Attaching to the already-rendered iframe (src has enablejsapi=1)
      // rather than letting the API create its own -- this is what keeps
      // the embed on youtube-nocookie.com instead of the API defaulting to
      // youtube.com.
      playerReadyRef.current = false;
      playerRef.current = new YT.Player(iframeRef.current, {
        events: {
          onReady: () => {
            if (!cancelled) playerReadyRef.current = true;
          },
          onStateChange: (e) => {
            if (cancelled || e.data !== YT.PlayerState.ENDED) return;
            const { autoplayNext, nextEpisode, onOpen } = latestRef.current;
            if (autoplayNext && nextEpisode) onOpen(nextEpisode.id);
          },
        },
      });
    });
    // No player.destroy() here -- the outer `key={episode.id}` on
    // PodcastScreen already fully unmounts this iframe on episode change,
    // and calling destroy() (which itself removes the <iframe> from the
    // DOM) after React has already torn it down races React's own cleanup
    // and can throw. Letting the old iframe/player just get garbage
    // collected with the DOM node is simpler and safe.
    return () => {
      cancelled = true;
      playerRef.current = null;
      playerReadyRef.current = false;
    };
  }, [episode.id]);

  // Real (human-written) transcript, fetched by hand per episode -- not
  // every episode has one yet, see podcastTranscriptState.ts. null once
  // resolved with no file found; undefined only while still loading.
  const [transcript, setTranscript] = useState<PodcastTranscript | null | undefined>(undefined);
  const [showTranslation, setShowTranslation] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);

  useEffect(() => {
    setTranscript(undefined);
    loadTranscript(episode.id).then(setTranscript);
  }, [episode.id]);

  // Polls rather than relying on a player event -- the IFrame API has no
  // "timeupdate" event, only coarse onStateChange, so this is the standard
  // way to track playback position for a synced transcript.
  useEffect(() => {
    if (!transcript) return;
    const interval = setInterval(() => {
      if (!playerReadyRef.current) return;
      const t = playerRef.current?.getCurrentTime();
      if (typeof t === "number") setCurrentTime(t);
    }, 500);
    return () => clearInterval(interval);
  }, [transcript]);

  const activeSegmentIndex = transcript
    ? findActiveSegmentIndex(transcript.segments, currentTime)
    : -1;
  const activeRowRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    activeRowRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [activeSegmentIndex]);

  function seekTo(sec: number) {
    if (!playerReadyRef.current) return;
    playerRef.current?.seekTo(sec, true);
    playerRef.current?.playVideo();
  }

  return (
    <div className="mx-auto max-w-3xl px-2.5 py-2 md:px-8 md:py-6">
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={onBack} className="flex items-center gap-1 text-sm font-medium text-neutral-500 hover:text-neutral-700">
          <ChevronLeft size={15} /> Podcast
        </button>
        <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-semibold text-neutral-600">
          {CHANNEL_LABELS[episode.channel]}
        </span>
        <LevelBadges levels={getEpisodeLevels(episode)} size="lg" />
      </div>

      <Card className="mt-4 gap-0 overflow-hidden rounded-2xl border-neutral-200 p-0 ring-0">
        <div className="aspect-video w-full bg-black">
          <iframe
            ref={iframeRef}
            key={episode.id}
            src={`https://www.youtube-nocookie.com/embed/${episode.id}?enablejsapi=1`}
            title={episode.title}
            className="h-full w-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>
      </Card>

      <label className="mt-3 flex items-center gap-2 text-xs font-medium text-neutral-600">
        <input
          type="checkbox"
          checked={autoplayNext}
          onChange={(e) => onToggleAutoplay(e.target.checked)}
          className="h-3.5 w-3.5 accent-rose-600"
        />
        Tự động phát tập tiếp theo
      </label>

      {transcript ? (
        <Card className="mt-3 gap-0 rounded-2xl border-neutral-200 p-5 ring-0">
          <div className="flex items-center justify-between">
            <div className="text-xs font-bold tracking-wide text-neutral-400 uppercase">
              Transcript {/* human-written, not auto-generated -- see fetch-podcast-transcript.ts */}
            </div>
            <button
              onClick={() => setShowTranslation((v) => !v)}
              className="flex items-center gap-1.5 rounded-full border border-neutral-200 px-3 py-1 text-xs font-semibold text-neutral-600 hover:bg-neutral-50"
            >
              <Globe size={13} /> {showTranslation ? "Ẩn bản dịch" : "Hiện bản dịch"}
            </button>
          </div>
          <div className="mt-3 max-h-96 overflow-y-auto rounded-lg">
            {transcript.segments.map((seg, i) => {
              const active = i === activeSegmentIndex;
              return (
                <button
                  key={i}
                  ref={active ? activeRowRef : undefined}
                  onClick={() => seekTo(seg.startSec)}
                  className={`block w-full rounded-lg px-2.5 py-2 text-left ${active ? "bg-rose-50" : "hover:bg-neutral-50"}`}
                >
                  <div className="flex gap-2.5">
                    <span className="w-9 shrink-0 pt-0.5 text-[11px] tabular-nums text-neutral-400">{formatDuration(seg.startSec)}</span>
                    <div>
                      <div className={`text-[14.5px] leading-relaxed ${active ? "font-semibold text-rose-700" : "text-neutral-800"}`}>
                        {seg.text}
                      </div>
                      {showTranslation && seg.textVi ? (
                        <div className="mt-0.5 text-[13px] leading-snug text-neutral-500 italic">{seg.textVi}</div>
                      ) : null}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </Card>
      ) : null}

      <Card className="mt-3 gap-2 rounded-2xl border-neutral-200 p-5 ring-0">
        <div className="flex items-start justify-between gap-3">
          <h2 className="font-semibold text-neutral-800">{episode.title}</h2>
          <div className="flex shrink-0 items-center gap-3">
            <button
              onClick={onToggleFavorite}
              title={favorited ? "Bỏ yêu thích" : "Yêu thích"}
              className={favorited ? "text-rose-500" : "text-neutral-400 hover:text-rose-500"}
            >
              <Heart size={17} fill={favorited ? "currentColor" : "none"} />
            </button>
            <a
              href={`https://www.youtube.com/watch?v=${episode.id}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1 text-xs font-semibold text-neutral-400 hover:text-rose-600"
            >
              <ExternalLink size={13} /> YouTube
            </a>
          </div>
        </div>
        <div className="text-xs text-neutral-400">{formatDate(episode.publishedAt)}</div>
        {episode.description ? <p className="text-sm whitespace-pre-line text-neutral-500">{episode.description}</p> : null}
      </Card>

      {prevEpisode ? (
        <button
          onClick={() => onOpen(prevEpisode.id)}
          aria-label="Tập trước"
          className="fixed bottom-36 left-4 z-20 flex h-10 w-10 items-center justify-center rounded-full bg-white text-neutral-600 shadow-lg ring-1 ring-neutral-200 active:bg-neutral-50 md:hidden"
        >
          <ChevronLeft size={18} />
        </button>
      ) : null}
      {nextEpisode ? (
        <button
          onClick={() => onOpen(nextEpisode.id)}
          aria-label="Tập sau"
          className="fixed right-4 bottom-36 z-20 flex h-10 w-10 items-center justify-center rounded-full bg-rose-600 text-white shadow-lg active:bg-rose-700 md:hidden"
        >
          <ChevronRight size={18} />
        </button>
      ) : null}
    </div>
  );
}

// Channel-tagged episodes can carry more than one level (e.g. bitesize's
// N3・N2), so this renders one small pill per level instead of assuming a
// single value like levelBadgeStyle's other callers (Kanji/Vocab/Listening,
// which are always exactly one level per item).
function LevelBadges({ levels, size = "sm" }: { levels: JlptLevel[]; size?: "sm" | "lg" }) {
  if (levels.length === 0) return null;
  const cls = size === "lg" ? "rounded-full px-2.5 py-1 text-xs font-semibold" : "rounded-full px-1.5 py-0.5 text-[10px] font-semibold";
  return (
    <>
      {levels.map((l) => (
        <span key={l} className={cls} style={levelBadgeStyle(l)}>
          {l}
        </span>
      ))}
    </>
  );
}

function formatDuration(totalSec: number): string {
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = Math.floor(totalSec % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("vi-VN");
}

// Last segment whose startSec is <= currentTime -- segments are already in
// playback order, so this is "which line are we on right now".
function findActiveSegmentIndex(segments: { startSec: number }[], currentTime: number): number {
  let active = -1;
  for (let i = 0; i < segments.length; i++) {
    if (segments[i].startSec <= currentTime) active = i;
    else break;
  }
  return active;
}
