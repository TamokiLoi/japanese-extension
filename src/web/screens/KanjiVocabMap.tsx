import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { BookOpen, ChevronLeft, ChevronRight, Focus, Search, X, ZoomIn, ZoomOut } from "lucide-react";
import { formatHanViet } from "../../hanVietFormat.ts";
import type { Kanji } from "../../types/kanji.ts";
import type { VocabCard } from "../../popup/vocabState.ts";
import "./kanji-vocab-map.css";

const PAGE_SIZE = 8;
const MIN_ZOOM = 0.8;
const MAX_ZOOM = 1.2;
const ZOOM_STEP = 0.1;

type Point = { x: number; y: number };
type Segment = { start: Point; end: Point };
type MapGeometry = { width: number; height: number; segments: Segment[] };
type Pan = { x: number; y: number };
type PanGesture = { pointerId: number; startX: number; startY: number; startPan: Pan; moved: boolean };
type VocabNodeGroup = { label: string; cards: VocabCard[] };
type MapPreview = { type: "word"; label: string } | { type: "center" } | null;

function rectCenter(rect: DOMRect): Point {
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

function rayRadius(rect: DOMRect, unit: Point, scale: number): number {
  const rx = rect.width / (2 * scale);
  const ry = rect.height / (2 * scale);
  if (!rx || !ry) return 0;
  return 1 / Math.sqrt((unit.x * unit.x) / (rx * rx) + (unit.y * unit.y) / (ry * ry));
}

function measureGeometry(canvas: HTMLDivElement, count: number, scale: number, pan: Pan): MapGeometry {
  const canvasRect = canvas.getBoundingClientRect();
  const centerShape = canvas.querySelector<HTMLElement>(".goi-map-center-circle");
  const centerRect = centerShape?.getBoundingClientRect();
  if (!centerRect || !canvasRect.width || !canvasRect.height) {
    return { width: canvasRect.width, height: canvasRect.height, segments: [] };
  }

  const toMapPoint = (point: Point): Point => ({
    x: (point.x - canvasRect.left - pan.x - canvasRect.width / 2) / scale + canvasRect.width / 2,
    y: (point.y - canvasRect.top - pan.y - canvasRect.height * 0.49) / scale + canvasRect.height * 0.49,
  });
  const center = toMapPoint(rectCenter(centerRect));
  const segments = Array.from({ length: count }, (_, index): Segment => {
    const shape = canvas.querySelector<HTMLElement>(`[data-map-index="${index}"] .goi-map-word-shape`);
    const nodeRect = shape?.getBoundingClientRect();
    if (!nodeRect) return { start: { x: 0, y: 0 }, end: { x: 0, y: 0 } };

    const node = toMapPoint(rectCenter(nodeRect));
    const dx = node.x - center.x;
    const dy = node.y - center.y;
    const distance = Math.hypot(dx, dy) || 1;
    const unit = { x: dx / distance, y: dy / distance };
    const sourceInset = rayRadius(centerRect, unit, scale);
    const targetInset = rayRadius(nodeRect, unit, scale);
    return {
      start: { x: center.x + unit.x * sourceInset, y: center.y + unit.y * sourceInset },
      end: { x: node.x - unit.x * targetInset, y: node.y - unit.y * targetInset },
    };
  });

  return { width: canvasRect.width, height: canvasRect.height, segments };
}

function normalize(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("vi");
}

function kanjiOnly(word: string): string {
  return [...word].filter((character) => /\p{Script=Han}/u.test(character)).join("");
}

function relatedWordTone(word: string, character: string): "prefix" | "suffix" | "middle" {
  if (word.startsWith(character)) return "prefix";
  if (word.endsWith(character)) return "suffix";
  return "middle";
}

function nodePoint(index: number, count: number): Point {
  const angle = -Math.PI / 2 + (Math.PI * 2 * index) / Math.max(count, 1);
  return { x: 50 + Math.cos(angle) * 35, y: 49 + Math.sin(angle) * 34 };
}

export function KanjiVocabMap({
  kanji,
  vocab,
  onOpenVocab,
}: {
  kanji: Kanji;
  vocab: VocabCard[];
  onOpenVocab: (vocabId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState<Pan>({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [isMobileLayout, setIsMobileLayout] = useState(() => typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches);
  const [selection, setSelection] = useState<MapPreview>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const zoomRef = useRef(1);
  const panRef = useRef<Pan>({ x: 0, y: 0 });
  const panGestureRef = useRef<PanGesture | null>(null);
  const [geometry, setGeometry] = useState<MapGeometry>({ width: 0, height: 0, segments: [] });
  const updateZoom = (nextZoom: number) => {
    const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Number(nextZoom.toFixed(2))));
    zoomRef.current = next;
    setZoom(next);
  };
  const updatePan = (next: Pan) => {
    panRef.current = next;
    setPan(next);
  };
  const resetMapView = () => {
    updateZoom(1);
    updatePan({ x: 0, y: 0 });
  };
  const handleCanvasPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    if (panGestureRef.current) return;
    if (!(event.target instanceof Element) || event.target.closest("button, .goi-map-center, .goi-map-zoom-controls")) return;
    panGestureRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startPan: panRef.current,
      moved: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const handleCanvasPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const gesture = panGestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    const dx = event.clientX - gesture.startX;
    const dy = event.clientY - gesture.startY;
    if (!gesture.moved && Math.hypot(dx, dy) < 4) return;
    gesture.moved = true;
    setIsPanning(true);
    updatePan({ x: gesture.startPan.x + dx, y: gesture.startPan.y + dy });
  };
  const handleCanvasPointerEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (panGestureRef.current?.pointerId !== event.pointerId) return;
    panGestureRef.current = null;
    setIsPanning(false);
  };
  const groups = useMemo(() => {
    const byLabel = new Map<string, VocabCard[]>();
    for (const card of vocab) {
      const label = kanjiOnly(card.word);
      if (!label) continue;
      const cards = byLabel.get(label);
      if (cards) cards.push(card);
      else byLabel.set(label, [card]);
    }
    return [...byLabel].map(([label, cards]) => ({ label, cards }));
  }, [vocab]);
  const filtered = useMemo(() => {
    const needle = normalize(query.trim());
    if (!needle) return groups;
    return groups.filter((group) => group.cards.some((card) =>
      [card.word, card.reading ?? "", card.meaningVi, ...card.hanViet].some((value) => normalize(value).includes(needle)),
    ));
  }, [groups, query]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const visibleWords = useMemo(
    () => filtered.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE),
    [filtered, currentPage],
  );
  const firstItem = filtered.length ? currentPage * PAGE_SIZE + 1 : 0;
  const lastItem = Math.min((currentPage + 1) * PAGE_SIZE, filtered.length);
  const useEllipses = groups.length > PAGE_SIZE;

  useEffect(() => {
    setPage(0);
    setSelection(null);
  }, [kanji.character, query]);

  useEffect(() => {
    zoomRef.current = 1;
    panRef.current = { x: 0, y: 0 };
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, [kanji.character]);

  useEffect(() => {
    setSelection(null);
  }, [currentPage]);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 767px)");
    const update = () => setIsMobileLayout(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (!selection) return;
    const dismissOnOutsideTap = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (previewRef.current?.contains(target)) return;
      if (target.closest(".goi-map-word-node, .goi-map-center, .goi-map-zoom-controls")) return;
      setSelection(null);
    };
    document.addEventListener("pointerdown", dismissOnOutsideTap);
    return () => document.removeEventListener("pointerdown", dismissOnOutsideTap);
  }, [selection]);

  useEffect(() => {
    if (!isMobileLayout || !selection) return;
    const frame = window.requestAnimationFrame(() => {
      const rect = previewRef.current?.getBoundingClientRect();
      const safeBottom = window.innerHeight - 72;
      if (rect && rect.bottom > safeBottom) {
        window.scrollBy({ top: rect.bottom - safeBottom + 8, behavior: "smooth" });
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [isMobileLayout, selection]);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      setGeometry({ width: 0, height: 0, segments: [] });
      return;
    }

    const update = () => {
      const next = measureGeometry(canvas, visibleWords.length, zoomRef.current, panRef.current);
      setGeometry((previous) => {
        const sameSize = Math.abs(previous.width - next.width) < 0.1 && Math.abs(previous.height - next.height) < 0.1;
        const sameSegments = previous.segments.length === next.segments.length && previous.segments.every((segment, index) =>
          Math.abs(segment.start.x - next.segments[index].start.x) < 0.1
          && Math.abs(segment.start.y - next.segments[index].start.y) < 0.1
          && Math.abs(segment.end.x - next.segments[index].end.x) < 0.1
          && Math.abs(segment.end.y - next.segments[index].end.y) < 0.1,
        );
        return sameSize && sameSegments ? previous : next;
      });
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(canvas);
    window.addEventListener("resize", update);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [kanji.character, visibleWords]);

  const centerMeaning = kanji.meanings.vi[0] || kanji.meanings.viDraft?.[0] || "";
  const previewGroup = selection?.type === "word" ? visibleWords.find((group) => group.label === selection.label) : undefined;
  const previewTone = previewGroup ? relatedWordTone(previewGroup.label, kanji.character) : "center";
  const selectWordGroup = (group: VocabNodeGroup) => {
    if (!isMobileLayout && group.cards.length === 1) {
      onOpenVocab(group.cards[0].id);
      return;
    }
    setSelection((current) => current?.type === "word" && current.label === group.label
      ? null
      : { type: "word", label: group.label });
  };

  return (
    <section className="goi-map-panel" aria-label={`Từ vựng có chữ ${kanji.character}`}>
      <div className="goi-map-toolbar">
        <div>
          <strong>Từ vựng có chữ {kanji.character}</strong>
          <span>{query.trim() ? `${filtered.length} / ${groups.length} nhóm` : `${groups.length} nhóm · ${vocab.length} thẻ`}</span>
        </div>
        <label className="goi-map-search">
          <Search size={16} aria-hidden="true" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Tìm từ, cách đọc hoặc nghĩa…"
            aria-label={`Tìm từ vựng có chữ ${kanji.character}`}
          />
        </label>
      </div>

      {visibleWords.length ? (
        <>
        <div
          ref={canvasRef}
          className={`goi-map-canvas${isPanning ? " is-panning" : ""}`}
          aria-label="Sơ đồ từ vựng; kéo nền để di chuyển, chọn một nút để xem từ"
          onPointerDown={handleCanvasPointerDown}
          onPointerMove={handleCanvasPointerMove}
          onPointerUp={handleCanvasPointerEnd}
          onPointerCancel={handleCanvasPointerEnd}
        >
          <div className="goi-map-graph" style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}>
          <svg className="goi-map-connections" viewBox={`0 0 ${Math.max(geometry.width, 1)} ${Math.max(geometry.height, 1)}`} aria-hidden="true">
            {visibleWords.map((word, index) => {
              const tone = relatedWordTone(word.label, kanji.character);
              const segment = geometry.segments[index];
              if (!segment) return null;
              return (
                <g key={word.label}>
                  <line x1={segment.start.x} y1={segment.start.y} x2={segment.end.x} y2={segment.end.y} className={`goi-map-line is-${tone}`} />
                  <circle cx={segment.start.x} cy={segment.start.y} r="2.8" className={`goi-map-flow-dot is-${tone}`}>
                    <animateMotion
                      dur={`${2.5 + (index % 4) * 0.35}s`}
                      begin={`${index * 0.16}s`}
                      repeatCount="indefinite"
                      path={`M 0 0 L ${segment.end.x - segment.start.x} ${segment.end.y - segment.start.y}`}
                    />
                  </circle>
                </g>
              );
            })}
          </svg>

          <div
            className="goi-map-center"
            style={{ left: "50%", top: "49%" }}
            role={isMobileLayout ? "button" : "img"}
            aria-label={`${kanji.character}, ${formatHanViet(kanji.hanViet, "Chưa có Hán Việt")}, ${centerMeaning || "Chưa có nghĩa"}`}
            aria-expanded={isMobileLayout ? selection?.type === "center" : undefined}
            tabIndex={0}
            onClick={() => {
              if (isMobileLayout) setSelection((current) => current?.type === "center" ? null : { type: "center" });
            }}
            onKeyDown={(event) => {
              if (isMobileLayout && (event.key === "Enter" || event.key === " ")) {
                event.preventDefault();
                setSelection((current) => current?.type === "center" ? null : { type: "center" });
              }
            }}
          >
            <span className="goi-map-center-circle">{kanji.character}</span>
            <span className="goi-map-center-tooltip" role="tooltip">
              <strong>{formatHanViet(kanji.hanViet, "Chưa có Hán Việt")}</strong>
              <span>{kanji.readings.on[0] || kanji.readings.kun[0] || "Chưa có cách đọc"}</span>
              <small>{centerMeaning || "Chưa có nghĩa"}</small>
            </span>
          </div>

          {visibleWords.map((word, index) => {
            const point = nodePoint(index, visibleWords.length);
            const tone = relatedWordTone(word.label, kanji.character);
            const length = [...word.label].length;
            const tooltipPlacement = point.y < 24
              ? point.x > 40 && point.x < 60 ? "tooltip-side" : "tooltip-below"
              : point.x < 28 ? "tooltip-right" : point.x > 72 ? "tooltip-left" : "";
            const isSelected = selection?.type === "word" && selection.label === word.label;
            const accessibleLabel = word.cards.length === 1
              ? `${word.cards[0].word}: ${word.cards[0].reading || "Chưa có cách đọc"}`
              : `${word.label}: ${word.cards.length} dạng từ, chạm để xem`;
            return (
              <button
                key={word.label}
                type="button"
                data-map-index={index}
                className={`goi-map-word-node is-${tone}${useEllipses ? " is-many" : " is-few"} ${tooltipPlacement}`}
                style={{ left: `${point.x}%`, top: `${point.y}%` }}
                onClick={() => selectWordGroup(word)}
                aria-expanded={isMobileLayout || word.cards.length > 1 ? isSelected : undefined}
                aria-label={accessibleLabel}
              >
                <span className={`goi-map-word-shape length-${Math.min(length, 4)}`} style={{ animationDelay: `${index * 0.18}s` }}>
                  <strong>{word.label}</strong>
                </span>
                <span className="goi-map-tooltip" aria-hidden="true">
                  {word.cards.map((card) => (
                    <span className="goi-map-tooltip-entry" key={card.id}>
                      <strong>{card.word}</strong>
                      <span>{card.reading || "Chưa có cách đọc"} · {formatHanViet(card.hanViet, "Chưa có Hán Việt")}</span>
                      <small>{card.meaningVi.split(/[;；。]/)[0]?.trim() || "Chưa có nghĩa"}</small>
                    </span>
                  ))}
                </span>
              </button>
            );
          })}
          </div>
          <div className="goi-map-zoom-controls" role="group" aria-label="Điều khiển sơ đồ">
            <button type="button" aria-label="Thu nhỏ sơ đồ" title="Thu nhỏ" disabled={zoom <= MIN_ZOOM} onClick={() => updateZoom(zoom - ZOOM_STEP)}>
              <ZoomOut size={14} />
            </button>
            <button type="button" aria-label="Phóng to sơ đồ" title="Phóng to" disabled={zoom >= MAX_ZOOM} onClick={() => updateZoom(zoom + ZOOM_STEP)}>
              <ZoomIn size={14} />
            </button>
            <button type="button" className="goi-map-center-control" aria-label="Căn giữa sơ đồ" title="Căn giữa" onClick={resetMapView}>
              <Focus size={14} /> Căn giữa
            </button>
          </div>
        </div>
        {selection && (
          <div
            ref={previewRef}
            className={`goi-map-selection-preview is-${previewTone}`}
            role="group"
            aria-label={selection.type === "center" ? `Thông tin Kanji ${kanji.character}` : `Các mục từ có nhãn ${previewGroup?.label || selection.label}`}
            aria-live="polite"
          >
            {selection.type === "center" ? (
              <div className="goi-map-selection-main">
                <div className="goi-map-selection-copy is-center">
                  <strong>{formatHanViet(kanji.hanViet, "Chưa có Hán Việt")}</strong>
                  <span>{kanji.readings.on[0] || kanji.readings.kun[0] || "Chưa có cách đọc"}</span>
                  <small>{centerMeaning || "Chưa có nghĩa"}</small>
                </div>
              </div>
            ) : previewGroup ? (
              <div className="goi-map-selection-main">
                <div className="goi-map-selection-heading">
                  <strong>{previewGroup.label}</strong>
                  <span>{previewGroup.cards.length} thẻ từ · chọn thẻ để mở</span>
                </div>
                <div className="goi-map-selection-list">
                  {previewGroup.cards.map((card) => (
                    <div className="goi-map-selection-entry" key={card.id}>
                      <div className="goi-map-selection-copy">
                        <strong>{card.word}</strong>
                        <span>{card.reading || "Chưa có cách đọc"} · {formatHanViet(card.hanViet, "Chưa có Hán Việt")}</span>
                        <small>{card.meaningVi.split(/[;；。]/)[0]?.trim() || "Chưa có nghĩa"}</small>
                      </div>
                      <button
                        className="goi-map-entry-open"
                        type="button"
                        aria-label={"Mở thẻ " + card.word}
                        onClick={() => onOpenVocab(card.id)}
                      >
                        <BookOpen size={15} aria-hidden="true" />
                        Mở thẻ
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
            <button className="goi-map-selection-close" type="button" aria-label="Đóng thông tin" onClick={() => setSelection(null)}>
              <X size={15} aria-hidden="true" />
            </button>
          </div>
        )}
        </>
      ) : (
        <div className="goi-map-empty">{vocab.length ? "Không tìm thấy từ phù hợp." : `Chưa có từ vựng có chữ ${kanji.character} trong dữ liệu.`}</div>
      )}

      <div className="goi-map-pager">
        <span>{firstItem}–{lastItem} / {filtered.length} nhóm</span>
        <div>
          <button type="button" aria-label="Trang trước" disabled={currentPage === 0} onClick={() => setPage((value) => Math.max(0, value - 1))}>
            <ChevronLeft size={16} />
          </button>
          <button type="button" aria-label="Trang sau" disabled={currentPage + 1 >= pageCount} onClick={() => setPage((value) => Math.min(pageCount - 1, value + 1))}>
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
      <div className="goi-map-legend" aria-label="Màu vị trí Kanji trong từ">
        <span><i className="is-center" /> Kanji gốc</span>
        <span><i className="is-prefix" /> Kanji ở đầu</span>
        <span><i className="is-middle" /> Kanji ở giữa</span>
        <span><i className="is-suffix" /> Kanji ở cuối</span>
        {isMobileLayout ? <span className="goi-map-gesture-hint">Kéo nền để di chuyển · dùng nút để phóng to</span> : null}
      </div>
    </section>
  );
}
