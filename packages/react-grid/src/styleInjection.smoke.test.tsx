// @vitest-environment happy-dom
import { beforeAll, describe, expect, it } from "vitest";
import React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { ColumnType } from "@agility-workbench/grid";
// Imported through the public entry rather than "./grid": this doubles as a runtime assertion
// that the core style helpers are re-exported from the React package.
import { areGridStylesInjected, Grid } from "./index";

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

// These cases are order-dependent: delivery dedupes per document for the lifetime of the module
// and they share one happy-dom document. The opt-out case therefore has to run before anything
// injects, and the nonce case has to be the first mount that does.
describe("automatic stylesheet delivery", () => {
  it("does not inject when the application opts out", async () => {
    await mountGrid({ suppressStyleInjection: true });
    expect(styleCount()).toBe(0);
    expect(areGridStylesInjected()).toBe(false);
  });

  it("injects the stylesheet on attach, carrying a styleNonce through from props", async () => {
    await mountGrid({ styleNonce: "test-nonce" });
    const style = document.querySelector("#pte-grid-styles");

    expect(styleCount()).toBe(1);
    expect(style?.textContent).toContain(".pte-root");
    expect(areGridStylesInjected()).toBe(true);
    // The nonce reaches the element only when delivery runs through the renderer, which reads it
    // from core options. A wrapper-level injectGridStyles() would land first with no nonce and
    // then suppress the real one via the dedupe-by-id guard, leaving the grid unstyled under CSP.
    expect(style?.getAttribute("nonce")).toBe("test-nonce");
  });

  it("does not add a second copy for a second grid on the page", async () => {
    await mountGrid();
    expect(styleCount()).toBe(1);
  });
});
