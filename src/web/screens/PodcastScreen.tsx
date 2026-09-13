import { useEffect, useRef, useState } from "react";
import { Captions, ChevronLeft, ChevronRight, ExternalLink, FileText, Globe, Heart, Languages, Search } from "lucide-react";
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
  const [showFurigana, setShowFurigana] = useState(false);
  const [tab, setTab] = useState<"transcript" | "description">("transcript");
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
    // "center" (not "nearest") centers the active line within its nearest
    // scrollable ancestor (the transcript's own scroll box on mobile, see
    // its className below) as it advances, karaoke-style -- "nearest" only
    // scrolls the minimum needed to be *technically* visible, which left
    // the active line peeking in at the very bottom edge instead of
    // somewhere actually readable. Also re-fires on `tab` so switching back
    // from the "Mô tả" tab re-centers immediately instead of waiting for
    // the next segment change (the ref is unmounted while that tab is
    // active, so the previous scroll position is stale by the time you
    // switch back).
    activeRowRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [activeSegmentIndex, tab]);

  function seekTo(sec: number) {
    if (!playerReadyRef.current) return;
    playerRef.current?.seekTo(sec, true);
    playerRef.current?.playVideo();
  }

  return (
    <div className="mx-auto max-w-3xl px-2.5 py-2 md:px-8 md:py-6">
      {/* Sticky on both mobile and desktop -- with a transcript that can
          run to hundreds of lines, losing the video off-screen while
          scrolling to follow along defeats the point either way. `md:top-4`
          (not `top-0`) lines up with WebAppShell's own `md:py-4` around its
          bordered/rounded content card, so the pinned block settles right
          at that card's top edge instead of overlapping past it;
          `md:rounded-t-2xl` continues that card's own corner radius so it
          reads as "the card's header is pinned", not a separate box. */}
      <div className="sticky top-0 z-10 bg-neutral-50 pb-3 md:top-4 md:rounded-t-2xl md:bg-white">
        <div className="flex flex-wrap items-center gap-2 pt-2 md:pt-0">
          <button onClick={onBack} className="flex items-center gap-1 text-sm font-medium text-neutral-500 hover:text-neutral-700">
            <ChevronLeft size={15} /> Podcast
          </button>
          <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-semibold text-neutral-600">
            {CHANNEL_LABELS[episode.channel]}
          </span>
          <LevelBadges levels={getEpisodeLevels(episode)} size="lg" />
        </div>

        <Card className="mt-3 gap-0 overflow-hidden rounded-2xl border-neutral-200 p-0 ring-0">
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
      </div>

      <label className="mt-3 flex items-center gap-2 text-xs font-medium text-neutral-600">
        <input
          type="checkbox"
          checked={autoplayNext}
          onChange={(e) => onToggleAutoplay(e.target.checked)}
          className="h-3.5 w-3.5 accent-rose-600"
        />
        Tự động phát tập tiếp theo
      </label>

      {(() => {
        const descriptionCard = (
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
        );

        // No tabs at all when there's nothing to switch to -- most episodes
        // don't have a transcript yet (fetched by hand per episode, see
        // fetch-podcast-transcript.ts), so this keeps the plain single-card
        // layout for those instead of a pointless 1-item tab bar.
        if (!transcript) return descriptionCard;

        return (
          <>
            <div className="mt-3 flex items-center gap-1 rounded-full border border-neutral-200 p-1">
              <button
                onClick={() => setTab("transcript")}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-full py-1.5 text-sm font-semibold ${
                  tab === "transcript" ? "bg-rose-50 text-rose-600" : "text-neutral-500 hover:bg-neutral-50"
                }`}
              >
                <Captions size={15} /> Transcript
              </button>
              <button
                onClick={() => setTab("description")}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-full py-1.5 text-sm font-semibold ${
                  tab === "description" ? "bg-rose-50 text-rose-600" : "text-neutral-500 hover:bg-neutral-50"
                }`}
              >
                <FileText size={15} /> Mô tả
              </button>
            </div>

            {tab === "description" ? (
              descriptionCard
            ) : (
              <Card className="mt-3 gap-0 rounded-2xl border-neutral-200 p-5 ring-0">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-xs font-bold tracking-wide text-neutral-400 uppercase">
                    Transcript {/* human-written, not auto-generated -- see fetch-podcast-transcript.ts */}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setShowFurigana((v) => !v)}
                      className="flex items-center gap-1.5 rounded-full border border-neutral-200 px-3 py-1 text-xs font-semibold text-neutral-600 hover:bg-neutral-50"
                    >
                      <Languages size={13} /> {showFurigana ? "Ẩn furigana" : "Hiện furigana"}
                    </button>
                    <button
                      onClick={() => setShowTranslation((v) => !v)}
                      className="flex items-center gap-1.5 rounded-full border border-neutral-200 px-3 py-1 text-xs font-semibold text-neutral-600 hover:bg-neutral-50"
                    >
                      <Globe size={13} /> {showTranslation ? "Ẩn bản dịch" : "Hiện bản dịch"}
                    </button>
                  </div>
                </div>
                {/* Its own scroll region -- the sticky video block above is
                    a fixed height, so this needs a bounded height + its own
                    overflow to scroll under it without pushing the page
                    (and the pinned video with it) around. */}
                <div className="mt-3 max-h-[65vh] overflow-y-auto">
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
                          <span className="w-9 shrink-0 pt-0.5 text-[11px] tabular-nums text-neutral-400">
                            {formatDuration(seg.startSec)}
                          </span>
                          <div>
                            <div className={`text-[14.5px] leading-relaxed ${active ? "font-semibold text-rose-700" : "text-neutral-800"}`}>
                              {showFurigana ? renderWithFurigana(seg.text) : seg.text}
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
            )}
          </>
        );
      })()}

      {/* Floating duplicates of the transcript header's toggles (mobile
          only) -- that header scrolls away with the rest of the page once
          you're deep into a long transcript, same underlying reason the
          video itself needed to go sticky. Stacked above the Tập trước/sau
          buttons (bottom-36) and the chat bubble (bottom-20, both left-4)
          so nothing overlaps. Only while actually on the transcript tab --
          toggling furigana/translation from the Mô tả tab wouldn't do
          anything visible anyway. */}
      {tab === "transcript" && transcript ? (
        <>
          <button
            onClick={() => setShowFurigana((v) => !v)}
            aria-label={showFurigana ? "Ẩn furigana" : "Hiện furigana"}
            className={`fixed bottom-60 left-4 z-20 flex h-10 w-10 items-center justify-center rounded-full shadow-lg md:hidden ${
              showFurigana ? "bg-rose-600 text-white" : "bg-white text-neutral-600 ring-1 ring-neutral-200"
            }`}
          >
            <Languages size={17} />
          </button>
          <button
            onClick={() => setShowTranslation((v) => !v)}
            aria-label={showTranslation ? "Ẩn bản dịch" : "Hiện bản dịch"}
            className={`fixed bottom-48 left-4 z-20 flex h-10 w-10 items-center justify-center rounded-full shadow-lg md:hidden ${
              showTranslation ? "bg-rose-600 text-white" : "bg-white text-neutral-600 ring-1 ring-neutral-200"
            }`}
          >
            <Globe size={17} />
          </button>
        </>
      ) : null}

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

// The transcript's own author already writes real furigana readings inline
// for kanji they figure a learner might not know -- e.g. "苗字（みょうじ）"
// -- rather than generating readings ourselves (which would need real
// Japanese morphological analysis to pick the right reading per context;
// getting that wrong in a JLPT app would actively teach a bad pronunciation).
// This just re-renders those already-correct annotations as real <ruby>
// furigana instead of a parenthetical afterthought. Only fires for
// kanji-run + hiragana/katakana-in-parens right next to each other, so an
// unrelated aside like "（笑）" is left alone.
const FURIGANA_PATTERN = /([一-龯々]+)[（(]([぀-ゟ゠-ヿ]+)[）)]/g;

function renderWithFurigana(text: string): React.ReactNode {
  const re = new RegExp(FURIGANA_PATTERN);
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text))) {
    if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index));
    parts.push(
      <ruby key={match.index}>
        {match[1]}
        <rt className="text-[9px] text-neutral-400">{match[2]}</rt>
      </ruby>,
    );
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return parts;
}
