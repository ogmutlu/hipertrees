import { z } from "zod";

const timestamp = z.number().finite().nonnegative();
interface ColorNode {
  id: string;
  treeId: string;
  parentId: string | null;
  color?: string | undefined;
  colors?: string[] | undefined;
  multipleColors?: boolean | undefined;
}
export const DEFAULT_COLORS = [
  "#dfc491",
  "#80c9bc",
  "#9ca8dc",
  "#b7c894",
  "#cb99bc",
  "#86b7db",
  "#dd9689",
  "#a5cfb4",
] as const;
export function assignedNodeColor(
  nodes: readonly ColorNode[],
  node: ColorNode,
): string {
  if (node.multipleColors && node.colors?.[0])
    return node.colors[0].toLowerCase();
  if (node.color) return node.color.toLowerCase();
  if (node.id === node.treeId) return "#dfc491";
  let ancestor = node;
  const seen = new Set<string>();
  while (
    ancestor.parentId !== node.treeId &&
    ancestor.parentId !== null &&
    !seen.has(ancestor.id)
  ) {
    seen.add(ancestor.id);
    const parent = nodes.find((item) => item.id === ancestor.parentId);
    if (!parent) break;
    ancestor = parent;
  }
  const siblings = nodes.filter((item) => item.parentId === node.treeId);
  return (
    DEFAULT_COLORS[
      (Math.max(
        0,
        siblings.findIndex((item) => item.id === ancestor.id),
      ) %
        (DEFAULT_COLORS.length - 1)) +
        1
    ] ?? "#80c9bc"
  );
}
export function assignedNodeColors(
  nodes: readonly ColorNode[],
  node: ColorNode,
): string[] {
  return node.multipleColors && node.colors?.length
    ? node.colors.map((color) => color.toLowerCase())
    : [assignedNodeColor(nodes, node)];
}
export function nextSubtreeColor(state: State, treeId: string): string {
  const used = new Set(
    state.nodes
      .filter((node) => node.treeId === treeId && node.finishedAt === undefined)
      .flatMap((node) => assignedNodeColors(state.nodes, node)),
  );
  for (const color of DEFAULT_COLORS.slice(1))
    if (!used.has(color)) return color;
  // Continue with distinct colors after the default palette is exhausted.
  for (let index = 1; ; index++) {
    const seed = (index * 7919) % 2097152;
    const color =
      "#" +
      [96 + (seed & 127), 96 + ((seed >> 7) & 127), 96 + ((seed >> 14) & 127)]
        .map((channel) => channel.toString(16).padStart(2, "0"))
        .join("");
    if (!used.has(color)) return color;
  }
}
const colorSchema = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/)
  .transform((color) => color.toLowerCase());
const nodeSchema = z.object({
  id: z.string().min(1),
  treeId: z.string().min(1),
  parentId: z.string().nullable(),
  title: z.string().trim().min(1).max(100),
  estimateMinutes: z.number().finite().nonnegative(),
  notes: z.string(),
  finishedAt: timestamp.optional(),
  linkedTreeId: z.string().min(1).optional(),
  filled: z.boolean().optional(),
  color: colorSchema.optional(),
  colors: z
    .array(colorSchema)
    .min(1)
    .max(32)
    .refine(
      (colors) => new Set(colors).size === colors.length,
      "Vertex colors must be unique",
    )
    .optional(),
  multipleColors: z.boolean().optional(),
  x: z.number().finite(),
  y: z.number().finite(),
});
const treeSchema = z.object({
  id: z.string().min(1),
  title: z.string().trim().min(1).max(100),
  createdAt: timestamp,
  pedantic: z.boolean().optional(),
  showFinished: z.boolean().optional(),
});
const periodSchema = z
  .object({ start: timestamp, end: timestamp })
  .refine((period) => period.end >= period.start, "Invalid focus interval");
const sessionSchema = z.object({
  id: z.string().min(1),
  treeId: z.string(),
  nodeId: z.string(),
  creditNodeId: z.string().min(1).optional(),
  title: z.string(),
  group: z.string(),
  startedAt: timestamp,
  endedAt: timestamp,
  durationMs: timestamp,
  periods: z.array(periodSchema).optional(),
});
const focusSchema = z.object({
  nodeId: z.string(),
  treeId: z.string(),
  title: z.string(),
  group: z.string(),
  startedAt: timestamp,
  runningSince: timestamp.nullable(),
  elapsedMs: timestamp,
  periods: z.array(periodSchema).optional(),
});
export const stateSchema = z
  .object({
    version: z.literal(1),
    trees: z.array(treeSchema).max(2000),
    nodes: z.array(nodeSchema).max(2000),
    sessions: z.array(sessionSchema),
    focus: focusSchema.nullable(),
  })
  .superRefine((state, context) => {
    const ids = new Set<string>();
    const fail = (message: string): void => {
      context.addIssue({ code: "custom", message });
    };
    for (const item of [...state.trees, ...state.sessions]) {
      const key = `${"createdAt" in item ? "tree" : "session"}:${item.id}`;
      if (ids.has(key)) fail("Duplicate record identity");
      ids.add(key);
    }
    const nodes = new Map(state.nodes.map((node) => [node.id, node]));
    if (nodes.size !== state.nodes.length) fail("Duplicate vertex identity");
    const trees = new Map(state.trees.map((tree) => [tree.id, tree]));
    const siblingNames = new Set<string>();
    for (const node of state.nodes) {
      if (node.colors && !node.multipleColors)
        fail("Enable multiple colors before assigning a color list.");
      const root = nodes.get(node.treeId);
      const parent = node.parentId === null ? null : nodes.get(node.parentId);
      if (
        !trees.has(node.treeId) ||
        !root ||
        root.parentId !== null ||
        root.treeId !== root.id ||
        (node.id === node.treeId && node.parentId !== null) ||
        (node.parentId !== null && (!parent || parent.treeId !== node.treeId))
      )
        fail("Invalid graph structure");
      const key = `${node.treeId}:${node.parentId}:${node.title}`;
      if (node.finishedAt === undefined) {
        if (siblingNames.has(key)) fail("Sibling names must be unique");
        siblingNames.add(key);
        if (parent?.finishedAt !== undefined)
          fail("Active vertices cannot have finished parents.");
      } else if (node.id === node.treeId) fail("The root cannot be finished.");
      const ancestors = new Set([node.id]);
      let next = node.parentId;
      while (next !== null) {
        if (ancestors.has(next)) {
          fail("Graph contains a cycle");
          break;
        }
        ancestors.add(next);
        next = nodes.get(next)?.parentId ?? null;
      }
    }
    for (const node of state.nodes)
      if (
        node.linkedTreeId &&
        !canLinkTree(state, node.treeId, node.linkedTreeId)
      )
        fail("Hypertree links cannot contain a cycle.");
    for (const tree of state.trees)
      if (nodes.get(tree.id)?.title !== tree.title)
        fail("Root name must match the hypertree");
    for (const session of state.sessions)
      if (session.endedAt < session.startedAt) fail("Invalid session dates");
    if (
      state.focus &&
      (nodes.get(state.focus.nodeId)?.treeId !== state.focus.treeId ||
        nodes.get(state.focus.nodeId)?.finishedAt !== undefined)
    )
      fail("Focus vertex is missing");
    for (const tree of state.trees) {
      if (!tree.pedantic) continue;
      const groups = new Map<string, Set<string>>();
      const forestNodes = state.nodes.filter(
        (node) => node.treeId === tree.id && node.finishedAt === undefined,
      );
      if (
        forestNodes.some(
          (node) => node.id !== tree.id && node.parentId === null,
        )
      )
        fail(
          "pedantic: a hypertree must be connected. Connect every vertex to the root before enabling pedantic.",
        );
      for (const node of forestNodes) {
        for (const color of assignedNodeColors(state.nodes, node)) {
          const group = groups.get(color) ?? new Set<string>();
          group.add(node.id);
          groups.set(color, group);
        }
      }
      // In a forest, an induced subgraph is connected iff it has n - 1 edges.
      for (const [color, group] of groups) {
        const edges = forestNodes.filter(
          (node) =>
            group.has(node.id) &&
            node.parentId !== null &&
            group.has(node.parentId),
        ).length;
        if (edges !== group.size - 1)
          fail(
            `pedantic: vertices colored ${color} must form one connected subtree. Connect them through vertices of that color or recolor them.`,
          );
      }
    }
  })
  .transform((state): typeof state => ({
    ...state,
    nodes: state.nodes.map((node) => ({
      ...node,
      color: assignedNodeColor(state.nodes, node),
      filled: node.filled ?? true,
    })),
  }));
export type State = z.infer<typeof stateSchema>;
export type GoalNode = z.infer<typeof nodeSchema>;
export type GoalTree = z.infer<typeof treeSchema>;
export type Focus = z.infer<typeof focusSchema>;

export function requireNode(state: State, id: string): GoalNode {
  const node = state.nodes.find((item) => item.id === id);
  if (!node) throw new Error("This vertex no longer exists.");
  return node;
}
export function nodePath(state: State, id: string): string {
  const path: string[] = [];
  let node = requireNode(state, id);
  path.push(node.title);
  while (node.parentId !== null) {
    node = requireNode(state, node.parentId);
    path.push(node.title);
  }
  return path.reverse().join(" / ");
}
export function focusElapsed(focus: Focus, now: number): number {
  return (
    focus.elapsedMs +
    (focus.runningSince === null ? 0 : Math.max(0, now - focus.runningSince))
  );
}
export function canLinkTree(
  state: Pick<State, "nodes">,
  treeId: string,
  targetId: string,
): boolean {
  const pending = [targetId];
  const visited = new Set<string>();
  while (pending.length) {
    const current = pending.pop()!;
    if (current === treeId) return false;
    if (visited.has(current)) continue;
    visited.add(current);
    for (const node of state.nodes)
      if (node.treeId === current && node.linkedTreeId)
        pending.push(node.linkedTreeId);
  }
  return true;
}
export function totals(
  state: State,
  treeId: string,
  now: number,
  cache = new Map<string, Map<string, number>>(),
): Map<string, number> {
  const cached = cache.get(treeId);
  if (cached) return cached;
  const tree = state.trees.find((item) => item.id === treeId);
  const nodes = new Map(
    state.nodes
      .filter((node) => node.treeId === treeId)
      .map((node) => [node.id, node]),
  );
  const result = new Map([...nodes.keys()].map((id) => [id, 0]));
  cache.set(treeId, result);
  if (!tree) return result;
  const credit = (nodeId: string, duration: number): void => {
    let node = nodes.get(nodeId);
    let reachedRoot = false;
    while (node) {
      if (node.id === treeId) reachedRoot = true;
      result.set(node.id, (result.get(node.id) ?? 0) + duration);
      node = node.parentId === null ? undefined : nodes.get(node.parentId);
    }
    if (!reachedRoot && nodes.has(nodeId))
      result.set(treeId, (result.get(treeId) ?? 0) + duration);
  };
  for (const session of state.sessions)
    if (session.treeId === treeId && session.startedAt >= tree.createdAt)
      credit(session.creditNodeId ?? session.nodeId, session.durationMs);
  if (state.focus?.treeId === treeId && state.focus.startedAt >= tree.createdAt)
    credit(state.focus.nodeId, focusElapsed(state.focus, now));
  for (const node of nodes.values())
    if (node.linkedTreeId)
      credit(
        node.id,
        totals(state, node.linkedTreeId, now, cache).get(node.linkedTreeId) ??
          0,
      );
  return result;
}
function focusPeriods(
  focus: Focus,
  now: number,
): { start: number; end: number }[] {
  if (!focus.periods)
    return [
      {
        start: Math.max(focus.startedAt, now - focusElapsed(focus, now)),
        end: now,
      },
    ];
  return focus.runningSince === null
    ? focus.periods
    : [
        ...focus.periods,
        { start: focus.runningSince, end: Math.max(focus.runningSince, now) },
      ];
}
function todaySessions(state: State, now: number): State["sessions"] {
  const day = new Date(now);
  day.setHours(0, 0, 0, 0);
  const midnight = day.getTime();
  const duration = (periods: { start: number; end: number }[]): number =>
    periods.reduce(
      (total, period) =>
        total +
        Math.max(
          0,
          Math.min(now, period.end) - Math.max(midnight, period.start),
        ),
      0,
    );
  const sessions = state.sessions.map((session) => ({
    ...session,
    durationMs: duration(
      session.periods ?? [
        {
          start: Math.max(
            session.startedAt,
            session.endedAt - session.durationMs,
          ),
          end: session.endedAt,
        },
      ],
    ),
  }));
  if (state.focus)
    sessions.push({
      id: "live-today",
      treeId: state.focus.treeId,
      nodeId: state.focus.nodeId,
      title: state.focus.title,
      group: state.focus.group,
      startedAt: state.focus.startedAt,
      endedAt: now,
      durationMs: duration(focusPeriods(state.focus, now)),
      periods: [],
    });
  return sessions;
}
export function todayTotals(
  state: State,
  treeId: string,
  now: number,
): Map<string, number> {
  return totals(
    { ...state, sessions: todaySessions(state, now), focus: null },
    treeId,
    now,
  );
}
export function todayTime(state: State, now: number): number {
  return todaySessions(state, now).reduce(
    (total, session) => total + session.durationMs,
    0,
  );
}
export function filterSessions(
  sessions: State["sessions"],
  from: string,
  to: string,
  subject: string,
): State["sessions"] {
  const query = subject.trim().toLocaleLowerCase();
  return sessions.filter((session) => {
    const date = new Date(session.startedAt);
    const day = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    return (
      (!from || day >= from) &&
      (!to || day <= to) &&
      (!query ||
        `${session.title} ${session.group}`.toLocaleLowerCase().includes(query))
    );
  });
}
export function subtreeIds(state: State, id: string): Set<string> {
  const ids = new Set([id]);
  const stack = [id];
  while (stack.length) {
    const parent = stack.pop();
    for (const node of state.nodes)
      if (node.parentId === parent) {
        ids.add(node.id);
        stack.push(node.id);
      }
  }
  return ids;
}
export function formatTime(ms: number): string {
  const seconds = Math.floor(Math.max(0, ms) / 1000);
  return `${Math.floor(seconds / 3600)
    .toString()
    .padStart(2, "0")}:${Math.floor((seconds / 60) % 60)
    .toString()
    .padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;
}
export function formatHms(ms: number): string {
  const seconds = Math.floor(Math.max(0, ms) / 1000);
  return `${Math.floor(seconds / 3600)}h${Math.floor(seconds / 60) % 60}m${seconds % 60}s`;
}
export function shortTime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds > 0 && seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(ms / 60000);
  return minutes >= 60
    ? `${Math.floor(minutes / 60)}h ${minutes % 60}m`
    : `${minutes}m`;
}
export type Action =
  | { type: "showFinished"; treeId: string; enabled: boolean }
  | { type: "pedantic"; treeId: string; enabled: boolean }
  | { type: "create"; id: string; title: string }
  | { type: "reorderTree"; id: string; direction: -1 | 1 }
  | { type: "isolate"; id: string; treeId: string; title: string }
  | { type: "color"; id: string; color: string | null }
  | { type: "colors"; id: string; colors: string[] }
  | { type: "multipleColors"; id: string; enabled: boolean }
  | { type: "fill"; id: string; filled: boolean }
  | {
      type: "add";
      id: string;
      parentId: string;
      title: string;
      linkedTreeId?: string;
    }
  | {
      type: "edit";
      expected?: Pick<GoalNode, "title" | "notes" | "estimateMinutes">;
      id: string;
      title: string;
      estimateMinutes: number;
      notes: string;
    }
  | { type: "connect"; id: string; parentId: string | null }
  | { type: "move"; id: string; x: number; y: number }
  | { type: "layout"; treeId: string }
  | { type: "delete"; id: string }
  | { type: "complete"; id: string; sessionId: string }
  | { type: "start"; id: string }
  | { type: "pause" }
  | {
      type: "addSession";
      id: string;
      nodeId: string;
      startedAt: number;
      durationMs: number;
    }
  | { type: "deleteSession"; id: string }
  | { type: "finish"; id: string }
  | { type: "discard" };

export function layout(state: State, treeId: string): State {
  const nodes = state.nodes.filter(
    (node) => node.treeId === treeId && node.finishedAt === undefined,
  );
  const children = (id: string): GoalNode[] =>
    nodes.filter((node) => node.parentId === id);
  const weights = new Map<string, number>();
  const stack: { id: string; depth: number }[] = nodes
    .filter((node) => node.parentId === null)
    .map((node) => ({ id: node.id, depth: node.id === treeId ? 0 : 1 }));
  const order: { id: string; depth: number }[] = [];
  while (stack.length) {
    const entry = stack.pop();
    if (!entry) break;
    order.push(entry);
    for (const child of children(entry.id))
      stack.push({ id: child.id, depth: entry.depth + 1 });
  }
  for (const entry of [...order].reverse())
    weights.set(
      entry.id,
      Math.max(
        1,
        children(entry.id).reduce(
          (sum, child) => sum + (weights.get(child.id) ?? 1),
          0,
        ),
      ),
    );
  const positions = new Map<string, { x: number; y: number }>();
  const maxDepth = Math.max(2, ...order.map((entry) => entry.depth));
  const place = (
    id: string,
    depth: number,
    left: number,
    width: number,
  ): void => {
    positions.set(id, {
      x: left + width / 2,
      y: 130 + depth * (430 / maxDepth),
    });
    let offset = left;
    for (const child of children(id)) {
      const share =
        (width * (weights.get(child.id) ?? 1)) / (weights.get(id) ?? 1);
      place(child.id, depth + 1, offset, share);
      offset += share;
    }
  };
  const components = nodes.filter((node) => node.parentId === null);
  const totalWeight = components.reduce(
    (sum, node) => sum + (weights.get(node.id) ?? 1),
    0,
  );
  let componentLeft = 90;
  for (const component of components) {
    const width =
      (920 * (weights.get(component.id) ?? 1)) / Math.max(1, totalWeight);
    place(component.id, component.id === treeId ? 0 : 1, componentLeft, width);
    componentLeft += width;
  }
  const root = nodes.find((node) => node.id === treeId);
  positions.set(treeId, { x: root?.x ?? 550, y: root?.y ?? 130 });
  return {
    ...state,
    nodes: state.nodes.map((node) => ({
      ...node,
      ...(positions.get(node.id) ?? {}),
    })),
  };
}
export function apply(state: State, action: Action, now: number): State {
  if (
    (action.type === "create" ||
      action.type === "add" ||
      action.type === "isolate" ||
      action.type === "edit") &&
    !action.title.trim()
  )
    throw new Error("Give this goal a name.");
  if (
    action.type === "edit" &&
    (!Number.isFinite(action.estimateMinutes) || action.estimateMinutes < 0)
  )
    throw new Error("The estimate must be a nonnegative number of minutes.");
  if (
    "id" in action &&
    [
      "start",
      "complete",
      "connect",
      "move",
      "color",
      "colors",
      "multipleColors",
      "fill",
    ].includes(action.type) &&
    state.nodes.find((node) => node.id === action.id)?.finishedAt !== undefined
  )
    throw new Error(
      "Finished vertices cannot be focused or changed in the graph.",
    );
  if (
    action.type === "add" &&
    requireNode(state, action.parentId).finishedAt !== undefined
  )
    throw new Error("Cannot add children to a finished vertex.");
  if (
    action.type === "connect" &&
    action.parentId &&
    requireNode(state, action.parentId).finishedAt !== undefined
  )
    throw new Error("Cannot connect to a finished vertex.");
  let next: State = state;
  switch (action.type) {
    case "showFinished": {
      next = {
        ...state,
        trees: state.trees.map((tree) =>
          tree.id === action.treeId
            ? { ...tree, showFinished: action.enabled }
            : tree,
        ),
      };
      break;
    }
    case "pedantic": {
      if (!state.trees.some((tree) => tree.id === action.treeId))
        throw new Error("This hypertree no longer exists.");
      next = {
        ...state,
        trees: state.trees.map((tree) =>
          tree.id === action.treeId
            ? { ...tree, pedantic: action.enabled }
            : tree,
        ),
      };
      break;
    }
    case "create": {
      const title = action.title.trim();
      if (state.trees.some((tree) => tree.title === title))
        throw new Error("A hypertree with this name already exists.");
      next = {
        ...state,
        trees: [
          ...state.trees,
          { id: action.id, title, createdAt: now, pedantic: false },
        ],
        nodes: [
          ...state.nodes,
          {
            id: action.id,
            treeId: action.id,
            parentId: null,
            title,
            estimateMinutes: 0,
            notes: "",
            x: 550,
            y: 130,
          },
        ],
      };
      break;
    }
    case "isolate": {
      if (!state.trees.some((tree) => tree.id === action.treeId))
        throw new Error("This hypertree no longer exists.");
      const isolatedCount = state.nodes.filter(
        (node) => node.treeId === action.treeId && node.parentId === null,
      ).length;
      next = {
        ...state,
        nodes: [
          ...state.nodes,
          {
            id: action.id,
            treeId: action.treeId,
            parentId: null,
            title: action.title.trim(),
            estimateMinutes: 0,
            notes: "",
            x: 750 + (isolatedCount % 3) * 80,
            y: 220 + (isolatedCount % 5) * 75,
          },
        ],
      };
      break;
    }
    case "fill": {
      requireNode(state, action.id);
      next = {
        ...state,
        nodes: state.nodes.map((node) =>
          node.id === action.id ? { ...node, filled: action.filled } : node,
        ),
      };
      break;
    }
    case "color": {
      requireNode(state, action.id);
      next = {
        ...state,
        nodes: state.nodes.map((node) => {
          if (node.id !== action.id) return node;
          const {
            color: previousColor,
            colors: previousColors,
            ...rest
          } = node;
          void previousColor;
          void previousColors;
          const updated =
            action.color === null ? rest : { ...rest, color: action.color };
          return node.multipleColors
            ? { ...updated, colors: [assignedNodeColor(state.nodes, updated)] }
            : updated;
        }),
      };
      break;
    }
    case "multipleColors": {
      requireNode(state, action.id);
      next = {
        ...state,
        nodes: state.nodes.map((node) => {
          if (node.id !== action.id) return node;
          const colors = assignedNodeColors(state.nodes, node);
          const { colors: previousColors, ...rest } = node;
          void previousColors;
          return action.enabled
            ? { ...rest, multipleColors: true, colors }
            : { ...rest, multipleColors: false, color: colors[0] };
        }),
      };
      break;
    }
    case "colors": {
      const node = requireNode(state, action.id);
      if (!node.multipleColors)
        throw new Error("Enable multiple colors first.");
      next = {
        ...state,
        nodes: state.nodes.map((item) =>
          item.id === action.id
            ? { ...item, colors: action.colors, color: action.colors[0] }
            : item,
        ),
      };
      break;
    }
    case "add": {
      if (
        action.linkedTreeId &&
        !state.trees.some((tree) => tree.id === action.linkedTreeId)
      )
        throw new Error("The linked hypertree no longer exists.");
      const parent = requireNode(state, action.parentId);
      next = layout(
        {
          ...state,
          nodes: [
            ...state.nodes,
            {
              id: action.id,
              treeId: parent.treeId,
              parentId: parent.id,
              title: action.title.trim(),
              ...(action.linkedTreeId
                ? { linkedTreeId: action.linkedTreeId }
                : {}),
              estimateMinutes: 0,
              notes: "",
              x: 550,
              y: 400,
              filled: true,
              ...(parent.id === parent.treeId
                ? {
                    color: nextSubtreeColor(state, parent.treeId),
                  }
                : {
                    color: assignedNodeColor(state.nodes, parent),
                    ...(parent.multipleColors
                      ? {
                          multipleColors: true,
                          colors: assignedNodeColors(state.nodes, parent),
                        }
                      : {}),
                  }),
            },
          ],
        },
        parent.treeId,
      );
      break;
    }
    case "edit": {
      const node = requireNode(state, action.id);
      if (
        action.expected &&
        (node.title !== action.expected.title ||
          node.notes !== action.expected.notes ||
          node.estimateMinutes !== action.expected.estimateMinutes)
      )
        throw new Error(
          "This goal was edited in another tab. Copy your notes and reopen it before saving.",
        );
      next = {
        ...state,
        nodes: state.nodes.map((item) =>
          item.id === action.id
            ? {
                ...item,
                title: action.title.trim(),
                estimateMinutes: action.estimateMinutes,
                notes: action.notes,
              }
            : item,
        ),
        trees: state.trees.map((tree) =>
          tree.id === node.id ? { ...tree, title: action.title.trim() } : tree,
        ),
      };
      break;
    }
    case "connect": {
      const node = requireNode(state, action.id);
      if (node.id === node.treeId)
        throw new Error("The root cannot be reconnected.");
      if (action.parentId !== null) {
        const parent = requireNode(state, action.parentId);
        if (parent.treeId !== node.treeId)
          throw new Error("Connections must stay within this graph.");
        if (subtreeIds(state, node.id).has(parent.id))
          throw new Error("This connection would create a cycle.");
      }
      if (state.focus && subtreeIds(state, node.id).has(state.focus.nodeId))
        throw new Error(
          "Save or discard the active session before reconnecting this subtree.",
        );
      next = {
        ...state,
        nodes: state.nodes.map((item) =>
          item.id === node.id ? { ...item, parentId: action.parentId } : item,
        ),
      };
      break;
    }
    case "move": {
      requireNode(state, action.id);
      next = {
        ...state,
        nodes: state.nodes.map((node) =>
          node.id === action.id ? { ...node, x: action.x, y: action.y } : node,
        ),
      };
      break;
    }
    case "layout":
      next = layout(state, action.treeId);
      break;
    case "complete": {
      const node = requireNode(state, action.id);
      if (node.id === node.treeId)
        throw new Error("Only child goals can be finished.");
      const ids = subtreeIds(state, node.id);
      const saved =
        state.focus && ids.has(state.focus.nodeId)
          ? apply(state, { type: "finish", id: action.sessionId }, now)
          : state;
      next = {
        ...saved,
        nodes: saved.nodes.map((item) =>
          ids.has(item.id)
            ? { ...item, finishedAt: item.finishedAt ?? now }
            : item,
        ),
      };
      break;
    }
    case "delete": {
      const node = requireNode(state, action.id);
      const ids =
        node.id === node.treeId
          ? new Set(
              state.nodes
                .filter((item) => item.treeId === node.treeId)
                .map((item) => item.id),
            )
          : subtreeIds(state, node.id);
      if (state.focus && ids.has(state.focus.nodeId))
        throw new Error(
          `Save or discard the active session before deleting this ${node.id === node.treeId ? "forest" : "subtree"}.`,
        );
      next = {
        ...state,
        nodes: state.nodes.filter((item) => !ids.has(item.id)),
        trees: state.trees.filter((tree) => tree.id !== node.id),
      };
      break;
    }
    case "reorderTree": {
      const index = state.trees.findIndex((tree) => tree.id === action.id);
      if (index < 0) throw new Error("Hypertree no longer exists.");
      const target = index + action.direction;
      if (target < 0 || target >= state.trees.length) break;
      const trees = [...state.trees];
      const moved = trees.splice(index, 1)[0]!;
      trees.splice(target, 0, moved);
      next = { ...state, trees };
      break;
    }
    case "start": {
      let node = requireNode(state, action.id);
      const visited = new Set<string>();
      while (node.linkedTreeId) {
        if (visited.has(node.id))
          throw new Error("Hypertree links cannot contain a cycle.");
        visited.add(node.id);
        node = requireNode(state, node.linkedTreeId);
      }
      if (state.focus && state.focus.nodeId !== node.id)
        throw new Error("Save or discard your current session first.");
      next = {
        ...state,
        focus: state.focus
          ? { ...state.focus, runningSince: state.focus.runningSince ?? now }
          : {
              nodeId: node.id,
              treeId: node.treeId,
              title:
                node.id === node.treeId ||
                state.nodes.some(
                  (item) =>
                    item.parentId === node.id && item.finishedAt === undefined,
                )
                  ? "General"
                  : node.title,
              group: nodePath(state, node.id),
              startedAt: now,
              runningSince: now,
              elapsedMs: 0,
              periods: [],
            },
      };
      break;
    }
    case "pause":
      if (state.focus)
        next = {
          ...state,
          focus: {
            ...state.focus,
            elapsedMs: focusElapsed(state.focus, now),
            periods: focusPeriods(state.focus, now),
            runningSince: null,
          },
        };
      break;
    case "addSession": {
      let node = requireNode(state, action.nodeId);
      while (node.linkedTreeId) node = requireNode(state, node.linkedTreeId);
      const endedAt = action.startedAt + action.durationMs;
      if (
        !Number.isFinite(action.startedAt) ||
        action.startedAt < 0 ||
        !Number.isFinite(action.durationMs) ||
        action.durationMs <= 0 ||
        !Number.isFinite(endedAt) ||
        endedAt > now
      )
        throw new Error(
          "Choose a valid past start time and a positive duration ending no later than now.",
        );
      next = {
        ...state,
        sessions: [
          ...state.sessions,
          {
            id: action.id,
            treeId: node.treeId,
            nodeId: node.id,
            title:
              node.id === node.treeId ||
              state.nodes.some(
                (item) =>
                  item.parentId === node.id && item.finishedAt === undefined,
              )
                ? "General"
                : node.title,
            group: nodePath(state, node.id),
            startedAt: action.startedAt,
            endedAt,
            durationMs: action.durationMs,
            periods: [{ start: action.startedAt, end: endedAt }],
          },
        ],
      };
      break;
    }
    case "deleteSession": {
      if (!state.sessions.some((session) => session.id === action.id))
        throw new Error("This saved session no longer exists.");
      next = {
        ...state,
        sessions: state.sessions.filter((session) => session.id !== action.id),
      };
      break;
    }
    case "finish":
      if (state.focus)
        next = {
          ...state,
          sessions: [
            ...state.sessions,
            {
              id: action.id,
              treeId: state.focus.treeId,
              nodeId: state.focus.nodeId,
              title: state.focus.title,
              group: state.focus.group,
              startedAt: state.focus.startedAt,
              endedAt: Math.max(now, state.focus.startedAt),
              durationMs: focusElapsed(state.focus, now),
              periods: focusPeriods(state.focus, now),
            },
          ],
          focus: null,
        };
      break;
    case "discard":
      next = { ...state, focus: null };
      break;
  }
  const parsed = stateSchema.safeParse(next);
  if (!parsed.success)
    throw new Error(
      [...new Set(parsed.error.issues.map((issue) => issue.message))].join(" "),
    );
  return parsed.data;
}
export function welcome(now: number): State {
  let state: State = {
    version: 1,
    trees: [],
    nodes: [],
    sessions: [],
    focus: null,
  };
  state = apply(
    state,
    { type: "create", id: "welcome", title: "A meaningful project" },
    now,
  );
  // Legacy demo fixtures keep their original distinct subtree colors.
  state = apply(
    state,
    { type: "pedantic", treeId: "welcome", enabled: false },
    now,
  );
  for (const [id, parentId, title] of [
    ["discover", "welcome", "Discover"],
    ["create", "welcome", "Create"],
    ["share", "welcome", "Share"],
    ["read", "discover", "Read & wonder"],
    ["ask", "discover", "Ask good questions"],
    ["sketch", "create", "Sketch an idea"],
    ["build", "create", "Make it real"],
    ["tell", "share", "Tell the story"],
  ] as const)
    state = apply(state, { type: "add", id, parentId, title }, now);
  return state;
}
