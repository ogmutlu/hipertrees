import { describe, expect, it } from "vitest";
import {
  apply,
  focusElapsed,
  stateSchema,
  totals,
  welcome,
} from "../src/domain";
import type { State } from "../src/domain";
import { STORAGE_KEY, Workspace } from "../src/storage";

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
  readonly values = new Map<string, string>();
  fail = false;
  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    if (this.fail) throw new Error("Quota exceeded");
    this.values.set(key, value);
  }
}

describe("focus accounting", () => {
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
