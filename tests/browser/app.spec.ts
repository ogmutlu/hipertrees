import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { DEFAULT_COLORS, apply, welcome } from "../../src/domain";

async function focusVertex(page: Page, title: string): Promise<void> {
  await page
    .getByRole("button", { name: `Select ${title}`, exact: true })
    .click();
  await page.getByRole("button", { name: "Focus", exact: true }).click();
}
async function openNotes(page: Page, title: string): Promise<void> {
  await page
    .getByRole("button", { name: `Select ${title}`, exact: true })
    .click();
  await page.getByRole("button", { name: "Edit goal", exact: true }).click();
}
async function chooseColor(page: Page, color: string): Promise<void> {
  await page.getByRole("button", { name: "Vertex color", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Choose vertex color" });
  await dialog
    .getByLabel("Vertex color", { exact: true })
    .evaluate((input: HTMLInputElement, value) => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set?.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    }, color);
  await dialog.getByRole("button", { name: "Done", exact: true }).click();
}
async function toggleFill(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Vertex color", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Choose vertex color" });
  const toggle = dialog.getByRole("switch", {
    name: "Fill interior",
    exact: true,
  });
  const previous = await toggle.getAttribute("aria-checked");
  await toggle.click();
  await expect(toggle).toHaveAttribute(
    "aria-checked",
    previous === "true" ? "false" : "true",
  );
  await dialog.getByRole("button", { name: "Done", exact: true }).click();
}

test.beforeEach(async ({ page }) => {
  const fixture = apply(
    welcome(Date.now()),
    {
      type: "edit",
      id: "welcome",
      title: "Test project",
      notes: "",
      estimateMinutes: 0,
    },
    Date.now(),
  );
  await page.addInitScript((state) => {
    if (!localStorage.getItem("hyperforest.workspace.v1"))
      localStorage.setItem("hyperforest.workspace.v1", JSON.stringify(state));
  }, fixture);
});

test("simple filled vertices and fixed menu slots survive mode and selection changes", async ({
  page,
}) => {
  await page.goto("./");
  const menu = page.locator(".inspector");
  const controls = [
    menu,
    page.locator(".inspector-summary"),
    page.locator(".inspector-actions"),
    page.getByRole("button", { name: "Vertex color", exact: true }),
    page.getByLabel("Parent connection"),
  ];
  const positions = await Promise.all(
    controls.map((control) => control.boundingBox()),
  );
  const check = async (): Promise<void> => {
    for (const [index, control] of controls.entries())
      expect(await control.boundingBox()).toEqual(positions[index]);
    await expect(page.locator(".goal [role=button]")).toHaveCount(9);
    await expect(
      page.locator(
        ".goal .node-play, .goal .node-notes, .goal .node-add, .goal .node-color-button",
      ),
    ).toHaveCount(0);
  };
  await check();
  await expect(page.getByTestId("node-fill-read")).toHaveAttribute(
    "fill",
    DEFAULT_COLORS[1] ?? "",
  );
  await expect(page.getByTestId("node-fill-read")).toHaveAttribute("r", "18");
  await expect(
    page.getByTestId("node-read").locator(".node-title"),
  ).toHaveAttribute("fill", "#ffffff");
  await page.getByRole("button", { name: "Edit graph", exact: true }).click();
  await check();
  await page
    .getByRole("button", { name: "Select Read & wonder", exact: true })
    .click();
  await check();
  await page
    .getByRole("button", { name: "Select Discover", exact: true })
    .click();
  await check();
  await page.getByRole("button", { name: "Vertex color", exact: true }).click();
  const picker = page.getByRole("dialog", { name: "Choose vertex color" });
  for (const [index, color] of DEFAULT_COLORS.entries()) {
    const swatch = picker.getByRole("button", {
      name: `Default color ${index + 1}`,
      exact: true,
    });
    await expect(swatch).toHaveText(String(index + 1));
    await expect(swatch).toHaveAttribute("title", color);
  }
  await picker
    .getByRole("button", { name: "Default color 3", exact: true })
    .click();
  await expect(page.getByTestId("node-fill-discover")).toHaveAttribute(
    "fill",
    DEFAULT_COLORS[2] ?? "",
  );
  await expect(
    page.getByTestId("node-discover").locator(".node-title"),
  ).toHaveAttribute("fill", "#ffffff");
  await picker.getByRole("button", { name: "Done", exact: true }).click();
  await page.getByRole("button", { name: "Done editing", exact: true }).click();
  await check();
});

test("pedantic explains the definition and rejects disconnected color groups", async ({
  page,
}) => {
  await page.goto("./");
  const toggle = page.getByRole("switch", { name: "pedantic", exact: true });
  await toggle.hover();
  await expect(page.getByRole("tooltip")).toContainText("connected subtree");
  await expect(page.getByRole("tooltip")).toContainText(/separate hypertrees/);
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-checked", "true");
  await page.getByRole("button", { name: "Edit graph", exact: true }).click();
  const color = async (name: string): Promise<void> => {
    await page
      .getByRole("button", { name: `Select ${name}`, exact: true })
      .click();
    await chooseColor(page, "#aabbcc");
  };
  await color("Read & wonder");
  await expect(page.getByTestId("node-fill-read")).toHaveAttribute(
    "stroke",
    "#aabbcc",
  );
  await color("Ask good questions");
  await expect(page.getByRole("alert")).toContainText("connected subtree");
  await expect(page.getByTestId("node-fill-ask")).toHaveAttribute(
    "stroke",
    "#80c9bc",
  );
  await color("Discover");
  await expect(page.getByTestId("node-fill-discover")).toHaveAttribute(
    "stroke",
    "#aabbcc",
  );
  await color("Ask good questions");
  await expect(page.getByTestId("node-fill-ask")).toHaveAttribute(
    "stroke",
    "#aabbcc",
  );
  await page
    .getByRole("button", { name: "Select Read & wonder", exact: true })
    .click();
  await page.getByLabel("Parent connection").selectOption("create");
  await expect(page.getByRole("alert")).toContainText("connected subtree");
  await expect(page.getByLabel("Parent connection")).toHaveValue("discover");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-checked", "false");
  await page.getByLabel("Parent connection").selectOption("create");
  await expect(page.getByLabel("Parent connection")).toHaveValue("create");
  await toggle.click();
  await expect(page.getByRole("alert")).toContainText("connected subtree");
  await expect(toggle).toHaveAttribute("aria-checked", "false");
  await page.reload();
  await expect(toggle).toHaveAttribute("aria-checked", "false");
  await page.getByRole("button", { name: "Edit graph", exact: true }).click();
  await page
    .getByRole("button", { name: "Select Read & wonder", exact: true })
    .click();
  await page.getByLabel("Parent connection").selectOption("discover");
  await expect(page.getByLabel("Parent connection")).toHaveValue("discover");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-checked", "true");
  await toggleFill(page);
  await expect(page.getByTestId("node-fill-read")).toHaveAttribute(
    "fill",
    "#101820",
  );
  await toggleFill(page);
  await expect(page.getByTestId("node-fill-read")).toHaveAttribute(
    "fill",
    "#aabbcc",
  );
  await expect(page.getByTestId("node-fill-read")).toHaveAttribute(
    "stroke",
    "#aabbcc",
  );
  await expect(toggle).toHaveAttribute("aria-checked", "true");
  await page.reload();
  await expect(toggle).toHaveAttribute("aria-checked", "true");
});

test("the compact top menu renames nodes and forest roots directly", async ({
  page,
}) => {
  await page.goto("./");
  await expect(
    page.getByRole("button", { name: "Rename selected vertex", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Edit graph", exact: true }).click();
  await page
    .getByRole("button", { name: "Select Read & wonder", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Rename selected vertex", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Vertex name", exact: true })
    .fill("Read papers");
  await page
    .getByRole("textbox", { name: "Vertex name", exact: true })
    .press("Enter");
  await expect(page.locator(".inspector h2")).toHaveText("Read papers");
  await expect(
    page.getByRole("button", { name: "Select Read papers", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Rename selected vertex", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Vertex name", exact: true })
    .fill("Cancelled");
  await page
    .getByRole("textbox", { name: "Vertex name", exact: true })
    .press("Escape");
  await expect(page.locator(".inspector h2")).toHaveText("Read papers");
  await page
    .getByRole("button", { name: "Select Test project", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Rename selected vertex", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Vertex name", exact: true })
    .fill("My forest");
  await page
    .getByRole("button", { name: "Save vertex name", exact: true })
    .click();
  await expect(page.getByRole("tab", { name: /My forest/ })).toBeVisible();
  await page.reload();
  await expect(page.locator(".inspector h2")).toHaveText("My forest");
  await expect(
    page.getByRole("button", { name: "Select Read papers", exact: true }),
  ).toBeVisible();
});

test("vertices reach both canvas edges and the top menu changes color", async ({
  page,
}) => {
  await page.goto("./");
  await page.getByRole("button", { name: "Edit graph", exact: true }).click();
  const canvas = await page.locator(".graph-svg").boundingBox();
  if (!canvas) throw new Error("Missing canvas");
  const body = page.getByTestId("node-fill-welcome");
  for (const x of [canvas.x + 70, canvas.x + canvas.width - 70]) {
    const source = await body.boundingBox();
    if (!source) throw new Error("Missing node");
    await page.mouse.move(
      source.x + source.width / 2,
      source.y + source.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(x, canvas.y + canvas.height * 0.3, { steps: 12 });
    await page.mouse.up();
    await expect
      .poll(async () => {
        const box = await body.boundingBox();
        return box ? Math.abs(box.x + box.width / 2 - x) : Infinity;
      })
      .toBeLessThan(3);
  }
  await page.getByRole("button", { name: "Vertex color", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Choose vertex color" });
  await dialog
    .getByLabel("Vertex color")
    .evaluate((input: HTMLInputElement) => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set?.call(input, "#7c83ff");
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
  await expect(body).toHaveAttribute("fill", "#7c83ff");
  await dialog.getByRole("button", { name: "Done", exact: true }).click();
  const moved = await page
    .getByTestId("node-welcome")
    .getAttribute("transform");
  await page.reload();
  await expect(page.getByTestId("node-welcome")).toHaveAttribute(
    "transform",
    moved ?? "",
  );
  await expect(body).toHaveAttribute("fill", "#7c83ff");
  await expect(
    page.getByRole("button", { name: "Vertex color", exact: true }),
  ).toBeDisabled();
});

test("hyperforest supports isolated colored vertices, notes and a full-width canvas", async ({
  page,
}) => {
  await page.goto("./");
  await expect(page).toHaveTitle(/hyperforest/);
  await expect(
    page.getByRole("button", { name: "New vertex", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Edit graph", exact: true }).click();
  await page.getByRole("button", { name: "New vertex", exact: true }).click();
  await page.getByLabel("Goal name", { exact: true }).fill("Independent");
  await page.getByRole("button", { name: "Add step", exact: true }).click();
  await expect(page.locator(".inspector h2")).toHaveText("Independent");
  await expect(page.getByLabel("Parent connection")).toHaveValue("welcome");
  await page.getByLabel("Parent connection").selectOption("");
  await chooseColor(page, "#ef6a75");
  const isolated = page.locator(".goal").filter({
    has: page.getByRole("button", {
      name: "Select Independent",
      exact: true,
    }),
  });
  await expect(isolated.locator('[data-testid^="node-fill-"]')).toHaveAttribute(
    "fill",
    "#ef6a75",
  );
  await page.getByRole("button", { name: "Done editing", exact: true }).click();
  await openNotes(page, "Independent");
  await expect(page.getByLabel("Goal name", { exact: true })).toBeDisabled();
  await page
    .getByRole("textbox", { name: "Markdown notes" })
    .fill("# Independent notes\nA new direction.");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const canvas = await page.locator(".map-panel").boundingBox();
  const details = await page.locator(".inspector").boundingBox();
  if (!canvas || !details) throw new Error("Missing layout");
  expect(Math.abs(canvas.width - details.width)).toBeLessThan(2);
  expect(details.y + details.height).toBeLessThanOrEqual(canvas.y + 1);
  expect(details.height).toBeLessThan(150);
  await page.reload();
  await expect(isolated.locator('[data-testid^="node-fill-"]')).toHaveAttribute(
    "fill",
    "#ef6a75",
  );
  await openNotes(page, "Independent");
  await expect(
    page.getByRole("textbox", { name: "Markdown notes" }),
  ).toHaveValue("# Independent notes\nA new direction.");
});

test("edit toggle gates dragging, reconnecting, disconnecting and node plus buttons", async ({
  page,
}) => {
  await page.goto("./");
  const read = page.getByTestId("node-read");
  const before = await read.getAttribute("transform");
  const circle = await read.locator("circle").first().boundingBox();
  if (!circle) throw new Error("Missing node");
  await page.mouse.move(
    circle.x + circle.width / 2,
    circle.y + circle.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    circle.x + circle.width / 2 + 60,
    circle.y + circle.height / 2 + 40,
    { steps: 8 },
  );
  await page.mouse.up();
  await expect(read).toHaveAttribute("transform", before ?? "");
  await expect(page.getByRole("button", { name: /^Add child to/ })).toHaveCount(
    0,
  );
  await expect(
    page.getByRole("button", { name: "Arrange vertices" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Edit graph", exact: true }).click();
  const target = await page
    .getByTestId("node-create")
    .locator("circle")
    .first()
    .boundingBox();
  const handle = page.getByTestId("edge-handle-read");
  const start = await handle.boundingBox();
  if (!target || !start) throw new Error("Missing connection");
  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    target.x + target.width / 2,
    target.y + target.height / 2,
    { steps: 12 },
  );
  await page.mouse.up();
  await page
    .getByRole("button", { name: "Select Read & wonder", exact: true })
    .click();
  await expect(page.getByLabel("Parent connection")).toHaveValue("create");
  const movedHandle = await handle.boundingBox();
  const canvas = await page.locator(".graph-svg").boundingBox();
  if (!movedHandle || !canvas) throw new Error("Missing canvas");
  await page.mouse.move(
    movedHandle.x + movedHandle.width / 2,
    movedHandle.y + movedHandle.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(canvas.x + 20, canvas.y + 20, { steps: 12 });
  await page.mouse.up();
  await expect(page.getByTestId("edge-read")).toHaveCount(0);
  await expect(page.getByLabel("Parent connection")).toHaveValue("");
  const detachedHandle = await handle.boundingBox();
  const discover = await page
    .getByTestId("node-discover")
    .locator("circle")
    .first()
    .boundingBox();
  if (!detachedHandle || !discover)
    throw new Error("Missing detached connector");
  await page.mouse.move(
    detachedHandle.x + detachedHandle.width / 2,
    detachedHandle.y + detachedHandle.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    discover.x + discover.width / 2,
    discover.y + discover.height / 2,
    { steps: 12 },
  );
  await page.mouse.up();
  await expect(page.getByLabel("Parent connection")).toHaveValue("discover");
  await page.getByLabel("Parent connection").selectOption("");
  await expect(page.getByTestId("edge-read")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Select Read & wonder", exact: true })
    .click();
  await page.getByRole("button", { name: "New vertex", exact: true }).click();
  await page.getByLabel("Goal name", { exact: true }).fill("A small step");
  await page.getByRole("button", { name: "Add step", exact: true }).click();
  await expect(page.locator(".inspector h2")).toHaveText("A small step");
  await page.getByRole("button", { name: "Done editing", exact: true }).click();
  await expect(page.getByTestId("edge-handle-read")).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId("edge-read")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Select A small step", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Edit graph", exact: true }),
  ).toHaveAttribute("aria-pressed", "false");
});

test("new workspaces are empty and roots can move in an expandable graph", async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.removeItem("hyperforest.workspace.v1"),
  );
  await page.goto("./");
  await expect(page.getByRole("tab")).toHaveCount(0);
  await page
    .getByRole("button", { name: "New hypertree", exact: true })
    .click();
  await page.getByLabel("Hypertree name").fill("My tree");
  await page
    .getByRole("button", { name: "Create hypertree", exact: true })
    .click();
  await page.getByRole("button", { name: "Edit graph", exact: true }).click();
  const root = page.locator(".root-goal");
  await expect(root).toHaveAttribute("transform", "translate(550 130)");
  const circle = root.getByRole("button", {
    name: "Select My tree",
    exact: true,
  });
  const box = await circle.boundingBox();
  if (!box) throw new Error("Missing root");
  await page.mouse.move(box.x + box.width / 2, box.y + 20);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 80, box.y + 80);
  await page.mouse.up();
  await expect(root).not.toHaveAttribute("transform", "translate(550 130)");
  await expect(page.locator(".map-heading, .graph-caption")).toHaveCount(0);
  const graph = page.locator(".graph");
  const area = await graph.boundingBox();
  if (!area) throw new Error("Missing graph");
  await page.mouse.move(area.x + area.width - 3, area.y + area.height - 3);
  await page.mouse.down();
  await page.mouse.move(area.x + area.width - 3, area.y + area.height + 150, {
    steps: 10,
  });
  await page.mouse.up();
  await expect
    .poll(async () => (await graph.boundingBox())?.height ?? 0)
    .toBeGreaterThan(area.height + 100);
});

test("finishing a child removes it and preserves parent time after reload", async ({
  page,
}) => {
  await page.goto("./");
  await focusVertex(page, "Read & wonder");
  await expect(page.getByTestId("focus-timer")).not.toHaveText("00:00:00");
  await page.getByRole("button", { name: "Pause & return" }).click();
  await page
    .getByRole("button", { name: "Select Discover", exact: true })
    .click();
  const parentTime = await page.locator(".time-stat > span").innerText();
  expect(parentTime).not.toBe("0m");
  await page
    .getByRole("button", { name: "Select Read & wonder", exact: true })
    .click();
  await page.getByRole("button", { name: "Edit graph", exact: true }).click();
  await page.getByRole("button", { name: "Finish goal", exact: true }).click();
  await page
    .getByRole("dialog", { name: "Finish goal" })
    .getByRole("button", { name: "Finish goal", exact: true })
    .click();
  await expect(page.getByTestId("node-read")).toHaveCount(0);
  await expect(page.locator(".inspector h2")).toHaveText("Discover");
  await expect(page.locator(".time-stat > span")).toHaveText(parentTime);
  await expect(page.locator(".paused-dock")).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId("node-read")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Select Discover", exact: true })
    .click();
  await expect(page.locator(".time-stat > span")).toHaveText(parentTime);
  await page
    .getByRole("button", { name: "Session history", exact: true })
    .click();
  await expect(page.locator(".history-list")).toContainText("Read & wonder");
});

test("Ctrl + scroll zooms the graph while ordinary scrolling stays native", async ({
  page,
}) => {
  await page.goto("./");
  const graph = page.locator(".graph-svg");
  const camera = page.locator(".graph-svg > g");
  await graph.hover();
  await page.evaluate(() => {
    document.addEventListener("wheel", (event) => {
      document.documentElement.dataset["wheelPrevented"] = String(
        event.defaultPrevented,
      );
    });
  });
  const original = await camera.getAttribute("transform");
  await page.mouse.wheel(0, 100);
  await expect(page.locator("html")).toHaveAttribute(
    "data-wheel-prevented",
    "false",
  );
  await expect(camera).toHaveAttribute("transform", original ?? "");

  await graph.hover();
  await page.keyboard.down("Control");
  await page.mouse.wheel(0, -100);
  await expect(camera).toHaveAttribute("transform", /scale\(1\.1\)/);
  await expect(page.locator("html")).toHaveAttribute(
    "data-wheel-prevented",
    "true",
  );
  await page.mouse.wheel(0, 100);
  await page.keyboard.up("Control");
  await expect(camera).toHaveAttribute("transform", original ?? "");
});

test("drags persist and start expands; pause contracts without losing time", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("./");
  await page.screenshot({
    path: "/tmp/hyperforest-desktop.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Edit graph", exact: true }).click();
  const node = page.getByTestId("node-read");
  const before = await node.getAttribute("transform");
  const body = page.getByRole("button", {
    name: "Select Read & wonder",
    exact: true,
  });
  const box = await body.boundingBox();
  expect(box).not.toBeNull();
  if (!box) throw new Error("Node is missing");
  // Start at the circle, not its text label.
  await page.mouse.move(box.x + box.width / 2, box.y + 30);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 60, box.y + 70, { steps: 12 });
  await page.mouse.up();
  await expect(node).not.toHaveAttribute("transform", before ?? "");
  const moved = await node.getAttribute("transform");
  await page.reload();
  await expect(node).toHaveAttribute("transform", moved ?? "");
  await focusVertex(page, "Read & wonder");
  await expect(
    page.getByRole("dialog", { name: "Focus session" }),
  ).toBeVisible();
  await expect(page.locator(".focus-screen")).toHaveClass(/expanded/);
  await expect(page.getByTestId("focus-timer")).not.toHaveText("00:00:00", {
    timeout: 5000,
  });
  await page.screenshot({ path: "/tmp/hyperforest-focus.png", fullPage: true });
  await page.getByRole("button", { name: "Pause & return" }).click();
  await expect(page.getByRole("dialog", { name: "Focus session" })).toHaveCount(
    0,
  );
  await expect(page.locator(".paused-dock")).toBeVisible();
  await page.reload();
  await expect(page.locator(".paused-dock")).toBeVisible();
  await page.getByRole("button", { name: "Resume", exact: true }).click();
  await expect(page.locator(".focus-screen")).toHaveClass(/expanded/);
  await page.getByRole("button", { name: "Save session", exact: true }).click();
  await expect(page.locator(".paused-dock")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Session history", exact: true })
    .click();
  await expect(page.locator(".history-list")).toContainText("Read & wonder");
  expect(errors).toEqual([]);
});

test("creates trees and children, edits markdown, and restores them on reload", async ({
  page,
}) => {
  await page.goto("./");
  await page.getByRole("button", { name: "New hypertree" }).click();
  await page.getByLabel("Hypertree name").fill("Thesis");
  await page
    .getByRole("button", { name: "Create hypertree", exact: true })
    .click();
  await expect(page.getByRole("tab", { name: /Thesis/ })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await page.getByRole("button", { name: "Edit graph", exact: true }).click();
  await page.getByRole("button", { name: "New vertex", exact: true }).click();
  await page.getByLabel("Goal name", { exact: true }).fill("Research");
  await page.getByRole("button", { name: "Add step", exact: true }).click();
  await expect(page.locator(".inspector h2")).toHaveText("Research");
  await page.getByRole("button", { name: "Edit goal", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Markdown notes" })
    .fill("# Research\nA question worth asking.");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(
    page.getByRole("dialog", { name: "Edit goal and notes" }),
  ).toHaveCount(0);
  await page.reload();
  await page.getByRole("tab", { name: /Thesis/ }).click();
  await page.getByRole("button", { name: "Edit graph", exact: true }).click();
  await page
    .getByRole("button", { name: "Select Research", exact: true })
    .click();
  await page.getByRole("button", { name: "Edit goal", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "Markdown notes" }),
  ).toHaveValue("# Research\nA question worth asking.");
});

test("fits on mobile without horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("./");
  await page.screenshot({
    path: "/tmp/hyperforest-mobile.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await focusVertex(page, "Create");
  await page.getByRole("button", { name: "Pause & return" }).click();
  await expect(page.locator(".paused-dock")).toBeVisible();
});

test("duplicate children show a visible error without changing saved data", async ({
  page,
}) => {
  await page.goto("./");
  await page.getByRole("button", { name: "Edit graph", exact: true }).click();
  await page.getByRole("button", { name: "New vertex", exact: true }).click();
  await page.getByLabel("Goal name", { exact: true }).fill("Discover");
  await page.getByRole("button", { name: "Add step", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Add child goal" });
  await expect(dialog.getByRole("alert")).toContainText(
    "Sibling names must be unique",
  );
  await page.getByRole("button", { name: "Close dialog" }).click();
  await expect(page.getByRole("tab", { name: /Test project/ })).toContainText(
    "9",
  );
});

test("double click focuses a vertex in normal and edit modes", async ({
  page,
}) => {
  await page.goto("./");
  const vertex = page.getByRole("button", {
    name: "Select Read & wonder",
    exact: true,
  });
  await vertex.click();
  await expect(page.locator(".focus-screen")).toHaveCount(0);
  await vertex.dblclick();
  await expect(page.locator(".focus-screen")).toHaveClass(/expanded/);
  await page.getByRole("button", { name: "Pause & return" }).click();
  await page.getByRole("button", { name: "Edit graph", exact: true }).click();
  await vertex.dblclick();
  await expect(page.locator(".focus-screen")).toHaveClass(/expanded/);
});

test("clear local data requires confirmation and stays empty after reload", async ({
  page,
}) => {
  await page.goto("./");
  await focusVertex(page, "Read & wonder");
  await page.getByRole("button", { name: "Pause & return" }).click();
  await page.evaluate(() => {
    localStorage.setItem(
      "hipertrees.workspace.v1",
      localStorage.getItem("hyperforest.workspace.v1") ?? "",
    );
    localStorage.setItem("unrelated-data", "keep");
  });
  const before = await page.evaluate(() =>
    localStorage.getItem("hyperforest.workspace.v1"),
  );
  await page
    .getByRole("button", { name: "Clear local data", exact: true })
    .click();
  const confirmation = page.getByRole("dialog", {
    name: "Clear local data",
    exact: true,
  });
  await expect(confirmation).toContainText("Export a backup first");
  await confirmation
    .getByRole("button", { name: "Cancel", exact: true })
    .click();
  expect(
    await page.evaluate(() => localStorage.getItem("hyperforest.workspace.v1")),
  ).toBe(before);
  await page
    .getByRole("button", { name: "Clear local data", exact: true })
    .click();
  await confirmation
    .getByRole("button", { name: "Delete all local data", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Every hypertree starts with one idea.",
    }),
  ).toBeVisible();
  await expect(page.locator(".paused-dock")).toHaveCount(0);
  expect(
    await page.evaluate(() => localStorage.getItem("hipertrees.workspace.v1")),
  ).toBeNull();
  expect(
    await page.evaluate(() => localStorage.getItem("unrelated-data")),
  ).toBe("keep");
  await page.reload();
  await expect(
    page.getByRole("heading", {
      name: "Every hypertree starts with one idea.",
    }),
  ).toBeVisible();
});

test("export downloads directly without an app dialog", async ({ page }) => {
  await page.addInitScript(() =>
    Object.defineProperty(window, "showSaveFilePicker", {
      configurable: true,
      value: undefined,
    }),
  );
  await page.goto("./");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export", exact: true }).click();
  expect((await download).suggestedFilename()).toBe("hyperforest-export.zip");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("export writes a backup through the native Save As API", async ({
  page,
}) => {
  await page.addInitScript(() =>
    Object.defineProperty(window, "showSaveFilePicker", {
      configurable: true,
      value: async (options: { suggestedName: string }) =>
        (await navigator.storage.getDirectory()).getFileHandle(
          options.suggestedName,
          { create: true },
        ),
    }),
  );
  await page.goto("./");
  await page.getByRole("button", { name: "Export", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect
    .poll(() =>
      page.evaluate(async () => {
        try {
          const file = await (
            await (
              await navigator.storage.getDirectory()
            ).getFileHandle("hyperforest-export.zip")
          ).getFile();
          return Array.from(
            new Uint8Array(await file.arrayBuffer()).slice(0, 2),
          );
        } catch {
          return [];
        }
      }),
    )
    .toEqual([80, 75]);
});

test("focus tab title shows only the timer and updates every second", async ({
  page,
}) => {
  await page.goto("./");
  await page.clock.install();
  await focusVertex(page, "Read & wonder");
  await expect(page).toHaveTitle("00:00:00");
  await page.clock.runFor(1000);
  await expect(page).toHaveTitle("00:00:01");
  await page.clock.runFor(1000);
  await expect(page).toHaveTitle("00:00:02");
  await page.getByRole("button", { name: "Pause & return" }).click();
  await expect(page).toHaveTitle("hyperforest — a little structure");
  await page.clock.runFor(2000);
  await expect(page).toHaveTitle("hyperforest — a little structure");
});

test("new hypertrees enable pedantic by default and cannot be disconnected", async ({
  page,
}) => {
  await page.goto("./");
  await page
    .getByRole("button", { name: "New hypertree", exact: true })
    .click();
  await page.getByLabel("Hypertree name").fill("Connected graph");
  await page
    .getByRole("button", { name: "Create hypertree", exact: true })
    .click();
  const toggle = page.getByRole("switch", { name: "pedantic", exact: true });
  await expect(toggle).toHaveAttribute("aria-checked", "true");
  await toggle.hover();
  await expect(page.getByRole("tooltip")).toContainText(
    "whole graph to be connected",
  );
  await page.getByRole("button", { name: "Edit graph", exact: true }).click();
  await page.getByRole("button", { name: "New vertex", exact: true }).click();
  await page.getByLabel("Goal name", { exact: true }).fill("Distinct color");
  await page.getByRole("button", { name: "Add step", exact: true }).click();
  await chooseColor(page, "#ef6a75");
  const parent = page.getByLabel("Parent connection");
  const rootId = await parent.inputValue();
  await expect(parent.locator('option[value=""]')).toHaveAttribute(
    "disabled",
    "",
  );
  await toggle.click();
  await parent.selectOption("");
  await toggle.click();
  await expect(page.getByRole("alert")).toContainText("must be connected");
  await expect(toggle).toHaveAttribute("aria-checked", "false");
  await parent.selectOption(rootId);
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-checked", "true");
  await page.reload();
  await page.getByRole("tab", { name: /Connected graph/ }).click();
  await expect(toggle).toHaveAttribute("aria-checked", "true");
});

test("multiple colors render, persist, and can return to a single color", async ({
  page,
}) => {
  await page.goto("./");
  await page.getByRole("button", { name: "Edit graph", exact: true }).click();
  await page.getByRole("button", { name: "Vertex color", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Choose vertex color" });
  const multiple = dialog.getByRole("switch", {
    name: "Multiple colors",
    exact: true,
  });
  await multiple.click();
  await expect(multiple).toHaveAttribute("aria-checked", "true");
  await dialog
    .getByRole("button", { name: "Default color 2", exact: true })
    .click();
  await expect(
    page.getByTestId("node-colors-welcome").locator("path"),
  ).toHaveCount(2);
  await dialog.getByRole("button", { name: "Done", exact: true }).click();
  await page.reload();
  await expect(
    page.getByTestId("node-colors-welcome").locator("path"),
  ).toHaveCount(2);
  await page.getByRole("button", { name: "Edit graph", exact: true }).click();
  await page.getByRole("button", { name: "Vertex color", exact: true }).click();
  await expect(multiple).toHaveAttribute("aria-checked", "true");
  await dialog
    .getByRole("switch", { name: "Fill interior", exact: true })
    .click();
  await expect(
    page.getByTestId("node-colors-welcome").locator("path").first(),
  ).toHaveAttribute("fill", "none");
  await multiple.click();
  await expect(multiple).toHaveAttribute("aria-checked", "false");
  await expect(page.getByTestId("node-colors-welcome")).toHaveCount(0);
});

test("adds another hypertree as a persistent live vertex", async ({ page }) => {
  await page.goto("./");
  await page
    .getByRole("button", { name: "New hypertree", exact: true })
    .click();
  await page.getByLabel("Hypertree name").fill("Linked project");
  await page
    .getByRole("button", { name: "Create hypertree", exact: true })
    .click();
  await page.getByRole("button", { name: "Edit graph", exact: true }).click();
  await page.getByRole("button", { name: "New vertex", exact: true }).click();
  await page.getByLabel("Vertex type").selectOption("welcome");
  await expect(page.getByLabel("Goal name", { exact: true })).toHaveValue(
    "Test project",
  );
  await page.getByRole("button", { name: "Add step", exact: true }).click();
  await expect(page.locator(".inspector h2")).toHaveText("Test project");
  await page.reload();
  await page.getByRole("tab", { name: /Linked project/ }).click();
  await expect(
    page.getByRole("button", { name: "Select Test project", exact: true }),
  ).toBeVisible();
  const linked = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("hyperforest.workspace.v1")!).nodes.find(
      (node: { linkedTreeId?: string }) => node.linkedTreeId === "welcome",
    ),
  );
  expect(linked).toBeTruthy();
});

test("reorders tabs and routes linked focus to its source root", async ({
  page,
}) => {
  await page.goto("./");
  await page
    .getByRole("button", { name: "New hypertree", exact: true })
    .click();
  await page.getByLabel("Hypertree name").fill("Container");
  await page
    .getByRole("button", { name: "Create hypertree", exact: true })
    .click();
  const rearrange = await page
    .getByRole("button", { name: "Rearrange tabs", exact: true })
    .boundingBox();
  const create = await page
    .getByRole("button", { name: "New hypertree", exact: true })
    .boundingBox();
  const history = await page
    .getByRole("button", { name: "Session history", exact: true })
    .boundingBox();
  expect(rearrange!.x + rearrange!.width).toBeLessThanOrEqual(create!.x);
  expect(create!.x + create!.width).toBeLessThanOrEqual(history!.x);
  expect(
    Math.abs(
      create!.y + create!.height / 2 - (history!.y + history!.height / 2),
    ),
  ).toBeLessThan(1);
  await expect(
    page
      .getByRole("tablist")
      .getByRole("button", { name: "New hypertree", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Rearrange tabs", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Move Container earlier", exact: true })
    .click();
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await expect(page.getByRole("tab").first()).toContainText("Container");
  await page.reload();
  await expect(page.getByRole("tab").first()).toContainText("Container");
  await page.getByRole("tab", { name: /Container/ }).click();
  await page.getByRole("button", { name: "Edit graph", exact: true }).click();
  await page.getByRole("button", { name: "New vertex", exact: true }).click();
  await page.getByLabel("Vertex type").selectOption("welcome");
  await page.getByRole("button", { name: "Add step", exact: true }).click();
  await page.getByRole("button", { name: "Focus", exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(localStorage.getItem("hyperforest.workspace.v1")!).focus
            ?.nodeId,
      ),
    )
    .toBe("welcome");
  await page
    .getByRole("button", { name: "Pause & return", exact: true })
    .click();
});

test("export includes a readable YAML structure alongside the JSON backup", async ({
  page,
}) => {
  await page.addInitScript(() =>
    Object.defineProperty(window, "showSaveFilePicker", {
      configurable: true,
      value: undefined,
    }),
  );
  await page.goto("./");
  const downloads: string[] = [];
  page.on("download", (file) => downloads.push(file.suggestedFilename()));
  await page.getByRole("button", { name: "Export", exact: true }).click();
  await expect.poll(() => downloads).toEqual(["hyperforest-export.zip"]);
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
