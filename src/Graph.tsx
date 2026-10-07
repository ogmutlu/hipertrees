import { useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import type { Action, GoalNode, State } from "./domain";
import { assignedNodeColor, assignedNodeColors, shortTime } from "./domain";
import { Icon } from "./icons";

export function nodeColor(state: State, node: GoalNode): string {
  return assignedNodeColor(state.nodes, node);
}
interface Props {
  editing: boolean;
  state: State;
  treeId: string;
  selected: string | null;
  time: Map<string, number>;
  select: (id: string) => void;
  start: (id: string, point: { x: number; y: number }) => Promise<void>;
  run: (action: Action) => Promise<boolean>;
}
interface Drag {
  id: string | null;
  startX: number;
  startY: number;
  x: number;
  y: number;
  moved: boolean;
}
export function Graph({
  editing,
  state,
  treeId,
  selected,
  time,
  select,
  start,
  run,
}: Props) {
  const svg = useRef<SVGSVGElement>(null);
  const drag = useRef<Drag | null>(null);
  const [link, setLink] = useState<{ id: string; x: number; y: number } | null>(
    null,
  );
  const [position, setPosition] = useState<{
    id: string;
    x: number;
    y: number;
  } | null>(null);
  const [compact, setCompact] = useState(
    () => window.matchMedia("(max-width: 760px)").matches,
  );
  const fitCamera = (
    small: boolean,
  ): { x: number; y: number; scale: number } =>
    small ? { x: 264, y: 172.8, scale: 0.52 } : { x: 0, y: 0, scale: 1 };
  const [camera, setCamera] = useState(() => fitCamera(compact));
  useEffect(() => {
    const element = svg.current;
    if (!element) return;
    const wheel = (event: WheelEvent): void => {
      if (!event.ctrlKey) return;
      event.preventDefault();
      setCamera((previous) => ({
        ...previous,
        scale: Math.max(
          0.55,
          Math.min(2.5, previous.scale - event.deltaY * 0.001),
        ),
      }));
    };
    // A non-passive listener prevents Ctrl+wheel from zooming the browser.
    element.addEventListener("wheel", wheel, { passive: false });
    return () => element.removeEventListener("wheel", wheel);
  }, []);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 760px)");
    const changed = (): void => {
      setCompact(media.matches);
      setCamera(fitCamera(media.matches));
    };
    media.addEventListener("change", changed);
    return () => media.removeEventListener("change", changed);
  }, []);
  const [dragging, setDragging] = useState(false);
  const nodes = state.nodes
    .filter(
      (node) =>
        node.treeId === treeId &&
        (node.finishedAt === undefined ||
          state.trees.find((tree) => tree.id === treeId)?.showFinished),
    )
    .map((node) =>
      node.id === position?.id
        ? { ...node, x: position.x, y: position.y }
        : node,
    );
  const coordinate = (x: number, y: number): DOMPoint => {
    const matrix = svg.current?.getScreenCTM();
    return matrix
      ? new DOMPoint(x, y).matrixTransform(matrix.inverse())
      : new DOMPoint(x, y);
  };
  const down = (
    event: ReactPointerEvent<SVGElement>,
    node?: GoalNode,
  ): void => {
    if (event.button !== 0) return;
    event.stopPropagation();
    if (node && (!editing || node.finishedAt !== undefined)) {
      select(node.id);
      return;
    }
    const point = coordinate(event.clientX, event.clientY);
    drag.current = {
      id: node?.id ?? null,
      startX: point.x,
      startY: point.y,
      x: node?.x ?? camera.x,
      y: node?.y ?? camera.y,
      moved: false,
    };
    if (node) select(node.id);
  };
  const linkDown = (
    event: ReactPointerEvent<SVGElement>,
    node: GoalNode,
  ): void => {
    if (!editing || node.finishedAt !== undefined || event.button !== 0) return;
    event.stopPropagation();
    const point = coordinate(event.clientX, event.clientY);
    setLink({
      id: node.id,
      x: (point.x - camera.x) / camera.scale,
      y: (point.y - camera.y) / camera.scale,
    });
    svg.current?.setPointerCapture(event.pointerId);
  };
  useEffect(() => {
    if (!editing) {
      drag.current = null;
      setPosition(null);
      setLink(null);
      setDragging(false);
    }
  }, [editing]);
  const move = (event: ReactPointerEvent<SVGSVGElement>): void => {
    if (link) {
      const point = coordinate(event.clientX, event.clientY);
      setLink({
        ...link,
        x: (point.x - camera.x) / camera.scale,
        y: (point.y - camera.y) / camera.scale,
      });
      return;
    }
    const current = drag.current;
    if (!current) return;
    const point = coordinate(event.clientX, event.clientY);
    const dx = point.x - current.startX,
      dy = point.y - current.startY;
    if (Math.abs(dx) + Math.abs(dy) > 3) current.moved = true;
    if (!current.moved) return;
    svg.current?.setPointerCapture(event.pointerId);
    setDragging(true);
    if (current.id)
      setPosition({
        id: current.id,
        x: current.x + dx / camera.scale,
        y: current.y + dy / camera.scale,
      });
    else
      setCamera((previous) => ({
        ...previous,
        x: current.x + dx,
        y: current.y + dy,
      }));
  };
  const up = async (): Promise<void> => {
    if (link) {
      const target = nodes.find(
        (node) =>
          node.finishedAt === undefined &&
          Math.hypot(node.x - link.x, node.y - link.y) <= 48,
      );
      setLink(null);
      await run({ type: "connect", id: link.id, parentId: target?.id ?? null });
      return;
    }
    const current = drag.current;
    drag.current = null;
    if (current?.id && current.moved && position)
      await run({ type: "move", ...position });
    setPosition(null);
    setDragging(false);
  };
  return (
    <div
      className={`graph ${editing ? "editing" : "frozen"} ${dragging ? "is-dragging" : ""}`}
    >
      <div className="canvas-grain" />
      <svg
        ref={svg}
        className="graph-svg"
        viewBox="0 0 1100 720"
        preserveAspectRatio={compact ? "xMidYMid slice" : "xMidYMid meet"}
        aria-label="Goal hypertree"
        onPointerDown={(event) => down(event)}
        onPointerMove={move}
        onPointerUp={() => {
          void up();
        }}
        onPointerCancel={() => {
          drag.current = null;
          setPosition(null);
          setLink(null);
          setDragging(false);
        }}
      >
        <defs>
          <filter id="glow">
            <feGaussianBlur stdDeviation="5" />
          </filter>
          <pattern
            id="dots"
            width="28"
            height="28"
            patternUnits="userSpaceOnUse"
          >
            <circle cx="1" cy="1" r=".8" fill="#5a6d7e" opacity=".2" />
          </pattern>
        </defs>
        <rect width="1100" height="720" fill="url(#dots)" />
        <g
          transform={`translate(${camera.x} ${camera.y}) scale(${camera.scale})`}
        >
          {nodes.map((node) => {
            const parent = nodes.find((item) => item.id === node.parentId);
            if (!parent) return null;
            const color = nodeColor(state, node);
            const d = `M${parent.x},${parent.y + (parent.id === treeId ? 24 : 18)} C${parent.x},${(parent.y + node.y) / 2} ${node.x},${(parent.y + node.y) / 2} ${node.x},${node.y - (node.id === treeId ? 24 : 18)}`;
            return (
              <g
                key={`edge-${node.id}`}
                className={
                  node.finishedAt !== undefined ? "edge finished-edge" : "edge"
                }
                data-testid={`edge-${node.id}`}
                onPointerDown={(event) => linkDown(event, node)}
              >
                {editing && node.finishedAt === undefined && (
                  <>
                    <path
                      d={d}
                      stroke="transparent"
                      strokeWidth="18"
                      fill="none"
                      className="edge-handle"
                      onPointerDown={(event) => linkDown(event, node)}
                    />
                    <circle
                      cx={(parent.x + node.x) / 2}
                      cy={(parent.y + node.y) / 2}
                      r="8"
                      fill="#101820"
                      stroke={color}
                      strokeWidth="2"
                      className="edge-handle"
                      data-testid={`edge-handle-${node.id}`}
                      onPointerDown={(event) => linkDown(event, node)}
                    />
                  </>
                )}
                <path
                  d={d}
                  stroke={color}
                  strokeWidth="5"
                  opacity=".09"
                  filter="url(#glow)"
                  fill="none"
                />
                <path
                  d={d}
                  stroke={color}
                  strokeWidth="1.2"
                  opacity=".55"
                  fill="none"
                />
              </g>
            );
          })}
          {link &&
            (() => {
              const child = nodes.find((node) => node.id === link.id);
              return child ? (
                <path
                  d={`M${link.x},${link.y} L${child.x},${child.y}`}
                  stroke="#dfc491"
                  strokeWidth="2"
                  strokeDasharray="6 5"
                  pointerEvents="none"
                />
              ) : null;
            })()}
          {nodes.map((node) => {
            const color = nodeColor(state, node);
            const colors = assignedNodeColors(state.nodes, node);
            const isActive = state.focus?.nodeId === node.id;

            const radius = node.id === treeId ? 24 : 18;
            return (
              <g
                key={node.id}
                transform={`translate(${node.x} ${node.y})`}
                className={`goal ${node.id === treeId ? "root-goal" : ""} ${selected === node.id ? "selected" : ""} ${isActive ? "active" : ""} ${node.finishedAt !== undefined ? "finished-ghost" : ""}`}
                data-testid={`node-${node.id}`}
              >
                <g
                  role="button"
                  tabIndex={0}
                  aria-label={`Select ${node.title}`}
                  onPointerDown={(event) => down(event, node)}
                  onDoubleClick={(event) => {
                    event.stopPropagation();
                    if (node.finishedAt !== undefined) return;
                    void start(node.id, {
                      x: event.clientX - innerWidth / 2,
                      y: event.clientY - innerHeight / 2,
                    });
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      select(node.id);
                    }
                  }}
                >
                  {node.id === treeId && (
                    <circle
                      r={radius + 5}
                      fill="none"
                      stroke={color}
                      strokeWidth="2"
                    />
                  )}
                  <circle
                    r={radius + 13}
                    className="node-aura"
                    fill={color}
                    filter="url(#glow)"
                  />
                  <circle
                    r={radius + 7}
                    className="selection-ring"
                    stroke={color}
                    strokeWidth=".8"
                    strokeDasharray="2 5"
                    fill="none"
                  />
                  <circle
                    r={radius}
                    data-testid={`node-fill-${node.id}`}
                    fill={node.filled ? color : "#101820"}
                    stroke={color}
                    strokeWidth={selected === node.id ? "2" : "1.4"}
                  />
                  {colors.length > 1 && (
                    <g data-testid={`node-colors-${node.id}`}>
                      {colors.map((segment, index) => {
                        const start =
                          -Math.PI / 2 + (index * 2 * Math.PI) / colors.length;
                        const end =
                          -Math.PI / 2 +
                          ((index + 1) * 2 * Math.PI) / colors.length;
                        const arc = `M${radius * Math.cos(start)},${radius * Math.sin(start)} A${radius},${radius} 0 0 1 ${radius * Math.cos(end)},${radius * Math.sin(end)}`;
                        return (
                          <path
                            key={segment}
                            data-color={segment}
                            d={
                              node.filled
                                ? `M0,0 L${radius * Math.cos(start)},${radius * Math.sin(start)} ${arc.slice(arc.indexOf(" A") + 1)} Z`
                                : arc
                            }
                            fill={node.filled ? segment : "none"}
                            stroke={segment}
                            strokeWidth={selected === node.id ? "2" : "1.4"}
                          />
                        );
                      })}
                    </g>
                  )}
                  <circle
                    r={radius - 7}
                    fill="none"
                    stroke={color}
                    opacity=".16"
                    strokeWidth=".7"
                  />
                  <text
                    y={radius + 23}
                    textAnchor="middle"
                    className="node-title"
                    fill="#ffffff"
                  >
                    {node.title.length > 23
                      ? `${node.title.slice(0, 22)}…`
                      : node.title}
                  </text>
                  <text
                    y={radius + 40}
                    textAnchor="middle"
                    className="node-time"
                  >
                    {shortTime(time.get(node.id) ?? 0)}
                    {node.estimateMinutes
                      ? ` / ${shortTime(node.estimateMinutes * 60000)}`
                      : " focused"}
                  </text>
                </g>
                {editing &&
                  node.finishedAt === undefined &&
                  node.id !== treeId &&
                  node.parentId === null && (
                    <circle
                      cx="0"
                      cy={-radius - 10}
                      r="8"
                      fill="#101820"
                      stroke={color}
                      strokeWidth="2"
                      className="edge-handle"
                      data-testid={`edge-handle-${node.id}`}
                      onPointerDown={(event) => linkDown(event, node)}
                    />
                  )}
              </g>
            );
          })}
        </g>
      </svg>
      <div className="canvas-controls">
        <button
          className="icon-button"
          aria-label="Zoom out"
          onClick={() =>
            setCamera((previous) => ({
              ...previous,
              scale: Math.max(0.55, previous.scale - 0.15),
            }))
          }
        >
          −
        </button>
        <button
          className="icon-button"
          aria-label="Zoom in"
          onClick={() =>
            setCamera((previous) => ({
              ...previous,
              scale: Math.min(2.5, previous.scale + 0.15),
            }))
          }
        >
          +
        </button>
        <button
          className="icon-button"
          aria-label="Fit graph"
          onClick={() => setCamera(fitCamera(compact))}
        >
          <Icon name="fit" />
        </button>
        <button
          className="icon-button"
          aria-label="Arrange vertices"
          disabled={!editing}
          onClick={() => {
            setCamera(fitCamera(compact));
            void run({ type: "layout", treeId });
          }}
        >
          <Icon name="tree" />
        </button>
      </div>
    </div>
  );
}
