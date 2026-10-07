import { expect, it } from "vitest";
import { apply } from "../src/domain";
import type { State } from "../src/domain";
import { structureYaml } from "../src/export";

it("exports nested structure, escaped names, disconnected vertices and live linked time", async () => {
  let state: State = {
    version: 1,
    trees: [],
    nodes: [],
    sessions: [],
    focus: null,
  };
  state = apply(state, { type: "create", id: "a", title: 'Work: "yes"' }, 1000);
  state = apply(state, { type: "create", id: "b", title: "Other" }, 1001);
  state = apply(
    state,
    {
      type: "add",
      id: "link",
      parentId: "a",
      title: "Linked",
      linkedTreeId: "b",
    },
    1002,
  );
  state = apply(state, { type: "pedantic", treeId: "a", enabled: false }, 1003);
  state = apply(
    state,
    { type: "isolate", id: "alone", treeId: "a", title: "Isolated" },
    1004,
  );
  state = apply(state, { type: "start", id: "b" }, 2000);
  const yaml = structureYaml(state, 65000);
  expect(yaml).toContain('name: "Work: \\"yes\\""');
  expect(yaml).toContain('          - name: "Linked"');
  expect(yaml).toContain('      - name: "Isolated"');
  expect(yaml).toContain('focus_time: "00:01:03"');
  expect(yaml).toContain("focus_milliseconds: 63000");
  expect(yaml).toContain('linked_hypertree: "Other"');
  expect(yaml).toContain("children: []");
  const { format } = await import("prettier");
  await expect(format(yaml, { parser: "yaml" })).resolves.toContain(
    "hypertrees:",
  );
});

it("exports an empty workspace", () => {
  expect(
    structureYaml(
      { version: 1, trees: [], nodes: [], sessions: [], focus: null },
      1000,
    ),
  ).toContain("hypertrees: []");
});

it("archives YAML and every Markdown note, with safe distinct filenames and a restorable backup", async () => {
  const { exportArchive, archiveBackup } = await import("../src/export");
  const { unzipSync, strFromU8 } = await import("fflate");
  let state: State = {
    version: 1,
    trees: [],
    nodes: [],
    sessions: [],
    focus: null,
  };
  state = apply(
    state,
    { type: "create", id: "root", title: "Research/Öğuz" },
    1000,
  );
  state = apply(
    state,
    { type: "add", id: "child", parentId: "root", title: "Read" },
    1001,
  );
  state = apply(
    state,
    {
      type: "edit",
      id: "child",
      title: "Read",
      estimateMinutes: 0,
      notes: "# Notes\nÖğuz: [link](https://example.com)\n",
    },
    1002,
  );
  state = apply(
    state,
    { type: "add", id: "duplicate", parentId: "child", title: "Read" },
    1003,
  );
  const archive = exportArchive(state, 5000);
  const files = unzipSync(archive);
  expect(JSON.parse(archiveBackup(archive))).toEqual(state);
  expect(strFromU8(files["hyperforest-structure.yaml"]!)).toBe(
    structureYaml(state, 5000),
  );
  expect(
    Object.keys(files).filter((name) => name.endsWith(".md")),
  ).toHaveLength(3);
  expect(strFromU8(files["notes/Research-Öğuz - Read.md"]!)).toBe(
    state.nodes.find((node) => node.id === "child")!.notes,
  );
  expect(files["notes/Research-Öğuz - Read (2).md"]).toBeDefined();
});
