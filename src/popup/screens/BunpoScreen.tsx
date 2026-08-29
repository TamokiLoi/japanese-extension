import { useEffect, useState } from "react";
import type { BunpoGrammarPoint, BunpoSource } from "../../types/bunpo.ts";
import type { JlptLevel } from "../../types/kanji.ts";
import {
  ALL_BUNPO,
  AVAILABLE_LEVELS,
  AVAILABLE_SOURCES,
  AVAILABLE_CHAPTERS,
  SOURCE_LABELS,
  countForLevel,
  findBunpoById,
  findChapterTitle,
  getFilteredList,
  loadViewerState,
  saveViewerState,
  type BunpoViewerState,
} from "../bunpoState.ts";
import { LevelDot } from "../LevelDot.tsx";
import { ExpandTabButton } from "../TabMode.tsx";
import { useDebouncedValue } from "../useDebouncedValue.ts";
import {
  getProgress,
  loadProgressMap,
  toggleFlag,
  toggleMastered,
  filterByProgress,
  bucketFor,
  type ItemProgress,
  type ProgressFilter,
  type ProgressMap,
} from "../progressState.ts";
import { findMatchingReadingPassages, findMatchingQuizBookQuestions } from "../bunpoLinks.ts";
import { saveViewerState as saveReadingViewerState, loadViewerState as loadReadingViewerState } from "../readingState.ts";
import { saveViewerState as saveQuizBookViewerState, loadViewerState as loadQuizBookViewerState } from "../quizBookState.ts";

function matchesQuery(g: BunpoGrammarPoint, q: string): boolean {
  if (!q) return true;
  return g.pattern.toLowerCase().includes(q) || g.meaningVi.toLowerCase().includes(q);
}

// Same list, same order, the list screen and the detail screen's prev/next
// buttons both use -- so stepping through with prev/next walks exactly the
// set of cards currently visible in the list (filters/search/progress
// filter all still apply).
function getVisibleList(state: BunpoViewerState, searchQuery: string, progressMap: ProgressMap): BunpoGrammarPoint[] {
  const q = searchQuery.trim().toLowerCase();
  return filterByProgress(getFilteredList(state).filter((g) => matchesQuery(g, q)), progressMap, state.progressFilter);
}

export function BunpoScreen({
  onBack,
  onOpenReading,
  onOpenQuizBook,
  targetId,
}: {
  onBack: () => void;
  onOpenReading: () => void;
  onOpenQuizBook: () => void;
  targetId?: string;
}) {
  const [state, setState] = useState<BunpoViewerState | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let s = await loadViewerState();
      if (targetId && findBunpoById(targetId)) {
        s = { ...s, currentGrammarId: targetId };
        await saveViewerState(s);
      }
      if (cancelled) return;
      setState(s);
    })();
    return () => {
      cancelled = true;
    };
  }, [targetId]);

  async function mutate(partial: Partial<BunpoViewerState>) {
    if (!state) return;
    const next = { ...state, ...partial };
    await saveViewerState(next);
    setState(next);
  }

  if (!state) {
    return (
      <header className="toolbar">
        <button className="icon-btn" title="Về menu" onClick={onBack}>
          ←
        </button>
        <span className="counter" />
        <ExpandTabButton screenHash="bunpo" />
      </header>
    );
  }

  const current = state.currentGrammarId ? findBunpoById(state.currentGrammarId) : undefined;

  if (current) {
    return (
      <DetailView
        g={current}
        state={state}
        onBack={onBack}
        onOpenReading={onOpenReading}
        onOpenQuizBook={onOpenQuizBook}
        mutate={mutate}
      />
    );
  }

  return <ListView state={state} onBack={onBack} mutate={mutate} />;
}

function ListView({
  state,
  onBack,
  mutate,
}: {
  state: BunpoViewerState;
  onBack: () => void;
  mutate: (partial: Partial<BunpoViewerState>) => Promise<void>;
}) {
  const [query, setQuery] = useState(state.listSearchQuery);
  const debouncedQuery = useDebouncedValue(query, 150);
  const [progressMap, setProgressMap] = useState<ProgressMap | null>(null);

  useEffect(() => {
    loadProgressMap().then(setProgressMap);
  }, [state]);

  useEffect(() => {
    if (debouncedQuery !== state.listSearchQuery) {
      mutate({ listSearchQuery: debouncedQuery });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQuery]);

  const allLevelsChecked = state.selectedLevels.length === AVAILABLE_LEVELS.length;
  const showChapterFilter = state.selectedSources.includes("theo-chuong") && AVAILABLE_CHAPTERS.length > 0;
  const allChaptersSelected = state.selectedChapters.length === AVAILABLE_CHAPTERS.length;
  const singleSelectedChapter = state.selectedChapters.length === 1 ? state.selectedChapters[0] : null;
  const chapterSelectValue = allChaptersSelected ? "all" : String(singleSelectedChapter ?? "all");

  const filtered = progressMap ? getVisibleList(state, debouncedQuery, progressMap) : [];

  function applyLevelSelection(newLevels: JlptLevel[]) {
    if (newLevels.length === 0) return;
    mutate({ selectedLevels: newLevels });
  }

  return (
    <>
      <header className="toolbar">
        <button className="icon-btn" title="Về menu" onClick={onBack}>
          ←
        </button>
        <span className="counter">{filtered.length} mẫu ngữ pháp</span>
        <ExpandTabButton screenHash="bunpo" />
      </header>

      <section className="level-selector">
        <label className="level-check level-check-all">
          <input
            type="checkbox"
            checked={allLevelsChecked}
            onChange={(e) => applyLevelSelection(e.target.checked ? [...AVAILABLE_LEVELS] : state.selectedLevels)}
          />
          Tất cả <span className="muted">({ALL_BUNPO.length})</span>
        </label>
        {AVAILABLE_LEVELS.map((level) => {
          const checked = state.selectedLevels.includes(level);
          return (
            <label key={level} className="level-check">
              <input
                type="checkbox"
                checked={checked}
                onChange={(e) => {
                  const next = e.target.checked
                    ? [...new Set([...state.selectedLevels, level])]
                    : state.selectedLevels.filter((l) => l !== level);
                  applyLevelSelection(next);
                }}
              />
              <LevelDot level={level} />
              {level} <span className="muted">({countForLevel(level)})</span>
            </label>
          );
        })}
      </section>

      <section className="quiz-setup">
        <div className="quiz-setup-group">
          <div className="quiz-setup-label">Nguồn</div>
          <div className="level-selector-inline">
            {AVAILABLE_SOURCES.map((source) => {
              const checked = state.selectedSources.includes(source);
              const count = ALL_BUNPO.filter((g) => g.source === source).length;
              return (
                <label key={source} className="level-check">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => {
                      const next = e.target.checked
                        ? [...new Set([...state.selectedSources, source])]
                        : state.selectedSources.filter((s) => s !== source);
                      if (next.length === 0) return;
                      mutate({ selectedSources: next as BunpoSource[] });
                    }}
                  />
                  {SOURCE_LABELS[source]} <span className="muted">({count})</span>
                </label>
              );
            })}
          </div>
        </div>

        {showChapterFilter ? (
          <div className="quiz-setup-group">
            <div className="quiz-setup-label">Chương</div>
            <div className="quiz-count-row">
              <select
                value={chapterSelectValue}
                onChange={(e) => {
                  const value = e.target.value;
                  const next = value === "all" ? [...AVAILABLE_CHAPTERS] : [Number(value)];
                  mutate({ selectedChapters: next });
                }}
              >
                <option value="all">Tất cả các chương</option>
                {AVAILABLE_CHAPTERS.map((c) => {
                  const title = findChapterTitle(c);
                  return (
                    <option key={c} value={c}>
                      Chương {c}
                      {title ? `: ${title}` : ""}
                    </option>
                  );
                })}
              </select>
            </div>
          </div>
        ) : null}

        <div className="quiz-setup-group">
          <div className="quiz-setup-label">Tiến độ</div>
          <div className="quiz-count-row">
            <select value={state.progressFilter} onChange={(e) => mutate({ progressFilter: e.target.value as ProgressFilter })}>
              <option value="all">Tất cả mẫu</option>
              <option value="unmastered">Chưa thuộc</option>
              <option value="flagged">Đã đánh dấu khó</option>
            </select>
          </div>
        </div>
      </section>

      <section className="jlpt-filter-row">
        <input
          type="text"
          placeholder="Tìm theo mẫu ngữ pháp hoặc nghĩa..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </section>

      <main className="jlpt-list">
        {filtered.length === 0 ? (
          <p className="empty">Không có mẫu ngữ pháp nào khớp bộ lọc này.</p>
        ) : (
          progressMap &&
          filtered.map((g) => {
            const bucket = bucketFor(progressMap[g.id]);
            const bucketMark = bucket === "mastered" ? "✓ " : bucket === "flagged" ? "🚩 " : "";
            return (
              <div key={g.id} className="jlpt-entry bunpo-entry" onClick={() => mutate({ currentGrammarId: g.id })}>
                <span className="search-tag-level">
                  <LevelDot level={g.level} />
                  {g.level}
                </span>
                <div className="jlpt-entry-word">
                  {bucketMark}
                  {g.pattern}
                  {g.chapter !== undefined ? <span className="muted"> · Chương {g.chapter}</span> : null}
                </div>
                <div className="jlpt-entry-meaning">{g.meaningVi}</div>
              </div>
            );
          })
        )}
      </main>
    </>
  );
}

function DetailView({
  g,
  state,
  onBack,
  onOpenReading,
  onOpenQuizBook,
  mutate,
}: {
  g: BunpoGrammarPoint;
  state: BunpoViewerState;
  onBack: () => void;
  onOpenReading: () => void;
  onOpenQuizBook: () => void;
  mutate: (partial: Partial<BunpoViewerState>) => Promise<void>;
}) {
  const [progress, setProgress] = useState<ItemProgress | null>(null);
  const [visibleList, setVisibleList] = useState<BunpoGrammarPoint[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [p, progressMap] = await Promise.all([getProgress(g.id), loadProgressMap()]);
      if (cancelled) return;
      setProgress(p);
      setVisibleList(getVisibleList(state, state.listSearchQuery, progressMap));
    })();
    return () => {
      cancelled = true;
    };
  }, [g.id, state]);

  const readingMatches = findMatchingReadingPassages(g);
  const quizBookMatches = findMatchingQuizBookQuestions(g);

  const currentIndex = visibleList.findIndex((item) => item.id === g.id);
  const prevItem = currentIndex > 0 ? visibleList[currentIndex - 1] : null;
  const nextItem = currentIndex >= 0 && currentIndex < visibleList.length - 1 ? visibleList[currentIndex + 1] : null;

  async function refreshProgress() {
    setProgress(await getProgress(g.id));
  }

  async function handleOpenReading(passageId: string) {
    const readingState = await loadReadingViewerState();
    await saveReadingViewerState({ ...readingState, currentPassageId: passageId });
    onOpenReading();
  }

  async function handleOpenQuizBook(questionId: string) {
    const qbState = await loadQuizBookViewerState();
    await saveQuizBookViewerState({ ...qbState, currentQuestionId: questionId });
    onOpenQuizBook();
  }

  if (!progress) {
    return (
      <header className="toolbar">
        <button className="icon-btn" title="Về menu" onClick={onBack}>
          ←
        </button>
        <span className="counter">Ngữ pháp</span>
        <ExpandTabButton screenHash="bunpo" />
      </header>
    );
  }

  return (
    <>
      <header className="toolbar">
        <button className="icon-btn" title="Về menu" onClick={onBack}>
          ←
        </button>
        <span className="counter">{currentIndex >= 0 ? `${currentIndex + 1} / ${visibleList.length}` : "Ngữ pháp"}</span>
        <ExpandTabButton screenHash="bunpo" />
      </header>

      <main className={`card card-${bucketFor(progress)}`}>
        <div className="reading-meta">
          <span className="level-badge" data-level={g.level}>
            {g.level}
          </span>
          <span className="reading-book-badge">
            {SOURCE_LABELS[g.source]}
            {g.chapter !== undefined ? ` · Chương ${g.chapter}` : ""}
          </span>
          <button className="reading-change-filter" title="Về danh sách ngữ pháp" onClick={() => mutate({ currentGrammarId: null })}>
            ☰ Danh sách
          </button>
        </div>
        {g.chapterTitle ? <div className="reading-timeline">{g.chapterTitle}</div> : null}

        <div className="reading-toolbar-row">
          <button
            className={`secondary-action-btn reading-toggle-btn ${progress.flagged ? "reading-toggle-on" : ""}`}
            onClick={async () => {
              await toggleFlag(g.id);
              await refreshProgress();
            }}
          >
            {progress.flagged ? "🚩 Bỏ đánh dấu khó" : "🚩 Đánh dấu khó"}
          </button>
          <button
            className={`secondary-action-btn reading-toggle-btn ${progress.mastered ? "reading-toggle-on" : ""}`}
            onClick={async () => {
              await toggleMastered(g.id);
              await refreshProgress();
            }}
          >
            {progress.mastered ? "✓ Đã thuộc" : "Đánh dấu đã thuộc"}
          </button>
        </div>

        <div className="vocab-word">{g.pattern}</div>

        <dl className="details">
          <dt>Nghĩa</dt>
          <dd>{g.meaningVi}</dd>
          {g.usage ? (
            <>
              <dt>Cách dùng</dt>
              <dd>{g.usage}</dd>
            </>
          ) : null}
          {g.examTip ? (
            <>
              <dt>Key JLPT</dt>
              <dd>{g.examTip}</dd>
            </>
          ) : null}
        </dl>

        <p className="example">
          <span className="example-jp">{g.example}</span>
          <span className="example-vi">{g.exampleVi}</span>
        </p>

        {readingMatches.length > 0 ? (
          <div className="related-vocab">
            <div className="related-vocab-label">📖 Xuất hiện trong bài đọc</div>
            <div className="related-vocab-list">
              {readingMatches.map((p) => (
                <button key={p.id} className="related-vocab-item" onClick={() => handleOpenReading(p.id)}>
                  {p.title}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {quizBookMatches.length > 0 ? (
          <div className="related-vocab">
            <div className="related-vocab-label">📝 Xuất hiện trong luyện đề</div>
            <div className="related-vocab-list">
              {quizBookMatches.map((qq) => (
                <button key={qq.id} className="related-vocab-item" onClick={() => handleOpenQuizBook(qq.id)}>
                  {qq.question.slice(0, 24)}
                  {qq.question.length > 24 ? "…" : ""}
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </main>

      <footer className="nav">
        <button disabled={!prevItem} onClick={() => prevItem && mutate({ currentGrammarId: prevItem.id })}>
          ← Mẫu trước
        </button>
        <button disabled={!nextItem} onClick={() => nextItem && mutate({ currentGrammarId: nextItem.id })}>
          Mẫu sau →
        </button>
      </footer>
    </>
  );
}
