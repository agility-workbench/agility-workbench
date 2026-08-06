// @vitest-environment happy-dom
import { beforeAll, describe, expect, it } from "vitest";
import React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { ColumnType } from "@agility-workbench/grid";
import { Grid } from "./grid";

beforeAll(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  (HTMLCanvasElement.prototype as any).getContext = () => ({
    font: "",
    measureText: (text: string) => ({ width: text.length * 7 }),
  });
});

const styleCount = () => document.querySelectorAll("#pte-grid-styles").length;

async function mountGrid(extraProps: Record<string, unknown> = {}) {
  const container = document.createElement("div");
  Object.defineProperty(container, "clientHeight", { value: 500, configurable: true });
  document.body.appendChild(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(
      <Grid
        rowIdKey="id"
        rowData={[{ id: "1", product: "A" }]}
        columnDefs={[{ colId: "product", key: "product", label: "Product", type: ColumnType.STRING }]}
        {...extraProps}
      />,
    );
  });

  return { root, container };
}

// Assertions are written against the *change* in the count rather than an
// absolute value, because injection dedupes per document for the lifetime of
// the module and these tests share one happy-dom document.
describe("automatic stylesheet delivery", () => {
  it("does not inject when the application opts out", async () => {
    const before = styleCount();
    await mountGrid({ suppressStyleInjection: true });
    expect(styleCount()).toBe(before);
  });

  it("injects the stylesheet when the grid attaches", async () => {
    await mountGrid();
    expect(styleCount()).toBe(1);
    expect(document.querySelector("#pte-grid-styles")?.textContent).toContain(".pte-root");
  });

  it("does not add a second copy for a second grid on the page", async () => {
    await mountGrid();
    await mountGrid();
    expect(styleCount()).toBe(1);
  });
});
