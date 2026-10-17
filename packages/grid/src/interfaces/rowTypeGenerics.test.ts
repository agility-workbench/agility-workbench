import { describe, expectTypeOf, it } from "vitest";
import type {
  ActionFrameComponentParams,
  CellRendererParams,
  ColDef,
  CreateGridOptions,
  GridEventCellClickedParams,
  GridEventMap,
  GridEventRowClickedParams,
  GridOptions,
  ICellEditorParams,
  IGridAPI,
  IRowNode,
  RowClassParams,
  TooltipComponentParams,
} from "../index";
import { createGrid } from "../index";

/**
 * The row-type generic is compile-time only, so these assertions are checked by the core type check
 * (`tsc -p packages/grid/tsconfig.json` includes test files); the runtime `it` is a placeholder so
 * the file is a valid suite.
 */
interface Trade {
  id: string;
  price: number;
}

type Getter<T> = NonNullable<ColDef<T>["valueGetter"]>;
type Fn<T> = T extends (...args: any[]) => any ? T : never;

describe("row-type generics", () => {
  it("are type-level only", () => {
    expectTypeOf(createGrid).toBeFunction();
  });

  it("ColDef<Row> types the row in its callbacks", () => {
    expectTypeOf<Parameters<Getter<Trade>>[0]>().toEqualTypeOf<IRowNode<Trade>>();
    expectTypeOf<Parameters<Fn<NonNullable<ColDef<Trade>["cellRenderer"]>>>[0]>()
      .toEqualTypeOf<CellRendererParams<Trade>>();
    expectTypeOf<CellRendererParams<Trade>["node"]>().toEqualTypeOf<IRowNode<Trade> | undefined>();
    expectTypeOf<Parameters<NonNullable<ColDef<Trade>["tooltipValueGetter"]>>[0]>()
      .toEqualTypeOf<TooltipComponentParams<Trade>>();
    expectTypeOf<TooltipComponentParams<Trade>["data"]>().toEqualTypeOf<Trade | undefined>();
    expectTypeOf<ActionFrameComponentParams<Trade>["data"]>().toEqualTypeOf<Trade>();
    expectTypeOf<ICellEditorParams<Trade>["row"]>().toEqualTypeOf<IRowNode<Trade>>();
    expectTypeOf<NonNullable<ColDef<Trade>["children"]>>().toEqualTypeOf<ColDef<Trade>[]>();

    const col: ColDef<Trade> = {
      key: "price",
      label: "Price",
      valueGetter: (node) => node.data.price * 2,
      cellClass: (p) => (p.data.price > 0 ? "up" : undefined),
      tooltipValueGetter: (p) => p.data?.id,
      cellRenderer: (p) => p.node?.data.id,
      comparator: (_a, _b, nodeA, nodeB) => nodeA.data.price - nodeB.data.price,
    };
    void col;
  });

  it("GridOptions<Row> and IGridAPI<Row> type the rows they carry", () => {
    expectTypeOf<RowClassParams<Trade>["data"]>().toEqualTypeOf<Trade>();
    expectTypeOf<Parameters<NonNullable<GridOptions<Trade>["getRowId"]>>[0]>().toEqualTypeOf<Trade>();
    expectTypeOf<Parameters<NonNullable<GridOptions<Trade>["isRowSelectable"]>>[0]>()
      .toEqualTypeOf<IRowNode<Trade>>();
    expectTypeOf<ReturnType<IGridAPI<Trade>["getSelectedRows"]>>().toEqualTypeOf<Trade[]>();
    expectTypeOf<ReturnType<IGridAPI<Trade>["getRowNode"]>>().toEqualTypeOf<IRowNode<Trade> | undefined>();
    expectTypeOf<Parameters<IGridAPI<Trade>["setRowData"]>[0]>().toEqualTypeOf<Trade[]>();
    expectTypeOf<ReturnType<IGridAPI<Trade>["getColumnDefs"]>>().toEqualTypeOf<ColDef<Trade>[]>();
  });

  it("events carry the row type", () => {
    expectTypeOf<GridEventCellClickedParams<Trade>["data"]>().toEqualTypeOf<Trade>();
    expectTypeOf<GridEventRowClickedParams<Trade>["node"]>().toEqualTypeOf<IRowNode<Trade> | undefined>();
    expectTypeOf<GridEventMap<Trade>["cellClicked"]>().toEqualTypeOf<GridEventCellClickedParams<Trade>>();
    expectTypeOf<Parameters<NonNullable<GridOptions<Trade>["onRowClicked"]>>[0]>()
      .toEqualTypeOf<GridEventRowClickedParams<Trade>>();
    const on = (api: IGridAPI<Trade>) =>
      api.on("cellClicked", (ev) => expectTypeOf(ev.data).toEqualTypeOf<Trade>());
    void on;
  });

  it("createGrid takes the row type explicitly or from typed columnDefs, never from rowData", () => {
    expectTypeOf<ReturnType<typeof createGrid<Trade>>>().toEqualTypeOf<IGridAPI<Trade>>();
    const fromColumns = (el: HTMLElement, columnDefs: ColDef<Trade>[]) => createGrid(el, { columnDefs });
    expectTypeOf<ReturnType<typeof fromColumns>>().toEqualTypeOf<IGridAPI<Trade>>();
    const fromRows = (el: HTMLElement, rowData: Trade[]) => createGrid(el, { rowData });
    expectTypeOf<ReturnType<typeof fromRows>>().toEqualTypeOf<IGridAPI<any>>();
    expectTypeOf<CreateGridOptions<Trade>["rowData"]>().toEqualTypeOf<Trade[] | undefined>();
  });

  it("the unparameterized types still accept the old any-shaped callbacks", () => {
    const old: ColDef = {
      key: "a",
      label: "A",
      valueGetter: (row: any) => row.data.whatever,
      cellRenderer: (p: { data: any; node?: any }) => String(p.data),
      cellClass: (p: { data: { x: number } }) => (p.data.x ? "x" : undefined),
    };
    const typed: ColDef<Trade> = { key: "price", label: "Price" };
    const mixed: ColDef[] = [old, typed];
    const options: GridOptions = {
      getRowId: (row: object) => String(row),
      getRowClass: (p) => p.data.anything,
      onCellClicked: (e) => e.data.anything,
      isRowSelectable: (node: IRowNode) => !!node.data,
    };
    expectTypeOf<ColDef>().toEqualTypeOf<ColDef<any>>();
    expectTypeOf<ReturnType<IGridAPI["getSelectedRows"]>>().toEqualTypeOf<any[]>();
    void mixed;
    void options;
  });
});
