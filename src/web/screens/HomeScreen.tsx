import { useEffect, useState } from "react";
import { Flame, ArrowRight, GraduationCap, ClipboardCheck } from "lucide-react";
import type { Screen } from "../../popup/App.tsx";
import { ALL_KANJI, getOrderedList as getFilteredKanji, loadViewerState as loadKanjiViewerState } from "../../popup/kanjiState.ts";
import { ALL_VOCAB, getOrderedList as getFilteredVocab, loadViewerState as loadVocabViewerState } from "../../popup/vocabState.ts";
import { ALL_BUNPO, getFilteredList as getFilteredBunpo, loadViewerState as loadBunpoViewerState } from "../../popup/bunpoState.ts";
import { getFilteredQuestions as getFilteredReading, loadViewerState as loadReadingViewerState } from "../../popup/readingState.ts";
import {
  ALL_QUIZBOOK,
  matchesFilters as matchesQuizBookFilters,
  loadViewerState as loadQuizBookViewerState,
} from "../../popup/quizBookState.ts";
import { getFilteredList as getFilteredListening, loadViewerState as loadListeningViewerState } from "../../popup/listeningState.ts";
import {
  dictationProgressId,
  getFilteredList as getFilteredDictation,
  loadViewerState as loadDictationViewerState,
} from "../../popup/dictationState.ts";
import {
  loadProgressMap,
  countBuckets,
  countStudiedToday,
  countDue,
  getStudyStreak,
  type ProgressMap,
  type ProgressBucket,
} from "../../popup/progressState.ts";

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
  totalItems: number;
  buckets: Record<ProgressBucket, number>;
  due: { kanji: number; vocab: number; bunpo: number };
}

async function loadStats(): Promise<Stats> {
  const [map, kanjiState, vocabState, bunpoState, readingState, quizBookState, listeningState, dictationState] = await Promise.all([
    loadProgressMap(),
    loadKanjiViewerState(),
    loadVocabViewerState(),
    loadBunpoViewerState(),
    loadReadingViewerState(),
    loadQuizBookViewerState(),
    loadListeningViewerState(),
    loadDictationViewerState(),
  ]);
  const filteredListening = getFilteredListening(listeningState);
  // Listening's own "answer"-direction entries use the question's plain id;
  // Dictation's use a "dict:"-prefixed id (see dictationProgressId) so the
  // two tracks don't collide in the same ItemProgress record for one
  // question -- both need to be in this pool for the bucket/total counts
  // below to reflect them, as two separate trackable items each. Each
  // content type is narrowed to whatever that section's own filter sheet
  // currently has selected (its persisted viewer state), rather than always
  // counting the full dataset -- "Tổng số thẻ"/"Tổng quan tiến độ" then
  // answer "how much of what I'm actually studying right now", matching
  // each screen's own filtered list instead of a fixed grand total.
  const filteredDictationItems = getFilteredDictation(dictationState).map((q) => ({ id: dictationProgressId(q.id) }));
  const filteredItems = [
    ...getFilteredKanji(kanjiState),
    ...getFilteredVocab(vocabState),
    ...getFilteredBunpo(bunpoState),
    ...getFilteredReading(readingState),
    ...ALL_QUIZBOOK.filter((q) => matchesQuizBookFilters(q, quizBookState)),
    ...filteredListening,
    ...filteredDictationItems,
  ];
  const streak = await getStudyStreak();
  return {
    streak,
    studiedToday: countStudiedToday(filteredItems, map),
    totalItems: filteredItems.length,
    buckets: countBuckets(filteredItems, map),
    // Kanji/Vocab/Bunpo only -- Ôn tập (reviewState.ts) can only build a
    // review session from these 3 content types so far, so "Cần ôn ngay"
    // below stays scoped to what it can actually launch. Listening/
    // Dictation still show up in "Tổng quan tiến độ" above (bucket counts
    // include them), just not in this specific due-review CTA yet.
    due: {
      kanji: countDue(ALL_KANJI, map),
      vocab: countDue(ALL_VOCAB, map),
      bunpo: countDue(ALL_BUNPO, map),
    },
  };
}

export function HomeScreen({ onNavigate }: { onNavigate: (screen: Screen, id?: string) => void }) {
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

  const totalDue = stats ? stats.due.kanji + stats.due.vocab + stats.due.bunpo : 0;

  return (
    <div className="mx-auto max-w-4xl px-2.5 py-2 md:px-8 md:py-6">
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
              <div className="mt-1 text-2xl font-bold text-neutral-800">{stats.totalItems}</div>
            </div>
          </div>

          <div className="mt-8">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-400">Tổng quan tiến độ</h2>
            <p className="mt-1 text-xs text-neutral-400">
              Theo đúng bộ lọc cấp độ/nguồn bạn đang chọn ở từng mục (Kanji, Từ vựng, Ngữ pháp...) -- đổi bộ lọc ở đó sẽ đổi số ở đây.
            </p>
            <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
              {BUCKET_ORDER.map((b) => (
                <button
                  key={b}
                  onClick={() => onNavigate("stats", `bucket:${b}`)}
                  className={`rounded-2xl p-4 text-left transition-transform hover:scale-[1.02] ${BUCKET_COLOR[b]}`}
                >
                  <div className="text-xs font-semibold">{BUCKET_LABEL[b]}</div>
                  <div className="mt-1 text-xl font-bold">{stats.buckets[b]}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="mt-8">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-400">Cần ôn ngay</h2>
            {totalDue > 0 ? (
              <button
                onClick={() => onNavigate("review")}
                className="mt-3 flex w-full items-center justify-between rounded-2xl border border-rose-200 bg-rose-50 p-4 text-left transition-colors hover:bg-rose-100"
              >
                <div className="flex items-center gap-3">
                  <GraduationCap className="text-rose-600" size={22} />
                  <div>
                    <div className="font-semibold text-neutral-800">Bắt đầu ôn tập</div>
                    <div className="text-sm text-rose-600">
                      {totalDue} thẻ cần ôn lại (Kanji {stats!.due.kanji} · Từ vựng {stats!.due.vocab} · Ngữ pháp {stats!.due.bunpo})
                    </div>
                  </div>
                </div>
                <ArrowRight className="text-rose-400" size={18} />
              </button>
            ) : (
              <p className="mt-3 rounded-2xl border border-neutral-200 bg-white p-4 text-sm text-neutral-500">
                Không có thẻ nào đến hạn ôn lại ngay bây giờ — cứ tiếp tục khám phá nội dung mới ở thanh bên nhé.
              </p>
            )}
          </div>

          <div className="mt-8">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-400">Luyện thi</h2>
            <button
              onClick={() => onNavigate("dethi")}
              className="mt-3 flex w-full items-center justify-between rounded-2xl border border-neutral-200 bg-white p-4 text-left transition-colors hover:bg-neutral-50"
            >
              <div className="flex items-center gap-3">
                <ClipboardCheck className="text-neutral-600" size={22} />
                <div>
                  <div className="font-semibold text-neutral-800">Làm đề thi JLPT N3</div>
                  <div className="text-sm text-neutral-500">25 đề thật, có tính giờ và chấm điểm theo barem</div>
                </div>
              </div>
              <ArrowRight className="text-neutral-400" size={18} />
            </button>
          </div>
        </>
      ) : (
        <p className="mt-6 text-neutral-400">Đang tải...</p>
      )}
    </div>
  );
}
