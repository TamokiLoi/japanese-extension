import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Background, Controls, ReactFlow, type Edge, type Node, type NodeProps, type ReactFlowInstance } from "@xyflow/react";
import { BookOpenText, Check, ChevronLeft } from "lucide-react";
import { findBunpoById } from "../../popup/bunpoState.ts";
import { bucketFor, loadProgressMap, type ProgressBucket, type ProgressMap } from "../../popup/progressState.ts";
import { BUNPO_N3_MAP_GROUPS } from "../data/bunpoN3Map.ts";
import { BUNPO_N5_MAP_GROUPS, type BunpoMapGroup } from "../data/bunpoN5Map.ts";
import { PageHeader } from "../components/PageHeader.tsx";
import { Button } from "../components/ui/button.tsx";
import "./bunpo-map.css";

type MapNodeRole = "root" | "group" | "item";
type MapNodeData = {
  role: MapNodeRole;
  label: string;
  hint?: string;
  groupId?: string;
  color?: string;
  grammarId?: string;
  status?: ProgressBucket;
  linkedCount?: number;
  itemCount?: number;
  onActivate?: () => void;
};
type DiagramNode = Node<MapNodeData, "bunpoMapNode">;
export type BunpoMapLevel = "N5" | "N3";

const STATUS_TEXT: Record<ProgressBucket, string> = {
  mastered: "Đã thuộc",
  learning: "Đang học",
  flagged: "Cần ôn lại",
  new: "Chưa học",
};

const GROUP_OVERVIEW_POSITIONS: Record<string, { x: number; y: number }> = {
  noun: { x: 40, y: 110 },
  adjective: { x: 910, y: 110 },
  verb: { x: 40, y: 690 },
  particle: { x: 910, y: 690 },
  other: { x: 475, y: 20 },
};

function overviewPosition(level: BunpoMapLevel, groupIndex: number, groupId: string) {
  if (level === "N5") return GROUP_OVERVIEW_POSITIONS[groupId];
  const column = Math.floor(groupIndex / 5);
  const row = groupIndex % 5;
  return { x: 10 + column * 415, y: 20 + row * 130 };
}

function MapNode({ data }: NodeProps<DiagramNode>) {
  if (data.role === "root") {
    return (
      <div className="bunpo-map-root nodrag">
        <span className="bunpo-map-root-kicker">NIHONGO NIN</span>
        <strong>{data.label}</strong>
        <span>Chọn một nhánh để khám phá</span>
      </div>
    );
  }

  if (data.role === "group") {
    return (
      <button
        type="button"
        onClick={data.onActivate}
        className="bunpo-map-group nodrag"
        style={{ "--map-accent": data.color } as React.CSSProperties}
      >
        <span className="bunpo-map-group-dot" />
        <span className="bunpo-map-group-copy">
          <strong>{data.label}</strong>
          <small>{data.linkedCount}/{data.itemCount} mục mở được thẻ</small>
        </span>
        <span className="bunpo-map-group-arrow" aria-hidden="true">↗</span>
      </button>
    );
  }

  const canOpen = !!data.grammarId;
  return (
    <button
      type="button"
      onClick={data.onActivate}
      disabled={!canOpen}
      className={`bunpo-map-item nodrag ${canOpen ? "is-linked" : "is-unlinked"} ${data.status ? `status-${data.status}` : ""}`}
      style={{ "--map-accent": data.color } as React.CSSProperties}
      aria-label={canOpen ? `${data.label}, trạng thái ${STATUS_TEXT[data.status ?? "new"]}` : `${data.label}, chưa có bài ngữ pháp`}
    >
      <span className="bunpo-map-item-mark" aria-hidden="true">
        {data.status === "mastered" ? <Check size={15} /> : canOpen ? <BookOpenText size={15} /> : <span>·</span>}
      </span>
      <span className="bunpo-map-item-copy">
        <strong>{data.label}</strong>
        {data.hint ? <small>{data.hint}</small> : null}
      </span>
      <span className={`bunpo-map-item-status ${canOpen ? "" : "is-missing"}`}>
        {canOpen ? STATUS_TEXT[data.status ?? "new"] : "Chưa có bài"}
      </span>
    </button>
  );
}

const nodeTypes = { bunpoMapNode: MapNode };

function useSmallScreen() {
  const [smallScreen, setSmallScreen] = useState(() => typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches);
  useEffect(() => {
    const query = window.matchMedia("(max-width: 767px)");
    const update = () => setSmallScreen(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return smallScreen;
}

export function BunpoMapScreen({
  level,
  onChangeLevel,
  onOpenBunpo,
  onBackToGrammar,
}: {
  level: BunpoMapLevel;
  onChangeLevel: (level: BunpoMapLevel) => void;
  onOpenBunpo: (grammarId: string) => void;
  onBackToGrammar: () => void;
}) {
  const smallScreen = useSmallScreen();
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(() =>
    typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches
      ? level === "N3" ? BUNPO_N3_MAP_GROUPS[0]?.id ?? null : "verb"
      : null,
  );
  const [progressMap, setProgressMap] = useState<ProgressMap>({});
  const flowRef = useRef<ReactFlowInstance<DiagramNode, Edge> | null>(null);
  const groups: BunpoMapGroup[] = level === "N3" ? BUNPO_N3_MAP_GROUPS : BUNPO_N5_MAP_GROUPS;

  useEffect(() => {
    let active = true;
    void loadProgressMap().then((map) => {
      if (active) setProgressMap(map);
    });
    return () => {
      active = false;
    };
  }, []);

  const selectedGroup = groups.find((group) => group.id === selectedGroupId) ?? null;

  const nodes = useMemo<DiagramNode[]>(() => {
    if (!selectedGroup) {
      const linkedCount = groups.flatMap((group) => group.items).filter(
        (item) => item.grammarId && findBunpoById(item.grammarId),
      ).length;
      return [
        {
          id: "root",
          type: "bunpoMapNode",
          position: level === "N3" ? { x: 442, y: -150 } : { x: 490, y: 370 },
          data: { role: "root", label: `Ngữ pháp ${level}`, hint: `${linkedCount} mục liên kết với thẻ` },
        },
        ...groups.map((group, index) => {
          const groupLinks = group.items.filter((item) => item.grammarId && findBunpoById(item.grammarId)).length;
          return {
            id: `group-${group.id}`,
            type: "bunpoMapNode" as const,
            position: overviewPosition(level, index, group.id),
            data: {
              role: "group" as const,
              label: group.label,
              groupId: group.id,
              color: group.color,
              linkedCount: groupLinks,
              itemCount: group.items.length,
              onActivate: () => setSelectedGroupId(group.id),
            },
          };
        }),
      ];
    }

    const itemX = smallScreen ? 112 : 540;
    const firstItemY = smallScreen ? 126 : 28;
    const itemGap = smallScreen ? 72 : 78;
    const groupX = smallScreen ? 64 : 48;
    const groupY = smallScreen ? 20 : Math.max(120, (selectedGroup.items.length * itemGap) / 2 - 32);
    return [
      {
        id: `group-${selectedGroup.id}`,
        type: "bunpoMapNode",
        position: { x: groupX, y: groupY },
        data: {
          role: "group",
          label: selectedGroup.label,
          groupId: selectedGroup.id,
          color: selectedGroup.color,
          linkedCount: selectedGroup.items.filter((item) => item.grammarId && findBunpoById(item.grammarId)).length,
          itemCount: selectedGroup.items.length,
          onActivate: () => setSelectedGroupId(null),
        },
      },
      ...selectedGroup.items.map((item, index) => {
        const existingCard = item.grammarId ? findBunpoById(item.grammarId) : undefined;
        return {
          id: item.id,
          type: "bunpoMapNode" as const,
          position: { x: itemX, y: firstItemY + index * itemGap },
          data: {
            role: "item" as const,
            label: item.label,
            hint: item.hint,
            groupId: selectedGroup.id,
            color: selectedGroup.color,
            grammarId: existingCard?.id,
            status: existingCard ? bucketFor(progressMap[existingCard.id]) : undefined,
            onActivate: existingCard ? () => onOpenBunpo(existingCard.id) : undefined,
          },
        };
      }),
    ];
  }, [groups, level, onOpenBunpo, progressMap, selectedGroup, smallScreen]);

  const edges = useMemo<Edge[]>(() => {
    if (!selectedGroup) {
      return groups.map((group) => ({
        id: `root-${group.id}`,
        source: "root",
        target: `group-${group.id}`,
        type: "default",
        style: { stroke: group.color, strokeWidth: 3 },
      }));
    }
    return selectedGroup.items.map((item) => ({
      id: `${selectedGroup.id}-${item.id}`,
      source: `group-${selectedGroup.id}`,
      target: item.id,
      type: "default",
      style: { stroke: `${selectedGroup.color}a8`, strokeWidth: 2.5 },
    }));
  }, [groups, selectedGroup]);

  const fitCurrentView = useCallback(() => {
    const currentFlow = flowRef.current;
    if (!currentFlow) return;
    const visibleIds = selectedGroup
      ? [`group-${selectedGroup.id}`, ...selectedGroup.items.map((item) => item.id)]
      : undefined;
    void currentFlow.fitView({
      nodes: visibleIds?.map((id) => ({ id })) as DiagramNode[] | undefined,
      padding: selectedGroup ? 0.18 : 0.16,
      maxZoom: selectedGroup ? 1 : 0.9,
      duration: 260,
    });
  }, [level, selectedGroup]);

  useEffect(() => {
    const frame = requestAnimationFrame(fitCurrentView);
    return () => cancelAnimationFrame(frame);
  }, [fitCurrentView, nodes]);

  function selectGroup(groupId: string | null) {
    setSelectedGroupId(groupId);
  }

  return (
    <div className="bunpo-map-page mx-auto max-w-7xl px-3 py-4 md:px-6 md:py-6">
      <PageHeader
        title={`Sơ đồ ngữ pháp ${level}`}
        subtitle={level === "N3" ? "15 chương trong lộ trình ngữ pháp N3 của Nihongo Nin." : "Chạm vào một nhánh để xem các mẫu câu liên quan."}
        icon={{ img: "icon-grammar.png", bg: "#f0e9ff" }}
        action={
          <Button variant="outline" size="sm" onClick={onBackToGrammar}>
            <ChevronLeft aria-hidden="true" /> Ngữ pháp
          </Button>
        }
      />

      <div className="bunpo-map-level-picker" role="group" aria-label="Chọn cấp độ sơ đồ">
        {(["N5", "N3"] as const).map((mapLevel) => (
          <button
            type="button"
            key={mapLevel}
            className={level === mapLevel ? "is-active" : ""}
            onClick={() => {
              if (mapLevel !== level) onChangeLevel(mapLevel);
            }}
            aria-pressed={level === mapLevel}
          >
            {mapLevel}
          </button>
        ))}
      </div>

      <div className="bunpo-map-branch-picker" role="group" aria-label="Chọn chủ đề ngữ pháp">
        <button
          type="button"
          className={`bunpo-map-branch-chip ${selectedGroupId === null ? "is-active" : ""}`}
          onClick={() => selectGroup(null)}
        >
          Tổng quan
        </button>
        {groups.map((group) => (
          <button
            type="button"
            key={group.id}
            className={`bunpo-map-branch-chip ${selectedGroupId === group.id ? "is-active" : ""}`}
            style={{ "--map-accent": group.color } as React.CSSProperties}
            onClick={() => selectGroup(group.id)}
            aria-pressed={selectedGroupId === group.id}
            aria-label={group.label}
          >
            {group.shortLabel ?? group.label}
          </button>
        ))}
      </div>

      {selectedGroup ? (
        <div className="bunpo-map-branch-heading">
          <button type="button" onClick={() => selectGroup(null)} className="bunpo-map-back-link">
            <ChevronLeft size={16} aria-hidden="true" /> Toàn sơ đồ
          </button>
          <span>{selectedGroup.items.length} chủ điểm · {selectedGroup.items.filter((item) => item.grammarId && findBunpoById(item.grammarId)).length} liên kết thẻ</span>
        </div>
      ) : null}

      {smallScreen ? (
        <section className="bunpo-map-mobile" aria-label="Sơ đồ ngữ pháp tương tác">
          {selectedGroup ? (
            <>
              <div className="bunpo-map-mobile-group" style={{ "--map-accent": selectedGroup.color } as React.CSSProperties}>
                <span className="bunpo-map-group-dot" />
                <div>
                  <strong>{selectedGroup.label}</strong>
                  <small>{selectedGroup.items.length} chủ điểm trong nhánh này</small>
                </div>
              </div>
              <div className="bunpo-map-mobile-list" style={{ "--map-accent": selectedGroup.color } as React.CSSProperties}>
                {selectedGroup.items.map((item) => {
                  const card = item.grammarId ? findBunpoById(item.grammarId) : undefined;
                  const status = card ? bucketFor(progressMap[card.id]) : undefined;
                  return (
                    <button
                      type="button"
                      key={item.id}
                      disabled={!card}
                      onClick={card ? () => onOpenBunpo(card.id) : undefined}
                      className={`bunpo-map-mobile-item ${card ? `status-${status}` : "is-unlinked"}`}
                      aria-label={card ? `${item.label}, trạng thái ${STATUS_TEXT[status ?? "new"]}` : `${item.label}, chưa có bài ngữ pháp`}
                    >
                      <span className="bunpo-map-mobile-mark" aria-hidden="true">
                        {status === "mastered" ? <Check size={15} /> : card ? <BookOpenText size={15} /> : <span>·</span>}
                      </span>
                      <span className="bunpo-map-mobile-copy">
                        <strong>{item.label}</strong>
                        <small>{item.hint}</small>
                      </span>
                      <span className={`bunpo-map-item-status ${card ? "" : "is-missing"}`}>
                        {card ? STATUS_TEXT[status ?? "new"] : "Chưa có bài"}
                      </span>
                    </button>
                  );
                })}
              </div>
            </>
          ) : (
            <>
              <div className="bunpo-map-mobile-root">
                <span>NIHONGO NIN</span>
                <strong>Ngữ pháp {level}</strong>
                <small>Chọn một nhánh để khám phá</small>
              </div>
              <div className="bunpo-map-mobile-groups">
                {groups.map((group) => {
                  const linkedCount = group.items.filter((item) => item.grammarId && findBunpoById(item.grammarId)).length;
                  return (
                    <button
                      type="button"
                      key={group.id}
                      onClick={() => selectGroup(group.id)}
                      className="bunpo-map-mobile-group-card"
                      style={{ "--map-accent": group.color } as React.CSSProperties}
                    >
                      <span className="bunpo-map-group-dot" />
                      <span className="bunpo-map-mobile-group-copy">
                        <strong>{group.label}</strong>
                        <small>{linkedCount}/{group.items.length} mục mở được thẻ</small>
                      </span>
                      <span className="bunpo-map-group-arrow" aria-hidden="true">↗</span>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </section>
      ) : (
        <section className={`bunpo-map-canvas ${selectedGroup ? "has-selection" : "is-overview"}`} aria-label="Sơ đồ ngữ pháp tương tác">
          <ReactFlow<DiagramNode, Edge>
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onInit={(instance) => {
              flowRef.current = instance;
              requestAnimationFrame(fitCurrentView);
            }}
            nodesDraggable={false}
            nodesConnectable={false}
            panOnDrag
            panOnScroll={false}
            zoomOnScroll={false}
            zoomOnPinch
            zoomOnDoubleClick={false}
            minZoom={0.25}
            maxZoom={1.25}
            fitView
            aria-label={`Sơ đồ các nhóm ngữ pháp ${level}`}
          >
            <Background color="#e8e9ef" gap={24} size={1} />
            <Controls showInteractive={false} position="bottom-right" />
          </ReactFlow>
        </section>
      )}

      <div className="bunpo-map-legend" aria-label="Chú giải trạng thái học">
        <span><i className="legend-dot legend-linked" /> Có thẻ ngữ pháp</span>
        {groups.flatMap((group) => group.items).some((item) => !item.grammarId || !findBunpoById(item.grammarId)) ? (
          <span><i className="legend-dot legend-missing" /> Chưa có bài</span>
        ) : null}
        <span><i className="legend-dot legend-mastered" /> Đã thuộc</span>
      </div>
      <p className="bunpo-map-note">
        {level === "N3"
          ? "Các nhánh theo chương N3 có sẵn; từng mẫu mở thẻ ngữ pháp tương ứng."
          : "Sơ đồ là bản phân nhóm đang thử nghiệm; một số mục chưa được liên kết với thẻ trong app."}
      </p>
    </div>
  );
}
