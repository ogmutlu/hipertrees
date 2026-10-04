import { useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import type { Action, GoalNode, State } from "./domain";
import { shortTime } from "./domain";
import { Icon } from "./icons";

const PALETTE = ["#80c9bc", "#9ca8dc", "#d5aa79", "#b7c894", "#cb99bc"];
export function nodeColor(state: State, node: GoalNode): string {
  if (node.parentId === null) return "#dfc491";
  let ancestor = node;
  while (ancestor.parentId !== node.treeId && ancestor.parentId !== null) {
    const parent = state.nodes.find((item) => item.id === ancestor.parentId);
    if (!parent) break;
    ancestor = parent;
  }
  const siblings = state.nodes.filter((item) => item.parentId === node.treeId);
  return (
    PALETTE[
      Math.max(
        0,
        siblings.findIndex((item) => item.id === ancestor.id),
      ) % PALETTE.length
    ] ?? "#80c9bc"
  );
}
interface Props {
  state: State;
  treeId: string;
  selected: string | null;
  time: Map<string, number>;
  select: (id: string) => void;
  start: (id: string, origin: { x: number; y: number }) => void;
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
    .filter((node) => node.treeId === treeId)
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
    const point = coordinate(event.clientX, event.clientY);
    drag.current = {
      id: node?.id ?? null,
      startX: point.x,
      startY: point.y,
      x: node?.x ?? camera.x,
      y: node?.y ?? camera.y,
      moved: false,
    };
    svg.current?.setPointerCapture(event.pointerId);
    if (node) select(node.id);
  };
  const move = (event: ReactPointerEvent<SVGSVGElement>): void => {
    const current = drag.current;
    if (!current) return;
    const point = coordinate(event.clientX, event.clientY);
    const dx = point.x - current.startX,
      dy = point.y - current.startY;
    if (Math.abs(dx) + Math.abs(dy) > 3) current.moved = true;
    if (!current.moved) return;
    setDragging(true);
    if (current.id)
      setPosition({
        id: current.id,
        x: Math.min(1040, Math.max(60, current.x + dx / camera.scale)),
        y: Math.min(660, Math.max(60, current.y + dy / camera.scale)),
      });
    else
      setCamera((previous) => ({
        ...previous,
        x: current.x + dx,
        y: current.y + dy,
      }));
  };
  const up = async (): Promise<void> => {
    const current = drag.current;
    drag.current = null;
    if (current?.id && current.moved && position)
      await run({ type: "move", ...position });
    setPosition(null);
    setDragging(false);
  };
  const activate = (id: string, element: Element): void => {
    const rect = element.getBoundingClientRect();
    start(id, {
      x: rect.left + rect.width / 2 - window.innerWidth / 2,
      y: rect.top + rect.height / 2 - window.innerHeight / 2,
    });
  };
  return (
    <div className={`graph ${dragging ? "is-dragging" : ""}`}>
      <div className="canvas-grain" />
      <svg
        ref={svg}
        className="graph-svg"
        viewBox="0 0 1100 720"
        preserveAspectRatio={compact ? "xMidYMid slice" : "xMidYMid meet"}
        aria-label="Draggable goal tree"
        onPointerDown={(event) => down(event)}
        onPointerMove={move}
        onPointerUp={() => {
          void up();
        }}
        onPointerCancel={() => {
          drag.current = null;
          setPosition(null);
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
            const d = `M${parent.x},${parent.y + 30} C${parent.x},${(parent.y + node.y) / 2} ${node.x},${(parent.y + node.y) / 2} ${node.x},${node.y - 30}`;
            return (
              <g key={`edge-${node.id}`} className="edge">
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
          {nodes.map((node) => {
            const color = nodeColor(state, node);
            const isActive = state.focus?.nodeId === node.id;
            const hasChildren = nodes.some((item) => item.parentId === node.id);
            const radius = node.parentId === null ? 39 : 31;
            return (
              <g
                key={node.id}
                transform={`translate(${node.x} ${node.y})`}
                className={`goal ${selected === node.id ? "selected" : ""} ${isActive ? "active" : ""}`}
                data-testid={`node-${node.id}`}
              >
                <g
                  role="button"
                  tabIndex={0}
                  aria-label={`Select ${node.title}`}
                  onPointerDown={(event) => down(event, node)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      select(node.id);
                    }
                  }}
                >
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
                    fill="#101820"
                    stroke={color}
                    strokeWidth={selected === node.id ? "2" : "1.4"}
                  />
                  <circle
                    r={radius - 7}
                    fill="none"
                    stroke={color}
                    opacity=".16"
                    strokeWidth=".7"
                  />
                  {hasChildren || node.parentId === null ? (
                    <g stroke={color} fill="#101820" strokeWidth="1.2">
                      <path d="M0-6-8 7M0-6 8 7" />
                      <circle cy="-8" r="3" />
                      <circle cx="-9" cy="9" r="3" />
                      <circle cx="9" cy="9" r="3" />
                    </g>
                  ) : (
                    <path
                      d="M0-7 2-2 7 0 2 2 0 7-2 2-7 0-2-2Z"
                      fill={color}
                      opacity=".9"
                    />
                  )}
                  <text
                    y={radius + 29}
                    textAnchor="middle"
                    className="node-title"
                    fill={color}
                  >
                    {node.title.length > 23
                      ? `${node.title.slice(0, 22)}…`
                      : node.title}
                  </text>
                  <text
                    y={radius + 49}
                    textAnchor="middle"
                    className="node-time"
                  >
                    {shortTime(time.get(node.id) ?? 0)}
                    {node.estimateMinutes
                      ? ` / ${shortTime(node.estimateMinutes * 60000)}`
                      : " focused"}
                  </text>
                </g>
                <g
                  role="button"
                  tabIndex={0}
                  aria-label={`${isActive ? "Resume" : "Start"} focus on ${node.title}`}
                  className="node-play"
                  transform={`translate(${radius * 0.8} ${radius * 0.65})`}
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={(event) => {
                    event.stopPropagation();
                    activate(node.id, event.currentTarget);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      activate(node.id, event.currentTarget);
                    }
                  }}
                >
                  <circle
                    r="13"
                    fill={color}
                    stroke="#0b1017"
                    strokeWidth="3"
                  />
                  <path d="m-3-4 7 4-7 4Z" fill="#111a20" />
                </g>
              </g>
            );
          })}
        </g>
      </svg>
      <div className="graph-caption">
        <span className="tiny-star">✦</span> Every small step belongs to
        something bigger.
      </div>
      <div className="canvas-controls">
        <span>Drag nodes · Ctrl + scroll to zoom</span>
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
          aria-label="Arrange nodes"
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
