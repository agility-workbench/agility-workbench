// @vitest-environment happy-dom
import { beforeAll, describe, expect, it } from "vitest";
import React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { IGridAPI } from "@agility-workbench/grid";
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

const COLS: ReactColDef[] = [{ colId: "name", key: "name", label: "Name" }];

describe("<Grid> localization props", () => {
  it("passes localeText and getLocaleText to the grid", async () => {
    const container = document.createElement("div");
    Object.defineProperty(container, "clientHeight", { value: 600, configurable: true });
    document.body.appendChild(container);
    const root = createRoot(container);
    let api: IGridAPI | null = null;
    await act(async () => {
      root.render(
        <Grid
          data={[{ id: 1, name: "Acme" }, { id: 2, name: "Globex" }]}
          columnDefs={COLS}
          rowIdKey="id"
          pagination
          localeText={{ rowsPerPage: "Zeilen pro Seite", nextPage: "Nächste Seite" }}
          getLocaleText={({ key, defaultValue }) => (key === "page" ? "Seite" : defaultValue)}
          onGridReady={(ready: IGridAPI) => { api = ready; }}
        />,
      );
    });

    expect(container.textContent).toContain("Zeilen pro Seite");
    expect(container.textContent).toContain("Seite");
    expect(container.querySelector(".pte-pagination-btn-next")?.getAttribute("aria-label")).toBe("Nächste Seite");
    expect(api!.getLocaleText("page")).toBe("Seite");

    await unmountTestRoot(root);
    container.remove();
  });
});
