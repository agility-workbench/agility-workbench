// @vitest-environment happy-dom
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { unmountTestRoot } from "./testUtils";
import { flushPendingReactRootUnmounts } from "./managedReactRoot";
import { Grid } from "./grid";
import type { ReactColDef } from "./cellRenderer";
import type {
  CellRendererParams,
  HeaderComponentParams,
  IGridAPI,
} from "@agility-workbench/grid";
import { AggregateType } from "@agility-workbench/grid";

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

type Row = { id: string; region: string; quarter: string; revenue: number };
const ROWS: Row[] = [
  { id: "1", region: "EMEA", quarter: "Q1", revenue: 20 },
  { id: "2", region: "EMEA", quarter: "Q2", revenue: 10 },
  { id: "3", region: "APAC", quarter: "Q1", revenue: 5 },
];

let liveHeaders = 0;

/** A React header: hooks, state across refreshes, and sort driven through the params callback. */
function SortHeader(props: HeaderComponentParams) {
  const [renders, setRenders] = React.useState(0);
  React.useEffect(() => {
    liveHeaders++;
    return () => { liveHeaders--; };
  }, []);
  React.useEffect(() => { setRenders((n) => n + 1); }, [props.sort.direction]);
  return (
    <button
      type="button"
      className={`react-header react-header-l${props.level}`}
      data-renders={renders}
      onClick={() => props.progressSort()}
    >
      {props.displayName}:{props.sort.direction ?? "none"}
    </button>
  );
}

function BadgeCell(props: CellRendererParams) {
  return <i className="react-badge">{String(props.value)}</i>;
}

function createContainer() {
  const container = document.createElement("div");
  Object.defineProperty(container, "clientHeight", { value: 600, configurable: true });
  Object.defineProperty(container, "clientWidth", { value: 900, configurable: true });
  document.body.appendChild(container);
  return container;
}

async function render(root: ReturnType<typeof createRoot>, element: React.ReactElement) {
  await act(async () => {
    root.render(element);
  });
}

describe("React header components", () => {
  it("mounts a React headerComponent (content only) and keeps the grid's menu row", async () => {
    const container = createContainer();
    const root = createRoot(container);
    const columns: ReactColDef[] = [
      { colId: "region", key: "region", label: "Region", headerComponent: SortHeader },
      { colId: "revenue", key: "revenue", label: "Revenue" },
    ];
    await render(root, <Grid rowIdKey="id" rowData={ROWS} columnDefs={columns} />);

    const button = container.querySelector<HTMLButtonElement>(".react-header")!;
    expect(button).toBeTruthy();
    expect(button.classList).toContain("react-header-l1");
    expect(button.textContent).toBe("Region:none");
    const hcell = button.closest(".pte-hcell")!;
    expect(hcell.querySelector(".pte-hcell-custom-content")).toBeTruthy();
    // Level 1 keeps the grid-built filter/menu row.
    expect(hcell.querySelector(".pte-hcell-menu")).toBeTruthy();

    // Refresh path: sorting through the params callback re-renders the same React root.
    await act(async () => { button.click(); });
    const after = container.querySelector<HTMLButtonElement>(".react-header")!;
    expect(after.textContent).toBe("Region:asc");

    await unmountTestRoot(root);
  });

  it("mounts a React headerCellComponent (whole cell) without the grid's menu row", async () => {
    const container = createContainer();
    const root = createRoot(container);
    const columns: ReactColDef[] = [
      { colId: "region", key: "region", label: "Region", headerCellComponent: SortHeader },
    ];
    await render(root, <Grid rowIdKey="id" rowData={ROWS} columnDefs={columns} />);

    const button = container.querySelector<HTMLButtonElement>(".react-header")!;
    expect(button.classList).toContain("react-header-l2");
    const hcell = button.closest(".pte-hcell")!;
    expect(hcell.querySelector(".pte-hcell-custom-cell")).toBeTruthy();
    expect(hcell.querySelector(".pte-hcell-menu")).toBeNull();

    await unmountTestRoot(root);
  });

  it("accepts React header components in defaultColDef", async () => {
    const container = createContainer();
    const root = createRoot(container);
    await render(
      root,
      <Grid
        rowIdKey="id"
        rowData={ROWS}
        columnDefs={[
          { colId: "region", key: "region", label: "Region" },
          { colId: "revenue", key: "revenue", label: "Revenue" },
        ]}
        defaultColDef={{ headerComponent: SortHeader }}
      />,
    );
    expect(Array.from(container.querySelectorAll(".react-header")).map((el) => el.textContent))
      .toEqual(["Region:none", "Revenue:none"]);
    await unmountTestRoot(root);
  });

  it("still honors the core DOM function form and core class form", async () => {
    const container = createContainer();
    const root = createRoot(container);
    const domHeader = (p: HeaderComponentParams) => {
      const el = document.createElement("em");
      el.className = "dom-header";
      el.textContent = `dom ${p.displayName}`;
      return el;
    };
    class ClassHeader {
      private el = document.createElement("u");
      init(p: HeaderComponentParams) { this.el.className = "class-header"; this.el.textContent = p.displayName; }
      getGui() { return this.el; }
      refresh() { return true; }
      destroy() {}
    }
    await render(
      root,
      <Grid
        rowIdKey="id"
        rowData={ROWS}
        columnDefs={[
          { colId: "region", key: "region", label: "Region", headerComponent: domHeader },
          { colId: "revenue", key: "revenue", label: "Revenue", headerCellComponent: ClassHeader },
        ]}
      />,
    );
    expect(container.querySelector(".dom-header")?.textContent).toBe("dom Region");
    expect(container.querySelector(".class-header")?.textContent).toBe("Revenue");
    await unmountTestRoot(root);
  });

  it("unmounts React header roots when the grid is destroyed", async () => {
    liveHeaders = 0;
    const container = createContainer();
    const root = createRoot(container);
    await render(
      root,
      <Grid
        rowIdKey="id"
        rowData={ROWS}
        columnDefs={[
          { colId: "region", key: "region", label: "Region", headerComponent: SortHeader },
          { colId: "revenue", key: "revenue", label: "Revenue", headerCellComponent: SortHeader },
        ]}
      />,
    );
    expect(liveHeaders).toBe(2);

    await unmountTestRoot(root);
    expect(liveHeaders).toBe(0);
  });

  it("unmounts React header roots replaced by a columnDefs change", async () => {
    liveHeaders = 0;
    const container = createContainer();
    const root = createRoot(container);
    const withHeader: ReactColDef[] = [
      { colId: "region", key: "region", label: "Region", headerComponent: SortHeader },
    ];
    await render(root, <Grid rowIdKey="id" rowData={ROWS} columnDefs={withHeader} />);
    expect(liveHeaders).toBe(1);

    await render(
      root,
      <Grid rowIdKey="id" rowData={ROWS} columnDefs={[{ colId: "region", key: "region", label: "Region" }]} />,
    );
    await act(async () => { await flushPendingReactRootUnmounts(); });
    expect(liveHeaders).toBe(0);
    expect(container.querySelector(".react-header")).toBeNull();

    await unmountTestRoot(root);
  });
});

describe("React components in groupColumnDef and pivotResultColumnDef", () => {
  it("adapts React components placed in groupColumnDef", async () => {
    const container = createContainer();
    const root = createRoot(container);
    await render(
      root,
      <Grid
        rowIdKey="id"
        rowData={ROWS}
        columnDefs={[
          { colId: "region", key: "region", label: "Region" },
          { colId: "revenue", key: "revenue", label: "Revenue" },
        ]}
        groupDefaultExpanded={-1}
        groupColumnDef={{ label: "Group", headerComponent: SortHeader, cellRenderer: BadgeCell }}
        onGridReady={(api) => api.setRowGroupColumns(["region"])}
      />,
    );

    expect(container.querySelector(".react-header")?.textContent).toBe("Group:none");
    // The auto-group column runs its renderer on leaf rows (group rows keep the grid's label).
    const badges = container.querySelectorAll(".react-badge");
    expect(badges.length).toBeGreaterThan(0);

    await unmountTestRoot(root);
  });

  it("adapts React components placed in pivotResultColumnDef", async () => {
    const container = createContainer();
    const root = createRoot(container);
    const apiRef = React.createRef<IGridAPI | null>();
    await render(
      root,
      <Grid
        apiRef={apiRef}
        rowIdKey="id"
        rowData={ROWS}
        columnDefs={[
          { colId: "region", key: "region", label: "Region" },
          { colId: "quarter", key: "quarter", label: "Quarter" },
          { colId: "revenue", key: "revenue", label: "Revenue" },
        ]}
        pivotMode
        pivotColumns={["quarter"]}
        pivotResultColumnDef={{ width: 140, headerComponent: SortHeader, cellRenderer: BadgeCell }}
        onGridReady={(api) => {
          api.setRowGroupColumns(["region"]);
          api.setAggregates([{ colId: "revenue", type: AggregateType.SUM }]);
        }}
      />,
    );

    // One generated leaf per quarter, each with the React header.
    expect(Array.from(container.querySelectorAll(".react-header")).map((el) => el.textContent))
      .toEqual(["Revenue:none", "Revenue:none"]);
    // Pivot result cells sit on group rows and run the React renderer with the aggregate.
    const values = Array.from(container.querySelectorAll(".react-badge")).map((el) => el.textContent);
    expect(values).toEqual(expect.arrayContaining(["20", "10", "5"]));

    await unmountTestRoot(root);
  });
});
