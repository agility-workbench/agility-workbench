// @vitest-environment happy-dom
import { afterEach, beforeAll, expect, it } from "vitest";
import { mount } from "./main";
import type { IGridAPI } from "@agility-workbench/grid";

// The grid's CanvasMeasurer needs a 2D canvas context to measure text;
// happy-dom does not implement one, so stub the minimum it uses.
beforeAll(() => {
  (HTMLCanvasElement.prototype as unknown as { getContext: () => object }).getContext = () => ({
    font: "",
    measureText: (t: string) => ({ width: t.length * 7 }),
  });
});

let api: IGridAPI | null = null;
afterEach(() => {
  api?.destroy();
  api = null;
});

async function waitFor(cond: () => boolean, label: string, timeoutMs = 5000): Promise<void> {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > timeoutMs) throw new Error(`Timed out waiting for: ${label}`);
    await new Promise((r) => setTimeout(r, 25));
  }
}

it("mounts from the packed tarball, renders rows, and quick-filters", async () => {
  const host = document.createElement("div");
  host.style.height = "400px";
  document.body.appendChild(host);

  api = mount(host);

  await waitFor(() => (host.textContent ?? "").includes("Widget"), "first row rendered");
  expect(host.textContent).toContain("Gadget");

  api.setQuickFilter("Sprocket");
  await waitFor(() => !(host.textContent ?? "").includes("Widget"), "quick filter applied");
  expect(host.textContent).toContain("Sprocket");

  api.setQuickFilter("");
  await waitFor(() => (host.textContent ?? "").includes("Widget"), "quick filter cleared");
});
