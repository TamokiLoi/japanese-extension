import { Fragment, useEffect, useState } from "react";
import type { BunpoGrammarPoint, BunpoSource } from "../../types/bunpo.ts";
import type { JlptLevel } from "../../types/kanji.ts";
import {
  ALL_BUNPO,
  AVAILABLE_LEVELS,
  AVAILABLE_SOURCES,
  AVAILABLE_CHAPTERS,
  SOURCE_LABELS,
  findBunpoById,
  findChapterTitle,
  getFilteredList,
  loadViewerState,
  saveViewerState,
  type BunpoViewerState,
} from "../bunpoState.ts";
import { LevelDot } from "../LevelDot.tsx";
import { ExpandTabButton } from "../TabMode.tsx";
import { CollapsibleSection } from "../CollapsibleSection.tsx";
import { useDebouncedValue } from "../useDebouncedValue.ts";
import {
  loadProgressMap,
  toggleFlag,
  toggleMastered,
  filterByProgress,
  bucketFor,
  defaultProgress,
  isFlagged,
  type ItemProgress,
  type ProgressFilter,
  type ProgressMap,
} from "../progressState.ts";
import { findMatchingReadingPassages, findMatchingQuizBookQuestions, findBunpoByPattern, findRelatedBunpo, highlightPatternInExample, parseUsage, isGrammarFormula, splitGrammarFormula, formatGrammarFormulaInline } from "../bunpoLinks.ts";
import { saveViewerState as saveReadingViewerState, loadViewerState as loadReadingViewerState } from "../readingState.ts";
import { saveViewerState as saveQuizBookViewerState, loadViewerState as loadQuizBookViewerState } from "../quizBookState.ts";
import "../../grammar-detail.css";

// Every conjugation-form term that appears anywhere in "usage" across both
// data sources (checked against the full dataset) -- shown once via the
// "ⓘ" button next to "Cách dùng" instead of annotating every occurrence
// inline, which would repeat the same explanation 90+ times and get
// unreadable fast on combined notations like "V辞書形／Vない形".
const USAGE_TERM_GLOSSARY: { term: string; explanation: string }[] = [
  { term: "辞書形", explanation: "Thể từ điển (dạng nguyên mẫu của động từ), vd: 食べる" },
  { term: "ます形", explanation: "Thể ます (dạng lịch sự), vd: 食べます" },
  { term: "て形", explanation: "Thể て, vd: 食べて" },
  { term: "た形", explanation: "Thể た (quá khứ thông thường), vd: 食べた" },
  { term: "ば形", explanation: "Thể ば (giả định), vd: 食べれば" },
  { term: "ない形", explanation: "Thể ない (phủ định), vd: 食べない" },
  { term: "意向形", explanation: "Thể ý chí / dự định, vd: 食べよう" },
  { term: "普通形", explanation: "Thể thông thường (từ điển／ない／た／なかった tuỳ loại từ và thì)" },
];

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

  // Functional setState so each call builds on the LATEST state instead of
  // a stale closure -- see web BunpoScreen.tsx's identical comment (a
  // debounced search-query save racing a row click, or any two mutate()
  // calls fired close together, would otherwise silently drop one change).
  function mutate(partial: Partial<BunpoViewerState>) {
    setState((prev) => {
      if (!prev) return prev;
      const next = { ...prev, ...partial };
      void saveViewerState(next);
      return next;
    });
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
  mutate: (partial: Partial<BunpoViewerState>) => void;
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

      <CollapsibleSection
        className="level-selector"
        title="Cấp độ"
        defaultOpen
        summary={allLevelsChecked ? "Tất cả" : `${state.selectedLevels.length} cấp độ`}
      >
        <label className="level-check level-check-all">
          <input
            type="checkbox"
            checked={allLevelsChecked}
            onChange={(e) => applyLevelSelection(e.target.checked ? [...AVAILABLE_LEVELS] : state.selectedLevels)}
          />
          Tất cả{" "}
          <span className="muted">({ALL_BUNPO.filter((g) => g.sources.some((s) => state.selectedSources.includes(s))).length})</span>
        </label>
        {AVAILABLE_LEVELS.map((level) => {
          const checked = state.selectedLevels.includes(level);
          // Factors in the currently selected sources, same as the source
          // checkboxes below factor in the selected levels -- see web
          // BunpoScreen.tsx's identical comment.
          const count = ALL_BUNPO.filter((g) => g.level === level && g.sources.some((s) => state.selectedSources.includes(s))).length;
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
              {level} <span className="muted">({count})</span>
            </label>
          );
        })}
      </CollapsibleSection>

      <CollapsibleSection
        className="quiz-setup"
        title="Nguồn & bộ lọc"
        summary={`${state.selectedSources.length}/${AVAILABLE_SOURCES.length} nguồn`}
      >
        <div className="quiz-setup-group">
          <div className="quiz-setup-label">Nguồn</div>
          <div className="level-selector-inline">
            {AVAILABLE_SOURCES.map((source) => {
              const checked = state.selectedSources.includes(source);
              const count = ALL_BUNPO.filter((g) => g.sources.includes(source) && state.selectedLevels.includes(g.level)).length;
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
      </CollapsibleSection>

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
              <div
                key={g.id}
                className="jlpt-entry bunpo-entry"
                // Commit the live query together with currentGrammarId --
                // see web BunpoScreen.tsx's identical comment.
                onClick={() => mutate({ currentGrammarId: g.id, listSearchQuery: query })}
              >
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
  mutate: (partial: Partial<BunpoViewerState>) => void;
}) {
  const [progress, setProgress] = useState<ItemProgress | null>(null);
  const [visibleList, setVisibleList] = useState<BunpoGrammarPoint[]>([]);
  const [showUsageGlossary, setShowUsageGlossary] = useState(false);

  // One shared load -- see web BunpoScreen.tsx's identical comment
  // (getProgress(id) internally re-reads loadProgressMap() itself).
  async function loadDetail(): Promise<{ p: ItemProgress; progressMap: ProgressMap }> {
    const progressMap = await loadProgressMap();
    return { p: progressMap[g.id] ?? defaultProgress(), progressMap };
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { p, progressMap } = await loadDetail();
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
  const relatedBunpo = findRelatedBunpo(g);
  const parsedUsage = g.usage ? parseUsage(g.usage) : null;
  const usageIsFormula = g.usage ? isGrammarFormula(g.usage) : false;
  const formulaLines = [
    ...(g.formula ? [formatGrammarFormulaInline(g.formula)] : []),
    ...(usageIsFormula && g.usage !== g.formula ? [formatGrammarFormulaInline(g.usage!)] : []),
  ];

  const currentIndex = visibleList.findIndex((item) => item.id === g.id);
  const prevItem = currentIndex > 0 ? visibleList[currentIndex - 1] : null;
  const nextItem = currentIndex >= 0 && currentIndex < visibleList.length - 1 ? visibleList[currentIndex + 1] : null;

  // Also recomputes visibleList -- see web BunpoScreen.tsx's identical
  // comment (toggling flag/mastered can move `g` in or out of the current
  // progressFilter bucket).
  async function refreshProgress() {
    const { p, progressMap } = await loadDetail();
    setProgress(p);
    setVisibleList(getVisibleList(state, state.listSearchQuery, progressMap));
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

      <main className={`card card-${bucketFor(progress)} grammar-detail-card`}>
        <div className="reading-meta">
          <button className="reading-change-filter" title="Về danh sách ngữ pháp" onClick={() => mutate({ currentGrammarId: null })}>
            ☰ Danh sách
          </button>
          <span className="level-badge" data-level={g.level}>
            {g.level}
          </span>
          {g.chapterTitle ? <span className="grammar-chapter-tag">{g.chapterTitle}</span> : null}
          <span className="reading-book-badge">
            {g.sources.map((s) => SOURCE_LABELS[s]).join(" · ")}
            {g.chapter !== undefined ? ` · Chương ${g.chapter}` : ""}
          </span>
        </div>
        <div className="reading-toolbar-row">
          <button
            className={`secondary-action-btn reading-toggle-btn ${isFlagged(progress) ? "reading-toggle-on" : ""}`}
            onClick={async () => {
              await toggleFlag(g.id);
              await refreshProgress();
            }}
          >
            {isFlagged(progress) ? "🚩 Bỏ đánh dấu khó" : "🚩 Đánh dấu khó"}
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

        <div className="grammar-hero">
          <div className="grammar-popup-title">
            {splitGrammarFormula(g.pattern).map((line, index) => <div key={index} className="grammar-pattern-line">{line}</div>)}
          </div>
          <div className="grammar-hero-divider" />
          <p className="grammar-meaning">{g.meaningVi}</p>
        </div>

        <div className="grammar-sections">
          {formulaLines.length > 0 ? <section className="grammar-section grammar-section--formula">
            <h3 className="grammar-section-title">
              ▣ Công thức
              {usageIsFormula ? <button type="button" className="usage-glossary-btn" title="Giải thích ký hiệu thể" onClick={() => setShowUsageGlossary(true)}>ⓘ</button> : null}
            </h3>
            <div className="grammar-section-body grammar-formula-lines">
              {formulaLines.map((line, index) => <div key={index} className="grammar-formula-line">{line}</div>)}
            </div>
          </section> : null}
          {g.usage && !usageIsFormula ? <section className="grammar-section grammar-section--usage">
            <h3 className="grammar-section-title">
              Cách dùng
              <button
                type="button"
                className="usage-glossary-btn"
                title="Giải thích ký hiệu thể"
                onClick={() => setShowUsageGlossary(true)}
              >
                ⓘ
              </button>
            </h3>
            {parsedUsage ? <>
              <div className="grammar-source-line">Nguồn: {parsedUsage.source}</div>
              <div className="grammar-section-body border-l-2 border-purple-200 pl-2 text-xs italic text-neutral-600">{parsedUsage.jp}</div>
              <div className="grammar-section-body">{parsedUsage.vi}</div>
            </> : <p className="grammar-section-body">{g.usage}</p>}
          </section> : null}
          {g.examTip ? <section className="grammar-section grammar-section--tip"><h3 className="grammar-section-title">✦ Mẹo làm JLPT</h3><p className="grammar-section-body">{g.examTip}</p></section> : null}
        </div>

        {g.example.trim() || g.moreExamples?.length ? <div className="grammar-sections"><section className="grammar-section grammar-section--example">
          <h3 className="grammar-section-title">☏ Ví dụ</h3>
          <div className="grammar-entry"><div className="grammar-example-jp">
            {highlightPatternInExample(g.example, g.pattern).map((frag, i) =>
              frag.highlighted ? (
                <mark key={i} className="example-jp-highlight">
                  {frag.text}
                </mark>
              ) : (
                <Fragment key={i}>{frag.text}</Fragment>
              ),
            )}
          </div><div className="grammar-example-vi">{g.exampleVi}</div></div>
        {g.moreExamples?.map((ex, i) => (
          <div className="grammar-entry" key={i}><div className="grammar-example-jp">
              {highlightPatternInExample(ex.jp, g.pattern).map((frag, j) =>
                frag.highlighted ? (
                  <mark key={j} className="example-jp-highlight">
                    {frag.text}
                  </mark>
                ) : (
                  <Fragment key={j}>{frag.text}</Fragment>
                ),
              )}
            </div><div className="grammar-example-vi">{ex.vi}</div></div>
        ))}
        </section></div> : null}

        {relatedBunpo.length > 0 ? (
          <div className="grammar-sections"><section className="grammar-section grammar-section--related">
            <h3 className="grammar-section-title">↗ Mẫu liên quan / dễ nhầm</h3>
            {relatedBunpo.map(({ target, relation, note }) => (
              <div className="grammar-link-entry" key={target.id}>
                <div className="flex flex-wrap items-center gap-2">
                  <button type="button" className="grammar-link-pattern" onClick={() => mutate({ currentGrammarId: target.id })}>{target.pattern}</button>
                  <span className="grammar-tag">{relation === "form" ? "Cùng cấu trúc" : relation === "meaning" ? "Nghĩa gần" : relation === "both" ? "Cấu trúc & nghĩa" : "Dễ nhầm"}</span>
                </div>
                <div className="grammar-section-body">{note}</div>
              </div>
            ))}
          </section></div>
        ) : null}

        {g.level !== "N3" && g.compareWith && g.compareWith.length > 0 ? (
          <div className="grammar-sections"><section className="grammar-section grammar-section--related">
            <div className="grammar-section-title">Dễ nhầm với</div>
            {g.compareWith.map((c, i) => {
              const target = findBunpoByPattern(c.pattern, g.level);
              return (
                <div className="compare-with-item" key={i}>
                  {target ? (
                    <button type="button" className="compare-with-pattern" onClick={() => mutate({ currentGrammarId: target.id })}>
                      {c.pattern}
                    </button>
                  ) : (
                    <span className="compare-with-pattern static">{c.pattern}</span>
                  )}
                  <div className="compare-with-note">{c.note}</div>
                </div>
              );
            })}
          </section></div>
        ) : null}

        {progress.dueAt ? <div className="grammar-sections">
          <section className="grammar-section grammar-section--study">
            <div className="grammar-study-status"><strong>Ôn tập</strong><span>{progress.dueAt <= Date.now() ? "Đến hạn" : `Đến hạn ${new Date(progress.dueAt).toLocaleDateString("vi-VN")}`}</span></div>
          </section>
        </div> : null}

        {readingMatches.length > 0 || quizBookMatches.length > 0 ? (
          <CollapsibleSection
            className="grammar-sections grammar-document-links"
            title="Xuất hiện trong các tài liệu"
            summary={`${readingMatches.length} bài đọc · ${quizBookMatches.length} đề thi`}
          >
            {readingMatches.length > 0 ? <section className="grammar-document-group grammar-document-group--reading">
              <div className="grammar-section-title">📖 Xuất hiện trong bài đọc</div>
              <div className="grammar-link-list">
                {readingMatches.map((p) => (
                  <button key={p.id} className="related-vocab-item" onClick={() => handleOpenReading(p.id)}>
                    {p.title}
                  </button>
                ))}
              </div>
            </section> : null}
            {quizBookMatches.length > 0 ? <section className="grammar-document-group grammar-document-group--quiz">
              <div className="grammar-section-title">📝 Xuất hiện trong luyện đề</div>
              <div className="grammar-link-list">
                {quizBookMatches.map((qq) => (
                  <button key={qq.id} className="related-vocab-item" onClick={() => handleOpenQuizBook(qq.id)}>
                    {qq.question.slice(0, 24)}
                    {qq.question.length > 24 ? "…" : ""}
                  </button>
                ))}
              </div>
            </section> : null}
          </CollapsibleSection>
        ) : null}

        {g.sources.length > 0 || g.chapterTitle ? <div className="grammar-sections">
          <section className="grammar-section grammar-section--notes">
            <h3 className="grammar-section-title">Ghi chú & nguồn</h3>
            {g.sources.length > 0 ? <div className="grammar-source-line">{g.sources.map((source) => SOURCE_LABELS[source]).join(" · ")}{g.chapter !== undefined ? ` · Chương ${g.chapter}` : ""}</div> : null}
            {g.chapterTitle ? <div className="grammar-section-body">{g.chapterTitle}</div> : null}
          </section>
        </div> : null}

        {showUsageGlossary ? (
          <div
            className="usage-glossary-overlay"
            onClick={(e) => {
              if (e.target === e.currentTarget) setShowUsageGlossary(false);
            }}
          >
            <div className="usage-glossary-modal">
              <button
                className="icon-btn usage-glossary-close"
                title="Đóng"
                onClick={() => setShowUsageGlossary(false)}
              >
                ✕
              </button>
              <div className="usage-glossary-title">Giải thích ký hiệu thể</div>
              <dl className="usage-glossary-list">
                {USAGE_TERM_GLOSSARY.map((entry) => (
                  <Fragment key={entry.term}>
                    <dt>{entry.term}</dt>
                    <dd>{entry.explanation}</dd>
                  </Fragment>
                ))}
              </dl>
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
