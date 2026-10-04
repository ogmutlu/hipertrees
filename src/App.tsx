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
  focusElapsed,
  formatTime,
  nodePath,
  shortTime,
  subtreeIds,
  totals,
} from "./domain";
import type { Action, GoalNode, State } from "./domain";
import { Graph, nodeColor } from "./Graph";
import { Icon } from "./icons";
import { transact, Workspace } from "./storage";

function download(name: string, text: string, type = "application/json"): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
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
function EditDialog({
  state,
  node,
  close,
  run,
}: {
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
    `${tree?.title ?? "Tree"}${node.parentId === null ? "" : ` - ${title}`}.md`.replaceAll(
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
    "tree" | "child" | "edit" | "delete" | "complete" | "history" | null
  >(null);
  const [newName, setNewName] = useState("");
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
    document.title =
      running && focusNode
        ? `${focusNode.title} · ${formatTime(focusElapsed(focus, Date.now()))} — hiper trees`
        : "hiper trees — a little structure";
    return () => cancelAnimationFrame(frame);
  }, [running, focusNode, focus]);
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
      (await run({ type: "add", id, parentId: node.id, title: newName }))
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
          <a className="brand" href="./" aria-label="hiper trees home">
            <span className="brand-icon">
              <Icon name="tree" size={21} />
            </span>
            hiper<span className="brand-separator">/</span>
            <span className="brand-sub">trees</span>
          </a>
          <div className="top-actions">
            <span className="saved-state">
              <i /> Saved on this device
            </span>
            <button
              className="quiet-button"
              onClick={() =>
                download(
                  "hipertrees-backup.json",
                  JSON.stringify(state, null, 2),
                )
              }
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
          </div>
        </header>
        <section className="workspace-header">
          <div>
            <div className="eyebrow">
              A LITTLE STRUCTURE. A LOT OF POSSIBILITY.
            </div>
            <h1>
              Your goals, connected<span>.</span>
            </h1>
          </div>
          <p>
            Follow a branch.
            <br />
            Find your next small step.
          </p>
        </section>
        <nav className="tree-tabs" role="tablist" aria-label="Goal trees">
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
              setDialog("tree");
            }}
          >
            <Icon name="plus" size={16} /> New tree
          </button>
        </nav>
        {tree && node ? (
          <div className="workspace">
            <section className="map-panel">
              <div className="map-heading">
                <div className="eyebrow">THE BIG PICTURE</div>
                <h2>{tree.title}</h2>
                <p>
                  Growing since{" "}
                  {new Date(tree.createdAt).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                  <span>·</span>
                  {shortTime(time.get(tree.id) ?? 0)} together
                </p>
              </div>
              <Graph
                key={tree.id}
                state={state}
                treeId={tree.id}
                selected={node.id}
                time={time}
                select={setSelected}
                start={(id, point) => {
                  void start(id, point);
                }}
                run={run}
              />
            </section>
            <aside
              className="inspector"
              style={{ "--node-color": color } as CSSProperties}
            >
              <div className="inspector-top">
                <span className="eyebrow">
                  {node.parentId === null
                    ? "THE ROOT"
                    : children.length
                      ? "A BRANCH"
                      : "YOUR NEXT STEP"}
                </span>
                <button
                  className="icon-button"
                  aria-label="Edit goal"
                  disabled={busy}
                  onClick={() => setDialog("edit")}
                >
                  <Icon name="notes" />
                </button>
              </div>
              <div className="inspector-symbol">
                <Icon
                  name={
                    children.length || node.parentId === null ? "tree" : "play"
                  }
                  size={25}
                />
              </div>
              <h2>{node.title}</h2>
              <p className="node-breadcrumb">{nodePath(state, node.id)}</p>
              <div className="time-stat">
                <span>{shortTime(time.get(node.id) ?? 0)}</span>
                <div>
                  TIME GIVEN TO THIS {children.length ? "BRANCH" : "GOAL"}
                  {node.estimateMinutes > 0 && (
                    <small>
                      of {shortTime(node.estimateMinutes * 60000)} estimated
                    </small>
                  )}
                </div>
              </div>
              {node.estimateMinutes > 0 && (
                <div className="progress-track">
                  <div
                    style={{
                      width: `${Math.min(100, ((time.get(node.id) ?? 0) / (node.estimateMinutes * 60000)) * 100)}%`,
                    }}
                  />
                </div>
              )}
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
                {focus?.nodeId === node.id
                  ? "Resume focus"
                  : "Focus on this step"}
                <span>↗</span>
              </button>
              <p className="focus-hint">
                {children.length || node.parentId === null
                  ? "An open-ended session for this whole group."
                  : "One thing at a time. Everything else can wait."}
              </p>
              <div className="inspector-rule" />
              <div className="section-heading">
                <span>SMALLER STEPS</span>
                <button
                  className="icon-button"
                  aria-label="Add child goal"
                  disabled={busy}
                  onClick={() => {
                    setNewName("");
                    setDialog("child");
                  }}
                >
                  <Icon name="plus" size={17} />
                </button>
              </div>
              {children.length ? (
                <div className="child-list">
                  {children.map((child) => (
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
                      <Icon name="arrow" size={14} />
                    </button>
                  ))}
                </div>
              ) : (
                <p className="empty-note">
                  Small enough to begin?
                  <br />
                  Or break it into a few smaller steps.
                </p>
              )}
              <div className="inspector-footer">
                {node.parentId !== null && (
                  <button
                    className="quiet-button"
                    disabled={busy}
                    onClick={() => setDialog("complete")}
                  >
                    <Icon name="check" size={16} /> Finish goal
                  </button>
                )}
                <button
                  className="quiet-button"
                  onClick={() => setDialog("history")}
                >
                  Session history
                </button>
                <button
                  className="icon-button danger"
                  aria-label="Delete selected branch"
                  onClick={() => setDialog("delete")}
                >
                  <Icon name="trash" size={16} />
                </button>
              </div>
            </aside>
          </div>
        ) : (
          <section className="empty-workspace">
            <Icon name="tree" size={64} />
            <h2>Every tree starts with one idea.</h2>
            <p>Give yours a name. You can find the branches as you go.</p>
            <button
              className="primary-button"
              onClick={() => {
                setNewName("");
                setDialog("tree");
              }}
            >
              Plant your first tree <Icon name="plus" />
            </button>
          </section>
        )}
        <footer className="page-footer">
          <span>Less overwhelm. More intention.</span>
          <span>
            hiper trees <i>✦</i> a space to grow
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
            label={dialog === "tree" ? "Create tree" : "Add child goal"}
          >
            <div className="eyebrow">
              {dialog === "tree"
                ? "SOMETHING WORTH GROWING"
                : "ONE SMALLER STEP"}
            </div>
            <h2>
              {dialog === "tree"
                ? "What are you working toward?"
                : `A new branch of ${node?.title ?? "your goal"}.`}
            </h2>
            <form
              onSubmit={(event) => {
                void create(event);
              }}
            >
              <label>
                {dialog === "tree" ? "Tree name" : "Goal name"}
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
                {dialog === "tree" ? "Create tree" : "Add step"}
                <Icon name="plus" />
              </button>
            </form>
          </Dialog>
        )}
        {dialog === "edit" && node && (
          <EditDialog
            state={state}
            node={node}
            close={() => setDialog(null)}
            run={run}
          />
        )}
        {dialog === "complete" && node && node.parentId !== null && (
          <Dialog close={() => setDialog(null)} label="Finish goal">
            <div className="eyebrow">ONE STEP COMPLETE</div>
            <h2>Finish “{node.title}”?</h2>
            <p>
              This removes this goal and its children from the tree. Their time
              stays in the parent and all its ancestors, and saved sessions stay
              in history. Any active session in this branch will be saved.
              Export a backup first to keep the notes.
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
                      setSelected(node.parentId);
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
          <Dialog close={() => setDialog(null)} label="Delete branch">
            <div className="eyebrow">MAKE A LITTLE ROOM</div>
            <h2>Remove “{node.title}”?</h2>
            <p>
              This removes {subtreeIds(state, node.id).size} node(s) including
              its children. Saved sessions stay in history. Export a backup
              first to keep the notes.
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
                Remove branch
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
            "hipertrees-recovery.json",
            localStorage.getItem("hipertrees.workspace.v1") ?? "",
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
            localStorage.removeItem("hipertrees.workspace.v1");
            location.reload();
          }
        }}
      >
        Reset this workspace
      </button>
    </main>
  );
}
