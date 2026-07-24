// @vitest-environment happy-dom
import { beforeAll, describe, expect, it } from "vitest";
import React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { Grid } from "./grid";
import type { ReactColDef } from "./cellRenderer";

beforeAll(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  (HTMLCanvasElement.prototype as any).getContext = () => ({
    font: "",
    measureText: (t: string) => ({ width: t.length * 7 }),
  });
});

const COLS: ReactColDef[] = [{ colId: "id", key: "id", label: "ID" }];

async function mount(props: Record<string, unknown>, data: unknown[] = []) {
  const container = document.createElement("div");
  Object.defineProperty(container, "clientHeight", { value: 600, configurable: true });
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(<Grid data={data} columnDefs={COLS} rowIdKey="id" {...props} />);
  });
  return { container, root };
}

describe("overlay message options", () => {
  it("uses a custom loadingMessage in the loading overlay", async () => {
    const { container, root } = await mount({ loading: true, loadingMessage: "Fetching rows…" });
    const label = container.querySelector(".pte-loading-label");
    expect(label?.textContent).toBe("Fetching rows…");
    root.unmount();
  });

  it("defaults the loading overlay text when loadingMessage is omitted", async () => {
    const { container, root } = await mount({ loading: true });
    expect(container.querySelector(".pte-loading-label")?.textContent).toBe("Loading data...");
    root.unmount();
  });

  it("uses a custom noRowsMessage when the grid is empty", async () => {
    const { container, root } = await mount({ noRowsMessage: "Nothing to see" }, []);
    const label = container.querySelector(".pte-norows-label");
    expect(label?.textContent).toBe("Nothing to see");
    root.unmount();
  });
});
