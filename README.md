# hiper trees

A standalone TypeScript web app for trees of goals. A dark, mathematical graph
canvas gives each branch a color, each node a play button, and each session room
to breathe. Built with React, SVG, Vite, and strict TypeScript.

## Run locally

Requires Node 24+ and npm.

```sh
cd web
npm ci
npm run dev
```

Open the printed URL, including `/hipertrees/`. Vite's base path is fixed to
`/hipertrees/` so the same production build works on GitHub Pages.

## Use

- Switch trees with the tabs, or create one with **New tree**.
- Select a child and choose **Finish goal** to remove it and its descendants.
  Their time remains credited to the parent and its ancestors; session history
  keeps the original goal names. Any active session in that branch is saved.
- Click a node to select it. Drag its circle to rearrange the graph. Drag empty
  canvas to pan; Ctrl + scroll or use +/− to zoom. Fit resets the view; Arrange lays out
  the tree again. Adding a node arranges its tree automatically.
- The play symbol on any node expands it into the focus view and starts the
  timer. A leaf uses its goal name; an internal node uses the generic task
  **General** within that group's path. Escape or **Pause & return** shrinks the
  node back into the graph. Resume continues the same session. **Save session**
  records it; pauses never count as focus time.
- Add a child or edit the selected node in the right panel. Every node supports
  an estimate and Markdown notes. Export notes as `Tree - Node.md`; root notes
  use `Tree.md`.
- Totals include each node's own sessions and all its descendants, starting at
  the tree's creation timestamp. Running time appears in those totals too.
  Renaming preserves attribution. Deleted branches no longer contribute to the
  remaining tree; their saved sessions stay in history. Deleting the active
  session's branch is blocked until that session is saved or discarded.

## Persistent storage

Trees, positions, notes, estimates, saved sessions, and the active timer persist
in browser localStorage under a versioned key. Reloading restores the timer;
a running timer continues while the page is closed. Pause before leaving if you
want to stop counting. Data stays in this browser profile on this site's origin;
it does not automatically sync between devices or with the Python CLI/TUI.

**Export** downloads a complete JSON backup. **Import** validates a backup before
replacing the workspace and asks before replacing existing data. Cooperating
browser tabs use Web Locks to serialize writes and storage events to refresh.
An edit form opened before another tab changes that goal detects the conflict
and keeps your draft available instead of overwriting the newer notes.
Failed storage writes leave the previous visible state intact. Malformed saved
data opens a recovery screen instead of being silently replaced. The initial
example is editable and saved locally; delete it whenever you're ready.

The app is static: no backend, account, analytics, or external font service.

## Host at ogmutlu.github.io/hipertrees/

The `web/` folder is a self-contained project. To deploy at the requested URL:

1. Create the GitHub repository **ogmutlu/hipertrees**.
2. Put the **contents** of `web/` at that repository's root, including its hidden
   `.github/workflows/pages.yml`, `package.json`, and `package-lock.json`.
3. In repository **Settings → Pages → Source**, select **GitHub Actions**.
4. Push to `main` or `master`, or run the **GitHub Pages** workflow manually.

The included workflow installs locked dependencies, runs domain tests and the
production build, and deploys `dist/` to Pages. This checkout's top-level
`.github/workflows/web.yml` runs checks and Chromium tests for `web/`; it does not
publish the Python repository at the wrong URL. No deployment has been performed.

You can also serve the contents of `dist/` at `/hipertrees/` on any static host.
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
are written to `/tmp/hipertrees-desktop.png`, `/tmp/hipertrees-focus.png`, and
`/tmp/hipertrees-mobile.png` during those tests.

`src/domain.ts` contains validated data and pure transitions; `src/storage.ts`
handles durable writes; `src/Graph.tsx` owns mouse interaction and graph rendering;
`src/App.tsx` coordinates the workspace and its dialogs. No explicit `any` types
are used. Imported and persisted data cross a runtime validation boundary.
