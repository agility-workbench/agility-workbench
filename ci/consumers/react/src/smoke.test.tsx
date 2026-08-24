// @vitest-environment happy-dom
import { afterEach, beforeAll, expect, it } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { version as reactVersion } from "react";
import type { IGridAPI } from "@agility-workbench/react-grid";
import { App } from "./App";

// The grid's CanvasMeasurer needs a 2D canvas context to measure text;
// happy-dom does not implement one, so stub the minimum it uses.
beforeAll(() => {
  (HTMLCanvasElement.prototype as unknown as { getContext: () => object }).getContext = () => ({
    font: "",
    measureText: (t: string) => ({ width: t.length * 7 }),
  });
});

let root: Root | null = null;
afterEach(() => {
  root?.unmount();
  root = null;
});

async function waitFor(cond: () => boolean, label: string, timeoutMs = 5000): Promise<void> {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > timeoutMs) throw new Error(`Timed out waiting for: ${label}`);
    await new Promise((r) => setTimeout(r, 25));
  }
}

it(`mounts under React ${reactVersion} (StrictMode), renders rows, and answers API calls`, async () => {
  const host = document.createElement("div");
  document.body.appendChild(host);

  let api: IGridAPI | null = null;
  root = createRoot(host);
  root.render(<App onReady={(readyApi) => (api = readyApi)} />);

  await waitFor(() => api !== null, "onGridReady");
  await waitFor(() => (host.textContent ?? "").includes("Widget"), "first row rendered");
  expect(host.textContent).toContain("Gadget");

  api!.setQuickFilter("Sprocket");
  await waitFor(() => !(host.textContent ?? "").includes("Widget"), "quick filter applied");
  expect(host.textContent).toContain("Sprocket");

  api!.setQuickFilter("");
  await waitFor(() => (host.textContent ?? "").includes("Widget"), "quick filter cleared");

  api!.selectRowsById(["1", "2"], "set");
  await waitFor(() => api!.getSelectedRows().length === 2, "two rows selected");
});
