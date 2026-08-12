// @vitest-environment happy-dom
import { beforeAll, describe, expect, it } from "vitest";
import React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { unmountTestRoot } from "./testUtils";
import { Grid } from "./grid";
import type { IGridAPI, SortIconVisibility } from "@agility-workbench/grid";

// happy-dom's <canvas> has no 2D context; CanvasMeasurer needs one to measure text.
beforeAll(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  (HTMLCanvasElement.prototype as any).getContext = () => ({
    font: "",
    measureText: (t: string) => ({ width: t.length * 7 }),
  });
});

type Row = { id: number; name: string };

async function mountGrid(props: { sortIconVisibility?: SortIconVisibility; colOverride?: SortIconVisibility } = {}) {
  const container = document.createElement("div");
  Object.defineProperty(container, "clientHeight", { value: 600, configurable: true });
  document.body.appendChild(container);

  const apiRef = React.createRef<IGridAPI | null>();
  const data: Row[] = [
    { id: 3, name: "CCC" },
    { id: 1, name: "AAA" },
    { id: 2, name: "BBB" },
  ];

  const root = createRoot(container);
  await act(async () => {
    root.render(
      <Grid
        apiRef={apiRef}
        data={data}
        columnDefs={[
          { colId: "id", key: "id", label: "ID" },
          { colId: "name", key: "name", label: "Name", sortIconVisibility: props.colOverride },
        ]}
        rowIdKey="id"
        defaultColDef={{ sortIconVisibility: props.sortIconVisibility }}
      />,
    );
  });

  return { container, apiRef, root };
}

function sortIconFor(container: HTMLElement, api: IGridAPI, colId: string): HTMLElement | null {
  const instanceId = api.getColumnModel().getByColId(colId)!.instanceID;
  const header = container.querySelector<HTMLElement>(`.pte-hcell#${instanceId}`)!;
  return header.querySelector<HTMLElement>(".pte-hcell-sort");
}

describe("sortIconVisibility", () => {
  it("renders a sort icon by default (hover mode)", async () => {
    const { container, apiRef, root } = await mountGrid();
    expect(sortIconFor(container, apiRef.current!, "name")).not.toBeNull();
    await unmountTestRoot(root);
  });

  it("renders a sort icon in 'always' mode, with the persist class", async () => {
    const { container, apiRef, root } = await mountGrid({ sortIconVisibility: "always" });
    const icon = sortIconFor(container, apiRef.current!, "name");
    expect(icon).not.toBeNull();
    expect(icon!.classList.contains("pte-sort-persist")).toBe(true);
    await unmountTestRoot(root);
  });

  it("renders NO sort icon in 'never' mode", async () => {
    const { container, apiRef, root } = await mountGrid({ sortIconVisibility: "never" });
    expect(sortIconFor(container, apiRef.current!, "name")).toBeNull();
    await unmountTestRoot(root);
  });

  it("a column stays sortable in 'never' mode (menu / API still work)", async () => {
    const { container, apiRef, root } = await mountGrid({ sortIconVisibility: "never" });
    const api = apiRef.current!;
    const nId = api.getColumnModel().getByColId("id")!.instanceID;
    // No icon to click, but the sort path still works via dispatch (menu/Shift+click/API route here).
    await act(async () => { api.dispatch({ type: "headerAction", action: "toggleSort", colId: nId }); });
    expect(api.getCore().getSortModel().items.map(s => s.key)).toEqual(["id"]);
    await unmountTestRoot(root);
  });

  it("column-level 'never' overrides a grid-level 'always'", async () => {
    const { container, apiRef, root } = await mountGrid({ sortIconVisibility: "always", colOverride: "never" });
    const api = apiRef.current!;
    // "id" inherits grid "always" → icon present; "name" overrides to "never" → no icon.
    expect(sortIconFor(container, api, "id")).not.toBeNull();
    expect(sortIconFor(container, api, "name")).toBeNull();
    await unmountTestRoot(root);
  });
});
