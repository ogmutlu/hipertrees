# hyperforest

A standalone TypeScript web app for hypertrees of goals. A dark, mathematical graph
canvas gives each vertex a color and each session room
to breathe. Built with React, SVG, Vite, and strict TypeScript.

## Run locally

Requires Node 24+ and npm.

```sh
cd web
npm ci
npm run dev
```

Open the printed URL, including `/hyperforest/`. Vite's base path is fixed to
`/hyperforest/` so the same production build works on GitHub Pages.

## Use

- Switch hypertrees with the tabs, or create one with **New hypertree**.
- Vertices are small filled circles by default, with white names and no action
  icons. The top menu keeps fixed slots across modes and selections.
- All vertices, including the distinguished root, can be dragged in edit mode.
  Drag the bottom-right corner of the graph area downward to make more room.
- Use **Edit graph** to unlock changes. Select a vertex and use **New vertex** in the top menu to add a child. Drag an edge or its circular handle onto another vertex to change its
  parent; with pedantic off, drop it on empty space to disconnect. A disconnected vertex has a
  handle above it for reconnecting. The **Parent connection** selector provides
  the same controls without dragging. Cycles are rejected.
- **New vertex**, next to **Edit graph** and **pedantic**, creates a child of the selected vertex.
  With pedantic off, disconnect it using the parent selector to create an independent component.
  **Vertex color** in the top menu opens the color picker. Its numbered
  eight filled **Default colors** swatches start with the root's gold, followed by the generated subtree palette. **Fill interior** switches
  between a filled vertex and a colored boundary without losing its color.
  Colors and fill settings persist in backups.
- Click the selected vertex name in the menu to rename it in edit mode.
  Press Enter or the pencil/checkmark controls to edit and save; Escape cancels.
- **Clear local data**, revealed by hovering or focusing **Saved on this device**, asks for confirmation before resetting
  all hypertrees, vertices, notes, and sessions. Export a backup first to keep a copy.
- **Done editing** freezes vertex positions and connections. Selection, focus,
  panning and zooming remain available.
- **pedantic**, on the right of the edit toolbar, is disabled by default for new
  hypertrees. It requires the entire graph to be connected and each color's
  vertices to induce a connected subtree of the host tree. Each graph represents
  a hypertree; the separate hypertrees together form a hyperforest. Hover or focus
  the toggle for the definition. All colors count, including initially assigned
  and boundary colors. The setting is saved per hypertree; existing explicit off
  settings remain off. Invalid color changes, disconnections, and imports are
  rejected. Reconnect all components and repair disconnected color groups before
  enabling pedantic on an existing graph.
  Older browser workspaces marked pedantic despite disconnected components are
  migrated with pedantic off, keeping their vertices, notes, and sessions intact.
- Select a child and choose **Finish goal** to hide and preserve its subtree,
  including notes, focus time, and session history. Its name and default color
  become available for reuse. Any active session in that subtree is saved.
- Toggle **finished**, to the right of **pedantic**, to display finished vertices
  as translucent ghosts. You can inspect their notes and time, but cannot focus
  or rearrange them. The toggle is saved per hypertree. Finished vertices stay
  in exports and are excluded from pedantic checks. **Delete subtree** remains
  the permanent removal action.
- Click a vertex to select it. Drag its circle to rearrange the graph. Drag empty
  canvas to pan; Ctrl + scroll or use +/− to zoom. Fit resets the view; Arrange lays out
  the hypertree again. Adding a vertex arranges its hypertree automatically.
- Double-click a vertex, or select it and choose **Focus** in the top menu, to expand
  it into the focus view and start the timer. A leaf uses its goal name; an internal vertex uses the generic task
  **General** within that group's path. Escape or **Pause & return** shrinks the
  vertex back into the graph. Resume continues the same session. **Save session**
  records it; pauses never count as focus time.
- Add a child or edit the selected vertex in the compact details menu above the graph. Every vertex supports
  an estimate and Markdown notes. The document button in the top menu opens
  the selected vertex's Markdown editor, including outside edit mode. Export notes as `Hypertree - Vertex.md`; root notes
  use `Hypertree.md`.
- Totals include each vertex's own sessions and all its descendants, starting at
  the hypertree's creation timestamp. Running time appears in those totals too.
  Reconnecting moves a subtree's time to its new ancestors; the main root total
  also includes disconnected components. Session history keeps the original
  group names. Renaming preserves attribution. Deleted subtrees no longer contribute to the
  remaining hypertree; their saved sessions stay in history. Deleting the active
  session's subtree is blocked until that session is saved or discarded.

## Persistent storage

Existing data from the former app is migrated to `hyperforest.workspace.v1`
without deleting the original saved copy.

Hypertrees, positions, notes, estimates, saved sessions, and the active timer persist
in browser localStorage under a versioned key. Reloading restores the timer;
a running timer continues while the page is closed. Pause before leaving if you
want to stop counting. Data stays in this browser profile on this site's origin;
it does not automatically sync between devices or with the Python CLI/TUI.

**Export** opens the browser's Save As picker where supported or directly
downloads the ZIP export, without an app dialog. In Firefox, enable
**Settings → General → Downloads → Always ask you where to save files** to choose
the destination for each export. **Import** validates a backup before
replacing the workspace and asks before replacing existing data. Cooperating
browser tabs use Web Locks to serialize writes and storage events to refresh.
An edit form opened before another tab changes that goal detects the conflict
and keeps your draft available instead of overwriting the newer notes.
Failed storage writes leave the previous visible state intact. Malformed saved
data opens a recovery screen instead of being silently replaced. New workspaces
start empty.

The app is static: no backend, account, analytics, or external font service.

## Host at ogmutlu.github.io/hyperforest/

The `web/` folder is a self-contained project. To deploy at the requested URL:

1. Create the GitHub repository **ogmutlu/hyperforest**.
2. Put the **contents** of `web/` at that repository's root, including its hidden
   `.github/workflows/pages.yml`, `package.json`, and `package-lock.json`.
3. In repository **Settings → Pages → Source**, select **GitHub Actions**.
4. Push to `main` or `master`, or run the **GitHub Pages** workflow manually.

The included workflow installs locked dependencies, runs domain tests and the
production build, and deploys `dist/` to Pages. This checkout's top-level
`.github/workflows/web.yml` runs checks and Chromium tests for `web/`; it does not
publish the Python repository at the wrong URL. No deployment has been performed.

The Pages workflow uses a distinct artifact name for each build attempt and
passes that name to deployment, avoiding ambiguous `github-pages` artifacts on
retries. After updating the workflow in the web repository, start a new run from
the updated commit. Re-running a failed run from an older commit still uses the
older workflow. The web workflows use Node 24 actions and Ubuntu 24.04 runners.

You can also serve the contents of `dist/` at `/hyperforest/` on any static host.
[Vite's Pages deployment documentation](https://vite.dev/guide/static-deploy.html#github-pages)
explains the base-path and GitHub Actions configuration.

## Checks

```sh
npm run check
npm run format:check
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

Use `CHROMIUM_PATH=/usr/bin/chromium npm run test:e2e` to test with an existing
Chromium installation. Browser tests exercise real mouse dragging, focus
expansion/pause, persistence after reload, notes, and mobile layout. Screenshots
are written to `/tmp/hyperforest-desktop.png`, `/tmp/hyperforest-focus.png`, and
`/tmp/hyperforest-mobile.png` during those tests.

`src/domain.ts` contains validated data and pure transitions; `src/storage.ts`
handles durable writes; `src/Graph.tsx` owns mouse interaction and graph rendering;
`src/App.tsx` coordinates the workspace and its dialogs. No explicit `any` types
are used. Imported and persisted data cross a runtime validation boundary.

Enable **Multiple colors** in the vertex color menu to select several default or
custom colors. Filled vertices show colored sectors; outlined vertices show
colored arcs. Turning the toggle off keeps the first color. Pedantic checks every
color independently, so a vertex can belong to several overlapping hyperedges.
Each new child of the root receives the next default subtree color. Deeper
vertices inherit all their parent’s colors, with pedantic on or off.

In **New vertex**, use **Vertex type** to link another hypertree. Its saved and
active focus time updates the linked vertex and its ancestors live, while the
source remains in its own tab. Circular links are excluded. Removing a linked
vertex leaves the source intact; deleting the source makes its linked contribution
zero. Links are included in backups.

Use **Rearrange tabs** to move hypertrees earlier or later. The order is saved
locally and included in backups. Focusing a linked vertex starts a session on the
original hypertree’s root; its live and saved time appears in both views without
adding a second session. A deleted source cannot be focused through its link.

New root children choose the first unused default subtree color, checking every
assigned color in that hypertree. After the palette is exhausted, distinct generated
colors are used. Descendants still inherit their parent’s colors.

**Export** saves `hyperforest-export.zip`, containing:

- `hyperforest-backup.json`: the complete restorable workspace.
- `hyperforest-structure.yaml`: a readable nested report of all hypertrees and
  vertices with cumulative focus times, including active sessions and linked
  hypertrees, in hours/minutes/seconds and precise milliseconds.
- `notes/`: a Markdown file for every vertex, named after its hypertree and vertex.
  Filename collisions receive numbered suffixes.

**Import** accepts the ZIP archive or an existing JSON backup. The YAML and notes
are readable reports; importing restores the original JSON snapshot.

**Rearrange tabs** and **New hypertree** appear in the top row, immediately before **Session history**.

**Today**, above **Focus**, shows focus time across all subjects for the current
local calendar day. Each session counts once, including focus started through
linked vertices and history from deleted subjects. New sessions record focus
intervals so pauses and midnight boundaries are handled exactly. Older sessions
without intervals use their saved duration ending at their end time for the daily
estimate.

**Session history** includes inclusive **From date** and **To date** filters based
on the session's local start date, plus a **Subject** search matching titles and
group paths. Filters combine; **Clear filters** restores the full history.

Today uses compact `hms` duration formatting, for example `1h2m3s`. In **Session history**, enable **Change
history** to add a session with a subject, local start time, and duration, or to
delete an existing session with confirmation. Manual sessions update counters
and are included in backups. Deleting a saved session leaves active focus intact.
