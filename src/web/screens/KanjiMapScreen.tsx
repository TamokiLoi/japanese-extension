import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import {
  Background,
  Controls,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
  type ReactFlowInstance,
} from "@xyflow/react";
import { ArrowLeft, ArrowRight, BookOpen, ChevronDown, ChevronRight, Focus, Search, X, ZoomIn, ZoomOut } from "lucide-react";
import graphRaw from "../../data/kanji-map-components.json";
import { ALL_KANJI } from "../../popup/kanjiState.ts";
import { vocabForKanjiChar } from "../../popup/kanjiVocabLinks.ts";
import { formatHanViet } from "../../hanVietFormat.ts";
import type { Kanji, JlptLevel } from "../../types/kanji.ts";
import { Button } from "../components/ui/button.tsx";
import { PageHeader } from "../components/PageHeader.tsx";
import { KanjiMnemonicChoice } from "../components/KanjiMnemonicChoice.tsx";
import "./kanji-map.css";

type ComponentRecord = {
  character: string;
  canonical: string;
  position: string | null;
  variant: boolean;
  partial: boolean;
  count: number;
};
type GraphRecord = { components: ComponentRecord[]; radicalFallback: string | null };
type GraphDataset = { meta: { recordCount: number; recordsWithComponents: number; recordsUsingRadicalFallback: number; recordsWithoutDecomposition: number; componentRecordCount?: number }; kanji: Record<string, GraphRecord>; components?: Record<string, GraphRecord> };
type MapNodeRole = "center" | "component" | "compound";
type MapNodeData = {
  role: MapNodeRole;
  tone: "app" | "b1" | "b2" | "b3";
  character: string;
  hanViet: string;
  meaning: string;
  selectable: boolean;
  tooltip: string[];
  nodeKey: string;
  expanded?: boolean;
  canExpand?: boolean;
  hasTarget?: boolean;
  onSelect: () => void;
  onExpand?: () => void;
};
type KanjiMapNodeType = Node<MapNodeData, "kanjiMapNode">;
type KanjiMapFlowInstance = ReactFlowInstance<KanjiMapNodeType, Edge>;
type MapPart = ComponentRecord & { target: string | null; graphKey: string | null; fromRadical?: boolean };
type VisiblePart = { part: MapPart; path: string; parentKey: string; parentCharacter: string; depth: number; canExpand: boolean };

const graph = graphRaw as unknown as GraphDataset;
const CHARACTER_MAP = new Map(ALL_KANJI.map((kanji) => [kanji.character, kanji]));
const JLPT_ORDER: JlptLevel[] = ["N5", "N4", "N3", "N2", "N1"];
const nodeTypes = { kanjiMapNode: KanjiMapNode };
const KanjiBookResources = lazy(() => import("../components/KanjiBookResources.tsx").then((module) => ({ default: module.KanjiBookResources })));

function shortMeaning(kanji: Kanji): string {
  return kanji.meanings.vi[0] || kanji.meanings.viDraft?.[0] || formatHanViet(kanji.hanViet, "Kanji");
}

function kanjiNodeLabels(kanji: Kanji): { hanViet: string; meaning: string } {
  const meaning = shortMeaning(kanji);
  const hanViet = formatHanViet(kanji.hanViet, meaning);
  return { hanViet, meaning: normalize(hanViet) === normalize(meaning) ? "" : meaning };
}

function componentLabels(part: MapPart, selected: Kanji): { hanViet: string; meaning: string } {
  const kanji = part.target ? CHARACTER_MAP.get(part.target) : undefined;
  if (kanji) return kanjiNodeLabels(kanji);
  const radical = selected.radical;
  const isRadical = !!radical && (radical.character === part.character || radical.character === part.canonical);
  if (isRadical) {
    const radicalCard = CHARACTER_MAP.get(radical.character);
    if (radicalCard) return { hanViet: `Bộ ${formatHanViet(radicalCard.hanViet, "thủ")}`, meaning: shortMeaning(radicalCard) };
    if (radical.meaningVi) return { hanViet: radical.meaningVi, meaning: "Bộ thủ" };
    return { hanViet: "Bộ thủ", meaning: `Số ${radical.raw}` };
  }
  if (part.fromRadical) return { hanViet: "Bộ thủ", meaning: selected.radical?.raw ? `Số ${selected.radical.raw}` : "" };
  return { hanViet: "Thành phần", meaning: "" };
}

function normalize(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function mapPartsFor(character: string): MapPart[] {
  const record = graph.kanji[character] ?? graph.components?.[character] ?? { components: [], radicalFallback: null };
  const components = record.components.map((part) => {
    const graphKey = graph.kanji[part.canonical]
      ? part.canonical
      : graph.components?.[part.canonical]
        ? part.canonical
        : graph.kanji[part.character] || graph.components?.[part.character]
          ? part.character
          : null;
    return { ...part, target: CHARACTER_MAP.has(part.canonical) ? part.canonical : CHARACTER_MAP.has(part.character) ? part.character : null, graphKey };
  });
  if (components.length) return components;
  const fallback = record.radicalFallback;
  if (!fallback) return [];
  return [{ character: fallback, canonical: fallback, position: null, variant: false, partial: false, count: 1, target: CHARACTER_MAP.has(fallback) ? fallback : null, graphKey: graph.kanji[fallback] || graph.components?.[fallback] ? fallback : null, fromRadical: true }];
}

function tooltipFor(part: MapPart, owner: Kanji): string[] {
  const target = part.target ? CHARACTER_MAP.get(part.target) : undefined;
  const radical = owner.radical && (owner.radical.character === part.character || owner.radical.character === part.canonical)
    ? owner.radical
    : undefined;
  if (!target) {
      const nested = part.graphKey ? graph.kanji[part.graphKey] ?? graph.components?.[part.graphKey] : undefined;
    const lines = [part.character];
    if (radical) lines.push(`Bộ thủ · số ${radical.raw}`);
    else if (part.fromRadical) lines.push(`Bộ thủ · số ${owner.radical?.raw ?? "—"}`);
    else lines.push("Mảnh cấu tạo · chưa có thẻ Kanji");
    if (nested?.components.length) lines.push(`KanjiVG · ${nested.components.length} thành phần · có thể mở tiếp`);
    if (part.variant) lines.push("Dạng hiển thị biến thể");
    return lines;
  }
  const lines = [`${target.character} · ${formatHanViet(target.hanViet, "Chưa có Hán Việt")}`];
  const meaning = shortMeaning(target);
  if (meaning && normalize(meaning) !== normalize(formatHanViet(target.hanViet, ""))) lines.push(meaning);
  const reading = target.readings.on[0] || target.readings.kun[0];
  if (reading) lines.push(reading);
  if (radical) lines.push(`Bộ thủ · số ${radical.raw}`);
  if (part.variant) lines.push("Dạng biến thể trong thành phần");
  else if (part.partial) lines.push("Thành phần chỉ hiển thị một phần");
  return lines;
}

function buildVisibleParts(root: string, expandedPaths: Set<string>, maxDepth = 3, maxNodes = 30): VisiblePart[] {
  const result: VisiblePart[] = [];
  const visit = (parentCharacter: string, parentKey: string, prefix: string, depth: number, ancestry: Set<string>) => {
    if (depth >= maxDepth || result.length >= maxNodes) return;
    const parts = mapPartsFor(parentCharacter);
    parts.forEach((part, index) => {
      if (result.length >= maxNodes) return;
      const segment = `${index}-${part.canonical}-${part.character}`;
      const path = prefix ? `${prefix}/${segment}` : segment;
      const cycle = !!part.target && ancestry.has(part.target);
      const canExpand = !!part.graphKey && !cycle && mapPartsFor(part.graphKey).length > 0 && depth + 1 < maxDepth;
      result.push({ part, path, parentKey, parentCharacter, depth, canExpand });
      if (!canExpand || cycle || !expandedPaths.has(path)) return;
      const nextAncestry = new Set(ancestry);
      nextAncestry.add(part.graphKey!);
      visit(part.graphKey!, `part-${path}`, path, depth + 1, nextAncestry);
    });
  };
  visit(root, `center-${root}`, "", 0, new Set([root]));
  return result;
}

function KanjiMapNode({ data }: NodeProps<KanjiMapNodeType>) {
  const isCenter = data.role === "center";
  const tooltipId = `kanji-map-tip-${data.nodeKey.replace(/[^a-z0-9_-]/gi, "-")}`;
  return (
    <div className={`kanji-map-flow-node ${isCenter ? "is-center" : `is-${data.role}`} tone-${data.tone}${data.selectable ? "" : " is-muted"}${data.canExpand ? " has-expander" : ""}${data.hasTarget ? " has-target" : ""}`}>
      {data.role !== "component" || data.hasTarget ? <Handle id="left" type="target" position={Position.Left} isConnectable={false} /> : null}
      <button type="button" onClick={data.onSelect} aria-disabled={!data.selectable} aria-label={`${data.character}: ${data.hanViet}${data.meaning ? `, ${data.meaning}` : ""}`} aria-describedby={tooltipId}>
        <span className="kanji-map-node-orb"><strong>{data.character}</strong></span>
        <span className="kanji-map-node-label">{data.hanViet}</span>
        {isCenter && data.meaning ? <small>{data.meaning}</small> : null}
      </button>
      {data.canExpand ? (
        <button type="button" className="kanji-map-node-expand" aria-label={`${data.expanded ? "Thu gọn" : "Mở"} cấu tạo của ${data.character}`} aria-expanded={!!data.expanded} onClick={(event) => { event.stopPropagation(); data.onExpand?.(); }}>
          {data.expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        </button>
      ) : null}
      <div className="kanji-map-node-tooltip" id={tooltipId} role="tooltip">
        {data.tooltip.map((line, index) => index === 0 ? <strong key={line}>{line}</strong> : <span key={`${line}-${index}`}>{line}</span>)}
      </div>
      {data.role !== "compound" ? <Handle id="right" type="source" position={Position.Right} isConnectable={false} /> : null}
    </div>
  );
}

function useSmallScreen() {
  const [smallScreen, setSmallScreen] = useState(() => typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 767px)");
    const update = () => setSmallScreen(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  return smallScreen;
}

export function KanjiMapScreen({
  initialCharacter,
  onBackToCards,
  onSelectCharacter,
  onOpenVocab,
}: {
  initialCharacter?: string;
  onBackToCards: () => void;
  onSelectCharacter: (character: string) => void;
  onOpenVocab: (vocabId: string) => void;
}) {
  const smallScreen = useSmallScreen();
  const resolveCharacter = useCallback((value?: string) => {
    if (!value) return undefined;
    const direct = CHARACTER_MAP.get(value);
    if (direct) return direct.character;
    return ALL_KANJI.find((kanji) => kanji.id === value)?.character;
  }, []);
  const [selectedCharacter, setSelectedCharacter] = useState(() => resolveCharacter(initialCharacter) ?? "人");
  const [query, setQuery] = useState("");
  const [level, setLevel] = useState<JlptLevel | "All">("All");
  const [compoundPage, setCompoundPage] = useState(0);
  const [flowInstance, setFlowInstance] = useState<KanjiMapFlowInstance | null>(null);
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    const next = resolveCharacter(initialCharacter);
    if (next) {
      setSelectedCharacter(next);
      setExpandedPaths(new Set());
    }
  }, [initialCharacter, resolveCharacter]);

  const selected = CHARACTER_MAP.get(selectedCharacter) ?? ALL_KANJI[0]!;
  const selectedGraph = graph.kanji[selected.character] ?? { components: [], radicalFallback: null };
  const visibleParts = useMemo(() => buildVisibleParts(selected.character, expandedPaths), [expandedPaths, selected.character]);
  const componentRecords = selectedGraph.components.map((part) => ({
    ...part,
    target: CHARACTER_MAP.has(part.canonical) ? part.canonical : CHARACTER_MAP.has(part.character) ? part.character : null,
  }));
  const parts: MapPart[] = componentRecords.length > 0
    ? componentRecords
    : selectedGraph.radicalFallback
      ? [{ character: selectedGraph.radicalFallback, canonical: selectedGraph.radicalFallback, position: null, variant: false, partial: false, count: 1, target: CHARACTER_MAP.has(selectedGraph.radicalFallback) ? selectedGraph.radicalFallback : null, fromRadical: true }]
      : [];

  const relationships = useMemo(() => {
    const compounds: Kanji[] = [];
    for (const candidate of ALL_KANJI) {
      if (graph.kanji[candidate.character]?.components.some((part) => part.canonical === selected.character || part.character === selected.character)) {
        compounds.push(candidate);
      }
    }
    return compounds;
  }, [selected.character]);
  const vocab = vocabForKanjiChar(selected.character);

  const searchResults = useMemo(() => {
    const trimmed = query.trim();
    if (!trimmed) return [];
    const needle = normalize(trimmed);
    return ALL_KANJI.filter((kanji) => {
      if (level !== "All" && kanji.level !== level) return false;
      return normalize(`${kanji.character} ${formatHanViet(kanji.hanViet)} ${kanji.meanings.vi.join(" ")} ${kanji.meanings.viDraft?.join(" ") ?? ""} ${kanji.meanings.en.join(" ")}`).includes(needle);
    }).slice(0, 9);
  }, [level, query]);

  const chooseCharacter = useCallback((character: string) => {
    const next = CHARACTER_MAP.get(character);
    if (!next) return;
    setSelectedCharacter(character);
    setQuery("");
    setCompoundPage(0);
    setExpandedPaths(new Set());
    onSelectCharacter(character);
  }, [onSelectCharacter]);

  const nodes = useMemo<KanjiMapNodeType[]>(() => {
    const currentCompounds = relationships.slice(compoundPage * 7, compoundPage * 7 + 7);
    const nodesByDepth = new Map<number, VisiblePart[]>();
    for (const item of visibleParts) {
      const group = nodesByDepth.get(item.depth) ?? [];
      group.push(item);
      nodesByDepth.set(item.depth, group);
    }
    const yFor = (item: VisiblePart) => {
      const group = nodesByDepth.get(item.depth) ?? [];
      const index = group.indexOf(item);
      return smallScreen
        ? 214 + (index - (group.length - 1) / 2) * 68
        : 250 + (index - (group.length - 1) / 2) * 92;
    };
    const compoundY = (i: number, count: number) => smallScreen
      ? 214 + (i - (count - 1) / 2) * 68
      : 220 + (i - (count - 1) / 2) * 90;
    const selectedTooltip = [`${selected.character} · ${formatHanViet(selected.hanViet, "Chưa có Hán Việt")}`, shortMeaning(selected), selected.readings.on[0] || selected.readings.kun[0] || ""] .filter(Boolean);
    const nextNodes: KanjiMapNodeType[] = [
      {
        id: `center-${selected.character}`,
        type: "kanjiMapNode",
        position: { x: smallScreen ? 128 : 282, y: smallScreen ? 188 : 202 },
        data: { role: "center", tone: "app", character: selected.character, ...kanjiNodeLabels(selected), selectable: true, tooltip: selectedTooltip, nodeKey: `center-${selected.character}`, onSelect: () => onBackToCards() },
      },
    ];
    visibleParts.forEach((item) => {
      const { part, path, parentKey, parentCharacter, depth, canExpand } = item;
      const owner = CHARACTER_MAP.get(parentCharacter) ?? selected;
      const targetId = part.target ? `part-${path}` : "";
      nextNodes.push({
        id: targetId || `part-${path}`,
        type: "kanjiMapNode",
        position: { x: (smallScreen ? 8 : 18) - depth * (smallScreen ? 160 : 220), y: yFor(item) },
        data: {
          role: "component",
          tone: part.fromRadical || !part.target ? "b3" : "b1",
          character: part.character,
          ...componentLabels(part, owner),
          selectable: !!part.target,
          tooltip: tooltipFor(part, owner),
          nodeKey: path,
          canExpand,
          hasTarget: depth > 0,
          expanded: expandedPaths.has(path),
          onSelect: () => { if (part.target) chooseCharacter(part.target); },
          onExpand: canExpand ? () => setExpandedPaths((previous) => {
            const next = new Set(previous);
            if (next.has(path)) {
              for (const candidate of [...next]) if (candidate === path || candidate.startsWith(`${path}/`)) next.delete(candidate);
            } else next.add(path);
            return next;
          }) : undefined,
        },
      });
    });
    currentCompounds.forEach((compound, index) => {
      nextNodes.push({
        id: `compound-${compound.character}`,
        type: "kanjiMapNode",
        position: { x: smallScreen ? 248 : 548, y: compoundY(index, currentCompounds.length) },
        data: { role: "compound", tone: "b2", character: compound.character, ...kanjiNodeLabels(compound), selectable: true, tooltip: [`${compound.character} · ${formatHanViet(compound.hanViet, "Chưa có Hán Việt")}`, shortMeaning(compound), compound.readings.on[0] || compound.readings.kun[0] || ""].filter(Boolean), nodeKey: `compound-${compound.character}`, onSelect: () => chooseCharacter(compound.character) },
      });
    });
    return nextNodes;
  }, [chooseCharacter, compoundPage, expandedPaths, onBackToCards, relationships, selected, smallScreen, visibleParts]);

  const edges = useMemo<Edge[]>(() => {
    return [
      ...visibleParts.map(({ part, path, parentKey }) => ({
        id: `part-edge-${path}`,
        source: `part-${path}`,
        target: parentKey,
        sourceHandle: "right",
        targetHandle: "left",
        type: "straight",
        markerEnd: { type: MarkerType.ArrowClosed, color: part.fromRadical || !part.target ? "#8abbb0" : "#3689b1" },
        style: { stroke: part.fromRadical || !part.target ? "#8abbb0" : "#3689b1", strokeWidth: 2 },
        className: "kanji-map-flow-edge is-component",
        animated: true,
      })),
      ...relationships.slice(compoundPage * 7, compoundPage * 7 + 7).map((compound) => ({
        id: `compound-edge-${compound.character}`,
        source: `center-${selected.character}`,
        target: `compound-${compound.character}`,
        sourceHandle: "right",
        targetHandle: "left",
        type: "straight",
        markerEnd: { type: MarkerType.ArrowClosed, color: "#8870c1" },
        style: { stroke: "#8870c1", strokeWidth: 2 },
        className: "kanji-map-flow-edge is-compound",
        animated: true,
      })),
    ];
  }, [compoundPage, relationships, selected.character, visibleParts]);

  useEffect(() => {
    if (!flowInstance) return;
    void flowInstance.fitView({ padding: smallScreen ? 0.08 : 0.12, duration: 200, minZoom: 0.32, maxZoom: 1.15 });
  }, [flowInstance, nodes, smallScreen]);

  const desktopCompoundStart = compoundPage * 7;
  const desktopCompoundEnd = Math.min(desktopCompoundStart + 7, relationships.length);

  const compoundPager = relationships.length > 7 ? (
    <div className={`kanji-map-flow-pager${smallScreen ? " is-mobile" : ""}`} aria-label="Chuyển trang chữ liên quan">
      <Button variant="outline" size="sm" disabled={compoundPage === 0} onClick={() => setCompoundPage((page) => Math.max(0, page - 1))}>
        <ArrowLeft size={14} /> Trước
      </Button>
      <span>{desktopCompoundStart + 1}–{desktopCompoundEnd} / {relationships.length} chữ liên quan</span>
      <Button variant="outline" size="sm" disabled={desktopCompoundEnd >= relationships.length} onClick={() => setCompoundPage((page) => page + 1)}>
        Sau <ArrowRight size={14} />
      </Button>
    </div>
  ) : null;

  return (
    <div className="kanji-map-page mx-auto max-w-[1500px] px-2.5 py-3 md:px-8 md:py-6">
      <PageHeader
        title="Kanji Map"
        subtitle={`${graph.meta.recordCount.toLocaleString("vi-VN")} chữ · bản đồ cấu tạo và chữ liên quan`}
        icon={{ img: "icon-kanji.png", bg: "#ffe4e6" }}
        action={<Button variant="outline" size="sm" onClick={onBackToCards}><ArrowLeft aria-hidden="true" /> Thẻ Kanji</Button>}
      />

      <div className="kanji-map-search-area">
        <div className="kanji-map-search-wrap">
          <Search size={18} aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Tìm Kanji, Hán Việt hoặc nghĩa…"
            aria-label="Tìm một Kanji trong bản đồ"
            aria-controls="kanji-map-search-results"
            aria-autocomplete="list"
            aria-expanded={searchResults.length > 0}
          />
          {query ? <button type="button" aria-label="Xóa tìm kiếm" onClick={() => setQuery("")}><X size={16} /></button> : null}
          {searchResults.length > 0 ? (
            <div className="kanji-map-search-results" id="kanji-map-search-results" role="listbox" aria-label="Kết quả tìm Kanji">
              {searchResults.map((result) => (
                <button type="button" role="option" aria-selected="false" key={result.id} onClick={() => chooseCharacter(result.character)}>
                  <strong>{result.character}</strong>
                  <span>{formatHanViet(result.hanViet, result.level)} · {shortMeaning(result)}</span>
                  <small>{result.level}</small>
                </button>
              ))}
            </div>
          ) : query.trim() ? <div className="kanji-map-search-empty" role="status">Không tìm thấy Kanji phù hợp.</div> : null}
        </div>
        <div className="kanji-map-level-picker" role="group" aria-label="Lọc cấp độ tìm kiếm">
          {(["All", ...JLPT_ORDER] as const).map((choice) => (
            <button type="button" key={choice} className={level === choice ? "is-active" : ""} aria-pressed={level === choice} onClick={() => setLevel(choice)}>
              {choice === "All" ? "Tất cả" : choice}
            </button>
          ))}
        </div>
      </div>

      <div className="kanji-map-workspace">
        <section className="kanji-map-map-panel" aria-label={`Bản đồ cấu tạo chữ ${selected.character}`}>
          <div className="kanji-map-selected-strip">
            <div>
              <strong>{selected.character}</strong>
              <small>{selected.level} · {formatHanViet(selected.hanViet, "Chưa có Hán Việt")} · {shortMeaning(selected)}</small>
            </div>
            {relationships.length > 7 ? <span>{relationships.length} chữ có chứa thành phần này</span> : null}
          </div>

          <section className={`kanji-map-flow-canvas${smallScreen ? " is-mobile" : ""}`} aria-label="Sơ đồ tương tác; kéo để di chuyển, chụm hai ngón tay hoặc dùng nút bấm để phóng to">
            <ReactFlow<KanjiMapNodeType, Edge>
              key={`${selected.character}-${compoundPage}-${smallScreen ? "mobile" : "desktop"}`}
              nodes={nodes}
              edges={edges}
              nodeTypes={nodeTypes}
              nodesDraggable={false}
              nodesConnectable={false}
              panOnDrag
              panOnScroll={false}
              zoomOnScroll={false}
              zoomOnPinch
              zoomOnDoubleClick={false}
              minZoom={0.32}
              maxZoom={1.35}
              fitView
              onInit={setFlowInstance}
              fitViewOptions={smallScreen ? { padding: 0.04, minZoom: 0.55, maxZoom: 1.15 } : { padding: 0.12, minZoom: 0.45, maxZoom: 1.15 }}
            >
              <Background color="#e9eaf0" gap={24} size={1} />
              {!smallScreen ? <Controls showInteractive={false} position="bottom-right" /> : null}
            </ReactFlow>
            {!smallScreen ? compoundPager : null}
          </section>
          {smallScreen ? compoundPager : null}

          <div className="kanji-map-legend">
            <span><i className="kanji-map-legend-dot is-center" /> Chữ đang chọn</span>
            <span><i className="kanji-map-legend-dot is-component" /> Thành phần có thẻ Kanji</span>
            <span><i className="kanji-map-legend-dot is-fragment" /> Thành phần chưa có thẻ riêng</span>
            <span><i className="kanji-map-legend-dot is-related" /> Chữ này → chữ có chứa nó</span>
            {smallScreen ? <span className="kanji-map-gesture-hint">Kéo để di chuyển · chụm hai ngón để phóng to</span> : null}
            {smallScreen ? (
              <div className="kanji-map-mobile-actions" aria-label="Điều khiển sơ đồ">
                <button type="button" aria-label="Thu nhỏ sơ đồ" title="Thu nhỏ" onClick={() => void flowInstance?.zoomOut({ duration: 140 })}><ZoomOut size={14} /></button>
                <button type="button" aria-label="Phóng to sơ đồ" title="Phóng to" onClick={() => void flowInstance?.zoomIn({ duration: 140 })}><ZoomIn size={14} /></button>
                <button type="button" aria-label="Căn giữa sơ đồ" title="Căn giữa" onClick={() => void flowInstance?.fitView({ padding: 0.04, duration: 200 })}><Focus size={14} /> Căn giữa</button>
              </div>
            ) : null}
          </div>
        </section>

        <aside className="kanji-map-detail-panel" aria-label={`Thông tin chữ ${selected.character}`}>
          <div className="kanji-map-detail-hero">
            <div className="kanji-map-detail-character">{selected.character}</div>
            <div>
              <span className="kanji-map-level-badge">{selected.level}</span>
              <h2>{formatHanViet(selected.hanViet, "Chưa có Hán Việt")}</h2>
              <p>{selected.meanings.vi.join(" · ") || selected.meanings.viDraft?.join(" · ") || "Chưa có nghĩa tiếng Việt"}</p>
            </div>
          </div>
          <div className="kanji-map-detail-facts">
            <div><span>Âm On</span><strong>{selected.readings.on.join("、") || "—"}</strong></div>
            <div><span>Âm Kun</span><strong>{selected.readings.kun.join("、") || "—"}</strong></div>
            <div><span>Bộ thủ</span><strong>{selected.radical?.character ?? "—"}</strong></div>
            <div><span>Số nét</span><strong>{selected.strokeCount ?? "—"}</strong></div>
          </div>
          {graph.kanji[selected.character]?.components.length === 0 && !selectedGraph.radicalFallback ? (
            <p className="kanji-map-data-note">Nguồn KanjiVG hiện chưa có phân rã thành phần cho chữ này.</p>
          ) : selectedGraph.radicalFallback && parts[0]?.fromRadical ? (
            <p className="kanji-map-data-note">Sơ đồ dùng bộ thủ để gợi liên hệ; đây không phải phân rã thành phần từ KanjiVG.</p>
          ) : null}
          <Suspense fallback={null}><KanjiBookResources kanji={selected} onOpenVocab={onOpenVocab} /></Suspense>
          <KanjiMnemonicChoice kanji={selected} />
          {selected.meanings.en.length > 0 ? <p className="kanji-map-english">{selected.meanings.en.slice(0, 3).join(" · ")}</p> : null}
          {vocab && vocab.shown.length > 0 ? (
            <section className="kanji-map-vocab">
              <div><strong>Từ vựng có chữ {selected.character}</strong><span>{vocab.total}</span></div>
              {vocab.shown.slice(0, 5).map((word) => (
                <button type="button" key={word.id} onClick={() => onOpenVocab(word.id)}>
                  <strong>{word.word}</strong><span>{word.reading ? `${word.reading} · ` : ""}{word.meaningVi}</span>
                </button>
              ))}
            </section>
          ) : null}
          <Button className="kanji-map-open-card" onClick={onBackToCards}><BookOpen size={16} /> Mở thẻ Kanji</Button>
        </aside>
      </div>

      <p className="kanji-map-attribution">
        Dữ liệu thành phần: <a href="https://kanjivg.tagaini.net/" target="_blank" rel="noreferrer">KanjiVG</a> · CC BY-SA 3.0. {graph.meta.recordsWithComponents.toLocaleString("vi-VN")} chữ có phân rã; {graph.meta.recordsUsingRadicalFallback} chữ dùng bộ thủ tham khảo; {graph.meta.recordsWithoutDecomposition} chữ chưa có phân rã trong nguồn.
      </p>
    </div>
  );
}
