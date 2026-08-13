// @vitest-environment happy-dom
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { unmountTestRoot } from "./testUtils";
import { Grid } from "./grid";
import {
  adaptActionFrame,
  adaptCellRenderer,
  adaptReactColumnDefs,
  adaptReactDefaultColDef,
  adaptTooltip,
} from "./cellRenderer";
import type { ReactColDef } from "./cellRenderer";
import type {
  ActionFrameComponentParams,
  CellRenderer,
  CellRendererParams,
  ICellRenderer,
  IGridAPI,
  TooltipComponentParams,
  ISetFilterComponent,
  SetFilterValueComponentParams,
} from "@agility-workbench/grid";

beforeAll(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  (HTMLCanvasElement.prototype as any).getContext = () => ({
    font: "",
    measureText: (t: string) => ({ width: t.length * 7 }),
  });
});

afterEach(() => {
  document.body.innerHTML = "";
});

function NameCell(props: CellRendererParams & { suffix?: string }) {
  return (
    <b className="react-cell">
      {String(props.value)}
      {props.suffix ? `:${props.suffix}` : ""}
    </b>
  );
}

let trackedUnmounts = 0;
function TrackedCell(props: CellRendererParams & { suffix?: string }) {
  React.useEffect(() => () => { trackedUnmounts++; }, []);
  return <NameCell {...props} />;
}

class CoreClassRenderer implements ICellRenderer {
  private el = document.createElement("span");
  init(params: CellRendererParams): void { this.el.textContent = String(params.value); }
  getGui(): HTMLElement { return this.el; }
  refresh(): boolean { return true; }
  destroy(): void {}
}

function rendererParams(value: unknown, extra?: object): CellRendererParams {
  return {
    value,
    data: { id: 1 },
    rowId: "1",
    rowIndex: 0,
    colDef: { colId: "name", key: "name", label: "Name", cellRendererParams: extra },
  } as CellRendererParams;
}

async function mountGrid() {
  const container = document.createElement("div");
  Object.defineProperty(container, "clientHeight", { value: 600, configurable: true });
  document.body.appendChild(container);
  const apiRef = React.createRef<IGridAPI | null>();
  const cols: ReactColDef[] = [
    { colId: "id", key: "id", label: "ID" },
    { colId: "name", key: "name", label: "Name", cellRenderer: NameCell, cellRendererParams: { suffix: "custom" } },
  ];
  const root = createRoot(container);
  const render = async (rows: Array<{ id: number; name: string }>) => {
    await act(async () => {
      root.render(<Grid apiRef={apiRef} rowData={rows} columnDefs={cols} rowIdKey="id" />);
    });
  };
  await render([
    { id: 1, name: "AAA" },
    { id: 2, name: "BBB" },
    { id: 3, name: "CCC" },
  ]);
  return { container, apiRef, root, render };
}

const cellTexts = (container: HTMLElement) =>
  Array.from(container.querySelectorAll(".react-cell"), (el) => el.textContent);

describe("React cell renderers in a live grid", () => {
  it("mounts React cell-renderer components through the adapter with merged cellRendererParams", async () => {
    const { container, root } = await mountGrid();
    expect(cellTexts(container)).toEqual(["AAA:custom", "BBB:custom", "CCC:custom"]);
    await unmountTestRoot(root);
  });

  it("forwards rowData changes into the core without recreating the grid", async () => {
    const { container, apiRef, root, render } = await mountGrid();
    const api = apiRef.current!;

    await render([
      { id: 1, name: "AAA" },
      { id: 2, name: "BBB" },
      { id: 3, name: "CCC" },
      { id: 4, name: "DDD" },
    ]);

    expect(apiRef.current).toBe(api);
    // The new row rendered through the React cell-renderer adapter.
    expect(cellTexts(container)).toEqual(["AAA:custom", "BBB:custom", "CCC:custom", "DDD:custom"]);
    await unmountTestRoot(root);
  });
});

describe("adaptCellRenderer", () => {
  beforeEach(() => { trackedUnmounts = 0; });

  it("wraps React components, caches the adapter class, and passes core classes through", () => {
    const Adapted = adaptCellRenderer(NameCell);
    expect(Adapted).not.toBe(NameCell);
    expect(adaptCellRenderer(NameCell)).toBe(Adapted);
    expect(adaptCellRenderer(CoreClassRenderer as unknown as CellRenderer)).toBe(CoreClassRenderer);
    expect(adaptCellRenderer(undefined)).toBeUndefined();
  });

  it("mounts on init, re-renders on refresh without remounting, and unmounts on destroy", async () => {
    const Adapted = adaptCellRenderer(TrackedCell) as unknown as new () => ICellRenderer;
    const renderer = new Adapted();

    await act(async () => { renderer.init(rendererParams("AAA", { suffix: "custom" })); });
    expect(renderer.getGui().textContent).toBe("AAA:custom");

    let refreshed: boolean | undefined;
    await act(async () => { refreshed = renderer.refresh?.(rendererParams("BBB", { suffix: "next" })); });
    expect(refreshed).toBe(true);
    expect(renderer.getGui().textContent).toBe("BBB:next");
    expect(trackedUnmounts).toBe(0); // refresh re-rendered, did not remount

    await act(async () => { renderer.destroy?.(); });
    expect(trackedUnmounts).toBe(1);
  });

  it("adapts nested and default column component slots to the same cached class", () => {
    const [group] = adaptReactColumnDefs([{
      colId: "group",
      label: "Group",
      children: [{ colId: "name", key: "name", label: "Name", cellRenderer: NameCell }],
    }])!;
    expect(group.children?.[0].cellRenderer).not.toBe(NameCell);

    const defaults = adaptReactDefaultColDef({ cellRenderer: NameCell });
    expect(defaults?.cellRenderer).toBe(group.children?.[0].cellRenderer);
  });

  it("adapts React components nested in set-filter params", async () => {
    function FilterValue(props: SetFilterValueComponentParams) {
      return <span className="filter-value">filter:{String(props.value)}</span>;
    }

    const [col] = adaptReactColumnDefs([{
      colId: "region",
      key: "region",
      label: "Region",
      filter: "set",
      filterParams: { valueComponent: FilterValue },
    }])!;
    expect(col.filterParams?.valueComponent).not.toBe(FilterValue);

    const Component = col.filterParams!.valueComponent as unknown as new () => ISetFilterComponent<SetFilterValueComponentParams>;
    const instance = new Component();
    await act(async () => {
      instance.init({ value: "EMEA", valueFormatted: "EMEA", colDef: {} as any, api: {} as IGridAPI });
    });
    expect(instance.getGui().querySelector(".filter-value")?.textContent).toBe("filter:EMEA");
    await act(async () => { instance.destroy(); });

    const defaults = adaptReactDefaultColDef({ filterParams: { valueComponent: FilterValue } });
    expect(defaults?.filterParams?.valueComponent).toBe(col.filterParams?.valueComponent);
  });
});

describe("React renderer refresh reasons", () => {
  it("delivers refreshReason='resize' to React component renderers after a column resize", async () => {
    const refreshReasons: Array<string | undefined> = [];
    function RecordingCell(props: CellRendererParams) {
      refreshReasons.push(props.refreshReason);
      return <span className="recording-cell">{String(props.value)}</span>;
    }

    const container = document.createElement("div");
    Object.defineProperty(container, "clientHeight", { value: 600, configurable: true });
    document.body.appendChild(container);
    const apiRef = React.createRef<IGridAPI | null>();
    const root = createRoot(container);
    await act(async () => {
      root.render(
        <Grid
          apiRef={apiRef}
          rowData={[
            { id: "1", region: "EMEA", sales: 10 },
            { id: "2", region: "APAC", sales: 20 },
          ]}
          columnDefs={[
            { colId: "region", key: "region", label: "Region" },
            { colId: "sales", key: "sales", label: "Sales", cellRenderer: RecordingCell, resizable: true },
          ]}
          rowIdKey="id"
        />,
      );
    });

    const core = apiRef.current!.getCore();
    const sales = core.getColumnModel().getByColId("sales")!;
    refreshReasons.length = 0; // drop the initial mount renders

    await act(async () => {
      core.dispatch({ type: "columnResize", colId: sales.instanceID, widthPx: sales.computedWidth + 60 });
    });

    expect(refreshReasons.length).toBeGreaterThan(0);
    expect(refreshReasons.every((reason) => reason === "resize")).toBe(true);
    await unmountTestRoot(root);
  });
});

describe("adaptTooltip / adaptActionFrame", () => {
  function Tip(props: TooltipComponentParams) {
    return <i>{String(props.value)}</i>;
  }
  function Frame(props: ActionFrameComponentParams) {
    return <i>{String(props.value)}</i>;
  }

  it("wraps React components and caches the adapter classes", () => {
    const AdaptedTip = adaptTooltip(Tip);
    expect(AdaptedTip).not.toBe(Tip);
    expect(adaptTooltip(Tip)).toBe(AdaptedTip);
    expect(adaptTooltip(undefined)).toBeUndefined();

    const AdaptedFrame = adaptActionFrame(Frame);
    expect(AdaptedFrame).not.toBe(Frame);
    expect(adaptActionFrame(Frame)).toBe(AdaptedFrame);
    expect(adaptActionFrame(undefined)).toBeUndefined();
  });
});
