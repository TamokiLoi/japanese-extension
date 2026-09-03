import { useEffect, useState } from "react";
import { Flame, ArrowRight, GraduationCap, ClipboardCheck, BookMarked, Library, PenSquare, BookOpenText, Headphones, Check } from "lucide-react";
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
  getWeekStudyDays,
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

const WEEKDAY_LABELS = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];

function greeting(): string {
  const h = new Date().getHours();
  if (h < 11) return "Chào buổi sáng!";
  if (h < 14) return "Chào buổi trưa!";
  if (h < 18) return "Chào buổi chiều!";
  return "Chào buổi tối!";
}

interface ContentCounts {
  kanji: number;
  vocab: number;
  bunpo: number;
  reading: number;
  listening: number;
}

interface Stats {
  streak: number;
  weekDays: boolean[];
  studiedToday: number;
  totalItems: number;
  counts: ContentCounts;
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
  // Each content type is narrowed to whatever that section's own filter
  // sheet currently has selected (its persisted viewer state), rather than
  // always counting the full dataset -- "Kho học liệu"/"Tổng quan tiến độ"
  // then answer "how much of what I'm actually studying right now",
  // matching each screen's own filtered list instead of a fixed grand total.
  const filteredKanji = getFilteredKanji(kanjiState);
  const filteredVocab = getFilteredVocab(vocabState);
  const filteredBunpo = getFilteredBunpo(bunpoState);
  const filteredReading = getFilteredReading(readingState);
  const filteredListening = getFilteredListening(listeningState);
  const filteredQuizBook = ALL_QUIZBOOK.filter((q) => matchesQuizBookFilters(q, quizBookState));
  // Listening's own "answer"-direction entries use the question's plain id;
  // Dictation's use a "dict:"-prefixed id (see dictationProgressId) so the
  // two tracks don't collide in the same ItemProgress record for one
  // question -- both need to be in this pool for the bucket/total counts
  // below to reflect them, as two separate trackable items each.
  const filteredDictationItems = getFilteredDictation(dictationState).map((q) => ({ id: dictationProgressId(q.id) }));
  const filteredItems = [
    ...filteredKanji,
    ...filteredVocab,
    ...filteredBunpo,
    ...filteredReading,
    ...filteredQuizBook,
    ...filteredListening,
    ...filteredDictationItems,
  ];
  const [streak, weekDays] = await Promise.all([getStudyStreak(), getWeekStudyDays()]);
  return {
    streak,
    weekDays,
    studiedToday: countStudiedToday(filteredItems, map),
    totalItems: filteredItems.length,
    counts: {
      kanji: filteredKanji.length,
      vocab: filteredVocab.length,
      bunpo: filteredBunpo.length,
      reading: filteredReading.length,
      listening: filteredListening.length,
    },
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

function WeekCalendar({ weekDays }: { weekDays: boolean[] }) {
  const todayIndex = (new Date().getDay() + 6) % 7; // Mon=0..Sun=6
  return (
    <div className="flex gap-1.5">
      {WEEKDAY_LABELS.map((label, i) => {
        const studied = weekDays[i];
        const isToday = i === todayIndex;
        return (
          <div key={label} className="flex flex-1 flex-col items-center gap-1.5">
            <span className={`text-[11px] font-semibold ${isToday ? "text-rose-600" : "text-neutral-400"}`}>{label}</span>
            <div
              className={`flex h-7 w-7 items-center justify-center rounded-full border-[1.5px] ${
                studied
                  ? "border-rose-600 bg-rose-600 text-white"
                  : isToday
                    ? "border-2 border-rose-600 bg-white"
                    : "border-rose-200 bg-white"
              }`}
            >
              {studied ? <Check size={13} strokeWidth={3} /> : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function StreakCard({ streak, weekDays }: { streak: number; weekDays: boolean[] }) {
  return (
    <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5">
      <div className="flex items-center gap-2 text-orange-500">
        <Flame size={18} />
        <span className="text-xs font-semibold uppercase tracking-wide text-neutral-800">Chuỗi ngày học</span>
      </div>
      <div className="mt-2 text-2xl font-bold text-neutral-800">{streak} ngày liên tiếp</div>
      <p className="mt-1 text-xs text-rose-700">Học mỗi ngày để giữ chuỗi streak và ghi nhớ lâu hơn.</p>
      <div className="mt-4">
        <WeekCalendar weekDays={weekDays} />
      </div>
    </div>
  );
}

function ContinueCard({
  icon: Icon,
  title,
  subtitle,
  onClick,
}: {
  icon: typeof BookMarked;
  title: string;
  subtitle: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-3 rounded-2xl border border-neutral-200 bg-white p-4 text-left transition-colors hover:border-rose-200 hover:bg-rose-50/40"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-rose-50 text-rose-600">
        <Icon size={18} />
      </span>
      <div className="min-w-0">
        <div className="truncate text-sm font-semibold text-neutral-800">{title}</div>
        <div className="truncate text-xs text-neutral-400">{subtitle}</div>
      </div>
    </button>
  );
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
    <div className="mx-auto max-w-6xl px-2.5 py-2 md:px-8 md:py-6">
      <h1 className="text-2xl font-bold text-neutral-800">{greeting()}</h1>
      <p className="mt-1 text-neutral-500">Tiếp tục hành trình học tiếng Nhật của bạn nào.</p>

      {stats ? (
        <div className="mt-6 flex flex-col gap-6 md:flex-row md:items-start">
          {/* Streak, mobile-only instance -- today's habit prompt belongs
              above the fold, before the two columns below split apart. The
              desktop instance lives inside the rail further down instead of
              trying to keep this one row-synced with the main column via
              CSS grid -- that forced the two independently-tall columns to
              share row tracks, staggering every section under it. */}
          <div className="md:hidden">
            <StreakCard streak={stats.streak} weekDays={stats.weekDays} />
          </div>

          {/* Main column */}
          <div className="flex flex-1 flex-col gap-8">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-400">Kho học liệu (theo bộ lọc hiện tại)</h2>
              <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
                <div className="flex items-center gap-2.5 rounded-2xl border border-neutral-200 bg-white p-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-rose-50 text-rose-600">
                    <BookMarked size={16} />
                  </span>
                  <div className="min-w-0">
                    <div className="truncate text-base font-bold text-neutral-800">{stats.counts.kanji}</div>
                    <div className="truncate text-[11px] text-neutral-400">Kanji</div>
                  </div>
                </div>
                <div className="flex items-center gap-2.5 rounded-2xl border border-neutral-200 bg-white p-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-rose-50 text-rose-600">
                    <Library size={16} />
                  </span>
                  <div className="min-w-0">
                    <div className="truncate text-base font-bold text-neutral-800">{stats.counts.vocab}</div>
                    <div className="truncate text-[11px] text-neutral-400">Từ vựng</div>
                  </div>
                </div>
                <div className="flex items-center gap-2.5 rounded-2xl border border-neutral-200 bg-white p-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-rose-50 text-rose-600">
                    <PenSquare size={16} />
                  </span>
                  <div className="min-w-0">
                    <div className="truncate text-base font-bold text-neutral-800">{stats.counts.bunpo}</div>
                    <div className="truncate text-[11px] text-neutral-400">Ngữ pháp</div>
                  </div>
                </div>
                <div className="flex items-center gap-2.5 rounded-2xl border border-neutral-200 bg-white p-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-rose-50 text-rose-600">
                    <Flame size={16} />
                  </span>
                  <div className="min-w-0">
                    <div className="truncate text-base font-bold text-neutral-800">{stats.studiedToday} thẻ</div>
                    <div className="truncate text-[11px] text-neutral-400">Đã học hôm nay</div>
                  </div>
                </div>
              </div>
            </div>

            <div>
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

            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-400">Tiếp tục học</h2>
              <div className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
                <ContinueCard icon={BookMarked} title="Kanji" subtitle={`${stats.counts.kanji} chữ Hán`} onClick={() => onNavigate("kanji")} />
                <ContinueCard icon={Library} title="Từ vựng" subtitle={`${stats.counts.vocab} từ`} onClick={() => onNavigate("vocab")} />
                <ContinueCard icon={PenSquare} title="Ngữ pháp" subtitle={`${stats.counts.bunpo} mẫu câu`} onClick={() => onNavigate("bunpo")} />
                <ContinueCard
                  icon={BookOpenText}
                  title="Luyện đọc"
                  subtitle={`${stats.counts.reading} câu hỏi`}
                  onClick={() => onNavigate("reading")}
                />
                <ContinueCard
                  icon={Headphones}
                  title="Luyện nghe"
                  subtitle={`${stats.counts.listening} câu`}
                  onClick={() => onNavigate("listening")}
                />
              </div>
            </div>
          </div>

          {/* Right rail -- on mobile this is just "Cần ôn ngay" + "Luyện
              thi" (Streak already showed above, full-width); on desktop it's
              the whole rail, flowing independently of the main column so
              its shorter content doesn't force gaps into the main column. */}
          <div className="flex flex-col gap-4 md:w-80 md:shrink-0">
            <div className="hidden md:block">
              <StreakCard streak={stats.streak} weekDays={stats.weekDays} />
            </div>
            <div>
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
                        {totalDue} thẻ cần ôn lại (Kanji {stats.due.kanji} · Từ vựng {stats.due.vocab} · Ngữ pháp {stats.due.bunpo})
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

            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-400">Luyện thi</h2>
              <button
                onClick={() => onNavigate("dethi")}
                className="mt-3 flex w-full items-center gap-3 rounded-2xl border border-neutral-200 bg-white p-4 text-left transition-colors hover:bg-neutral-50"
              >
                <ClipboardCheck className="shrink-0 text-neutral-600" size={22} />
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-neutral-800">Làm đề thi JLPT N3</div>
                  <div className="text-sm text-neutral-500">25 đề thật, có tính giờ và chấm điểm theo barem</div>
                </div>
              </button>
            </div>
          </div>
        </div>
      ) : (
        <p className="mt-6 text-neutral-400">Đang tải...</p>
      )}
    </div>
  );
}
