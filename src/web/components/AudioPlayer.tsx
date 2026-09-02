import { useEffect, useRef, useState } from "react";
import { Play, Pause, Repeat, Volume2, VolumeX } from "lucide-react";

const RATES = [0.75, 1, 1.25, 1.5];

function formatTime(s: number): string {
  if (!Number.isFinite(s)) return "0:00";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec < 10 ? "0" : ""}${sec}`;
}

// Custom player replacing the browser's bare <audio controls> -- play/pause,
// a draggable seek bar, loop, 4 speed presets, and volume, all in the same
// rose/neutral visual language as the rest of the app. Shared by
// ListeningScreen and DictationScreen so both get the exact same controls.
export function AudioPlayer({ src, autoPlay = false, onEnded }: { src: string; autoPlay?: boolean; onEnded?: () => void }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [rate, setRate] = useState(1);
  const [loop, setLoop] = useState(false);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);

  // A new question/câu means a new audio source -- reset playback state and
  // (for Dictation's "tự phát khi sang câu mới") optionally start playing it
  // right away rather than carrying over the previous clip's position.
  useEffect(() => {
    setPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    const el = audioRef.current;
    if (!el) return;
    el.load();
    if (autoPlay) {
      el.play()
        .then(() => setPlaying(true))
        .catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src]);

  useEffect(() => {
    const el = audioRef.current;
    if (el) el.playbackRate = rate;
  }, [rate]);

  useEffect(() => {
    const el = audioRef.current;
    if (el) el.volume = muted ? 0 : volume;
  }, [volume, muted]);

  function togglePlay() {
    const el = audioRef.current;
    if (!el) return;
    if (playing) {
      el.pause();
    } else {
      el.play().catch(() => {});
    }
  }

  return (
    <div>
      <audio
        ref={audioRef}
        src={src}
        loop={loop}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
        onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
        onEnded={() => {
          setPlaying(false);
          onEnded?.();
        }}
      />

      {/* seek row */}
      <div className="flex items-center gap-3">
        <span className="w-9 text-right text-xs tabular-nums text-neutral-400">{formatTime(currentTime)}</span>
        <input
          type="range"
          min={0}
          max={duration || 0}
          step={0.1}
          value={currentTime}
          onChange={(e) => {
            const t = Number(e.target.value);
            setCurrentTime(t);
            if (audioRef.current) audioRef.current.currentTime = t;
          }}
          className="h-1.5 flex-1 accent-rose-600"
        />
        <span className="w-9 text-xs tabular-nums text-neutral-400">{formatTime(duration)}</span>
      </div>

      {/* controls row */}
      <div className="mt-3.5 flex flex-wrap items-center gap-2.5">
        <button
          onClick={togglePlay}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-rose-600 text-white hover:bg-rose-700"
        >
          {playing ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" className="ml-0.5" />}
        </button>

        <button
          onClick={() => setLoop((v) => !v)}
          title="Lặp lại"
          className={`flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold ${
            loop ? "border-rose-300 bg-rose-50 text-rose-600" : "border-neutral-200 text-neutral-500 hover:bg-neutral-50"
          }`}
        >
          <Repeat size={13} /> Lặp lại
        </button>

        <div className="flex items-center gap-1 rounded-full border border-neutral-200 p-[3px]">
          {RATES.map((r) => (
            <button
              key={r}
              onClick={() => setRate(r)}
              className={`h-[26px] rounded-full px-2.5 text-[11px] font-semibold ${
                r === rate ? "bg-rose-50 text-rose-600" : "text-neutral-500 hover:bg-neutral-50"
              }`}
            >
              {r}x
            </button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-1.5">
          <button onClick={() => setMuted((v) => !v)} className="flex text-neutral-500 hover:text-neutral-700">
            {muted || volume === 0 ? <VolumeX size={17} /> : <Volume2 size={17} />}
          </button>
          <input
            type="range"
            min={0}
            max={100}
            value={muted ? 0 : Math.round(volume * 100)}
            onChange={(e) => {
              setVolume(Number(e.target.value) / 100);
              setMuted(false);
            }}
            className="h-1.5 w-[70px] accent-rose-600"
          />
        </div>
      </div>
    </div>
  );
}
