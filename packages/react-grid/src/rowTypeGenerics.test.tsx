import React from "react";
import { describe, expectTypeOf, it } from "vitest";
import type { ColDef, IGridAPI, IRowNode } from "@agility-workbench/grid";
import { Grid } from "./grid";
import type { GridProps } from "./interface";
import type { ReactColDef } from "./cellRenderer";

/**
 * Compile-time checks of the row-type generic on the React binding; `tsc --noEmit` on this package
 * type-checks test files. The runtime `it` keeps the file a valid suite.
 */
interface Trade {
  id: string;
  price: number;
}

describe("React row-type generics", () => {
  it("GridProps<Row> types columnDefs, callbacks and the API handle", () => {
    expectTypeOf<GridProps<Trade>["columnDefs"]>()
      .toEqualTypeOf<ReactColDef<Trade>[] | ColDef<Trade>[] | null | undefined>();
    expectTypeOf<Parameters<NonNullable<GridProps<Trade>["onGridReady"]>>[0]>().toEqualTypeOf<IGridAPI<Trade>>();
    expectTypeOf<GridProps<Trade>["rowData"]>().toEqualTypeOf<Trade[] | undefined>();

    const columnDefs: ReactColDef<Trade>[] = [
      { key: "price", label: "Price", valueGetter: (node) => node.data.price },
    ];
    const explicit = () => (
      <Grid<Trade>
        columnDefs={columnDefs}
        rowData={[]}
        getRowClass={(p) => (p.data.price > 0 ? "up" : undefined)}
        onGridReady={(api) => expectTypeOf(api.getSelectedRows()).toEqualTypeOf<Trade[]>()}
      />
    );
    // Typed columnDefs supply the row type without a type argument.
    const fromColumns = () => (
      <Grid
        columnDefs={columnDefs}
        getRowClass={(p) => {
          expectTypeOf(p.data).toEqualTypeOf<Trade>();
          return undefined;
        }}
      />
    );
    void fromColumns;
    // Untyped usage keeps `any` rows: an empty rowData literal does not pin the row type.
    const untyped = () => (
      <Grid
        rowData={[]}
        getRowClass={(p) => p.data.anything}
        isRowSelectable={(node: IRowNode) => !!node.data}
      />
    );
    void explicit;
    void untyped;
    expectTypeOf(Grid).toBeFunction();
  });

  it("is type-level only", () => {
    expectTypeOf<React.ReactNode>().not.toBeNever();
  });
});
