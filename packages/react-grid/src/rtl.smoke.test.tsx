// @vitest-environment happy-dom
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { unmountTestRoot } from "./testUtils";
import { Grid } from "./grid";
import type { IGridAPI } from "@agility-workbench/grid";
import type { ReactColDef } from "./cellRenderer";

/**
 * `enableRtl` through the React wrapper: the prop reaches the core as a creation option and the grid
 * root carries the resolved direction, including the inherited case (prop unset under an RTL
 * ancestor) and the forced-LTR case under an RTL page.
 */

beforeAll(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  (HTMLCanvasElement.prototype as any).getContext = () => ({
    font: "",
    measureText: (t: string) => ({ width: t.length * 7 }),
  });
});

const ROWS = [{ id: "1", name: "أحمد", city: "חיפה" }, { id: "2", name: "فاطمة", city: "אילת" }];
const COLUMNS: ReactColDef[] = [
  { colId: "name", key: "name", label: "الاسم", pinned: "left" },
  { colId: "city", key: "city", label: "עיר" },
];

let mounted: { root: Root; container: HTMLElement } | null = null;

afterEach(async () => {
  if (mounted) await unmountTestRoot(mounted.root);
  mounted = null;
  document.body.innerHTML = "";
});

async function mountGrid(props: Record<string, unknown>, ancestorDir?: string) {
  const container = document.createElement("div");
  Object.defineProperty(container, "clientHeight", { value: 400, configurable: true });
  if (ancestorDir) {
    const page = document.createElement("main");
    page.setAttribute("dir", ancestorDir);
    page.appendChild(container);
    document.body.appendChild(page);
  } else {
    document.body.appendChild(container);
  }
  const apiRef = React.createRef<IGridAPI | null>();
  const root = createRoot(container);
  mounted = { root, container };
  await act(async () => {
    root.render(<Grid apiRef={apiRef} data={ROWS} columnDefs={COLUMNS} rowIdKey="id" {...props} />);
  });
  return { api: apiRef.current!, gridRoot: container.querySelector<HTMLElement>(".pte-root")! };
}

describe("<Grid enableRtl>", () => {
  it("writes dir=rtl on the grid root and passes the option to the core", async () => {
    const { api, gridRoot } = await mountGrid({ enableRtl: true });
    expect(gridRoot.dir).toBe("rtl");
    expect(api.getGridOption("enableRtl" as any)).toBe(true);
  });

  it("follows an RTL ancestor when unset, and enableRtl={false} forces LTR inside it", async () => {
    expect((await mountGrid({}, "rtl")).gridRoot.dir).toBe("rtl");
    await unmountTestRoot(mounted!.root);
    mounted = null;
    expect((await mountGrid({ enableRtl: false }, "rtl")).gridRoot.dir).toBe("ltr");
  });
});
