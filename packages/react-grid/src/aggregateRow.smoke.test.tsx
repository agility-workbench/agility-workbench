// @vitest-environment happy-dom
import { beforeAll, describe, expect, it } from "vitest";
import React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { AggregateType, ColumnType, type IGridAPI } from "@agility-workbench/grid";
import { Grid } from "./grid";

beforeAll(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  (HTMLCanvasElement.prototype as any).getContext = () => ({
    font: "",
    measureText: (text: string) => ({ width: text.length * 7 }),
  });
});

describe("aggregate row function menu", () => {
  it("marks the active function and changes or removes aggregation through the existing menu action", async () => {
    const container = document.createElement("div");
    Object.defineProperty(container, "clientHeight", { value: 500, configurable: true });
    document.body.appendChild(container);
    const apiRef = React.createRef<IGridAPI | null>();
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <Grid
          apiRef={apiRef}
          rowIdKey="id"
          rowData={[
            { id: "1", product: "A", sales: 10 },
            { id: "2", product: "B", sales: 30 },
          ]}
          columnDefs={[
            { colId: "product", key: "product", label: "Product", type: ColumnType.STRING },
            { colId: "sales", key: "sales", label: "Sales", type: ColumnType.NUMBER },
          ]}
          tooltip={{ showDelay: 0, hideDelay: 0 }}
        />,
      );
    });

    const core = apiRef.current!.getCore();
    const salesId = core.getColumnModel().getByColId("sales")!.instanceID;
    await act(async () => {
      core.dispatch({
        type: "aggregateModelSet",
        aggregateModels: [{ key: salesId, type: AggregateType.AVG }],
      });
    });

    const aggregateCell = container.querySelector<HTMLElement>(
      `.pte-aggregate-cell[data-col-id="${salesId}"]`,
    )!;
    const menuButton = aggregateCell.querySelector<HTMLButtonElement>(
      ".pte-aggregate-menu-button",
    )!;
    expect(menuButton.getAttribute("aria-label")).toBe(
      "Change Sales aggregation. Current function: Avg",
    );
    expect(menuButton.querySelector(".icon-avg")).not.toBeNull();

    await act(async () => menuButton.click());
    const average = container.querySelector<HTMLButtonElement>('[data-item-id="aggAvg"]')!;
    const sum = container.querySelector<HTMLButtonElement>('[data-item-id="aggSum"]')!;
    expect(average.disabled).toBe(true);
    expect(average.querySelector(".pte-menu-item-icon-right.icon-check")).not.toBeNull();
    expect(sum.querySelector(".pte-menu-item-icon-left.icon-sum")).not.toBeNull();

    await act(async () => sum.click());
    expect(core.getAggregateModel()).toEqual([{ key: salesId, type: AggregateType.SUM }]);
    expect(aggregateCell.querySelector(".icon-sum")).not.toBeNull();

    await act(async () => {
      aggregateCell.querySelector<HTMLButtonElement>(".pte-aggregate-menu-button")!.click();
    });
    const clear = container.querySelector<HTMLButtonElement>('[data-item-id="aggClear"]')!;
    await act(async () => clear.click());
    expect(core.getAggregateModel()).toEqual([]);
    expect(container.querySelector<HTMLElement>(".pte-aggregate-row")!.style.display).toBe("none");

    await act(async () => root.unmount());
    container.remove();
  });
});
