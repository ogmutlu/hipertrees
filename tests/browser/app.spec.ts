import { expect, test } from "@playwright/test";

test("finishing a child removes it and preserves parent time after reload", async ({
  page,
}) => {
  await page.goto("./");
  await page
    .getByRole("button", { name: "Start focus on Read & wonder", exact: true })
    .click();
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
    path: "/tmp/hipertrees-desktop.png",
    fullPage: true,
  });
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
  await page
    .getByRole("button", { name: "Start focus on Read & wonder", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Focus session" }),
  ).toBeVisible();
  await expect(page.locator(".focus-screen")).toHaveClass(/expanded/);
  await expect(page.getByTestId("focus-timer")).not.toHaveText("00:00:00", {
    timeout: 5000,
  });
  await page.screenshot({ path: "/tmp/hipertrees-focus.png", fullPage: true });
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
  await page.getByRole("button", { name: "New tree" }).click();
  await page.getByLabel("Tree name").fill("Thesis");
  await page.getByRole("button", { name: "Create tree", exact: true }).click();
  await expect(page.getByRole("tab", { name: /Thesis/ })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await page.getByRole("button", { name: "Add child goal" }).click();
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
  await page.screenshot({ path: "/tmp/hipertrees-mobile.png", fullPage: true });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page
    .getByRole("button", { name: "Start focus on Create", exact: true })
    .click();
  await page.getByRole("button", { name: "Pause & return" }).click();
  await expect(page.locator(".paused-dock")).toBeVisible();
});

test("duplicate children show a visible error without changing saved data", async ({
  page,
}) => {
  await page.goto("./");
  await page.getByRole("button", { name: "Add child goal" }).click();
  await page.getByLabel("Goal name", { exact: true }).fill("Discover");
  await page.getByRole("button", { name: "Add step", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Add child goal" });
  await expect(dialog.getByRole("alert")).toContainText(
    "Sibling names must be unique",
  );
  await page.getByRole("button", { name: "Close dialog" }).click();
  await expect(
    page.getByRole("tab", { name: /A meaningful project/ }),
  ).toContainText("9");
});
