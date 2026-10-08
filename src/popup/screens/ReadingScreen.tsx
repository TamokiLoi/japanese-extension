import { useEffect, useState } from "react";
import type { ReadingPassage, ReadingLength, ReadingBook } from "../../types/reading.ts";
import { findUniqueTextRanges, type TextRange } from "../../lib/textRanges.ts";
import { findMarkdownPipeTables } from "../../lib/markdownpipetable.ts";
import { sliceReadingBody, splitPassageParagraphs } from "../../lib/passageParagraphs.ts";
import { MarkdownTableText } from "../../components/markdowntabletext.tsx";
import {
  ALL_READING,
  AVAILABLE_LEVELS,
  AVAILABLE_LENGTHS,
  AVAILABLE_BOOKS,
  AVAILABLE_JLPT_EXAMS,
  AVAILABLE_N3_SETS,
  READING_EXAM_BOOKS,
  AVAILABLE_TOPICS,
  LENGTH_LABELS,
  BOOK_LABELS,
  BOOK_DIFFICULTY_NOTE,
  pickRandomPassage,
  findReadingById,
  loadViewerState,
  saveViewerState,
  getPassageProgress,
  resetPassageAnswers,
  matchesFilters,
  matchesReadingSources,
  readingExamIdsForBook,
  isReadingExamBook,
  type ReadingViewerState,
} from "../readingState.ts";
import type { JlptLevel } from "../../types/kanji.ts";
import { LevelDot } from "../LevelDot.tsx";
import { ExpandTabButton } from "../TabMode.tsx";
import { CollapsibleSection } from "../CollapsibleSection.tsx";

function StatusIcon({ status, correct, total }: { status: "not-started" | "in-progress" | "done"; correct: number; total: number }) {
  if (status === "done") {
    const allCorrect = correct === total;
    return (
      <span className={`reading-status-badge ${allCorrect ? "reading-status-perfect" : "reading-status-done"}`}>
        ✓ {correct}/{total}
      </span>
    );
  }
  if (status === "in-progress") {
    return <span className="reading-status-badge reading-status-progress">⋯ đang làm</span>;
  }
  return <span className="reading-status-badge reading-status-todo">chưa làm</span>;
}

// Minutes shown as a small range around the stored estimate, so it reads
// like "~3-4 phút" instead of implying false precision.
function timelineLabel(passage: ReadingPassage): string {
  const min = passage.estimatedMinutes;
  const max = min + (passage.length === "long" ? 3 : passage.length === "medium" ? 2 : 1);
  return `${LENGTH_LABELS[passage.length]} · ~${min}-${max} phút`;
}

function renderReadingTextWithUnderlines(text: string, ranges: TextRange[], sourceOffset = 0) {
  const renderLines = (value: string, prefix: string) => value.split("\n").map((line, index, lines) => (
    <span key={`${prefix}-${index}`}>
      {line}
      {index < lines.length - 1 ? <br /> : null}
    </span>
  ));
  const localRanges = ranges.flatMap((range) => {
    const start = Math.max(0, range.start - sourceOffset);
    const end = Math.min(text.length, range.end - sourceOffset);
    return start < end ? [{ start, end }] : [];
  });
  if (!localRanges.length) return renderLines(text, "plain");
  const boundaries = new Set([0, text.length]);
  for (const range of localRanges) {
    boundaries.add(range.start);
    boundaries.add(range.end);
  }
  const points = [...boundaries].sort((a, b) => a - b);
  return points.slice(0, -1).map((start, index) => {
    const end = points[index + 1];
    const part = text.slice(start, end);
    return localRanges.some((range) => start >= range.start && end <= range.end)
      ? <strong key={index} className="font-bold underline decoration-2 underline-offset-2">{renderLines(part, `marked-${index}`)}</strong>
      : <span key={index}>{renderLines(part, `plain-${index}`)}</span>;
  });
}

function ReadingBody({ passage, showFurigana }: { passage: ReadingPassage; showFurigana: boolean }) {
  const passageText = passage.body.map((segment) => segment.text).join("");
  const underlineRanges = findUniqueTextRanges(passageText, passage.underlinedPhrases, passage.underlinedRanges);
  const markdownTables = findMarkdownPipeTables(passageText);
  if (passage.book === "news" || passage.book === "custom") {
    const paragraphs: ReadingPassage["body"][] = [];
    for (const segment of passage.body) {
      if (paragraphs.length === 0 || segment.paragraphStart) paragraphs.push([]);
      paragraphs[paragraphs.length - 1].push(segment);
    }
    return (
      <div className="reading-article-paragraphs">
        {paragraphs.map((paragraph, pi) => (
          <p key={pi}>
            {paragraph.map((seg, i) => {
              const text = seg.paragraphStart ? seg.text.replace(/^\n+/u, "") : seg.text;
              const sourceOffset = passageText.indexOf(seg.text);
              const markedText = renderReadingTextWithUnderlines(text, underlineRanges, Math.max(0, sourceOffset));
              return showFurigana && seg.furigana ? <ruby key={i}>{markedText}<rt>{seg.furigana}</rt></ruby> : <span key={i}>{markedText}</span>;
            })}
          </p>
        ))}
      </div>
    );
  }
  if (markdownTables.length > 0) {
    let segmentOffset = 0;
    const segmentRanges = passage.body.map((segment) => {
      const start = segmentOffset;
      segmentOffset += segment.text.length;
      return { segment, start, end: segmentOffset };
    });
    const renderTextAtOffset = (text: string, sourceOffset: number, keyPrefix: string, renderBreakTags: boolean) => {
      if (!renderBreakTags) return renderReadingTextWithUnderlines(text, underlineRanges, sourceOffset);
      let localOffset = 0;
      return text.split(/(<br\s*\/?>)/giu).map((part, index) => {
        const partOffset = localOffset;
        localOffset += part.length;
        if (/^<br\s*\/?>$/iu.test(part)) return <br key={`${keyPrefix}-br-${index}`} />;
        return part ? <span key={`${keyPrefix}-text-${index}`}>{renderReadingTextWithUnderlines(part, underlineRanges, sourceOffset + partOffset)}</span> : null;
      });
    };
    const renderSourceRange = (start: number, end: number, keyPrefix: string, renderBreakTags = false) =>
      segmentRanges.flatMap(({ segment, start: segmentStart, end: segmentEnd }, index) => {
        const from = Math.max(start, segmentStart);
        const to = Math.min(end, segmentEnd);
        if (from >= to) return [];
        const text = segment.text.slice(from - segmentStart, to - segmentStart);
        const content = renderTextAtOffset(text, from, `${keyPrefix}-${index}`, renderBreakTags);
        const key = `${keyPrefix}-${index}`;
        return showFurigana && segment.furigana && from === segmentStart && to === segmentEnd
          ? [<ruby key={key}>{content}<rt>{segment.furigana}</rt></ruby>]
          : [<span key={key}>{content}</span>];
      });

    const blocks = [];
    let cursor = 0;
    markdownTables.forEach((table, tableIndex) => {
      const columnCount = table.header?.length ?? Math.max(...table.rows.map((row) => row.reduce((count, cell) => count + (cell.colSpan ?? 1), 0)));
      let textEnd = table.start;
      while (textEnd > cursor && (passageText[textEnd - 1] === "\n" || passageText[textEnd - 1] === "\r")) textEnd--;
      if (textEnd > cursor) blocks.push(
        <p key={`before-${tableIndex}`} style={{ whiteSpace: "pre-line" }}>{renderSourceRange(cursor, textEnd, `before-${tableIndex}`)}</p>,
      );
      blocks.push(
        <div key={`table-${tableIndex}`} className="reading-markdown-table-scroll">
          <table className="reading-markdown-table" style={{ minWidth: `${Math.max(620, columnCount * 140)}px` }}>
            {table.header ? (
              <thead>
                <tr>
                  {table.header.map((cell, cellIndex) => (
                    <th key={cellIndex} colSpan={cell.colSpan ?? 1} scope="col">{renderSourceRange(cell.start, cell.end, `header-${tableIndex}-${cellIndex}`, true)}</th>
                  ))}
                </tr>
              </thead>
            ) : null}
            <tbody>
              {table.rows.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {row.map((cell, cellIndex) => (
                    <td key={cellIndex} colSpan={cell.colSpan ?? 1}>{renderSourceRange(cell.start, cell.end, `cell-${tableIndex}-${rowIndex}-${cellIndex}`, true)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      cursor = table.end;
      while (passageText[cursor] === "\n" || passageText[cursor] === "\r") cursor++;
    });
    if (cursor < passageText.length) blocks.push(
      <p key="after-table" style={{ whiteSpace: "pre-line" }}>{renderSourceRange(cursor, passageText.length, "after-table")}</p>,
    );
    return <div className="reading-passage-text-blocks">{blocks}</div>;
  }
  return (
    <div className="reading-passage-paragraphs">
      {splitPassageParagraphs(passageText).map((paragraph, pi) => (
        <p key={pi}>
          {sliceReadingBody(passage.body, paragraph.start, paragraph.end).map((segment, si) => {
            const content = renderReadingTextWithUnderlines(segment.text, underlineRanges, segment.offset);
            return showFurigana && segment.furigana
              ? <ruby key={si}>{content}<rt>{segment.furigana}</rt></ruby>
              : <span key={si}>{content}</span>;
          })}
        </p>
      ))}
    </div>
  );
}

const STATUS_LABELS = { all: "Tất cả", "not-started": "Chưa làm", done: "Đã làm" } as const;

export function ReadingScreen({ onBack }: { onBack: () => void }) {
  const [state, setState] = useState<ReadingViewerState | null>(null);
  const [error, setError] = useState<string | undefined>(undefined);
  const [detailId, setDetailId] = useState<string | null>(null);

  useEffect(() => {
    loadViewerState().then(setState);
  }, []);

  async function mutate(partial: Partial<ReadingViewerState>) {
    if (!state) return;
    const next = { ...state, ...partial };
    await saveViewerState(next);
    setState(next);
    setError(undefined);
  }

  if (!state) {
    return (
      <header className="toolbar">
        <button className="icon-btn" title="Về menu" onClick={onBack}>
          ←
        </button>
        <span className="counter">Luyện đọc</span>
        <ExpandTabButton screenHash="reading" />
      </header>
    );
  }

  const passage = state.currentPassageId ? findReadingById(state.currentPassageId) : undefined;

  if (passage) {
    return <PassageView passage={passage} state={state} onBack={onBack} mutate={mutate} />;
  }

  return (
    <ListView state={state} onBack={onBack} mutate={mutate} error={error} setError={setError} detailId={detailId} setDetailId={setDetailId} />
  );
}

function ListView({
  state,
  onBack,
  mutate,
  error,
  setError,
  detailId,
  setDetailId,
}: {
  state: ReadingViewerState;
  onBack: () => void;
  mutate: (partial: Partial<ReadingViewerState>) => Promise<void>;
  error?: string;
  setError: (e?: string) => void;
  detailId: string | null;
  setDetailId: (id: string | null) => void;
}) {
  const filtered = ALL_READING.filter((p) => matchesFilters(p, state));
  const practicePassages = filtered.filter((p) => p.questions.length > 0);
  const doneCount = practicePassages.filter((p) => getPassageProgress(p, state.answers).status === "done").length;

  const visiblePassages = filtered.filter((p) => {
    if (state.savedOnly && !state.savedPassageIds.includes(p.id)) return false;
    if (state.listStatusFilter === "all") return true;
    const progress = getPassageProgress(p, state.answers);
    if (state.listStatusFilter === "done") return progress.status === "done";
    return progress.status !== "done";
  });
  const selectedJlptCount = state.selectedExamIds.filter((id) => readingExamIdsForBook("jlpt-exam").includes(id)).length;
  const selectedN3SetCount = state.selectedExamIds.filter((id) => readingExamIdsForBook("de-n3").includes(id)).length;

  const statusDotClass = (status: "not-started" | "in-progress" | "done", correct: number, total: number) => {
    if (status === "done") return correct === total ? "reading-tile-perfect" : "reading-tile-done";
    if (status === "in-progress") return "reading-tile-progress";
    return "reading-tile-todo";
  };

  async function openPassage(passage: ReadingPassage) {
    await mutate({
      currentPassageId: passage.id,
      lastPassageId: passage.id,
      answers: { ...state.answers, [passage.id]: state.answers[passage.id] ?? passage.questions.map(() => null) },
    });
  }

  async function handleStart() {
    const passage = pickRandomPassage(state.selectedLevels, state.selectedLengths, state.selectedBooks, undefined, state.selectedTopics, state.selectedExamIds);
    if (!passage) {
      setError("Không có bài đọc nào khớp bộ lọc này.");
      return;
    }
    await openPassage(passage);
  }

  const detailPassage = detailId ? findReadingById(detailId) : undefined;
  const detailProgress = detailPassage ? getPassageProgress(detailPassage, state.answers) : null;
  const lastPassage = state.lastPassageId ? findReadingById(state.lastPassageId) : undefined;

  async function handleResetDetail(passage: ReadingPassage) {
    if (!confirm(`Làm lại "${passage.title}" từ đầu? Kết quả đã trả lời sẽ bị xoá.`)) return;
    await mutate(resetPassageAnswers(state, passage.id));
  }

  return (
    <>
      <header className="toolbar">
        <button className="icon-btn" title="Về menu" onClick={onBack}>
          ←
        </button>
        <span className="counter">Luyện đọc</span>
        <ExpandTabButton screenHash="reading" />
      </header>

      <CollapsibleSection
        className="quiz-setup"
        title="Bộ lọc"
        defaultOpen
        summary={`Nguồn ${state.selectedBooks.length}/${AVAILABLE_BOOKS.length} · JLPT ${selectedJlptCount}/${AVAILABLE_JLPT_EXAMS.length} · 10 đề N3 ${selectedN3SetCount}/${AVAILABLE_N3_SETS.length}`}
      >
        {AVAILABLE_LEVELS.length > 1 ? (
          <div className="quiz-setup-group">
            <div className="quiz-setup-label">Cấp độ</div>
            <div className="level-selector-inline">
              {AVAILABLE_LEVELS.map((level) => {
                const checked = state.selectedLevels.includes(level);
                const count = ALL_READING.filter(
                  (p) => p.level === level && state.selectedLengths.includes(p.length) && matchesReadingSources(p, state.selectedBooks, state.selectedExamIds),
                ).length;
                return (
                  <label key={level} className="level-check">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => {
                        const next = e.target.checked
                          ? [...new Set([...state.selectedLevels, level])]
                          : state.selectedLevels.filter((l) => l !== level);
                        if (next.length === 0) return;
                        mutate({ selectedLevels: next });
                      }}
                    />
                    <LevelDot level={level} />
                    {level} <span className="muted">({count})</span>
                  </label>
                );
              })}
            </div>
          </div>
        ) : null}

        <div className="quiz-setup-group">
          <div className="quiz-setup-label">Nguồn bài đọc</div>
          <div className="reading-book-radio-row">
            {AVAILABLE_BOOKS.map((book) => {
              const checked = state.selectedBooks.includes(book);
              const count = ALL_READING.filter(
                (p) => p.book === book && state.selectedLevels.includes(p.level) && state.selectedLengths.includes(p.length),
              ).length;
              return (
                <label key={book} className="quiz-radio reading-book-radio">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => {
                      const next = e.target.checked
                        ? [...new Set([...state.selectedBooks, book])]
                        : state.selectedBooks.filter((b) => b !== book);
                      if (next.length === 0) return;
                      const familyIds = readingExamIdsForBook(book);
                      const nextExamIds = isReadingExamBook(book)
                        ? checked
                          ? state.selectedExamIds.filter((id) => !familyIds.includes(id))
                          : [...new Set([...state.selectedExamIds, ...familyIds])]
                        : state.selectedExamIds;
                      mutate({ selectedBooks: next, selectedExamIds: nextExamIds });
                    }}
                  />
                  <span className="reading-book-radio-body">
                    <span className="reading-book-radio-title">{BOOK_LABELS[book]}</span>
                    <span className="reading-book-radio-note">
                      {BOOK_DIFFICULTY_NOTE[book]} · {count} bài
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
        </div>

        {READING_EXAM_BOOKS.map((book) => {
          if (!state.selectedBooks.includes(book)) return null;
          const options = book === "jlpt-exam" ? AVAILABLE_JLPT_EXAMS : AVAILABLE_N3_SETS;
          const title = book === "jlpt-exam" ? "Đề JLPT theo kỳ" : "10 đề N3 theo đề";
          const selectedCount = options.filter((exam) => state.selectedExamIds.includes(exam.id)).length;
          const totalCount = ALL_READING.filter((p) => p.book === book && state.selectedLevels.includes(p.level) && state.selectedLengths.includes(p.length)).length;
          return (
            <details key={book} className="reading-exam-filter">
              <summary>
                <span>{title}</span>
                <span className="muted">{selectedCount}/{options.length} · {totalCount} bài</span>
              </summary>
              <div className="quiz-radio-row reading-exam-filter-options">
                {options.map((exam) => {
                  const checked = state.selectedExamIds.includes(exam.id);
                  const count = ALL_READING.filter((p) => p.examId === exam.id && state.selectedLevels.includes(p.level) && state.selectedLengths.includes(p.length)).length;
                  if (!count) return null;
                  return (
                    <label key={exam.id} className="quiz-radio">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(event) => {
                          const nextExamIds = event.target.checked
                            ? [...new Set([...state.selectedExamIds, exam.id])]
                            : state.selectedExamIds.filter((id) => id !== exam.id);
                          const idsForBook = readingExamIdsForBook(book);
                          const hasFamilySelection = nextExamIds.some((id) => idsForBook.includes(id));
                          const nextBooks = hasFamilySelection
                            ? [...new Set([...state.selectedBooks, book])]
                            : state.selectedBooks.filter((item) => item !== book);
                          if (nextBooks.length === 0) return;
                          mutate({ selectedExamIds: nextExamIds, selectedBooks: nextBooks });
                        }}
                      />
                      {exam.label} <span className="muted">({count})</span>
                    </label>
                  );
                })}
              </div>
            </details>
          );
        })}

        {state.selectedBooks.includes("jlpt-exam") ? (
          <div className="quiz-setup-group">
            <div className="quiz-setup-label">Phần đề JLPT</div>
            <div className="quiz-radio-row">
              {AVAILABLE_TOPICS.filter((topic) => ALL_READING.some((p) => p.book === "jlpt-exam" && p.topic === topic && !!p.examId && state.selectedExamIds.includes(p.examId) && state.selectedLevels.includes(p.level) && state.selectedLengths.includes(p.length))).map((topic) => {
                const checked = state.selectedTopics.includes(topic);
                const count = ALL_READING.filter(
                  (p) => p.book === "jlpt-exam" && p.topic === topic && !!p.examId && state.selectedExamIds.includes(p.examId) && state.selectedLevels.includes(p.level) && state.selectedLengths.includes(p.length),
                ).length;
                return (
                  <label key={topic} className="quiz-radio">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => {
                        const next = e.target.checked
                          ? [...new Set([...state.selectedTopics, topic])]
                          : state.selectedTopics.filter((item) => item !== topic);
                        if (next.length === 0) return;
                        mutate({ selectedTopics: next });
                      }}
                    />
                    {topic} <span className="muted">({count})</span>
                  </label>
                );
              })}
            </div>
          </div>
        ) : null}

        {(["news", "custom"] as const).map((book) => {
          if (!state.selectedBooks.includes(book)) return null;
          const topics = [...new Set(ALL_READING.filter((p) => p.book === book && p.topic).map((p) => p.topic!))]
            .sort((a, b) => a.localeCompare(b, "ja", { numeric: true }));
          if (!topics.length) return null;
          return (
            <div key={book} className="quiz-setup-group">
              <div className="quiz-setup-label">{book === "news" ? "Chủ đề báo Nhật" : "Chủ đề nội dung tự thêm"}</div>
              <div className="quiz-radio-row">
                {topics.map((topic) => {
                  const checked = state.selectedTopics.includes(topic);
                  return (
                    <label key={topic} className="quiz-radio">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(event) => {
                          const next = event.target.checked
                            ? [...new Set([...state.selectedTopics, topic])]
                            : state.selectedTopics.filter((item) => item !== topic);
                          if (next.length) mutate({ selectedTopics: next });
                        }}
                      />
                      {topic} <span className="muted">({ALL_READING.filter((p) => p.book === book && p.topic === topic).length})</span>
                    </label>
                  );
                })}
              </div>
            </div>
          );
        })}

        <div className="quiz-setup-group">
          <div className="quiz-setup-label">Độ dài bài đọc</div>
          <div className="quiz-radio-row">
            {AVAILABLE_LENGTHS.map((length) => {
              const checked = state.selectedLengths.includes(length);
              const count = ALL_READING.filter(
                (p) => p.length === length && state.selectedLevels.includes(p.level) && matchesReadingSources(p, state.selectedBooks, state.selectedExamIds),
              ).length;
              return (
                <label key={length} className="quiz-radio">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => {
                      const next = e.target.checked
                        ? [...new Set([...state.selectedLengths, length])]
                        : state.selectedLengths.filter((l) => l !== length);
                      if (next.length === 0) return;
                      mutate({ selectedLengths: next });
                    }}
                  />
                  {LENGTH_LABELS[length]} <span className="muted">({count})</span>
                </label>
              );
            })}
          </div>
        </div>
      </CollapsibleSection>

      <div className="quiz-setup">
        {error ? <p className="quiz-error">{error}</p> : null}

        <button className={`secondary-action-btn ${state.savedOnly ? "reading-toggle-on" : ""}`} onClick={() => mutate({ savedOnly: !state.savedOnly })}>
          {state.savedOnly ? "✓ Đang xem bài đã lưu" : `Bài đã lưu (${state.savedPassageIds.length})`}
        </button>

        <button className="primary-action-btn" onClick={handleStart}>
          🎲 Random bài đọc
        </button>
        {lastPassage ? <button className="secondary-action-btn" title={lastPassage.title} onClick={() => openPassage(lastPassage)}>Tiếp tục đọc</button> : null}
      </div>

      <section className="reading-list-section">
        <div className="reading-list-summary">
          <span>
            Đã làm <strong>{doneCount}/{practicePassages.length}</strong> bài có câu hỏi
          </span>
          <div className="reading-status-filter-row">
            {(["all", "not-started", "done"] as const).map((s) => (
              <button
                key={s}
                className={`reading-status-filter-btn ${state.listStatusFilter === s ? "reading-status-filter-active" : ""}`}
                onClick={() => mutate({ listStatusFilter: s })}
              >
                {STATUS_LABELS[s]}
              </button>
            ))}
          </div>
        </div>
        <div className="reading-detail">
          {detailPassage && detailProgress ? (
            <>
              <div className="reading-detail-title">{detailPassage.title}</div>
              <div className="reading-detail-meta">
                {BOOK_LABELS[detailPassage.book]} · {LENGTH_LABELS[detailPassage.length]}
                {detailPassage.topic ? ` · ${detailPassage.topic}` : ""}
                {AVAILABLE_LEVELS.length > 1 ? ` · ${detailPassage.level}` : ""} · {timelineLabel(detailPassage)}
              </div>
              {(detailPassage.book === "news" || detailPassage.book === "custom") && state.savedPassageIds.includes(detailPassage.id) ? (
                <div className="reading-detail-meta">★ Đã lưu</div>
              ) : null}
              <div className="reading-detail-footer">
                <StatusIcon status={detailProgress.status} correct={detailProgress.correct} total={detailProgress.total} />
                {detailProgress.status !== "not-started" ? (
                  <button className="reading-reset-btn" onClick={() => handleResetDetail(detailPassage)}>
                    ↺ Làm lại
                  </button>
                ) : null}
              </div>
            </>
          ) : (
            <span className="reading-detail-empty">Di chuột vào một bài để xem chi tiết, bấm để mở</span>
          )}
        </div>
        {visiblePassages.length === 0 ? (
          <p className="quiz-error reading-empty">Không có bài đọc nào khớp bộ lọc này.</p>
        ) : (
          <div className="reading-tile-grid">
            {visiblePassages.map((p) => {
              const progress = getPassageProgress(p, state.answers);
              return (
                <button
                  key={p.id}
                  className={`reading-tile ${statusDotClass(progress.status, progress.correct, progress.total)}`}
                  onMouseEnter={() => setDetailId(p.id)}
                  onFocus={() => setDetailId(p.id)}
                  onClick={() => openPassage(p)}
                >
                  読
                </button>
              );
            })}
          </div>
        )}
      </section>
    </>
  );
}

function PassageView({
  passage,
  state,
  onBack,
  mutate,
}: {
  passage: ReadingPassage;
  state: ReadingViewerState;
  onBack: () => void;
  mutate: (partial: Partial<ReadingViewerState>) => Promise<void>;
}) {
  const answers = state.answers[passage.id] ?? passage.questions.map(() => null);
  const answeredCount = answers.filter((a) => a !== null).length;
  const total = passage.questions.length;
  const allAnswered = answeredCount >= total;
  const correctCount = passage.questions.filter((q, qi) => answers[qi] === q.correctIndex).length;
  const passagePool = ALL_READING.filter((p) => matchesFilters(p, state)).filter((p) => {
    if (state.savedOnly && !state.savedPassageIds.includes(p.id)) return false;
    const progress = getPassageProgress(p, state.answers);
    if (state.listStatusFilter === "all") return true;
    if (state.listStatusFilter === "done") return progress.status === "done";
    if (state.listStatusFilter === "needs-review") return progress.status === "done" && progress.correct < progress.total;
    if (state.listStatusFilter === "in-progress") return progress.status === "in-progress";
    return progress.status !== "done";
  });
  const passageIndex = passagePool.findIndex((p) => p.id === passage.id);
  const nextPassage = passageIndex >= 0 ? passagePool[passageIndex + 1] : undefined;
  const isArticle = passage.book === "news" || passage.book === "custom";
  const isLinkOnly = passage.linkOnly === true;
  const isSaved = state.savedPassageIds.includes(passage.id);

  async function handleReset() {
    if (!confirm(`Làm lại "${passage.title}" từ đầu? Kết quả đã trả lời sẽ bị xoá.`)) return;
    await mutate(resetPassageAnswers(state, passage.id));
  }

  function toggleSaved() {
    const savedPassageIds = isSaved
      ? state.savedPassageIds.filter((id) => id !== passage.id)
      : [...state.savedPassageIds, passage.id];
    void mutate({ savedPassageIds });
  }

  return (
    <>
      <header className="toolbar">
        <button className="icon-btn" title="Về menu" onClick={onBack}>
          ←
        </button>
        <span className="counter">Luyện đọc</span>
        <ExpandTabButton screenHash="reading" />
      </header>

      <main className="reading-card">
        <div className="reading-meta">
          <button className="reading-change-filter" title="Về danh sách bài đọc" onClick={() => mutate({ currentPassageId: null })}>
            ☰ Danh sách
          </button>
          <span className="level-badge" data-level={passage.level}>
            {passage.level}
          </span>
          <span className="reading-book-badge">{BOOK_LABELS[passage.book]}</span>
          {passage.topic ? <span className="reading-book-badge">{passage.topic}</span> : null}
          <span className="reading-timeline">{timelineLabel(passage)}</span>
        </div>
        <h2 className="reading-title">{passage.title}</h2>

        {isArticle ? (
          <div className="reading-news-source">
            <span>{passage.source}</span>
            {passage.publishedAt ? <span> · {passage.publishedAt}</span> : null}
            {passage.sourceUrl ? <a href={passage.sourceUrl} target="_blank" rel="noreferrer"> · Mở nguồn ↗</a> : null}
            <button className="secondary-action-btn" onClick={toggleSaved}>{isSaved ? "★ Đã lưu" : "☆ Lưu bài"}</button>
            {passage.sourceNotice ? <small>{passage.sourceNotice}</small> : null}
          </div>
        ) : null}

        {!isArticle ? <div className="reading-progress-row">
          <div className="reading-progress-bar">
            <div className="reading-progress-bar-fill" style={{ width: `${total ? (answeredCount / total) * 100 : 0}%` }}></div>
          </div>
          <span className="reading-progress-label">
            {answeredCount}/{total} câu
          </span>
          {answeredCount > 0 ? (
            <button className="reading-reset-btn" title="Làm lại từ đầu" onClick={handleReset}>
              ↺ Làm lại
            </button>
          ) : null}
        </div> : null}

        {allAnswered && total > 0 ? (
          <div className={`reading-score-banner ${correctCount === total ? "reading-score-perfect" : ""}`}>
            {correctCount === total ? "🎉" : "📊"} Đúng {correctCount}/{total} câu ({Math.round((correctCount / total) * 100)}%)
          </div>
        ) : null}

        {!isLinkOnly ? <div className="reading-toolbar-row">
          <button
            className={`secondary-action-btn reading-toggle-btn ${state.showFurigana ? "reading-toggle-on" : ""}`}
            onClick={() => mutate({ showFurigana: !state.showFurigana })}
          >
            {state.showFurigana ? "Ẩn furigana" : "Hiện furigana"}
          </button>
          <button
            className={`secondary-action-btn reading-toggle-btn ${state.showTranslation ? "reading-toggle-on" : ""}`}
            onClick={() => mutate({ showTranslation: !state.showTranslation })}
          >
            {state.showTranslation ? "Ẩn bản dịch" : "Xem bản dịch"}
          </button>
          {passage.studyNote ? (
            <button
              className={`secondary-action-btn reading-toggle-btn ${state.showStudyNote ? "reading-toggle-on" : ""}`}
              onClick={() => mutate({ showStudyNote: !state.showStudyNote })}
            >
              {state.showStudyNote ? "Ẩn ghi chú" : "Xem ghi chú"}
            </button>
          ) : null}
        </div> : null}

        {!isLinkOnly ? <div className="reading-body">
          <ReadingBody passage={passage} showFurigana={state.showFurigana} />
        </div> : <div className="reading-news-link-only">Nội dung bài chưa được cấp quyền hiển thị trong ứng dụng. Bạn có thể mở nguồn để đọc trực tiếp.</div>}

        {state.showTranslation ? (
          <div className="reading-translation">
            <MarkdownTableText text={passage.translationVi} />
          </div>
        ) : null}

        {state.showStudyNote && passage.studyNote ? (
          <div className="reading-study-note">
            {passage.studyNote.split("\n").map((line, i, arr) => (
              <span key={i}>
                {line}
                {i < arr.length - 1 ? <br /> : null}
              </span>
            ))}
          </div>
        ) : null}

        {!isArticle ? <div className="reading-questions">
          {passage.questions.map((q, qi) => {
            const answered = answers[qi];
            return (
              <div key={qi} className="reading-question">
                <div className="reading-question-prompt">
                  Câu {q.sourceNumber ?? qi + 1}: {renderReadingTextWithUnderlines(
                    q.question,
                    findUniqueTextRanges(q.question, q.underline ? [q.underline] : []),
                  )}
                </div>
                <div className="quiz-choices">
                  {q.options.map((opt, oi) => {
                    const classes = ["quiz-choice"];
                    if (answered !== null) {
                      if (oi === q.correctIndex) classes.push("quiz-choice-correct");
                      else if (oi === answered) classes.push("quiz-choice-wrong");
                    }
                    return (
                      <button
                        key={oi}
                        className={classes.join(" ")}
                        disabled={answered !== null}
                        onClick={() => {
                          const newAnswers = [...answers];
                          newAnswers[qi] = oi;
                          mutate({ answers: { ...state.answers, [passage.id]: newAnswers } });
                        }}
                      >
                        {opt}
                      </button>
                    );
                  })}
                </div>
                {answered !== null ? (
                  <>
                    <div className="reading-question-vi">{q.questionVi}</div>
                    <div className="reading-explanation">{q.explanation}</div>
                  </>
                ) : null}
              </div>
            );
          })}
        </div> : null}

        <button
          className="primary-action-btn reading-another-btn"
          onClick={() => nextPassage && mutate({
            currentPassageId: nextPassage.id,
            lastPassageId: nextPassage.id,
            answers: { ...state.answers, [nextPassage.id]: state.answers[nextPassage.id] ?? nextPassage.questions.map(() => null) },
          })}
          disabled={!nextPassage}
        >
          → Bài tiếp theo
        </button>
      </main>
    </>
  );
}
