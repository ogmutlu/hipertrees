import { z } from "zod";

const timestamp = z.number().finite().nonnegative();
const nodeSchema = z.object({
  id: z.string().min(1),
  treeId: z.string().min(1),
  parentId: z.string().nullable(),
  title: z.string().trim().min(1).max(100),
  estimateMinutes: z.number().finite().nonnegative(),
  notes: z.string(),
  x: z.number().finite(),
  y: z.number().finite(),
});
const treeSchema = z.object({
  id: z.string().min(1),
  title: z.string().trim().min(1).max(100),
  createdAt: timestamp,
});
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
});
const focusSchema = z.object({
  nodeId: z.string(),
  treeId: z.string(),
  title: z.string(),
  group: z.string(),
  startedAt: timestamp,
  runningSince: timestamp.nullable(),
  elapsedMs: timestamp,
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
    if (nodes.size !== state.nodes.length) fail("Duplicate node identity");
    const trees = new Map(state.trees.map((tree) => [tree.id, tree]));
    const siblingNames = new Set<string>();
    for (const node of state.nodes) {
      const root = nodes.get(node.treeId);
      const parent = node.parentId === null ? null : nodes.get(node.parentId);
      if (
        !trees.has(node.treeId) ||
        !root ||
        root.parentId !== null ||
        root.treeId !== root.id ||
        (node.parentId === null
          ? node.id !== node.treeId
          : !parent || parent.treeId !== node.treeId)
      )
        fail("Invalid tree structure");
      const key = `${node.treeId}:${node.parentId}:${node.title}`;
      if (siblingNames.has(key)) fail("Sibling names must be unique");
      siblingNames.add(key);
      const ancestors = new Set([node.id]);
      let next = node.parentId;
      while (next !== null) {
        if (ancestors.has(next)) {
          fail("Tree contains a cycle");
          break;
        }
        ancestors.add(next);
        next = nodes.get(next)?.parentId ?? null;
      }
    }
    for (const tree of state.trees)
      if (nodes.get(tree.id)?.title !== tree.title)
        fail("Root name must match the tree");
    for (const session of state.sessions)
      if (session.endedAt < session.startedAt) fail("Invalid session dates");
    if (
      state.focus &&
      nodes.get(state.focus.nodeId)?.treeId !== state.focus.treeId
    )
      fail("Focus node is missing");
  });
export type State = z.infer<typeof stateSchema>;
export type GoalNode = z.infer<typeof nodeSchema>;
export type GoalTree = z.infer<typeof treeSchema>;
export type Focus = z.infer<typeof focusSchema>;

export function requireNode(state: State, id: string): GoalNode {
  const node = state.nodes.find((item) => item.id === id);
  if (!node) throw new Error("This node no longer exists.");
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
export function totals(
  state: State,
  treeId: string,
  now: number,
): Map<string, number> {
  const tree = state.trees.find((item) => item.id === treeId);
  const nodes = new Map(
    state.nodes
      .filter((node) => node.treeId === treeId)
      .map((node) => [node.id, node]),
  );
  const result = new Map([...nodes.keys()].map((id) => [id, 0]));
  if (!tree) return result;
  const credit = (nodeId: string, duration: number): void => {
    let node = nodes.get(nodeId);
    while (node) {
      result.set(node.id, (result.get(node.id) ?? 0) + duration);
      node = node.parentId === null ? undefined : nodes.get(node.parentId);
    }
  };
  for (const session of state.sessions)
    if (session.treeId === treeId && session.startedAt >= tree.createdAt)
      credit(session.creditNodeId ?? session.nodeId, session.durationMs);
  if (state.focus?.treeId === treeId && state.focus.startedAt >= tree.createdAt)
    credit(state.focus.nodeId, focusElapsed(state.focus, now));
  return result;
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
export function shortTime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds > 0 && seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(ms / 60000);
  return minutes >= 60
    ? `${Math.floor(minutes / 60)}h ${minutes % 60}m`
    : `${minutes}m`;
}
export type Action =
  | { type: "create"; id: string; title: string }
  | { type: "add"; id: string; parentId: string; title: string }
  | {
      type: "edit";
      expected?: Pick<GoalNode, "title" | "notes" | "estimateMinutes">;
      id: string;
      title: string;
      estimateMinutes: number;
      notes: string;
    }
  | { type: "move"; id: string; x: number; y: number }
  | { type: "layout"; treeId: string }
  | { type: "delete"; id: string }
  | { type: "complete"; id: string; sessionId: string }
  | { type: "start"; id: string }
  | { type: "pause" }
  | { type: "finish"; id: string }
  | { type: "discard" };

export function layout(state: State, treeId: string): State {
  const nodes = state.nodes.filter((node) => node.treeId === treeId);
  const children = (id: string): GoalNode[] =>
    nodes.filter((node) => node.parentId === id);
  const weights = new Map<string, number>();
  const stack: { id: string; depth: number }[] = [{ id: treeId, depth: 0 }];
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
  place(treeId, 0, 90, 920);
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
      action.type === "edit") &&
    !action.title.trim()
  )
    throw new Error("Give this goal a name.");
  if (
    action.type === "edit" &&
    (!Number.isFinite(action.estimateMinutes) || action.estimateMinutes < 0)
  )
    throw new Error("The estimate must be a nonnegative number of minutes.");
  let next: State = state;
  switch (action.type) {
    case "create": {
      const title = action.title.trim();
      if (state.trees.some((tree) => tree.title === title))
        throw new Error("A tree with this name already exists.");
      next = {
        ...state,
        trees: [...state.trees, { id: action.id, title, createdAt: now }],
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
            y: 280,
          },
        ],
      };
      break;
    }
    case "add": {
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
              estimateMinutes: 0,
              notes: "",
              x: 550,
              y: 400,
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
    case "move":
      requireNode(state, action.id);
      next = {
        ...state,
        nodes: state.nodes.map((node) =>
          node.id === action.id ? { ...node, x: action.x, y: action.y } : node,
        ),
      };
      break;
    case "layout":
      next = layout(state, action.treeId);
      break;
    case "complete": {
      const node = requireNode(state, action.id);
      if (node.parentId === null)
        throw new Error("Only child goals can be finished.");
      const parentId = node.parentId;
      const ids = subtreeIds(state, node.id);
      const saved =
        state.focus && ids.has(state.focus.nodeId)
          ? apply(state, { type: "finish", id: action.sessionId }, now)
          : state;
      next = {
        ...saved,
        nodes: saved.nodes.filter((item) => !ids.has(item.id)),
        sessions: saved.sessions.map((session) =>
          session.treeId === node.treeId &&
          ids.has(session.creditNodeId ?? session.nodeId)
            ? { ...session, creditNodeId: parentId }
            : session,
        ),
      };
      break;
    }
    case "delete": {
      const node = requireNode(state, action.id);
      const ids = subtreeIds(state, node.id);
      if (state.focus && ids.has(state.focus.nodeId))
        throw new Error(
          "Save or discard the active session before deleting this branch.",
        );
      next = {
        ...state,
        nodes: state.nodes.filter((item) => !ids.has(item.id)),
        trees: state.trees.filter((tree) => tree.id !== node.id),
      };
      break;
    }
    case "start": {
      const node = requireNode(state, action.id);
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
                node.parentId === null ||
                state.nodes.some((item) => item.parentId === node.id)
                  ? "General"
                  : node.title,
              group: nodePath(state, node.id),
              startedAt: now,
              runningSince: now,
              elapsedMs: 0,
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
            runningSince: null,
          },
        };
      break;
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
