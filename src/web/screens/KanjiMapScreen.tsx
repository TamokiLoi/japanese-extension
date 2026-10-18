import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import {
  BaseEdge,
  Controls,
  Handle,
  Position,
  ReactFlow,
  type Edge,
  type EdgeProps,
  type Node,
  type NodeProps,
  type ReactFlowInstance,
} from "@xyflow/react";
import { ArrowLeft, ArrowRight, BookOpen, Focus, Search, X, ZoomIn, ZoomOut } from "lucide-react";
import graphRaw from "../../data/kanji-map-components.json";
import { radicalForCharacter, type RadicalCardRecord } from "../../data/radicalCards.ts";
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
type MapHandleSide = "left" | "right" | "top" | "bottom";
type MapPoint = { x: number; y: number };
type KanjiMapEdgeData = {
  flowColor: string;
  sourceCenter: MapPoint;
  targetCenter: MapPoint;
  sourceRadius: number;
  targetRadius: number;
};
type MapNodeData = {
  role: MapNodeRole;
  tone: "app" | "b1" | "b2" | "b3";
  character: string;
  hanViet: string;
  meaning: string;
  selectable: boolean;
  tooltip: string[];
  nodeKey: string;
  hasTarget?: boolean;
  onSelect: () => void;
};
type KanjiMapNodeType = Node<MapNodeData, "kanjiMapNode">;
type KanjiMapEdgeType = Edge<KanjiMapEdgeData, "kanjiMapEdge">;
type KanjiMapFlowInstance = ReactFlowInstance<KanjiMapNodeType, KanjiMapEdgeType>;
type MapPart = ComponentRecord & { target: string | null; graphKey: string | null; radical?: RadicalCardRecord; fromRadical?: boolean };
type VisiblePart = { part: MapPart; path: string; parentKey: string; parentCharacter: string; depth: number; canExpand: boolean };

const graph = graphRaw as unknown as GraphDataset;
const CHARACTER_MAP = new Map(ALL_KANJI.map((kanji) => [kanji.character, kanji]));
const JLPT_ORDER: JlptLevel[] = ["N5", "N4", "N3", "N2", "N1"];
const nodeTypes = { kanjiMapNode: KanjiMapNode };
const edgeTypes = { kanjiMapEdge: KanjiMapEdge };
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
  if (part.radical) return { hanViet: `${part.radical.nameHanViet} · bộ ${part.radical.number}`, meaning: part.radical.meaning };
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
    return {
      ...part,
      target: CHARACTER_MAP.has(part.canonical) ? part.canonical : CHARACTER_MAP.has(part.character) ? part.character : null,
      graphKey,
      radical: radicalForCharacter(part.canonical) ?? radicalForCharacter(part.character),
    };
  });
  if (components.length) return components;
  const fallback = record.radicalFallback;
  if (!fallback) return [];
  return [{ character: fallback, canonical: fallback, position: null, variant: false, partial: false, count: 1, target: CHARACTER_MAP.has(fallback) ? fallback : null, graphKey: graph.kanji[fallback] || graph.components?.[fallback] ? fallback : null, radical: radicalForCharacter(fallback), fromRadical: true }];
}

function tooltipFor(part: MapPart, owner: Kanji): string[] {
  const target = part.target ? CHARACTER_MAP.get(part.target) : undefined;
  const radical = owner.radical && (owner.radical.character === part.character || owner.radical.character === part.canonical)
    ? owner.radical
    : undefined;
  if (!target) {
      const nested = part.graphKey ? graph.kanji[part.graphKey] ?? graph.components?.[part.graphKey] : undefined;
    const lines = part.radical
      ? [`Bộ ${part.radical.number} · ${part.character} · ${part.radical.nameHanViet}`, part.radical.meaning, `${part.radical.strokes} nét`]
      : [part.character];
    if (!part.radical && radical) lines.push(`Bộ thủ · số ${radical.raw}`);
    else if (!part.radical && part.fromRadical) lines.push(`Bộ thủ · số ${owner.radical?.raw ?? "—"}`);
    else if (!part.radical) lines.push("Thành phần hình thể từ KanjiVG · chưa có thẻ riêng trong app");
    if (part.radical?.variants.length) lines.push(`Dạng khác: ${part.radical.variants.join("、")}`);
    if (nested?.components.length) lines.push(`KanjiVG · ${nested.components.length} thành phần`);
    if (part.variant) lines.push("Dạng hiển thị biến thể");
    if (part.partial) lines.push("Chỉ hiện một phần trong chữ này");
    return lines;
  }
  const lines = [`${target.character} · ${formatHanViet(target.hanViet, "Chưa có Hán Việt")}`];
  const meaning = shortMeaning(target);
  if (meaning && normalize(meaning) !== normalize(formatHanViet(target.hanViet, ""))) lines.push(meaning);
  const reading = target.readings.on[0] || target.readings.kun[0];
  if (reading) lines.push(reading);
  if (radical) lines.push(`Bộ thủ · số ${radical.raw}`);
  else if (part.radical) lines.push(`Bộ ${part.radical.number} · ${part.radical.nameHanViet}`);
  if (part.variant) lines.push("Dạng biến thể trong thành phần");
  else if (part.partial) lines.push("Chỉ hiện một phần trong chữ này");
  return lines;
}

function buildVisibleParts(root: string, maxDepth = 8, maxNodes = 48): VisiblePart[] {
  const result: VisiblePart[] = [];
  const visit = (parentCharacter: string, parentKey: string, prefix: string, depth: number, ancestry: Set<string>) => {
    if (depth >= maxDepth || result.length >= maxNodes) return;
    const parts = mapPartsFor(parentCharacter);
    parts.forEach((part, index) => {
      if (result.length >= maxNodes) return;
      const segment = `${index}-${part.canonical}-${part.character}`;
      const path = prefix ? `${prefix}/${segment}` : segment;
      // Component aliases can return to an earlier card, graph record, or
      // visible glyph (for example 巳 → 己 or a radical fallback). Stop that
      // branch before drawing the same glyph twice along one path.
      const cycle = ancestry.has(part.character)
        || (!!part.target && ancestry.has(part.target))
        || (!!part.graphKey && ancestry.has(part.graphKey));
      if (cycle) return;
      const canExpand = !!part.graphKey && mapPartsFor(part.graphKey).length > 0 && depth + 1 < maxDepth;
      result.push({ part, path, parentKey, parentCharacter, depth, canExpand });
      if (!canExpand) return;
      const nextAncestry = new Set(ancestry);
      nextAncestry.add(part.character);
      nextAncestry.add(part.graphKey!);
      if (part.target) nextAncestry.add(part.target);
      visit(part.graphKey!, `part-${path}`, path, depth + 1, nextAncestry);
    });
  };
  visit(root, `center-${root}`, "", 0, new Set([root]));
  return result;
}

function branchPartPositions(
  visibleParts: VisiblePart[],
  rootKey: string,
  rootCenter: MapPoint,
  horizontalStep: number,
  leafSpacing: number,
): Map<string, MapPoint> {
  const childrenByParent = new Map<string, VisiblePart[]>();
  for (const item of visibleParts) {
    const children = childrenByParent.get(item.parentKey) ?? [];
    children.push(item);
    childrenByParent.set(item.parentKey, children);
  }

  const leavesByPath = new Map<string, number>();
  const leafCount = (item: VisiblePart): number => {
    const cached = leavesByPath.get(item.path);
    if (cached !== undefined) return cached;
    const children = childrenByParent.get(`part-${item.path}`) ?? [];
    const count = children.length ? children.reduce((sum, child) => sum + leafCount(child), 0) : 1;
    leavesByPath.set(item.path, count);
    return count;
  };

  const roots = childrenByParent.get(rootKey) ?? [];
  const positions = new Map<string, MapPoint>();
  const sides: [VisiblePart[], VisiblePart[]] = [[], []];
  const sideWeights = [0, 0];
  // Keep larger subtrees balanced on opposite sides of the selected kanji.
  [...roots]
    .sort((a, b) => leafCount(b) - leafCount(a))
    .forEach((item) => {
      const sideIndex = sideWeights[0] <= sideWeights[1] ? 0 : 1;
      sides[sideIndex].push(item);
      sideWeights[sideIndex] += leafCount(item);
    });

  sides.forEach((sideRoots, sideIndex) => {
    const totalLeaves = sideRoots.reduce((sum, item) => sum + leafCount(item), 0);
    const direction = sideIndex === 0 ? -1 : 1;
    const place = (item: VisiblePart, start: number) => {
      const count = leafCount(item);
      const middleLeaf = start + (count - 1) / 2;
      positions.set(`part-${item.path}`, {
        x: rootCenter.x + direction * horizontalStep * (item.depth + 1),
        y: rootCenter.y + (middleLeaf - (totalLeaves - 1) / 2) * leafSpacing,
      });
      let childStart = start;
      for (const child of childrenByParent.get(`part-${item.path}`) ?? []) {
        place(child, childStart);
        childStart += leafCount(child);
      }
    };

    let start = 0;
    for (const item of sideRoots) {
      place(item, start);
      start += leafCount(item);
    }
  });
  return positions;
}

function mapHandleSide(from: MapPoint, toward: MapPoint): MapHandleSide {
  const dx = toward.x - from.x;
  const dy = toward.y - from.y;
  if (Math.abs(dx) >= Math.abs(dy)) return dx < 0 ? "left" : "right";
  return dy < 0 ? "top" : "bottom";
}

function oppositeHandleSide(side: MapHandleSide): MapHandleSide {
  if (side === "left") return "right";
  if (side === "right") return "left";
  if (side === "top") return "bottom";
  return "top";
}

function edgePathBetweenNodes(data: KanjiMapEdgeData): string {
  const dx = data.targetCenter.x - data.sourceCenter.x;
  const dy = data.targetCenter.y - data.sourceCenter.y;
  const distance = Math.hypot(dx, dy) || 1;
  const unitX = dx / distance;
  const unitY = dy / distance;
  const sourceX = data.sourceCenter.x + unitX * data.sourceRadius;
  const sourceY = data.sourceCenter.y + unitY * data.sourceRadius;
  const targetX = data.targetCenter.x - unitX * data.targetRadius;
  const targetY = data.targetCenter.y - unitY * data.targetRadius;
  return `M ${sourceX} ${sourceY} L ${targetX} ${targetY}`;
}

function KanjiMapNode({ data }: NodeProps<KanjiMapNodeType>) {
  const isCenter = data.role === "center";
  const handlePositions: Record<MapHandleSide, Position> = {
    left: Position.Left,
    right: Position.Right,
    top: Position.Top,
    bottom: Position.Bottom,
  };
  const handleSides: MapHandleSide[] = ["left", "right", "top", "bottom"];
  const tooltipId = `kanji-map-tip-${data.nodeKey.replace(/[^a-z0-9_-]/gi, "-")}`;
  return (
    <div className={`kanji-map-flow-node ${isCenter ? "is-center" : `is-${data.role}`} tone-${data.tone}${data.selectable ? "" : " is-muted"}${data.hasTarget ? " has-target" : ""}`}>
      {data.role !== "component" || data.hasTarget ? handleSides.map((side) => <Handle key={`target-${side}`} id={`target-${side}`} type="target" position={handlePositions[side]} isConnectable={false} />) : null}
      <button className="kanji-map-node-main" type="button" onClick={data.onSelect} disabled={!data.selectable} aria-label={`${data.character}: ${data.hanViet}${data.meaning ? `, ${data.meaning}` : ""}`} aria-describedby={tooltipId}>
        <span className="kanji-map-node-orb"><strong>{data.character}</strong></span>
        <span className="kanji-map-node-label">{data.hanViet}</span>
        {isCenter && data.meaning ? <small>{data.meaning}</small> : null}
      </button>
      <div className="kanji-map-node-tooltip" id={tooltipId} role="tooltip">
        {data.tooltip.map((line, index) => index === 0 ? <strong key={line}>{line}</strong> : <span key={`${line}-${index}`}>{line}</span>)}
      </div>
      {data.role !== "compound" ? handleSides.map((side) => <Handle key={`source-${side}`} id={`source-${side}`} type="source" position={handlePositions[side]} isConnectable={false} />) : null}
    </div>
  );
}

function KanjiMapEdge({ id, data }: EdgeProps<KanjiMapEdgeType>) {
  const path = data ? edgePathBetweenNodes(data) : "";
  return (
    <>
      <BaseEdge id={id} path={path} style={{ stroke: "#c8cdd5", strokeWidth: 1.5 }} />
      <circle className="kanji-map-flow-dot" r="2.8" fill={data?.flowColor ?? "#748195"} aria-hidden="true">
        <animateMotion dur="1.55s" repeatCount="indefinite" path={path} />
      </circle>
    </>
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
  onSelectRadical,
  onOpenVocab,
}: {
  initialCharacter?: string;
  onBackToCards: () => void;
  onSelectCharacter: (character: string) => void;
  onSelectRadical: (character: string) => void;
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

  useEffect(() => {
    const next = resolveCharacter(initialCharacter);
    if (next) setSelectedCharacter(next);
  }, [initialCharacter, resolveCharacter]);

  const selected = CHARACTER_MAP.get(selectedCharacter) ?? ALL_KANJI[0]!;
  const selectedGraph = graph.kanji[selected.character] ?? { components: [], radicalFallback: null };
  // Show the complete available decomposition by default, like a kanji-analysis map.
  const visibleParts = useMemo(() => buildVisibleParts(selected.character), [selected.character]);
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
    const matches = ALL_KANJI.flatMap((kanji, index) => {
      if (level !== "All" && kanji.level !== level) return [];
      const hanVietTerms = kanji.hanViet.map(normalize);
      const vietnameseTerms = [...kanji.meanings.vi, ...(kanji.meanings.viDraft ?? [])].map(normalize);
      const englishTerms = kanji.meanings.en.map(normalize);
      const character = normalize(kanji.character);
      const contains = (terms: string[]) => terms.some((term) => term.includes(needle));
      if (!character.includes(needle) && !contains(hanVietTerms) && !contains(vietnameseTerms) && !contains(englishTerms)) return [];

      // Meaning matches should rank alongside Hán Việt matches. This lets a
      // search such as “kinh” surface 驚 (kinh ngạc), even when many other
      // characters share the same Sino-Vietnamese reading.
      const scoreTerms = (terms: string[], exact: number, prefix: number, partial: number) => {
        if (terms.some((term) => term === needle)) return exact;
        if (terms.some((term) => term.startsWith(needle))) return prefix;
        if (contains(terms)) return partial;
        return 0;
      };
      const score = (character === needle ? 1200 : character.startsWith(needle) ? 1100 : 0)
        + scoreTerms(vietnameseTerms, 900, 760, 620)
        + scoreTerms(hanVietTerms, 850, 700, 560)
        + scoreTerms(englishTerms, 400, 320, 240);
      return [{ kanji, score, index }];
    });
    return matches
      .sort((a, b) => b.score - a.score || a.index - b.index)
      .slice(0, 40)
      .map(({ kanji }) => kanji);
  }, [level, query]);

  const chooseCharacter = useCallback((character: string) => {
    const next = CHARACTER_MAP.get(character);
    if (!next) return;
    setSelectedCharacter(character);
    setQuery("");
    setCompoundPage(0);
    onSelectCharacter(character);
  }, [onSelectCharacter]);

  const currentCompounds = useMemo(() => relationships.slice(compoundPage * 7, compoundPage * 7 + 7), [compoundPage, relationships]);
  const treeCenters = useMemo(() => {
    const centers = new Map<string, MapPoint>();
    const rootKey = `center-${selected.character}`;
    const maxDepth = visibleParts.reduce((depth, item) => Math.max(depth, item.depth), 0);
    const horizontalStep = smallScreen ? 90 : 144;
    const leafSpacing = smallScreen ? 58 : 82;
    const origin = { x: 1200, y: 1200 };
    centers.set(rootKey, origin);

    const parts = branchPartPositions(visibleParts, rootKey, origin, horizontalStep, leafSpacing);
    for (const [key, center] of parts) centers.set(key, center);

    const compoundX = origin.x + (Math.max(1, maxDepth) + 1) * horizontalStep;
    currentCompounds.forEach((compound, index) => {
      centers.set(`compound-${compound.character}`, {
        x: compoundX,
        y: origin.y + (index - (currentCompounds.length - 1) / 2) * leafSpacing,
      });
    });
    return centers;
  }, [currentCompounds, selected.character, smallScreen, visibleParts]);

  const nodes = useMemo<KanjiMapNodeType[]>(() => {
    const centerWidth = smallScreen ? 88 : 126;
    const centerOrb = smallScreen ? 52 : 64;
    const partWidth = smallScreen ? 78 : 116;
    const partOrb = smallScreen ? 40 : 50;
    const selectedTooltip = [`${selected.character} · ${formatHanViet(selected.hanViet, "Chưa có Hán Việt")}`, shortMeaning(selected), selected.readings.on[0] || selected.readings.kun[0] || ""] .filter(Boolean);
    const centerPosition = treeCenters.get(`center-${selected.character}`)!;
    const nextNodes: KanjiMapNodeType[] = [
      {
        id: `center-${selected.character}`,
        type: "kanjiMapNode",
        position: { x: centerPosition.x - centerWidth / 2, y: centerPosition.y - centerOrb / 2 },
        data: { role: "center", tone: "app", character: selected.character, ...kanjiNodeLabels(selected), selectable: true, tooltip: selectedTooltip, nodeKey: `center-${selected.character}`, onSelect: () => onBackToCards() },
      },
    ];
    visibleParts.forEach((item) => {
      const { part, path, parentKey, parentCharacter, depth } = item;
      const owner = CHARACTER_MAP.get(parentCharacter) ?? selected;
      const targetId = part.target ? `part-${path}` : "";
      nextNodes.push({
        id: targetId || `part-${path}`,
        type: "kanjiMapNode",
        position: (() => {
          const center = treeCenters.get(`part-${path}`)!;
          return { x: center.x - partWidth / 2, y: center.y - partOrb / 2 };
        })(),
        data: {
          role: "component",
          tone: part.fromRadical || !part.target ? "b3" : "b1",
          character: part.character,
          ...componentLabels(part, owner),
          selectable: !!part.target || !!part.radical,
          tooltip: tooltipFor(part, owner),
          nodeKey: path,
          // A direct component can itself be composed of smaller parts, so it
          // also needs an incoming handle. Without it React Flow drops the
          // child-to-parent arrow for the first expanded level.
          hasTarget: depth > 0 || !!part.graphKey,
          onSelect: () => {
            if (part.target) chooseCharacter(part.target);
            else if (part.radical) onSelectRadical(part.radical.character);
          },
        },
      });
    });
    currentCompounds.forEach((compound) => {
      const center = treeCenters.get(`compound-${compound.character}`)!;
      nextNodes.push({
        id: `compound-${compound.character}`,
        type: "kanjiMapNode",
        position: { x: center.x - partWidth / 2, y: center.y - partOrb / 2 },
        data: { role: "compound", tone: "b2", character: compound.character, ...kanjiNodeLabels(compound), selectable: true, tooltip: [`${compound.character} · ${formatHanViet(compound.hanViet, "Chưa có Hán Việt")}`, shortMeaning(compound), compound.readings.on[0] || compound.readings.kun[0] || ""].filter(Boolean), nodeKey: `compound-${compound.character}`, onSelect: () => chooseCharacter(compound.character) },
      });
    });
    return nextNodes;
  }, [chooseCharacter, currentCompounds, onBackToCards, onSelectRadical, selected, smallScreen, treeCenters, visibleParts]);

  const edges = useMemo<KanjiMapEdgeType[]>(() => {
    const centerRadius = (smallScreen ? 52 : 64) / 2;
    const partRadius = (smallScreen ? 40 : 50) / 2;
    return [
      ...visibleParts.map(({ part, path, parentKey }) => {
        const color = part.fromRadical || !part.target ? "#4f927f" : "#3689b1";
        const sourceId = `part-${path}`;
        const sourceCenter = treeCenters.get(sourceId)!;
        const targetCenter = treeCenters.get(parentKey)!;
        const sourceSide = mapHandleSide(sourceCenter, targetCenter);
        const targetSide = oppositeHandleSide(sourceSide);
        return {
          id: `part-edge-${path}`,
          source: sourceId,
          target: parentKey,
          sourceHandle: `source-${sourceSide}`,
          targetHandle: `target-${targetSide}`,
          type: "kanjiMapEdge",
          data: {
            flowColor: color,
            sourceCenter,
            targetCenter,
            sourceRadius: partRadius,
            targetRadius: parentKey === `center-${selected.character}` ? centerRadius : partRadius,
          },
          className: "kanji-map-flow-edge is-component",
        };
      }),
      ...currentCompounds.map((compound) => {
        const sourceId = `center-${selected.character}`;
        const targetId = `compound-${compound.character}`;
        const sourceCenter = treeCenters.get(sourceId)!;
        const targetCenter = treeCenters.get(targetId)!;
        const sourceSide = mapHandleSide(sourceCenter, targetCenter);
        const targetSide = oppositeHandleSide(sourceSide);
        return {
          id: `compound-edge-${compound.character}`,
          source: sourceId,
          target: targetId,
          sourceHandle: `source-${sourceSide}`,
          targetHandle: `target-${targetSide}`,
          type: "kanjiMapEdge",
          data: {
            flowColor: "#8870c1",
            sourceCenter,
            targetCenter,
            sourceRadius: centerRadius,
            targetRadius: partRadius,
          },
          className: "kanji-map-flow-edge is-compound",
        };
      }),
    ];
  }, [currentCompounds, selected.character, smallScreen, treeCenters, visibleParts]);

  useEffect(() => {
    if (!flowInstance) return;
    // Expanded graphs can be taller than the mobile canvas. Let fitView zoom
    // out far enough to include the whole graph instead of cropping nodes.
    void flowInstance.fitView({ padding: smallScreen ? 0.08 : 0.12, duration: 200, minZoom: smallScreen ? 0.18 : 0.32, maxZoom: 1.15 });
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
      <div className="kanji-map-header">
        <PageHeader
          title="Kanji Map"
          subtitle={`${graph.meta.recordCount.toLocaleString("vi-VN")} chữ`}
          icon={{ img: "icon-kanji.png", bg: "#ffe4e6" }}
          action={<Button className="kanji-map-back-button" variant="outline" size="sm" aria-label="Quay lại thẻ Kanji" onClick={onBackToCards}><ArrowLeft aria-hidden="true" /><span className="kanji-map-back-label">Thẻ Kanji</span></Button>}
        />
      </div>

      <div className="kanji-map-search-area">
        <div className="kanji-map-search-wrap">
          <Search size={18} aria-hidden="true" />
          <input
            type="text"
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
            <ReactFlow<KanjiMapNodeType, KanjiMapEdgeType>
              key={`${selected.character}-${compoundPage}-${smallScreen ? "mobile" : "desktop"}`}
              nodes={nodes}
              edges={edges}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              nodesDraggable={false}
              nodesConnectable={false}
              panOnDrag
              panOnScroll={false}
              zoomOnScroll={false}
              zoomOnPinch
              zoomOnDoubleClick={false}
              minZoom={smallScreen ? 0.18 : 0.32}
              maxZoom={1.35}
              fitView
              onInit={setFlowInstance}
              fitViewOptions={smallScreen ? { padding: 0.04, minZoom: 0.18, maxZoom: 1.15 } : { padding: 0.12, minZoom: 0.45, maxZoom: 1.15 }}
            >
              {!smallScreen ? <Controls showInteractive={false} position="bottom-right" /> : null}
            </ReactFlow>
            {!smallScreen ? compoundPager : null}
          </section>
          {smallScreen ? compoundPager : null}

          <div className="kanji-map-legend">
            <span><i className="kanji-map-legend-dot is-center" /> Chữ đang chọn</span>
            <span><i className="kanji-map-legend-dot is-component" /> Thành phần có thẻ Kanji</span>
            <span><i className="kanji-map-legend-dot is-fragment" /> Bộ thủ / mảnh cấu tạo</span>
            <span><i className="kanji-map-legend-dot is-related" /> Chữ này → chữ có chứa nó</span>
            {smallScreen ? <span className="kanji-map-gesture-hint">Kéo để di chuyển · chụm hai ngón để phóng to</span> : null}
            {smallScreen ? (
              <div className="kanji-map-mobile-actions" aria-label="Điều khiển sơ đồ">
                <button type="button" aria-label="Thu nhỏ sơ đồ" title="Thu nhỏ" onClick={() => void flowInstance?.zoomOut({ duration: 140 })}><ZoomOut size={14} /></button>
                <button type="button" aria-label="Phóng to sơ đồ" title="Phóng to" onClick={() => void flowInstance?.zoomIn({ duration: 140 })}><ZoomIn size={14} /></button>
                <button type="button" aria-label="Căn giữa sơ đồ" title="Căn giữa" onClick={() => void flowInstance?.fitView({ padding: 0.04, duration: 200, minZoom: 0.18, maxZoom: 1.15 })}><Focus size={14} /> Căn giữa</button>
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
          <KanjiMnemonicChoice kanji={selected} />
          <Suspense fallback={null}><KanjiBookResources kanji={selected} onOpenVocab={onOpenVocab} /></Suspense>
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
