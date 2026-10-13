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

const COLS: ReactColDef[] = [
  { colId: "grp", label: "Group", children: [{ colId: "a", key: "a", label: "A" }] },
  { colId: "id", key: "id", label: "ID" },
];

describe("header height props", () => {
  it("sizes the header from the header heights and follows prop changes", async () => {
    const container = document.createElement("div");
    Object.defineProperty(container, "clientHeight", { value: 600, configurable: true });
    document.body.appendChild(container);
    const root = createRoot(container);
    const render = (props: Record<string, unknown>) =>
      act(async () => {
        root.render(<Grid data={[{ id: 1, a: 1 }]} columnDefs={COLS} rowIdKey="id" {...props} />);
      });
    const wrapper = () => container.querySelector<HTMLElement>(".pte-header-wrapper")!;
    const leafCell = () => container.querySelector<HTMLElement>(".pte-hcell-children .pte-hcell")!;

    await render({ leafHeaderHeight: 60, parentHeaderHeight: 30, rowHeight: 50 });
    expect(wrapper().style.height).toBe("90px");
    expect(leafCell().style.height).toBe("60px");

    await render({ leafHeaderHeight: 40, parentHeaderHeight: 30, rowHeight: 50 });
    expect(wrapper().style.height).toBe("70px");
    expect(leafCell().style.height).toBe("40px");

    await render({ headerHeight: 50, rowHeight: 50 });
    expect(wrapper().style.height).toBe("100px");
    expect(leafCell().style.height).toBe("50px");

    await unmountTestRoot(root);
    container.remove();
  });
});
