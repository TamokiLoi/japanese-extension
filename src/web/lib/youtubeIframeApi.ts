// Lazy-loads YouTube's IFrame Player JS API (needed only for PodcastScreen's
// "tự động phát tập tiếp theo" -- a plain <iframe src> has no event hook, so
// detecting "this episode just ended" requires attaching the JS API to an
// existing iframe that has `enablejsapi=1` in its src. The API script is a
// singleton across the whole page (YouTube's own global callback contract),
// so this caches the loading promise instead of re-inserting the <script>
// tag on every mount.
export interface YouTubePlayer {
  destroy: () => void;
  getCurrentTime: () => number;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  playVideo: () => void;
}

declare global {
  interface Window {
    YT?: {
      Player: new (
        el: HTMLElement,
        opts: { events?: { onReady?: () => void; onStateChange?: (e: { data: number }) => void } },
      ) => YouTubePlayer;
      PlayerState: { ENDED: number };
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

let apiPromise: Promise<void> | null = null;

export function loadYouTubeIframeApi(): Promise<void> {
  if (window.YT?.Player) return Promise.resolve();
  if (apiPromise) return apiPromise;
  apiPromise = new Promise((resolve) => {
    const prevCallback = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prevCallback?.();
      resolve();
    };
    const script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(script);
  });
  return apiPromise;
}
