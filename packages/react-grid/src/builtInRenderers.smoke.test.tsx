// @vitest-environment happy-dom
import { beforeAll, describe, expect, it } from "vitest";
import React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { unmountTestRoot } from "./testUtils";
import { Grid } from "./grid";
import type { ReactColDef } from "./cellRenderer";

beforeAll(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  (HTMLCanvasElement.prototype as any).getContext = () => ({
    font: "",
    measureText: (t: string) => ({ width: t.length * 7 }),
  });
});

describe("built-in renderer aliases", () => {
  it('cellRenderer: "progress" renders a progressbar through the React wrapper', async () => {
    const container = document.createElement("div");
    Object.defineProperty(container, "clientHeight", { value: 600, configurable: true });
    document.body.appendChild(container);
    const columnDefs: ReactColDef[] = [
      { colId: "name", key: "name", label: "Name" },
      { colId: "done", key: "done", label: "Done", cellRenderer: "progress", cellRendererParams: { max: 100 } },
    ];
    const root = createRoot(container);
    await act(async () => {
      root.render(<Grid data={[{ id: 1, name: "A", done: 40 }]} columnDefs={columnDefs} rowIdKey="id" />);
    });
    const bar = container.querySelector<HTMLElement>('.pte-row[data-view-idx="0"] [role="progressbar"]');
    expect(bar).not.toBeNull();
    expect(bar!.getAttribute("aria-valuenow")).toBe("40");
    expect(bar!.getAttribute("aria-valuemax")).toBe("100");
    expect(bar!.getAttribute("aria-label")).toBe("Done");
    await unmountTestRoot(root);
  });
});
