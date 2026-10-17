// @vitest-environment happy-dom
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
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

// happy-dom has no layout: a wrapping header label reports four 20px lines.
beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, "scrollHeight", {
    configurable: true,
    get(this: HTMLElement) {
      return this.classList.contains("pte-hcell-label") && this.closest(".pte-hcell-wrap-text") ? 80 : 0;
    },
  });
});

afterEach(() => {
  delete (HTMLElement.prototype as any).scrollHeight;
});

const cols = (autoHeaderHeight: boolean): ReactColDef[] => [
  { colId: "long", key: "long", label: "A long header label that wraps onto several lines", width: 90, wrapHeaderText: true, autoHeaderHeight },
  { colId: "id", key: "id", label: "ID", lockPosition: "right" },
];

describe("wrapHeaderText + autoHeaderHeight (React)", () => {
  it("grows the header to the wrapped label and back when the prop turns off", async () => {
    const container = document.createElement("div");
    Object.defineProperty(container, "clientHeight", { value: 600, configurable: true });
    document.body.appendChild(container);
    const root = createRoot(container);
    const render = (autoHeaderHeight: boolean) =>
      act(async () => {
        root.render(<Grid data={[{ id: 1, long: "x" }]} columnDefs={cols(autoHeaderHeight)} rowIdKey="id" />);
      });
    const wrapper = () => container.querySelector<HTMLElement>(".pte-header-wrapper")!;
    const leafCell = () => container.querySelector<HTMLElement>(".pte-hcell")!;

    await render(true);
    const grown = Number.parseFloat(wrapper().style.height);
    expect(grown).toBeGreaterThan(80);
    expect(leafCell().style.height).toBe(`${grown}px`);
    expect(container.querySelector(".pte-hcell-wrap-text")).not.toBeNull();

    await render(false);
    expect(wrapper().style.height).toBe("43px");

    await unmountTestRoot(root);
    container.remove();
  });
});
