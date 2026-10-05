import { apply, stateSchema, welcome } from "./domain";
import type { Action, State } from "./domain";

export const STORAGE_KEY = "hyperforest.workspace.v1";
export const LEGACY_STORAGE_KEY = "hipertrees.workspace.v1";
export class Workspace {
  private state: State;
  private readonly listeners = new Set<() => void>();
  private original: string | null;
  constructor(
    private readonly storage: Pick<
      Storage,
      "getItem" | "setItem" | "removeItem"
    >,
    _now: number,
  ) {
    this.original =
      storage.getItem(STORAGE_KEY) ?? storage.getItem(LEGACY_STORAGE_KEY);
    this.state =
      this.original === null
        ? { version: 1, trees: [], nodes: [], sessions: [], focus: null }
        : stateSchema.parse(JSON.parse(this.original) as unknown);
    const demo = this.state.trees.find((tree) => tree.id === "welcome");
    if (
      demo &&
      !this.state.focus &&
      !this.state.sessions.some((session) => session.treeId === demo.id)
    ) {
      const nodes = this.state.nodes.filter((node) => node.treeId === demo.id);
      const template = welcome(demo.createdAt).nodes;
      const fields = [
        "id",
        "treeId",
        "parentId",
        "title",
        "estimateMinutes",
        "notes",
        "color",
        "filled",
        "x",
        "y",
      ] as const;
      if (
        nodes.length === template.length &&
        nodes.every((node) => {
          const expected = template.find((item) => item.id === node.id);
          return (
            expected && fields.every((field) => node[field] === expected[field])
          );
        }) &&
        demo.title === "A meaningful project"
      ) {
        this.state = {
          ...this.state,
          trees: this.state.trees.filter((tree) => tree.id !== demo.id),
          nodes: this.state.nodes.filter((node) => node.treeId !== demo.id),
        };
        this.write(this.state);
      }
    }
    if (storage.getItem(STORAGE_KEY) === null) this.write(this.state);
  }
  getSnapshot = (): State => this.state;
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  private notify(): void {
    for (const listener of this.listeners) listener();
  }
  refresh = (): void => {
    const raw = this.storage.getItem(STORAGE_KEY);
    if (raw === this.original) return;
    if (raw === null)
      throw new Error(
        "Workspace was removed in another tab. Reload to create a new one.",
      );
    const state = stateSchema.parse(JSON.parse(raw) as unknown);
    this.original = raw;
    this.state = state;
    this.notify();
  };
  commit(action: Action, now: number): void {
    this.refresh();
    this.write(apply(this.state, action, now));
  }
  replace(raw: string): void {
    this.refresh();
    this.write(stateSchema.parse(JSON.parse(raw) as unknown));
  }
  clear(): void {
    this.refresh();
    this.storage.removeItem(LEGACY_STORAGE_KEY);
    this.write({ version: 1, trees: [], nodes: [], sessions: [], focus: null });
  }
  private write(state: State): void {
    const raw = JSON.stringify(state);
    // Do not update the visible state if quota/security errors prevent saving.
    this.storage.setItem(STORAGE_KEY, raw);
    this.original = raw;
    this.state = state;
    this.notify();
  }
}
export async function transact(work: () => void): Promise<void> {
  if ("locks" in navigator) await navigator.locks.request(STORAGE_KEY, work);
  else work();
}
