import { describe, expect, it } from "vitest";
import {
  apply,
  DEFAULT_COLORS,
  assignedNodeColors,
  focusElapsed,
  stateSchema,
  totals,
  welcome,
} from "../src/domain";
import type { State } from "../src/domain";
import { LEGACY_STORAGE_KEY, STORAGE_KEY, Workspace } from "../src/storage";

const empty = (): State => ({
  version: 1,
  trees: [],
  nodes: [],
  sessions: [],
  focus: null,
});
function example(): State {
  let state = apply(
    empty(),
    { type: "create", id: "root", title: "Thesis" },
    1000,
  );
  state = apply(
    state,
    { type: "pedantic", treeId: "root", enabled: false },
    1000,
  );
  state = apply(
    state,
    { type: "add", id: "branch", parentId: "root", title: "Research" },
    1001,
  );
  return apply(
    state,
    { type: "add", id: "leaf", parentId: "branch", title: "Read" },
    1002,
  );
}
class MemoryStorage {
  readonly values = new Map<string, string>([
    [
      STORAGE_KEY,
      JSON.stringify(
        apply(
          welcome(1000),
          {
            type: "edit",
            id: "welcome",
            title: "Test project",
            notes: "",
            estimateMinutes: 0,
          },
          1000,
        ),
      ),
    ],
  ]);
  fail = false;
  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    if (this.fail) throw new Error("Quota exceeded");
    this.values.set(key, value);
  }
  removeItem(key: string): void {
    if (this.fail) throw new Error("Storage unavailable");
    this.values.delete(key);
  }
}

it("clears workspace and legacy data without touching other storage", () => {
  const storage = new MemoryStorage();
  storage.setItem(LEGACY_STORAGE_KEY, JSON.stringify(example()));
  storage.setItem("other-app", "keep");
  const workspace = new Workspace(storage, 1000);
  const otherTab = new Workspace(storage, 1000);
  workspace.clear();
  expect(workspace.getSnapshot()).toEqual(empty());
  expect(storage.getItem(LEGACY_STORAGE_KEY)).toBeNull();
  expect(storage.getItem("other-app")).toBe("keep");
  otherTab.refresh();
  expect(otherTab.getSnapshot()).toEqual(empty());
  expect(new Workspace(storage, 2000).getSnapshot()).toEqual(empty());
});

describe("focus accounting", () => {
  it("counts initial and outline colors while filling changes only appearance", () => {
    let state = apply(
      example(),
      { type: "pedantic", treeId: "root", enabled: true },
      2000,
    );
    expect(() =>
      apply(state, { type: "connect", id: "leaf", parentId: "root" }, 3000),
    ).toThrow("connected subtree");
    const before = state.nodes.find((node) => node.id === "branch")?.color;
    state = apply(state, { type: "fill", id: "branch", filled: true }, 3000);
    state = apply(state, { type: "fill", id: "branch", filled: false }, 4000);
    expect(state.nodes.find((node) => node.id === "branch")).toMatchObject({
      color: before,
      filled: false,
    });
    expect(state.trees[0]?.pedantic).toBe(true);
    expect(() =>
      apply(
        state,
        { type: "isolate", id: "island", treeId: "root", title: "Island" },
        4000,
      ),
    ).toThrow("must be connected");
    state = apply(
      state,
      { type: "add", id: "child", parentId: "leaf", title: "Child" },
      5000,
    );
    expect(state.nodes.find((node) => node.id === "child")?.color).toBe(
      state.nodes.find((node) => node.id === "leaf")?.color,
    );
    expect(
      stateSchema.parse(JSON.parse(JSON.stringify(state))).trees[0]?.pedantic,
    ).toBe(true);
  });
  it("enforces connected color classes in pedantic forests", () => {
    let state = apply(
      example(),
      { type: "color", id: "root", color: "#AABBCC" },
      2000,
    );
    state = apply(state, { type: "color", id: "leaf", color: "#aabbcc" }, 2000);
    expect(() =>
      apply(state, { type: "pedantic", treeId: "root", enabled: true }, 2000),
    ).toThrow("connected subtree");
    state = apply(
      state,
      { type: "color", id: "branch", color: "#aabbcc" },
      2000,
    );
    state = apply(
      state,
      { type: "pedantic", treeId: "root", enabled: true },
      2000,
    );
    expect(state.nodes.find((node) => node.id === "root")?.color).toBe(
      "#aabbcc",
    );
    expect(() =>
      apply(state, { type: "color", id: "branch", color: null }, 3000),
    ).toThrow("connected subtree");
    expect(() =>
      apply(state, { type: "connect", id: "branch", parentId: null }, 3000),
    ).toThrow("must be connected");
    expect(() =>
      apply(
        state,
        { type: "isolate", id: "island", treeId: "root", title: "Island" },
        3000,
      ),
    ).toThrow("must be connected");
    expect(() =>
      stateSchema.parse({
        ...state,
        nodes: state.nodes.map((node) =>
          node.id === "branch" ? { ...node, parentId: null } : node,
        ),
      }),
    ).toThrow("must be connected");
    state = apply(
      state,
      { type: "complete", id: "branch", sessionId: "unused" },
      4000,
    );
    expect(state.nodes.map((node) => node.id)).toEqual(["root"]);
    state = apply(
      state,
      { type: "pedantic", treeId: "root", enabled: false },
      4000,
    );
    state = apply(
      state,
      { type: "isolate", id: "island", treeId: "root", title: "Island" },
      5000,
    );
    expect(() =>
      apply(state, { type: "pedantic", treeId: "root", enabled: true }, 6000),
    ).toThrow("must be connected");
  });
  it("supports disconnected components and rejects invalid reconnections", () => {
    let state = apply(example(), { type: "start", id: "leaf" }, 2000);
    state = apply(state, { type: "finish", id: "saved" }, 5000);
    state = apply(state, { type: "connect", id: "leaf", parentId: null }, 6000);
    expect(totals(state, "root", 6000).get("root")).toBe(3000);
    expect(totals(state, "root", 6000).get("branch")).toBe(0);
    state = apply(state, { type: "move", id: "leaf", x: 200, y: 450 }, 7000);
    state = apply(state, { type: "layout", treeId: "root" }, 8000);
    expect(
      stateSchema
        .parse(JSON.parse(JSON.stringify(state)))
        .nodes.find((node) => node.id === "leaf")?.parentId,
    ).toBeNull();
    state = apply(
      state,
      { type: "connect", id: "leaf", parentId: "branch" },
      9000,
    );
    expect(totals(state, "root", 9000).get("branch")).toBe(3000);
    expect(() =>
      apply(state, { type: "connect", id: "branch", parentId: "leaf" }, 10000),
    ).toThrow("cycle");
    expect(() =>
      apply(state, { type: "connect", id: "root", parentId: "leaf" }, 10000),
    ).toThrow("root");
    state = apply(
      state,
      { type: "create", id: "other", title: "Other" },
      10000,
    );
    expect(() =>
      apply(state, { type: "connect", id: "leaf", parentId: "other" }, 10000),
    ).toThrow("within this graph");
    state = apply(
      state,
      { type: "connect", id: "branch", parentId: null },
      11000,
    );
    state = apply(state, { type: "start", id: "leaf" }, 12000);
    expect(() =>
      apply(state, { type: "connect", id: "branch", parentId: "root" }, 13000),
    ).toThrow("active session");
    expect(() => apply(state, { type: "delete", id: "root" }, 13000)).toThrow(
      "active session",
    );
    state = apply(state, { type: "discard" }, 13000);
    state = apply(state, { type: "delete", id: "root" }, 14000);
    expect(state.nodes.map((node) => node.id)).toEqual(["other"]);
  });
  it("finishes children without losing ancestor time or session history", () => {
    let state = apply(example(), { type: "start", id: "leaf" }, 2000);
    state = apply(state, { type: "pause" }, 62000);
    state = apply(
      state,
      { type: "complete", id: "leaf", sessionId: "saved" },
      90000,
    );
    expect(state.focus).toBeNull();
    expect(state.nodes.some((node) => node.id === "leaf")).toBe(false);
    expect(state.sessions[0]).toMatchObject({
      nodeId: "leaf",
      creditNodeId: "branch",
      durationMs: 60000,
      title: "Read",
      group: "Thesis / Research / Read",
    });
    expect(totals(state, "root", 90000)).toEqual(
      new Map([
        ["root", 60000],
        ["branch", 60000],
      ]),
    );
    state = apply(state, { type: "start", id: "branch" }, 100000);
    state = apply(
      state,
      { type: "complete", id: "branch", sessionId: "branch-session" },
      130000,
    );
    state = stateSchema.parse(JSON.parse(JSON.stringify(state)));
    expect(totals(state, "root", 140000)).toEqual(new Map([["root", 90000]]));
    expect(state.sessions).toHaveLength(2);
    expect(state.sessions[0]?.nodeId).toBe("leaf");
    expect(() =>
      apply(
        state,
        { type: "complete", id: "root", sessionId: "unused" },
        140000,
      ),
    ).toThrow("Only child");
  });
  it("finishes an entire branch and excludes sessions before tree creation", () => {
    let state = apply(example(), { type: "start", id: "leaf" }, 2000);
    state = apply(state, { type: "finish", id: "saved" }, 5000);
    const session = state.sessions[0];
    if (!session) throw new Error("Missing session");
    state = {
      ...state,
      sessions: [
        ...state.sessions,
        {
          ...session,
          id: "old",
          startedAt: 0,
        },
      ],
    };
    state = apply(
      state,
      { type: "complete", id: "branch", sessionId: "unused" },
      6000,
    );
    expect(state.nodes.map((node) => node.id)).toEqual(["root"]);
    expect(totals(state, "root", 6000).get("root")).toBe(3000);
  });
  it("excludes pauses and credits every ancestor once", () => {
    let state = apply(example(), { type: "start", id: "leaf" }, 2000);
    expect(state.focus?.title).toBe("Read");
    state = apply(state, { type: "pause" }, 62000);
    expect(state.focus && focusElapsed(state.focus, 300000)).toBe(60000);
    state = apply(state, { type: "start", id: "leaf" }, 400000);
    state = apply(state, { type: "finish", id: "session" }, 430000);
    expect(state.sessions[0]?.durationMs).toBe(90000);
    expect(state.sessions[0]?.group).toBe("Thesis / Research / Read");
    expect(totals(state, "root", 430000)).toEqual(
      new Map([
        ["root", 90000],
        ["branch", 90000],
        ["leaf", 90000],
      ]),
    );
    state = apply(state, { type: "start", id: "branch" }, 440000);
    expect(state.focus?.title).toBe("General");
    state = apply(state, { type: "finish", id: "general" }, 450000);
    expect(totals(state, "root", 450000).get("root")).toBe(100000);
    expect(totals(state, "root", 450000).get("leaf")).toBe(90000);
  });
  it("keeps attribution after renaming and isolates old sessions", () => {
    let state = apply(example(), { type: "start", id: "leaf" }, 2000);
    state = apply(state, { type: "finish", id: "saved" }, 5000);
    state = apply(
      state,
      {
        type: "edit",
        id: "leaf",
        title: "Read papers",
        estimateMinutes: 60,
        notes: "# Notes",
      },
      6000,
    );
    expect(totals(state, "root", 7000).get("leaf")).toBe(3000);
    const beforeCreation = {
      ...state,
      sessions: [
        ...state.sessions,
        {
          id: "past",
          treeId: "root",
          nodeId: "leaf",
          title: "Read",
          group: "",
          startedAt: 999,
          endedAt: 2000,
          durationMs: 1000,
        },
      ],
    };
    expect(totals(beforeCreation, "root", 7000).get("root")).toBe(3000);
    state = apply(state, { type: "delete", id: "root" }, 7000);
    expect(state.sessions).toHaveLength(1);
    state = apply(
      state,
      { type: "create", id: "new-root", title: "Thesis" },
      8000,
    );
    expect(totals(state, "new-root", 9000).get("new-root")).toBe(0);
  });
  it("blocks switching or deleting an unsaved active goal", () => {
    const state = apply(example(), { type: "start", id: "leaf" }, 2000);
    expect(() => apply(state, { type: "start", id: "root" }, 3000)).toThrow(
      "current session",
    );
    expect(() => apply(state, { type: "delete", id: "branch" }, 3000)).toThrow(
      "active session",
    );
    expect(apply(state, { type: "discard" }, 3000).sessions).toHaveLength(0);
  });
});
describe("validated persistence", () => {
  it("migrates the previous app storage without losing work", () => {
    const storage = new MemoryStorage();
    const previous = storage.getItem(STORAGE_KEY);
    storage.values.clear();
    if (!previous) throw new Error("Missing fixture");
    storage.setItem(LEGACY_STORAGE_KEY, previous);
    const migrated = new Workspace(storage, 2000).getSnapshot();
    expect(migrated.nodes).toHaveLength(9);
    expect(storage.getItem(STORAGE_KEY)).toBe(JSON.stringify(migrated));
    expect(storage.getItem(LEGACY_STORAGE_KEY)).toBe(previous);
  });
  it("persists root movement, isolated nodes and validated fill colors", () => {
    const storage = new MemoryStorage();
    const workspace = new Workspace(storage, 1000);
    workspace.commit({ type: "move", id: "welcome", x: 220, y: 300 }, 2000);
    workspace.commit(
      {
        type: "isolate",
        id: "isolated",
        treeId: "welcome",
        title: "Independent",
      },
      3000,
    );
    workspace.commit({ type: "color", id: "isolated", color: "#ef6a75" }, 4000);
    workspace.commit(
      { type: "add", id: "child", parentId: "isolated", title: "Child" },
      5000,
    );
    const reloaded = new Workspace(storage, 6000).getSnapshot();
    expect(reloaded.nodes.find((node) => node.id === "welcome")).toMatchObject({
      x: 220,
      y: 300,
    });
    expect(reloaded.nodes.find((node) => node.id === "isolated")).toMatchObject(
      { parentId: null, color: "#ef6a75" },
    );
    expect(reloaded.nodes.find((node) => node.id === "child")?.parentId).toBe(
      "isolated",
    );
    expect(() =>
      workspace.commit(
        { type: "color", id: "isolated", color: "invalid" },
        7000,
      ),
    ).toThrow();
    workspace.commit({ type: "color", id: "isolated", color: null }, 8000);
    expect(
      workspace.getSnapshot().nodes.find((node) => node.id === "isolated")
        ?.color,
    ).toBe("#80c9bc");
  });
  it("starts empty and removes only untouched legacy starter trees", () => {
    const storage = new MemoryStorage();
    storage.values.clear();
    expect(new Workspace(storage, 1000).getSnapshot().trees).toEqual([]);
    storage.setItem(STORAGE_KEY, JSON.stringify(welcome(1000)));
    expect(new Workspace(storage, 2000).getSnapshot().trees).toEqual([]);
    let used = apply(welcome(1000), { type: "start", id: "read" }, 2000);
    used = apply(used, { type: "finish", id: "saved" }, 3000);
    storage.setItem(STORAGE_KEY, JSON.stringify(used));
    expect(new Workspace(storage, 4000).getSnapshot().sessions).toHaveLength(1);
    expect(new Workspace(storage, 4000).getSnapshot().trees).toHaveLength(1);
    expect(
      apply(
        used,
        { type: "move", id: "welcome", x: 100, y: 200 },
        4000,
      ).nodes.find((node) => node.id === "welcome"),
    ).toMatchObject({ x: 100, y: 200 });
  });
  it("retains drag positions, notes and a running focus across reloads", () => {
    const storage = new MemoryStorage();
    const workspace = new Workspace(storage, 1000);
    workspace.commit({ type: "move", id: "read", x: 222, y: 333 }, 2000);
    workspace.commit(
      {
        type: "edit",
        id: "read",
        title: "Read & wonder",
        estimateMinutes: 20,
        notes: "# A thought",
      },
      3000,
    );
    workspace.commit({ type: "start", id: "read" }, 4000);
    const reloaded = new Workspace(storage, 5000).getSnapshot();
    expect(reloaded.nodes.find((node) => node.id === "read")).toMatchObject({
      x: 222,
      y: 333,
      notes: "# A thought",
    });
    expect(reloaded.focus && focusElapsed(reloaded.focus, 6000)).toBe(2000);
  });
  it("keeps the previous visible state on failed writes", () => {
    const storage = new MemoryStorage();
    const workspace = new Workspace(storage, 1000);
    const previous = workspace.getSnapshot();
    storage.fail = true;
    expect(() =>
      workspace.commit({ type: "delete", id: "read" }, 2000),
    ).toThrow("Quota");
    expect(workspace.getSnapshot()).toBe(previous);
  });
  it("never silently resets corrupted data or imports cycles", () => {
    const storage = new MemoryStorage();
    storage.setItem(STORAGE_KEY, "{broken");
    expect(() => new Workspace(storage, 1000)).toThrow();
    expect(storage.getItem(STORAGE_KEY)).toBe("{broken");
    const state = example();
    expect(() =>
      stateSchema.parse({
        ...state,
        nodes: state.nodes.map((node) =>
          node.id === "branch" ? { ...node, parentId: "leaf" } : node,
        ),
      }),
    ).toThrow();
  });
  it("refreshes another tab before mutating without losing its changes", () => {
    const storage = new MemoryStorage();
    const first = new Workspace(storage, 1000),
      second = new Workspace(storage, 1000);
    first.commit(
      {
        type: "edit",
        id: "read",
        title: "Read & wonder",
        notes: "Other tab",
        estimateMinutes: 0,
      },
      2000,
    );
    second.commit({ type: "move", id: "read", x: 77, y: 88 }, 3000);
    first.refresh();
    expect(
      first.getSnapshot().nodes.find((node) => node.id === "read"),
    ).toMatchObject({ notes: "Other tab", x: 77, y: 88 });
  });
  it("preserves another tab's notes when an older edit form is submitted", () => {
    const storage = new MemoryStorage();
    const first = new Workspace(storage, 1000),
      second = new Workspace(storage, 1000);
    const original = first
      .getSnapshot()
      .nodes.find((node) => node.id === "read");
    if (!original) throw new Error("Missing example goal");
    second.commit(
      {
        type: "edit",
        id: "read",
        title: original.title,
        notes: "New notes",
        estimateMinutes: 0,
      },
      2000,
    );
    expect(() =>
      first.commit(
        {
          type: "edit",
          id: "read",
          expected: original,
          title: original.title,
          notes: "Stale notes",
          estimateMinutes: 0,
        },
        3000,
      ),
    ).toThrow("edited in another tab");
    expect(
      first.getSnapshot().nodes.find((node) => node.id === "read")?.notes,
    ).toBe("New notes");
  });
  it("creates a valid, fully laid-out example", () => {
    expect(stateSchema.parse(welcome(1000)).nodes).toHaveLength(9);
  });
});

it("new hypertrees default to pedantic and require connectivity even with distinct colors", () => {
  let state = apply(
    empty(),
    { type: "create", id: "root", title: "Connected" },
    1000,
  );
  expect(state.trees[0]?.pedantic).toBe(true);
  state = apply(
    state,
    { type: "add", id: "leaf", parentId: "root", title: "Leaf" },
    1001,
  );
  state = apply(state, { type: "color", id: "leaf", color: "#ef6a75" }, 1002);
  expect(() =>
    apply(state, { type: "connect", id: "leaf", parentId: null }, 1003),
  ).toThrow("must be connected");
  expect(() =>
    stateSchema.parse({
      ...state,
      nodes: state.nodes.map((node) =>
        node.id === "leaf" ? { ...node, parentId: null } : node,
      ),
    }),
  ).toThrow("must be connected");
  state = apply(
    state,
    { type: "pedantic", treeId: "root", enabled: false },
    1004,
  );
  state = apply(state, { type: "connect", id: "leaf", parentId: null }, 1005);
  expect(() =>
    apply(state, { type: "pedantic", treeId: "root", enabled: true }, 1006),
  ).toThrow("must be connected");
  state = apply(state, { type: "connect", id: "leaf", parentId: "root" }, 1007);
  state = apply(
    state,
    { type: "pedantic", treeId: "root", enabled: true },
    1008,
  );
  expect(state.trees[0]?.pedantic).toBe(true);
});

it("migrates previously pedantic disconnected storage without weakening imports", () => {
  let state = apply(
    example(),
    { type: "color", id: "leaf", color: "#ef6a75" },
    2000,
  );
  state = apply(state, { type: "connect", id: "leaf", parentId: null }, 2001);
  const legacy = {
    ...state,
    trees: state.trees.map((tree) => ({ ...tree, pedantic: true })),
  };
  const storage = new MemoryStorage();
  storage.setItem(STORAGE_KEY, JSON.stringify(legacy));
  const ws = new Workspace(storage, 2002);
  expect(ws.getSnapshot().trees[0]?.pedantic).toBe(false);
  expect(ws.getSnapshot().nodes).toEqual(state.nodes);
  expect(() => ws.replace(JSON.stringify(legacy))).toThrow("must be connected");
  const invalid = { ...legacy, version: 99 };
  storage.setItem(STORAGE_KEY, JSON.stringify(invalid));
  expect(() => new Workspace(storage, 2003)).toThrow();
  expect(storage.getItem(STORAGE_KEY)).toBe(JSON.stringify(invalid));
});

describe("multiple vertex colors", () => {
  it("preserves colors through backups and keeps the first when disabled", () => {
    let state = apply(
      example(),
      { type: "multipleColors", id: "branch", enabled: true },
      2000,
    );
    state = apply(
      state,
      { type: "colors", id: "branch", colors: ["#ABCDEF", "#123456"] },
      2001,
    );
    state = stateSchema.parse(JSON.parse(JSON.stringify(state)));
    expect(
      assignedNodeColors(
        state.nodes,
        state.nodes.find((node) => node.id === "branch")!,
      ),
    ).toEqual(["#abcdef", "#123456"]);
    expect(() =>
      apply(state, { type: "colors", id: "branch", colors: [] }, 2002),
    ).toThrow();
    expect(() =>
      apply(
        state,
        { type: "colors", id: "branch", colors: ["#abcdef", "#ABCDEF"] },
        2002,
      ),
    ).toThrow();
    state = apply(
      state,
      { type: "multipleColors", id: "branch", enabled: false },
      2003,
    );
    expect(
      assignedNodeColors(
        state.nodes,
        state.nodes.find((node) => node.id === "branch")!,
      ),
    ).toEqual(["#abcdef"]);
  });
  it("enforces connected overlapping hyperedges and inherits all parent colors", () => {
    let state = apply(
      empty(),
      { type: "create", id: "root", title: "Work" },
      1000,
    );
    state = apply(
      state,
      { type: "multipleColors", id: "root", enabled: true },
      1001,
    );
    state = apply(
      state,
      { type: "colors", id: "root", colors: ["#abcdef", "#123456"] },
      1002,
    );
    state = apply(
      state,
      { type: "add", id: "middle", parentId: "root", title: "Middle" },
      1003,
    );
    state = apply(
      state,
      { type: "multipleColors", id: "middle", enabled: true },
      1003,
    );
    state = apply(
      state,
      { type: "colors", id: "middle", colors: ["#abcdef", "#123456"] },
      1003,
    );
    state = apply(
      state,
      { type: "add", id: "leaf", parentId: "middle", title: "Leaf" },
      1004,
    );
    expect(
      assignedNodeColors(
        state.nodes,
        state.nodes.find((node) => node.id === "leaf")!,
      ),
    ).toEqual(["#abcdef", "#123456"]);
    expect(() =>
      apply(state, { type: "colors", id: "middle", colors: ["#abcdef"] }, 1005),
    ).toThrow();
    expect(() =>
      apply(
        state,
        { type: "multipleColors", id: "middle", enabled: false },
        1005,
      ),
    ).toThrow();
    state = apply(
      state,
      { type: "colors", id: "leaf", colors: ["#abcdef"] },
      1006,
    );
    expect(() =>
      apply(state, { type: "colors", id: "middle", colors: ["#abcdef"] }, 1007),
    ).not.toThrow();
  });
});

it("assigns root children successive palette colors and descendants inherit in either mode", () => {
  for (const pedantic of [true, false]) {
    let state = apply(
      empty(),
      { type: "create", id: "root", title: "Work" },
      1000,
    );
    state = apply(
      state,
      { type: "pedantic", treeId: "root", enabled: pedantic },
      1001,
    );
    for (let index = 1; index < DEFAULT_COLORS.length; index++) {
      state = apply(
        state,
        {
          type: "add",
          id: `child-${index}`,
          parentId: "root",
          title: `Child ${index}`,
        },
        1002,
      );
      expect(
        state.nodes.find((node) => node.id === `child-${index}`)?.color,
      ).toBe(DEFAULT_COLORS[index]);
    }
    state = apply(
      state,
      { type: "multipleColors", id: "child-1", enabled: true },
      1003,
    );
    state = apply(
      state,
      { type: "colors", id: "child-1", colors: [DEFAULT_COLORS[1], "#123456"] },
      1004,
    );
    state = apply(
      state,
      {
        type: "add",
        id: "grandchild",
        parentId: "child-1",
        title: "Grandchild",
      },
      1005,
    );
    expect(
      assignedNodeColors(
        state.nodes,
        state.nodes.find((node) => node.id === "grandchild")!,
      ),
    ).toEqual([DEFAULT_COLORS[1], "#123456"]);
  }
});

it("linked hypertrees aggregate live and saved time, persist, and reject cycles", () => {
  let state = apply(empty(), { type: "create", id: "a", title: "A" }, 1000);
  state = apply(state, { type: "create", id: "b", title: "B" }, 1001);
  state = apply(
    state,
    { type: "add", id: "link", parentId: "a", title: "B", linkedTreeId: "b" },
    1002,
  );
  state = apply(state, { type: "start", id: "b" }, 2000);
  expect(totals(state, "a", 5000).get("link")).toBe(3000);
  expect(totals(state, "a", 6000).get("a")).toBe(4000);
  state = apply(state, { type: "finish", id: "saved" }, 6000);
  state = stateSchema.parse(JSON.parse(JSON.stringify(state)));
  expect(totals(state, "a", 9000).get("link")).toBe(4000);
  expect(() =>
    apply(
      state,
      {
        type: "add",
        id: "cycle",
        parentId: "b",
        title: "A",
        linkedTreeId: "a",
      },
      9001,
    ),
  ).toThrow(/cycle/);
  expect(() =>
    apply(
      state,
      {
        type: "add",
        id: "self",
        parentId: "a",
        title: "Self",
        linkedTreeId: "a",
      },
      9001,
    ),
  ).toThrow(/cycle/);
  expect(() =>
    apply(
      state,
      {
        type: "add",
        id: "missing",
        parentId: "a",
        title: "Missing",
        linkedTreeId: "missing",
      },
      9001,
    ),
  ).toThrow(/no longer exists/);
  state = apply(state, { type: "delete", id: "b" }, 9002);
  expect(state.nodes.some((node) => node.id === "link")).toBe(true);
  expect(totals(state, "a", 9003).get("link")).toBe(0);
});

it("focus through a hypertree link credits only the original root and appears in both views", () => {
  let state = apply(empty(), { type: "create", id: "a", title: "A" }, 1000);
  state = apply(state, { type: "create", id: "b", title: "B" }, 1001);
  state = apply(
    state,
    {
      type: "add",
      id: "link",
      parentId: "a",
      title: "Linked B",
      linkedTreeId: "b",
    },
    1002,
  );
  state = apply(state, { type: "start", id: "link" }, 2000);
  expect(state.focus?.nodeId).toBe("b");
  expect(totals(state, "b", 5000).get("b")).toBe(3000);
  expect(totals(state, "a", 5000).get("link")).toBe(3000);
  state = apply(state, { type: "pause" }, 5000);
  state = apply(state, { type: "start", id: "b" }, 6000);
  state = apply(state, { type: "finish", id: "saved" }, 7000);
  expect(state.sessions[0]?.treeId).toBe("b");
  expect(totals(state, "a", 9000).get("a")).toBe(4000);
  state = apply(state, { type: "delete", id: "b" }, 10000);
  expect(() => apply(state, { type: "start", id: "link" }, 10001)).toThrow();
});

it("tab ordering persists without changing graph data", () => {
  let state = apply(empty(), { type: "create", id: "a", title: "A" }, 1000);
  state = apply(state, { type: "create", id: "b", title: "B" }, 1001);
  const nodes = state.nodes;
  state = apply(state, { type: "reorderTree", id: "b", direction: -1 }, 1002);
  state = stateSchema.parse(JSON.parse(JSON.stringify(state)));
  expect(state.trees.map((tree) => tree.id)).toEqual(["b", "a"]);
  expect(state.nodes).toEqual(nodes);
});
