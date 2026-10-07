import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type { CSSProperties, FormEvent } from "react";
import {
  DEFAULT_COLORS,
  canLinkTree,
  assignedNodeColors,
  focusElapsed,
  formatTime,
  shortTime,
  subtreeIds,
  totals,
} from "./domain";
import type { Action, GoalNode, State } from "./domain";
import { Graph, nodeColor } from "./Graph";
import { Icon } from "./icons";
import {
  LEGACY_STORAGE_KEY,
  STORAGE_KEY,
  transact,
  Workspace,
} from "./storage";

function download(name: string, text: string, type = "application/json"): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
interface SaveWindow extends Window {
  showSaveFilePicker?: (options: {
    suggestedName: string;
    types: { description: string; accept: Record<string, string[]> }[];
  }) => Promise<FileSystemFileHandle>;
}
async function exportBackup(name: string, contents: string): Promise<void> {
  const picker = (window as SaveWindow).showSaveFilePicker;
  if (!picker) {
    download(name, contents);
    return;
  }
  const file = await picker.call(window, {
    suggestedName: name,
    types: [
      {
        description: "hyperforest backup",
        accept: { "application/json": [".json"] },
      },
    ],
  });
  const stream = await file.createWritable();
  try {
    await stream.write(contents);
    await stream.close();
  } catch (error: unknown) {
    await stream.abort().catch(() => {});
    throw error;
  }
}
const ErrorContext = createContext("");

function Dialog({
  children,
  close,
  label,
}: {
  children: React.ReactNode;
  close: () => void;
  label: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const error = useContext(ErrorContext);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      className="dialog"
      aria-label={label}
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
    >
      <button
        className="icon-button dialog-close"
        aria-label="Close dialog"
        onClick={close}
      >
        <Icon name="close" />
      </button>
      {children}
      {error && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
    </dialog>
  );
}
function NodeName({
  node,
  editing,
  busy,
  run,
}: {
  node: GoalNode;
  editing: boolean;
  busy: boolean;
  run: (action: Action) => Promise<boolean>;
}) {
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(node.title);
  const original = useRef(node);
  useEffect(() => {
    if (!editing) setRenaming(false);
  }, [editing]);
  if (!renaming)
    return (
      <h2 className="node-heading">
        <button
          className="rename-name"
          aria-label="Rename selected vertex"
          disabled={!editing || busy}
          onClick={() => {
            original.current = node;
            setName(node.title);
            setRenaming(true);
          }}
        >
          {node.title}
          <Icon
            name="pencil"
            size={14}
            style={{ visibility: editing ? "visible" : "hidden" }}
          />
        </button>
      </h2>
    );
  return (
    <form
      className="inline-rename"
      onSubmit={(event) => {
        event.preventDefault();
        const snapshot = original.current;
        void run({
          type: "edit",
          id: snapshot.id,
          title: name,
          notes: snapshot.notes,
          estimateMinutes: snapshot.estimateMinutes,
          expected: {
            title: snapshot.title,
            notes: snapshot.notes,
            estimateMinutes: snapshot.estimateMinutes,
          },
        }).then((success) => {
          if (success) setRenaming(false);
        });
      }}
    >
      <input
        autoFocus
        aria-label="Vertex name"
        required
        maxLength={100}
        value={name}
        disabled={busy}
        onChange={(event) => setName(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            setRenaming(false);
          }
        }}
      />
      <button
        type="submit"
        className="icon-button"
        aria-label="Save vertex name"
        disabled={busy}
      >
        <Icon name="check" />
      </button>
      <button
        type="button"
        className="icon-button"
        aria-label="Cancel rename"
        onClick={() => setRenaming(false)}
      >
        <Icon name="close" />
      </button>
    </form>
  );
}

function EditDialog({
  state,
  node,
  close,
  run,
  editing,
}: {
  editing: boolean;
  state: State;
  node: GoalNode;
  close: () => void;
  run: (action: Action) => Promise<boolean>;
}) {
  const original = useRef(node);
  const [title, setTitle] = useState(node.title);
  const [estimate, setEstimate] = useState(String(node.estimateMinutes || ""));
  const [notes, setNotes] = useState(node.notes);
  const tree = state.trees.find((item) => item.id === node.treeId);
  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    if (
      await run({
        type: "edit",
        id: original.current.id,
        expected: {
          title: original.current.title,
          notes: original.current.notes,
          estimateMinutes: original.current.estimateMinutes,
        },
        title,
        estimateMinutes: Number(estimate),
        notes,
      })
    )
      close();
  };
  const filename =
    `${tree?.title ?? "Hypertree"}${node.id === node.treeId ? "" : ` - ${title}`}.md`.replaceAll(
      "/",
      "-",
    );
  return (
    <Dialog close={close} label="Edit goal and notes">
      <div className="eyebrow">A PLACE FOR YOUR THOUGHTS</div>
      <h2>Give this step some shape.</h2>
      <form
        onSubmit={(event) => {
          void submit(event);
        }}
      >
        <label>
          Goal name
          <input
            autoFocus
            disabled={!editing}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            maxLength={100}
            required
          />
        </label>
        <label>
          Time estimate <span>(minutes, optional)</span>
          <input
            type="number"
            disabled={!editing}
            min="0"
            step="any"
            value={estimate}
            onChange={(event) => setEstimate(event.target.value)}
            placeholder="No rush"
          />
        </label>
        <label>
          Markdown notes
          <textarea
            aria-label="Markdown notes"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder={
              "# A thought to come back to\n\nWhat matters about this step?"
            }
            rows={8}
          />
        </label>
        <div className="dialog-actions">
          <button
            type="button"
            className="quiet-button"
            onClick={() => download(filename, notes, "text/markdown")}
          >
            <Icon name="download" /> {filename}
          </button>
          <button type="submit" className="primary-button">
            Save changes <Icon name="check" />
          </button>
        </div>
      </form>
    </Dialog>
  );
}
export function App({ workspace }: { workspace: Workspace }) {
  const state = useSyncExternalStore(
    workspace.subscribe,
    workspace.getSnapshot,
  );
  const [treeId, setTreeId] = useState(
    state.focus?.treeId ?? state.trees[0]?.id ?? "",
  );
  const [selected, setSelected] = useState<string | null>(
    state.trees[0]?.id ?? null,
  );
  const [now, setNow] = useState(Date.now());
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [dialog, setDialog] = useState<
    | "tree"
    | "child"
    | "color"
    | "edit"
    | "delete"
    | "complete"
    | "history"
    | "clear"
    | null
  >(null);
  const [editing, setEditing] = useState(false);
  const [newName, setNewName] = useState("");
  const [linkedTreeId, setLinkedTreeId] = useState("");
  const [customColor, setCustomColor] = useState("#dfc491");
  const [origin, setOrigin] = useState({ x: 0, y: 0 });
  const [expanded, setExpanded] = useState(false);
  const importInput = useRef<HTMLInputElement>(null);
  const focusDialog = useRef<HTMLDialogElement>(null);
  const tree = state.trees.find((item) => item.id === treeId) ?? state.trees[0];
  const node =
    state.nodes.find(
      (item) => item.id === selected && item.treeId === tree?.id,
    ) ?? state.nodes.find((item) => item.id === tree?.id);
  const focusNode = state.nodes.find((item) => item.id === state.focus?.nodeId);
  const focus = state.focus;
  const time = totals(state, tree?.id ?? "", now);
  const children = state.nodes.filter((item) => item.parentId === node?.id);
  const color = node ? nodeColor(state, node) : "#dfc491";
  const colors = node ? assignedNodeColors(state.nodes, node) : [color];
  const run = async (action: Action): Promise<boolean> => {
    setBusy(true);
    try {
      await transact(() => workspace.commit(action, Date.now()));
      setError("");
      return true;
    } catch (exception: unknown) {
      setError(
        exception instanceof Error
          ? exception.message
          : "Could not save your changes.",
      );
      return false;
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 250);
    const refresh = (): void => {
      try {
        workspace.refresh();
      } catch (exception: unknown) {
        setError(
          exception instanceof Error
            ? exception.message
            : "Could not refresh workspace.",
        );
      }
    };
    window.addEventListener("storage", refresh);
    return () => {
      clearInterval(timer);
      window.removeEventListener("storage", refresh);
    };
  }, [workspace]);
  const running = focus !== null && focus.runningSince !== null;
  useEffect(() => {
    if (running) focusDialog.current?.showModal();
    else focusDialog.current?.close();
    const frame = requestAnimationFrame(() => setExpanded(running));
    return () => cancelAnimationFrame(frame);
  }, [running, focusNode, focus]);
  useEffect(() => {
    if (!running) {
      document.title = "hyperforest — a little structure";
      return;
    }
    const updateTitle = (): void => {
      document.title = formatTime(focusElapsed(focus, Date.now()));
    };
    updateTitle();
    const timer = setInterval(updateTitle, 1000);
    return () => clearInterval(timer);
  }, [running, focus]);
  const start = async (
    id: string,
    point: { x: number; y: number },
  ): Promise<void> => {
    setOrigin(point);
    if (await run({ type: "start", id })) {
      setSelected(id);
      setNow(Date.now());
    }
  };
  const create = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    const id = crypto.randomUUID();
    if (dialog === "tree") {
      if (await run({ type: "create", id, title: newName })) {
        setTreeId(id);
        setSelected(id);
        setDialog(null);
      }
    } else if (
      node &&
      (await run({
        type: "add",
        id,
        parentId: node.id,
        title: newName,
        ...(linkedTreeId ? { linkedTreeId } : {}),
      }))
    ) {
      setSelected(id);
      setDialog(null);
    }
  };
  const importFile = async (file: File | undefined): Promise<void> => {
    if (!file) return;
    if (
      !window.confirm(
        "Replace this workspace with your backup? Export your current workspace first if you want to keep it.",
      )
    )
      return;
    setBusy(true);
    try {
      const raw = await file.text();
      await transact(() => workspace.replace(raw));
      setError("");
      setSelected(null);
      setTreeId(workspace.getSnapshot().trees[0]?.id ?? "");
    } catch (exception: unknown) {
      setError(
        exception instanceof Error
          ? exception.message
          : "This backup could not be restored.",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <ErrorContext.Provider value={error}>
      <main>
        <header className="topbar">
          <a className="brand" href="./" aria-label="hyperforest home">
            <span className="brand-icon">
              <Icon name="tree" size={21} />
            </span>
            hyperforest
          </a>
          <div className="top-actions">
            <button
              className="quiet-button"
              onClick={() => setDialog("history")}
            >
              Session history
            </button>
            <span className="saved-state" role="status">
              <i /> Saved on this device
            </span>
            <button
              className="quiet-button"
              onClick={() => {
                setBusy(true);
                void exportBackup(
                  "hyperforest-backup.json",
                  JSON.stringify(workspace.getSnapshot(), null, 2),
                )
                  .then(() => setError(""))
                  .catch((exception: unknown) => {
                    if (!(
                      exception instanceof DOMException &&
                      exception.name === "AbortError"
                    ))
                      setError(
                        exception instanceof Error
                          ? exception.message
                          : "Could not export the backup.",
                      );
                  })
                  .finally(() => setBusy(false));
              }}
            >
              <Icon name="download" /> Export
            </button>
            <button
              className="quiet-button"
              disabled={busy}
              onClick={() => importInput.current?.click()}
            >
              <Icon name="upload" /> Import
            </button>
            <input
              ref={importInput}
              hidden
              type="file"
              accept="application/json,.json"
              aria-label="Import backup"
              onChange={(event) => {
                void importFile(event.target.files?.[0]);
                event.target.value = "";
              }}
            />
            <button
              className="quiet-button danger"
              disabled={busy}
              onClick={() => setDialog("clear")}
            >
              <Icon name="trash" /> Clear local data
            </button>
          </div>
        </header>
        <nav className="tree-tabs" role="tablist" aria-label="Goal hypertrees">
          {state.trees.map((item) => (
            <button
              key={item.id}
              role="tab"
              aria-selected={item.id === tree?.id}
              className={item.id === tree?.id ? "tree-tab current" : "tree-tab"}
              onClick={() => {
                setTreeId(item.id);
                setSelected(item.id);
              }}
            >
              <span className="tab-dot" />
              {item.title}
              <span className="tab-count">
                {state.nodes.filter((goal) => goal.treeId === item.id).length}
              </span>
            </button>
          ))}
          <button
            className="new-tree"
            disabled={busy}
            onClick={() => {
              setNewName("");
              setLinkedTreeId("");
              setDialog("tree");
            }}
          >
            <Icon name="plus" size={16} /> New hypertree
          </button>
        </nav>
        {tree && node ? (
          <div className="workspace">
            <aside
              className="inspector"
              data-editing={editing}
              style={{ "--node-color": color } as CSSProperties}
            >
              <div className="inspector-summary">
                <NodeName
                  key={node.id}
                  node={node}
                  editing={editing}
                  busy={busy}
                  run={run}
                />
                <div className="time-stat">
                  <span>{shortTime(time.get(node.id) ?? 0)}</span>
                  <div>
                    TIME GIVEN
                    {node.estimateMinutes > 0 && (
                      <small>
                        of {shortTime(node.estimateMinutes * 60000)}
                      </small>
                    )}
                  </div>
                </div>
                <button
                  className="primary-button start-button"
                  disabled={busy}
                  onClick={(event) => {
                    const rect = event.currentTarget.getBoundingClientRect();
                    void start(node.id, {
                      x: rect.left - innerWidth / 2,
                      y: rect.top - innerHeight / 2,
                    });
                  }}
                >
                  <Icon name="play" size={16} />
                  Focus
                </button>
                <button
                  className="icon-button"
                  aria-label="Edit goal"
                  disabled={busy}
                  onClick={() => setDialog("edit")}
                >
                  <Icon name="notes" />
                </button>
              </div>
              <div className="inspector-actions">
                <button
                  className="quiet-button"
                  aria-label="Vertex color"
                  disabled={busy || !editing}
                  onClick={() => {
                    setCustomColor(color);
                    setDialog("color");
                  }}
                >
                  Vertex color
                </button>
                <label className="connection-select">
                  Parent
                  <select
                    aria-label="Parent connection"
                    disabled={busy || !editing || node.id === node.treeId}
                    value={node.parentId ?? ""}
                    onChange={(event) => {
                      void run({
                        type: "connect",
                        id: node.id,
                        parentId: event.target.value || null,
                      });
                    }}
                  >
                    <option
                      value=""
                      disabled={
                        node.id !== node.treeId && Boolean(tree.pedantic)
                      }
                    >
                      {node.id === node.treeId ? "Root" : "Disconnected"}
                    </option>
                    {state.nodes
                      .filter(
                        (item) =>
                          item.treeId === node.treeId &&
                          !subtreeIds(state, node.id).has(item.id),
                      )
                      .map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.title}
                        </option>
                      ))}
                  </select>
                </label>
                <button
                  className="quiet-button"
                  disabled={busy || !editing || node.id === node.treeId}
                  onClick={() => setDialog("complete")}
                >
                  <Icon name="check" size={16} />
                  Finish goal
                </button>
                <button
                  className="icon-button danger"
                  aria-label={
                    node.id === node.treeId
                      ? "Delete hypertree"
                      : "Delete subtree"
                  }
                  disabled={!editing || busy}
                  onClick={() => setDialog("delete")}
                >
                  <Icon name="trash" size={16} />
                </button>
              </div>
              <div className="edit-toolbar">
                <button
                  className="quiet-button"
                  aria-pressed={editing}
                  onClick={() => setEditing((value) => !value)}
                >
                  <Icon name={editing ? "check" : "pencil"} />{" "}
                  {editing ? "Done editing" : "Edit graph"}
                </button>
                <button
                  className="quiet-button"
                  disabled={!editing || busy}
                  onClick={() => {
                    setNewName("");
                    setLinkedTreeId("");
                    setDialog("child");
                  }}
                >
                  <Icon name="plus" /> New vertex
                </button>
                <div className="pedantic-control">
                  <button
                    className="quiet-button pedantic-toggle"
                    role="switch"
                    aria-label="pedantic"
                    aria-checked={tree.pedantic ?? false}
                    aria-describedby="pedantic-definition"
                    disabled={busy}
                    onClick={() => {
                      void run({
                        type: "pedantic",
                        treeId: tree.id,
                        enabled: !tree.pedantic,
                      });
                    }}
                  >
                    <span className="toggle-track" aria-hidden="true">
                      <i />
                    </span>
                    pedantic
                  </button>
                  <div
                    id="pedantic-definition"
                    role="tooltip"
                    className="pedantic-tooltip"
                  >
                    <p>
                      A hypertree is a hypergraph with a host tree in which each
                      hyperedge is the vertex set of a connected subtree. Each
                      graph here represents one hypertree; the collection of
                      separate hypertrees forms a hyperforest.
                    </p>
                    <p>
                      Here, each vertex color defines a hyperedge, including the
                      initially assigned colors. Pedantic requires the whole
                      graph to be connected, and all vertices with the same
                      color to form one connected subtree. New hypertrees have
                      pedantic enabled by default.
                    </p>
                  </div>
                </div>
              </div>
              <div className="child-list" aria-label="Child vertices">
                {children.length ? (
                  children.map((child) => (
                    <button
                      key={child.id}
                      onClick={() => setSelected(child.id)}
                    >
                      <span
                        className="child-dot"
                        style={{ background: nodeColor(state, child) }}
                      />
                      <span>{child.title}</span>
                      <small>{shortTime(time.get(child.id) ?? 0)}</small>
                    </button>
                  ))
                ) : (
                  <span className="no-children">No child vertices</span>
                )}
              </div>
            </aside>
            <section className="map-panel">
              <Graph
                key={tree.id}
                editing={editing}
                state={state}
                treeId={tree.id}
                selected={node.id}
                time={time}
                select={setSelected}
                start={start}
                run={run}
              />
            </section>
          </div>
        ) : (
          <section className="empty-workspace">
            <Icon name="tree" size={64} />
            <h2>Every hypertree starts with one idea.</h2>
            <p>Give yours a name. You can find the vertices as you go.</p>
            <button
              className="primary-button"
              onClick={() => {
                setNewName("");
                setLinkedTreeId("");
                setDialog("tree");
              }}
            >
              Create your first hypertree <Icon name="plus" />
            </button>
          </section>
        )}
        <footer className="page-footer">
          <span>Less overwhelm. More intention.</span>
          <span>
            hyperforest <i>✦</i> a space to grow
          </span>
        </footer>
        {focus && focusNode && (
          <>
            <dialog
              ref={focusDialog}
              onCancel={(event) => {
                event.preventDefault();
                void run({ type: "pause" });
              }}
              className={`focus-screen ${expanded ? "expanded" : ""}`}
              aria-hidden={!running}
              inert={!running}
              role="dialog"
              aria-modal="true"
              aria-label="Focus session"
              style={
                {
                  "--node-color": nodeColor(state, focusNode),
                  "--origin-x": `${origin.x}px`,
                  "--origin-y": `${origin.y}px`,
                } as CSSProperties
              }
            >
              <div className="focus-backdrop" />
              <div className="focus-disc">
                <div className="focus-inner-ring" />
                <div className="focus-content">
                  <div className="eyebrow">
                    ONE THING. YOUR WHOLE ATTENTION.
                  </div>
                  <span className="focus-star">✦</span>
                  <h2>{focusNode.title}</h2>
                  <div className="focus-timer" data-testid="focus-timer">
                    {formatTime(focusElapsed(focus, now))}
                  </div>
                  <p>
                    {focus.title === "General"
                      ? "A little time for the bigger picture."
                      : "There is nothing else you need to do right now."}
                  </p>
                  {error && (
                    <p className="inline-error" role="alert">
                      {error}
                    </p>
                  )}
                  <div className="focus-actions">
                    <button
                      className="primary-button"
                      disabled={busy}
                      onClick={() => {
                        void run({ type: "pause" });
                      }}
                    >
                      <Icon name="pause" /> Pause & return
                    </button>
                    <button
                      className="quiet-button"
                      disabled={busy}
                      onClick={() => {
                        void run({ type: "finish", id: crypto.randomUUID() });
                      }}
                    >
                      Save session <Icon name="check" />
                    </button>
                  </div>
                  <span className="focus-lineage">{focus.group}</span>
                </div>
              </div>
            </dialog>
            {!running && (
              <div className="paused-dock">
                <span className="paused-dot" />
                <div>
                  <strong>{focusNode.title}</strong>
                  <small>Paused · {formatTime(focusElapsed(focus, now))}</small>
                </div>
                <button
                  className="primary-button"
                  disabled={busy}
                  onClick={() => {
                    void start(focus.nodeId, { x: 0, y: 0 });
                  }}
                >
                  <Icon name="play" size={14} /> Resume
                </button>
                <button
                  className="quiet-button"
                  disabled={busy}
                  onClick={() => {
                    void run({ type: "finish", id: crypto.randomUUID() });
                  }}
                >
                  Save
                </button>
                <button
                  className="icon-button"
                  aria-label="Discard paused session"
                  onClick={() => {
                    if (confirm("Discard this unsaved focus session?"))
                      void run({ type: "discard" });
                  }}
                >
                  <Icon name="close" size={16} />
                </button>
              </div>
            )}
          </>
        )}
        {(dialog === "tree" || dialog === "child") && (
          <Dialog
            close={() => setDialog(null)}
            label={dialog === "tree" ? "Create hypertree" : "Add child goal"}
          >
            <div className="eyebrow">
              {dialog === "tree"
                ? "SOMETHING WORTH GROWING"
                : "ONE SMALLER STEP"}
            </div>
            <h2>
              {dialog === "tree"
                ? "What are you working toward?"
                : `A new child of ${node?.title ?? "your goal"}.`}
            </h2>
            <form
              onSubmit={(event) => {
                void create(event);
              }}
            >
              {dialog === "child" && node && (
                <label>
                  Vertex type
                  <select
                    aria-label="Vertex type"
                    value={linkedTreeId}
                    onChange={(event) => {
                      setLinkedTreeId(event.target.value);
                      setNewName(
                        state.trees.find(
                          (tree) => tree.id === event.target.value,
                        )?.title ?? "",
                      );
                    }}
                  >
                    <option value="">New goal</option>
                    <optgroup label="Link another hypertree">
                      {state.trees
                        .filter((tree) =>
                          canLinkTree(state, node.treeId, tree.id),
                        )
                        .map((tree) => (
                          <option key={tree.id} value={tree.id}>
                            {tree.title}
                          </option>
                        ))}
                    </optgroup>
                  </select>
                  {linkedTreeId && (
                    <p>
                      Its live total contributes to this vertex and its
                      ancestors. The original hypertree stays in its own tab.
                    </p>
                  )}
                </label>
              )}
              <label>
                {dialog === "tree" ? "Hypertree name" : "Goal name"}
                <input
                  autoFocus
                  required
                  maxLength={100}
                  value={newName}
                  onChange={(event) => setNewName(event.target.value)}
                  placeholder={
                    dialog === "tree"
                      ? "A project, a practice, a possibility…"
                      : "Something small enough to begin…"
                  }
                />
              </label>
              <button className="primary-button" type="submit" disabled={busy}>
                {dialog === "tree" ? "Create hypertree" : "Add step"}
                <Icon name="plus" />
              </button>
            </form>
          </Dialog>
        )}
        {dialog === "color" && editing && node && (
          <Dialog close={() => setDialog(null)} label="Choose vertex color">
            <h2>Color “{node.title}”</h2>
            <button
              className="quiet-button pedantic-toggle"
              role="switch"
              aria-label="Multiple colors"
              aria-checked={node.multipleColors ?? false}
              disabled={busy}
              onClick={() => {
                void run({
                  type: "multipleColors",
                  id: node.id,
                  enabled: !node.multipleColors,
                });
              }}
            >
              <span className="toggle-track" aria-hidden="true">
                <i />
              </span>
              Multiple colors
            </button>
            {node.multipleColors && (
              <section className="selected-colors" aria-label="Selected colors">
                <p>
                  Select colors to add or remove them. Keep at least one color.
                  Turning off multiple colors keeps the first color.
                </p>
                <div>
                  {colors.map((selectedColor) => (
                    <button
                      key={selectedColor}
                      className="quiet-button"
                      aria-label={`Remove color ${selectedColor}`}
                      disabled={busy || colors.length === 1}
                      onClick={() => {
                        void run({
                          type: "colors",
                          id: node.id,
                          colors: colors.filter(
                            (item) => item !== selectedColor,
                          ),
                        });
                      }}
                    >
                      <span
                        className="selected-color-dot"
                        style={{ background: selectedColor }}
                      />
                      {selectedColor}
                      <Icon name="close" size={12} />
                    </button>
                  ))}
                </div>
              </section>
            )}
            <section className="default-colors" aria-label="Default colors">
              <h3>Default colors</h3>
              <div>
                {DEFAULT_COLORS.map((swatch, index) => (
                  <button
                    key={swatch}
                    className="color-swatch"
                    aria-label={`Default color ${index + 1}`}
                    aria-pressed={colors.includes(swatch)}
                    title={swatch}
                    style={{
                      background: swatch,
                      borderColor: swatch,
                      color: "#101820",
                    }}
                    disabled={
                      busy ||
                      Boolean(
                        node.multipleColors &&
                        colors.length === 1 &&
                        colors.includes(swatch),
                      )
                    }
                    onClick={() => {
                      if (node.multipleColors)
                        void run({
                          type: "colors",
                          id: node.id,
                          colors: colors.includes(swatch)
                            ? colors.filter((item) => item !== swatch)
                            : [...colors, swatch],
                        });
                      else
                        void run({ type: "color", id: node.id, color: swatch });
                    }}
                  >
                    {index + 1}
                  </button>
                ))}
              </div>
            </section>
            <div className="node-color-control">
              <label>
                Vertex color{" "}
                <input
                  aria-label="Vertex color"
                  type="color"
                  value={node.multipleColors ? customColor : color}
                  disabled={busy}
                  onChange={(event) => {
                    if (node.multipleColors) setCustomColor(event.target.value);
                    else
                      void run({
                        type: "color",
                        id: node.id,
                        color: event.target.value,
                      });
                  }}
                />
              </label>
              {node.multipleColors && (
                <button
                  className="quiet-button"
                  disabled={busy || colors.includes(customColor)}
                  onClick={() => {
                    void run({
                      type: "colors",
                      id: node.id,
                      colors: [...colors, customColor],
                    });
                  }}
                >
                  Add custom color
                </button>
              )}
              <button
                className="quiet-button pedantic-toggle"
                role="switch"
                aria-label="Fill interior"
                aria-checked={node.filled ?? false}
                disabled={busy}
                onClick={() => {
                  void run({ type: "fill", id: node.id, filled: !node.filled });
                }}
              >
                <span className="toggle-track" aria-hidden="true">
                  <i />
                </span>
                Fill interior
              </button>
            </div>
            <div className="dialog-actions">
              <button
                className="primary-button"
                onClick={() => setDialog(null)}
              >
                Done
              </button>
            </div>
          </Dialog>
        )}
        {dialog === "edit" && node && (
          <EditDialog
            state={state}
            node={node}
            editing={editing}
            close={() => setDialog(null)}
            run={run}
          />
        )}
        {dialog === "complete" && node && node.id !== node.treeId && (
          <Dialog close={() => setDialog(null)} label="Finish goal">
            <div className="eyebrow">ONE STEP COMPLETE</div>
            <h2>Finish “{node.title}”?</h2>
            <p>
              This removes the subtree rooted at this vertex. Its time stays in
              the parent and all its ancestors, and saved sessions stay in
              history. Any active session in this subtree will be saved. Export
              a backup first to keep the notes.
            </p>
            <div className="dialog-actions">
              <button className="quiet-button" onClick={() => setDialog(null)}>
                Keep working
              </button>
              <button
                className="primary-button"
                disabled={busy}
                onClick={() => {
                  void run({
                    type: "complete",
                    id: node.id,
                    sessionId: crypto.randomUUID(),
                  }).then((success) => {
                    if (success) {
                      setDialog(null);
                      setSelected(node.parentId ?? node.treeId);
                    }
                  });
                }}
              >
                Finish goal <Icon name="check" />
              </button>
            </div>
          </Dialog>
        )}
        {dialog === "delete" && node && (
          <Dialog
            close={() => setDialog(null)}
            label={
              node.id === node.treeId ? "Delete hypertree" : "Delete subtree"
            }
          >
            <div className="eyebrow">MAKE A LITTLE ROOM</div>
            <h2>Remove “{node.title}”?</h2>
            <p>
              {node.id === node.treeId
                ? "This removes the entire hypertree, including any disconnected subtrees when pedantic is off."
                : "This removes the subtree rooted at this vertex, including all descendants."}{" "}
              Vertices removed:{" "}
              {node.id === node.treeId
                ? state.nodes.filter((item) => item.treeId === node.treeId)
                    .length
                : subtreeIds(state, node.id).size}
              . Saved sessions stay in history. Export a backup first to keep
              the notes.
            </p>
            <div className="dialog-actions">
              <button className="quiet-button" onClick={() => setDialog(null)}>
                Keep it
              </button>
              <button
                className="danger-button"
                disabled={busy}
                onClick={() => {
                  void run({ type: "delete", id: node.id }).then((success) => {
                    if (success) {
                      setDialog(null);
                      setSelected(tree?.id ?? null);
                    }
                  });
                }}
              >
                {node.id === node.treeId
                  ? "Remove hypertree"
                  : "Remove subtree"}
              </button>
            </div>
          </Dialog>
        )}
        {dialog === "clear" && (
          <Dialog close={() => setDialog(null)} label="Clear local data">
            <h2>Clear everything on this device?</h2>
            <p>
              This permanently deletes all hypertrees, vertices, notes, saved
              sessions, and any active focus session from this browser. Export a
              backup first if you want to keep your work.
            </p>
            <div className="dialog-actions">
              <button
                className="quiet-button"
                disabled={busy}
                onClick={() => setDialog(null)}
              >
                Cancel
              </button>
              <button
                className="danger-button"
                disabled={busy}
                onClick={() => {
                  setBusy(true);
                  void transact(() => workspace.clear())
                    .then(() => {
                      setTreeId("");
                      setSelected(null);
                      setEditing(false);
                      setError("");
                      setDialog(null);
                    })
                    .catch((exception: unknown) => {
                      setError(
                        exception instanceof Error
                          ? exception.message
                          : "Could not clear local data.",
                      );
                    })
                    .finally(() => setBusy(false));
                }}
              >
                Delete all local data
              </button>
            </div>
          </Dialog>
        )}
        {dialog === "history" && (
          <Dialog close={() => setDialog(null)} label="Session history">
            <div className="eyebrow">TIME WELL GIVEN</div>
            <h2>A record of showing up.</h2>
            <div className="history-list">
              {state.sessions.length ? (
                [...state.sessions].reverse().map((session) => (
                  <article key={session.id}>
                    <div>
                      <strong>{session.title}</strong>
                      <small>
                        {session.group}
                        <br />
                        {new Date(session.startedAt).toLocaleString()}
                      </small>
                    </div>
                    <span>{shortTime(session.durationMs)}</span>
                  </article>
                ))
              ) : (
                <p>Your saved sessions will appear here. Start small.</p>
              )}
            </div>
          </Dialog>
        )}
        {error && !dialog && !running && (
          <div className="toast" role="alert">
            <span>{error}</span>
            <button
              className="icon-button"
              aria-label="Dismiss error"
              onClick={() => setError("")}
            >
              <Icon name="close" />
            </button>
          </div>
        )}
      </main>
    </ErrorContext.Provider>
  );
}
export function Recovery({ error }: { error: unknown }) {
  return (
    <main className="empty-workspace">
      <Icon name="tree" size={48} />
      <h1>Let’s keep your work safe.</h1>
      <p>
        The saved workspace could not be opened. It has not been overwritten.
      </p>
      <pre>{error instanceof Error ? error.message : String(error)}</pre>
      <button
        className="primary-button"
        onClick={() =>
          download(
            "hyperforest-recovery.json",
            localStorage.getItem(STORAGE_KEY) ??
              localStorage.getItem(LEGACY_STORAGE_KEY) ??
              "",
          )
        }
      >
        Download stored data
      </button>
      <button
        className="quiet-button"
        onClick={() => {
          if (
            confirm("Reset local storage? Download your stored data first.")
          ) {
            localStorage.removeItem(STORAGE_KEY);
            localStorage.removeItem(LEGACY_STORAGE_KEY);
            location.reload();
          }
        }}
      >
        Reset this workspace
      </button>
    </main>
  );
}
