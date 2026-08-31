import { useEffect, useState } from "react";
import { Flame, BookMarked, Library, PenSquare, ArrowRight } from "lucide-react";
import type { Screen } from "../../popup/App.tsx";
import { ALL_KANJI } from "../../popup/kanjiState.ts";
import { ALL_VOCAB } from "../../popup/vocabState.ts";
import { ALL_BUNPO } from "../../popup/bunpoState.ts";
import {
  loadProgressMap,
  countBuckets,
  countStudiedToday,
  countDue,
  getStudyStreak,
  type ProgressMap,
  type ProgressBucket,
} from "../../popup/progressState.ts";
import { loadViewerState as loadKanjiViewerState, saveViewerState as saveKanjiViewerState } from "../../popup/kanjiState.ts";
import { loadViewerState as loadVocabViewerState, saveViewerState as saveVocabViewerState } from "../../popup/vocabState.ts";
import { loadViewerState as loadBunpoViewerState, saveViewerState as saveBunpoViewerState } from "../../popup/bunpoState.ts";

const BUCKET_ORDER: ProgressBucket[] = ["mastered", "learning", "flagged", "new"];
const BUCKET_LABEL: Record<ProgressBucket, string> = {
  mastered: "Đã thuộc",
  learning: "Đang học",
  flagged: "Cần ôn lại",
  new: "Chưa học",
};
const BUCKET_COLOR: Record<ProgressBucket, string> = {
  mastered: "text-emerald-600 bg-emerald-50",
  learning: "text-amber-600 bg-amber-50",
  flagged: "text-rose-600 bg-rose-50",
  new: "text-neutral-500 bg-neutral-100",
};

function greeting(): string {
  const h = new Date().getHours();
  if (h < 11) return "Chào buổi sáng!";
  if (h < 14) return "Chào buổi trưa!";
  if (h < 18) return "Chào buổi chiều!";
  return "Chào buổi tối!";
}

interface Stats {
  streak: number;
  studiedToday: number;
  buckets: Record<ProgressBucket, number>;
  due: { kanji: number; vocab: number; bunpo: number };
}

async function loadStats(): Promise<Stats> {
  const map: ProgressMap = await loadProgressMap();
  const allItems = [...ALL_KANJI, ...ALL_VOCAB, ...ALL_BUNPO];
  const streak = await getStudyStreak();
  return {
    streak,
    studiedToday: countStudiedToday(allItems, map),
    buckets: countBuckets(allItems, map),
    due: {
      kanji: countDue(ALL_KANJI, map),
      vocab: countDue(ALL_VOCAB, map),
      bunpo: countDue(ALL_BUNPO, map),
    },
  };
}

export function HomeScreen({ onNavigate }: { onNavigate: (screen: Screen) => void }) {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadStats().then((s) => {
      if (!cancelled) setStats(s);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function reviewDue(kind: "kanji" | "vocab" | "bunpo") {
    if (kind === "kanji") {
      const s = await loadKanjiViewerState();
      await saveKanjiViewerState({ ...s, progressFilter: "due" });
      onNavigate("kanji");
    } else if (kind === "vocab") {
      const s = await loadVocabViewerState();
      await saveVocabViewerState({ ...s, progressFilter: "due" });
      onNavigate("vocab");
    } else {
      const s = await loadBunpoViewerState();
      await saveBunpoViewerState({ ...s, progressFilter: "due" });
      onNavigate("bunpo");
    }
  }

  const dueCards = stats
    ? ([
        { kind: "kanji" as const, label: "Kanji", count: stats.due.kanji, icon: BookMarked },
        { kind: "vocab" as const, label: "Từ vựng", count: stats.due.vocab, icon: Library },
        { kind: "bunpo" as const, label: "Ngữ pháp", count: stats.due.bunpo, icon: PenSquare },
      ].filter((c) => c.count > 0))
    : [];

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 md:px-8 md:py-10">
      <h1 className="text-2xl font-bold text-neutral-800">{greeting()}</h1>
      <p className="mt-1 text-neutral-500">Tiếp tục hành trình học tiếng Nhật của bạn nào.</p>

      {stats ? (
        <>
          <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-3">
            <div className="rounded-2xl border border-neutral-200 bg-white p-4">
              <div className="flex items-center gap-2 text-orange-500">
                <Flame size={18} />
                <span className="text-xs font-semibold uppercase tracking-wide text-neutral-400">Chuỗi ngày học</span>
              </div>
              <div className="mt-1 text-2xl font-bold text-neutral-800">{stats.streak} ngày</div>
            </div>
            <div className="rounded-2xl border border-neutral-200 bg-white p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-neutral-400">Đã học hôm nay</div>
              <div className="mt-1 text-2xl font-bold text-neutral-800">{stats.studiedToday} thẻ</div>
            </div>
            <div className="rounded-2xl border border-neutral-200 bg-white p-4 col-span-2 md:col-span-1">
              <div className="text-xs font-semibold uppercase tracking-wide text-neutral-400">Tổng số thẻ</div>
              <div className="mt-1 text-2xl font-bold text-neutral-800">
                {ALL_KANJI.length + ALL_VOCAB.length + ALL_BUNPO.length}
              </div>
            </div>
          </div>

          <div className="mt-8">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-400">Tổng quan tiến độ</h2>
            <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
              {BUCKET_ORDER.map((b) => (
                <div key={b} className={`rounded-2xl p-4 ${BUCKET_COLOR[b]}`}>
                  <div className="text-xs font-semibold">{BUCKET_LABEL[b]}</div>
                  <div className="mt-1 text-xl font-bold">{stats.buckets[b]}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-8">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-400">Cần ôn ngay</h2>
            {dueCards.length > 0 ? (
              <div className="mt-3 grid gap-3 md:grid-cols-3">
                {dueCards.map(({ kind, label, count, icon: Icon }) => (
                  <button
                    key={kind}
                    onClick={() => reviewDue(kind)}
                    className="flex items-center justify-between rounded-2xl border border-rose-200 bg-rose-50 p-4 text-left transition-colors hover:bg-rose-100"
                  >
                    <div className="flex items-center gap-3">
                      <Icon className="text-rose-600" size={22} />
                      <div>
                        <div className="font-semibold text-neutral-800">{label}</div>
                        <div className="text-sm text-rose-600">{count} thẻ cần ôn lại</div>
                      </div>
                    </div>
                    <ArrowRight className="text-rose-400" size={18} />
                  </button>
                ))}
              </div>
            ) : (
              <p className="mt-3 rounded-2xl border border-neutral-200 bg-white p-4 text-sm text-neutral-500">
                Không có thẻ nào đến hạn ôn lại ngay bây giờ — cứ tiếp tục khám phá nội dung mới ở thanh bên nhé.
              </p>
            )}
          </div>
        </>
      ) : (
        <p className="mt-6 text-neutral-400">Đang tải...</p>
      )}
    </div>
  );
}
