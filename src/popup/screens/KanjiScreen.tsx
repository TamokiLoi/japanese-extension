import { useEffect, useState } from "react";
import type { Kanji } from "../../types/kanji.ts";
import {
  ALL_KANJI,
  AVAILABLE_LEVELS,
  countForLevel,
  getOrderedList,
  loadViewerState,
  saveViewerState,
  resolveJumpState,
  type KanjiViewerState,
} from "../kanjiState.ts";
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
import { LevelDot } from "../LevelDot.tsx";
import { vocabForKanjiChar } from "../kanjiVocabLinks.ts";
import { formatHanViet } from "../../hanVietFormat.ts";

function meaningLine(k: Kanji): { text: string; isDraft: boolean } {
  if (k.meanings.vi.length > 0) {
    return { text: k.meanings.vi.join(", "), isDraft: false };
  }
  if (k.meanings.viDraft && k.meanings.viDraft.length > 0) {
    return { text: k.meanings.viDraft.join(", "), isDraft: true };
  }
  return { text: "(chưa có nghĩa tiếng Việt)", isDraft: false };
}

async function getFilteredList(state: KanjiViewerState): Promise<Kanji[]> {
  const map = await loadProgressMap();
  return filterByProgress(getOrderedList(state), map, state.progressFilter);
}

export function KanjiScreen({
  onBack,
  onOpenVocab,
  jumpToId,
}: {
  onBack: () => void;
  onOpenVocab: (vocabId: string) => void;
  jumpToId?: string;
}) {
  const [state, setState] = useState<KanjiViewerState | null>(null);
  const [list, setList] = useState<Kanji[]>([]);
  const [progress, setProgress] = useState<ItemProgress | null>(null);
  const [gridMap, setGridMap] = useState<ProgressMap | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let s = await loadViewerState();
      let l: Kanji[];
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
    const k = list[state.index];
    if (state.viewMode === "grid") {
      loadProgressMap().then((m) => {
        if (!cancelled) setGridMap(m);
      });
      setProgress(null);
    } else if (k) {
      getProgress(k.id).then((p) => {
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

  async function mutate(partial: Partial<KanjiViewerState>, recomputeList = true) {
    if (!state) return;
    const next: KanjiViewerState = { ...state, ...partial };
    await saveViewerState(next);
    const newList = recomputeList ? await getFilteredList(next) : list;
    setState(next);
    setList(newList);
  }

  async function applyLevelSelection(newLevels: (typeof AVAILABLE_LEVELS)[number][]) {
    // Never allow an empty selection -- simply skip the mutation so the
    // controlled checkboxes stay reflecting the previous (valid) state.
    if (newLevels.length === 0) return;
    await mutate({ selectedLevels: newLevels, index: 0 });
  }

  async function refreshProgress() {
    const k = list[state!.index];
    if (!k) return;
    const p = await getProgress(k.id);
    setProgress(p);
  }

  if (!state) {
    return (
      <header className="toolbar">
        <button className="icon-btn" title="Về menu" onClick={onBack}>
          ←
        </button>
        <span className="counter" />
        <ExpandTabButton screenHash="kanji" />
      </header>
    );
  }

  const k = list[state.index];
  const totalSelected = list.length;
  const isGrid = state.viewMode === "grid";
  const bucketCounts = gridMap ? countBuckets(list, gridMap) : null;
  const allChecked = state.selectedLevels.length === AVAILABLE_LEVELS.length;
  const related = k ? vocabForKanjiChar(k.character) : null;

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
        <ExpandTabButton screenHash="kanji" />
      </header>

      <section className="level-selector">
        <label className="level-check level-check-all">
          <input
            type="checkbox"
            checked={allChecked}
            onChange={(e) => applyLevelSelection(e.target.checked ? [...AVAILABLE_LEVELS] : state.selectedLevels)}
          />
          Tất cả <span className="muted">({ALL_KANJI.length})</span>
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
          onChange={(e) => mutate({ progressFilter: e.target.value as KanjiViewerState["progressFilter"], index: 0 })}
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
              <p className="empty">Không có Kanji nào ở bộ lọc này.</p>
            ) : (
              <div className="reading-tile-grid">
                {list.map((item, i) => {
                  const bucket = bucketFor(gridMap[item.id]);
                  return (
                    <button
                      key={item.id}
                      className={`reading-tile ${BUCKET_TILE_CLASS[bucket]}`}
                      title={`${item.character} · ${BUCKET_LABEL[bucket]}`}
                      onClick={() => mutate({ index: i, viewMode: "card" }, false)}
                    >
                      {item.character}
                    </button>
                  );
                })}
              </div>
            )}
          </section>
        ) : null
      ) : !k ? (
        <p className="empty">Không có Kanji nào ở bộ lọc này.</p>
      ) : (
        <main className={`card card-${bucketFor(progress ?? undefined)}`}>
          <div className="level-badge" data-level={k.level}>
            {k.level}
          </div>
          <button
            className={`flag-btn ${progress?.flagged ? "flagged" : ""}`}
            title={progress?.flagged ? "Bỏ đánh dấu khó" : "Đánh dấu khó, cần học lại"}
            onClick={async () => {
              await toggleFlag(k.id);
              await refreshProgress();
            }}
          >
            🚩
          </button>
          <button
            className={`mastered-badge ${progress?.mastered ? "mastered-on" : ""}`}
            title={progress?.mastered ? "Bỏ đánh dấu đã thuộc" : "Đánh dấu đã thuộc"}
            onClick={async () => {
              await toggleMastered(k.id);
              await refreshProgress();
            }}
          >
            {progress?.mastered ? "✓ Đã thuộc" : "Đánh dấu đã thuộc"}
          </button>
          <div className="character">{k.character}</div>

          <dl className="details">
            <dt>Hán Việt</dt>
            <dd className="hanviet">{formatHanViet(k.hanViet)}</dd>

            <dt>Âm On</dt>
            <dd>{k.readings.on.length > 0 ? k.readings.on.join("、") : "—"}</dd>

            <dt>Âm Kun</dt>
            <dd>{k.readings.kun.length > 0 ? k.readings.kun.join("、") : "—"}</dd>

            <dt>Nghĩa</dt>
            <dd>
              {meaningLine(k).text}
              {meaningLine(k).isDraft ? (
                <span className="draft-tag" title="Dịch bằng AI, chưa được kiểm duyệt">
                  nháp AI
                </span>
              ) : null}
            </dd>

            <dt>English</dt>
            <dd className="muted">{k.meanings.en.join(", ") || "—"}</dd>

            <dt>Bộ thủ</dt>
            <dd>{k.radical?.character ? `${k.radical.character}${k.radical.raw ? ` (bộ ${k.radical.raw})` : ""}` : "—"}</dd>

            <dt>Số nét</dt>
            <dd>{k.strokeCount ?? "—"}</dd>
          </dl>

          {k.mnemonic ? (
            <p className="mnemonic">
              <span className="mnemonic-label">Mẹo nhớ:</span> {k.mnemonic}
            </p>
          ) : null}

          {related && related.shown.length > 0 ? (
            <div className="related-vocab">
              <div className="related-vocab-label">
                Từ vựng chứa chữ này{related.total > related.shown.length ? ` (${related.total})` : ""}
              </div>
              <div className="related-vocab-list">
                {related.shown.map((v) => (
                  <button key={v.id} className="related-vocab-item" onClick={() => onOpenVocab(v.id)}>
                    {v.word}
                    {v.reading ? <span className="muted"> {v.reading}</span> : null}
                  </button>
                ))}
              </div>
            </div>
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
