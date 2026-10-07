import { strToU8, strFromU8, zipSync, unzipSync } from "fflate";
import { assignedNodeColors, formatTime, totals } from "./domain";
import type { GoalNode, State } from "./domain";

/** A YAML report, separate from the lossless JSON backup. */
export function structureYaml(state: State, now: number): string {
  const quote = (value: string): string => JSON.stringify(value);
  const lines = [
    "# hyperforest structure and cumulative focus times",
    `exported_at: ${quote(new Date(now).toISOString())}`,
  ];
  if (!state.trees.length) return lines.join("\n") + "\nhypertrees: []\n";
  lines.push("hypertrees:");
  for (const tree of state.trees) {
    const time = totals(state, tree.id, now);
    lines.push(
      `  - name: ${quote(tree.title)}`,
      `    id: ${quote(tree.id)}`,
      `    created_at: ${quote(new Date(tree.createdAt).toISOString())}`,
      `    focus_time: ${quote(formatTime(time.get(tree.id) ?? 0))}`,
      `    focus_milliseconds: ${time.get(tree.id) ?? 0}`,
      "    vertices:",
    );
    const write = (node: GoalNode, indent: number): void => {
      const pad = " ".repeat(indent);
      lines.push(
        `${pad}- name: ${quote(node.title)}`,
        `${pad}  id: ${quote(node.id)}`,
        `${pad}  focus_time: ${quote(formatTime(time.get(node.id) ?? 0))}`,
        `${pad}  focus_milliseconds: ${time.get(node.id) ?? 0}`,
        `${pad}  colors: [${assignedNodeColors(state.nodes, node).map(quote).join(", ")}]`,
      );
      if (node.finishedAt !== undefined)
        lines.push(
          `${pad}  finished_at: ${quote(new Date(node.finishedAt).toISOString())}`,
        );
      if (node.linkedTreeId) {
        const source = state.trees.find(
          (item) => item.id === node.linkedTreeId,
        );
        lines.push(
          `${pad}  linked_hypertree: ${quote(source?.title ?? "Deleted hypertree")}`,
          `${pad}  linked_hypertree_id: ${quote(node.linkedTreeId)}`,
        );
      }
      const children = state.nodes.filter((item) => item.parentId === node.id);
      if (children.length) {
        lines.push(`${pad}  children:`);
        for (const child of children) write(child, indent + 4);
      } else lines.push(`${pad}  children: []`);
    };
    for (const node of state.nodes.filter(
      (item) => item.treeId === tree.id && item.parentId === null,
    ))
      write(node, 6);
  }
  return lines.join("\n") + "\n";
}

export function notesFilename(state: State, node: GoalNode): string {
  const tree = state.trees.find((item) => item.id === node.treeId)!;
  const title = `${tree.title} - ${node.title}`
    .replace(/[\\/:*?"<>|\x00-\x1f]/g, "-")
    .replace(/[. ]+$/, "");
  return `${title || "notes"}.md`;
}
export function exportArchive(state: State, now: number): Uint8Array {
  const files: Record<string, Uint8Array> = {
    "hyperforest-backup.json": strToU8(JSON.stringify(state, null, 2)),
    "hyperforest-structure.yaml": strToU8(structureYaml(state, now)),
    "notes/": new Uint8Array(),
  };
  for (const node of state.nodes) {
    const filename = notesFilename(state, node);
    let path = `notes/${filename}`;
    let suffix = 2;
    while (Object.hasOwn(files, path))
      path = `notes/${filename.slice(0, -3)} (${suffix++}).md`;
    files[path] = strToU8(node.notes);
  }
  return zipSync(files);
}
export function archiveBackup(contents: Uint8Array): string {
  const files = unzipSync(contents, {
    filter: (file) => file.name === "hyperforest-backup.json",
  });
  const backup = files["hyperforest-backup.json"];
  if (!backup)
    throw new Error("ZIP does not contain a hyperforest JSON backup.");
  return strFromU8(backup);
}
