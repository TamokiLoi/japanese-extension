import { useEffect, useState } from "react";
import {
  ALL_VOCAB,
  AVAILABLE_SOURCES,
  SOURCE_LABELS,
  countForSource,
  getOrderedList,
  loadViewerState,
  saveViewerState,
  resolveJumpState,
  type VocabCard,
  type VocabSource,
  type VocabViewerState,
} from "../vocabState.ts";
import {
  getProgress,
  loadProgressMap,
  toggleFlag,
  toggleMastered,
  filterByProgress,
  bucketFor,
  countBuckets,
  BUCKET_TILE_CLASS,
  BUCKET_LABEL,
  type ItemProgress,
  type ProgressMap,
} from "../progressState.ts";
import { ExpandTabButton } from "../TabMode.tsx";
import { kanjiIdForChar } from "../kanjiVocabLinks.ts";
import { formatHanViet } from "../../hanVietFormat.ts";

// Renders a word with each character that's a known kanji wrapped in a
// clickable span so it can jump to that kanji's card.
function WordWithKanjiLinks({ word, onOpenKanji }: { word: string; onOpenKanji: (kanjiId: string) => void }) {
  return (
    <>
      {[...word].map((ch, i) => {
        const kanjiId = kanjiIdForChar(ch);
        return kanjiId ? (
          <span key={i} className="word-kanji-link" onClick={() => onOpenKanji(kanjiId)}>
            {ch}
          </span>
        ) : (
          <span key={i}>{ch}</span>
        );
      })}
    </>
  );
}

async function getFilteredList(state: VocabViewerState): Promise<VocabCard[]> {
  const map = await loadProgressMap();
  return filterByProgress(getOrderedList(state), map, state.progressFilter);
}

export function VocabScreen({
  onBack,
  onOpenKanji,
  jumpToId,
}: {
  onBack: () => void;
  onOpenKanji: (kanjiId: string) => void;
  jumpToId?: string;
}) {
  const [state, setState] = useState<VocabViewerState | null>(null);
  const [list, setList] = useState<VocabCard[]>([]);
  const [progress, setProgress] = useState<ItemProgress | null>(null);
  const [gridMap, setGridMap] = useState<ProgressMap | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let s = await loadViewerState();
      let l: VocabCard[];
      if (jumpToId) {
        const jumped = resolveJumpState(s, jumpToId);
        if (jumped) {
          s = jumped;
          l = getOrderedList(s);
        } else {
          l = await getFilteredList(s);
          s = { ...s, index: Math.min(s.index, Math.max(l.length - 1, 0)) };
        }
      } else {
        l = await getFilteredList(s);
        s = { ...s, index: Math.min(s.index, Math.max(l.length - 1, 0)) };
      }
      await saveViewerState(s);
      if (cancelled) return;
      setState(s);
      setList(l);
    })();
    return () => {
      cancelled = true;
    };
  }, [jumpToId]);

  useEffect(() => {
    let cancelled = false;
    if (!state) return;
    const v = list[state.index];
    if (state.viewMode === "grid") {
      loadProgressMap().then((m) => {
        if (!cancelled) setGridMap(m);
      });
      setProgress(null);
    } else if (v) {
      getProgress(v.id).then((p) => {
        if (!cancelled) setProgress(p);
      });
      setGridMap(null);
    } else {
      setProgress(null);
      setGridMap(null);
    }
    return () => {
      cancelled = true;
    };
  }, [state, list]);

  async function mutate(partial: Partial<VocabViewerState>, recomputeList = true) {
    if (!state) return;
    const next: VocabViewerState = { ...state, ...partial };
    await saveViewerState(next);
    const newList = recomputeList ? await getFilteredList(next) : list;
    setState(next);
    setList(newList);
  }

  async function applySourceSelection(newSources: VocabSource[]) {
    // Never allow an empty selection -- simply skip the mutation so the
    // controlled checkboxes stay reflecting the previous (valid) state.
    if (newSources.length === 0) return;
    await mutate({ selectedSources: newSources, index: 0 });
  }

  async function refreshProgress() {
    const v = list[state!.index];
    if (!v) return;
    const p = await getProgress(v.id);
    setProgress(p);
  }

  if (!state) {
    return (
      <header className="toolbar">
        <button className="icon-btn" title="Về menu" onClick={onBack}>
          ←
        </button>
        <span className="counter" />
        <ExpandTabButton screenHash="vocab" />
      </header>
    );
  }

  const v = list[state.index];
  const totalSelected = list.length;
  const isGrid = state.viewMode === "grid";
  const bucketCounts = gridMap ? countBuckets(list, gridMap) : null;
  const allChecked = state.selectedSources.length === AVAILABLE_SOURCES.length;

  return (
    <>
      <header className="toolbar">
        <button className="icon-btn" title="Về menu" onClick={onBack}>
          ←
        </button>
        <span className="counter">{isGrid ? `${list.length} thẻ` : `${list.length > 0 ? state.index + 1 : 0} / ${totalSelected}`}</span>
        <button
          className="icon-btn"
          title={isGrid ? "Xem từng thẻ" : "Xem lưới tổng quan (đã thuộc / chưa thuộc)"}
          onClick={() => mutate({ viewMode: isGrid ? "card" : "grid" }, false)}
        >
          {isGrid ? "📇" : "⊞"}
        </button>
        <ExpandTabButton screenHash="vocab" />
      </header>

      <section className="level-selector">
        <label className="level-check level-check-all">
          <input
            type="checkbox"
            checked={allChecked}
            onChange={(e) => applySourceSelection(e.target.checked ? [...AVAILABLE_SOURCES] : state.selectedSources)}
          />
          Tất cả <span className="muted">({ALL_VOCAB.length})</span>
        </label>
        {AVAILABLE_SOURCES.map((source) => {
          const checked = state.selectedSources.includes(source);
          return (
            <label key={source} className="level-check">
              <input
                type="checkbox"
                checked={checked}
                onChange={(e) => {
                  const next = e.target.checked
                    ? [...new Set([...state.selectedSources, source])]
                    : state.selectedSources.filter((s) => s !== source);
                  applySourceSelection(next);
                }}
              />
              {SOURCE_LABELS[source]} <span className="muted">({countForSource(source)})</span>
            </label>
          );
        })}
        <label className="random-toggle">
          <input
            type="checkbox"
            checked={state.randomOrder}
            onChange={(e) => {
              const randomOrder = e.target.checked;
              mutate({ randomOrder, shuffleSeed: randomOrder ? Date.now() : state.shuffleSeed, index: 0 });
            }}
          />
          Hiển thị ngẫu nhiên
        </label>
      </section>

      <section className="progress-filter-row">
        <select
          value={state.progressFilter}
          onChange={(e) => mutate({ progressFilter: e.target.value as VocabViewerState["progressFilter"], index: 0 })}
        >
          <option value="all">Tất cả thẻ</option>
          <option value="unmastered">Chưa thuộc</option>
          <option value="flagged">Đã đánh dấu khó</option>
        </select>
      </section>

      {isGrid ? (
        bucketCounts && gridMap ? (
          <section className="reading-list-section">
            <div className="reading-list-summary">
              <span>
                Đã thuộc <strong>{bucketCounts.mastered}</strong> · Cần ôn lại <strong>{bucketCounts.flagged}</strong> · Đang học{" "}
                <strong>{bucketCounts.learning}</strong> · Chưa học <strong>{bucketCounts.new}</strong>
              </span>
            </div>
            {list.length === 0 ? (
              <p className="empty">Không có từ vựng nào ở bộ lọc này.</p>
            ) : (
              <div className="reading-tile-grid reading-tile-grid-word">
                {list.map((item, i) => {
                  const bucket = bucketFor(gridMap[item.id]);
                  return (
                    <button
                      key={item.id}
                      className={`reading-tile reading-tile-word ${BUCKET_TILE_CLASS[bucket]}`}
                      title={`${item.word} · ${BUCKET_LABEL[bucket]}`}
                      onClick={() => mutate({ index: i, viewMode: "card" }, false)}
                    >
                      {item.word}
                    </button>
                  );
                })}
              </div>
            )}
          </section>
        ) : null
      ) : !v ? (
        <p className="empty">Không có từ vựng nào ở bộ lọc này.</p>
      ) : (
        <main className={`card card-${bucketFor(progress ?? undefined)}`}>
          <div className="level-badge" data-level={v.level}>
            {v.level}
          </div>
          <button
            className={`flag-btn ${progress?.flagged ? "flagged" : ""}`}
            title={progress?.flagged ? "Bỏ đánh dấu khó" : "Đánh dấu khó, cần học lại"}
            onClick={async () => {
              await toggleFlag(v.id);
              await refreshProgress();
            }}
          >
            🚩
          </button>
          <button
            className={`mastered-badge ${progress?.mastered ? "mastered-on" : ""}`}
            title={progress?.mastered ? "Bỏ đánh dấu đã thuộc" : "Đánh dấu đã thuộc"}
            onClick={async () => {
              await toggleMastered(v.id);
              await refreshProgress();
            }}
          >
            {progress?.mastered ? "✓ Đã thuộc" : "Đánh dấu đã thuộc"}
          </button>
          <div className="vocab-source-tag">{SOURCE_LABELS[v.source]}</div>
          <div className="vocab-word">
            <WordWithKanjiLinks word={v.word} onOpenKanji={onOpenKanji} />
          </div>
          {v.reading ? <div className="vocab-reading">{v.reading}</div> : null}

          <dl className="details">
            {v.hanViet.length > 0 ? (
              <>
                <dt>Hán Việt</dt>
                <dd className="hanviet">{formatHanViet(v.hanViet)}</dd>
              </>
            ) : null}

            <dt>Nghĩa</dt>
            <dd>{v.meaningVi || "—"}</dd>

            {v.synonym ? (
              <>
                <dt>Đồng nghĩa</dt>
                <dd>
                  {v.synonym.word}
                  {v.synonym.reading ? ` (${v.synonym.reading})` : ""}
                </dd>
              </>
            ) : null}
          </dl>

          {v.mnemonic.length > 0 ? (
            <p className="mnemonic">
              <span className="mnemonic-label">Mẹo nhớ:</span> {v.mnemonic.join(" / ")}
            </p>
          ) : null}

          {v.example ? (
            <p className="example">
              <span className="example-jp">{v.example}</span>
              {v.exampleVi ? <span className="example-vi">{v.exampleVi}</span> : null}
            </p>
          ) : null}
        </main>
      )}

      {isGrid ? null : (
        <footer className="nav">
          <button disabled={state.index === 0} onClick={() => mutate({ index: state.index - 1 }, false)}>
            ← Trước
          </button>
          <button
            title="Nhảy tới 1 thẻ bất kỳ"
            onClick={() => {
              if (list.length === 0) return;
              mutate({ index: Math.floor(Math.random() * list.length) }, false);
            }}
          >
            🎲
          </button>
          <button disabled={state.index >= list.length - 1} onClick={() => mutate({ index: state.index + 1 }, false)}>
            Tiếp →
          </button>
        </footer>
      )}
    </>
  );
}
