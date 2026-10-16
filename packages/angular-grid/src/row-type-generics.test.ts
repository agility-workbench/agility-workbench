import { describe, expectTypeOf, it } from "vitest";
import type { IGridAPI, IRowNode } from "@agility-workbench/grid";
import type { AwbGrid } from "./grid.component";
import type { NgColDef } from "./interface";

/**
 * Compile-time checks of the row-type generic on the Angular binding (`tsconfig.typecheck.json`
 * type-checks test files). The runtime `it` keeps the file a valid suite.
 */
interface Trade {
  id: string;
  price: number;
}

describe("Angular row-type generics", () => {
  it("NgColDef<Row> and AwbGrid<Row> type the row", () => {
    expectTypeOf<Parameters<NonNullable<NgColDef<Trade>["valueGetter"]>>[0]>().toEqualTypeOf<IRowNode<Trade>>();
    expectTypeOf<NonNullable<NgColDef<Trade>["children"]>>().toEqualTypeOf<NgColDef<Trade>[]>();
    expectTypeOf<AwbGrid<Trade>["api"]>().toEqualTypeOf<IGridAPI<Trade> | null>();

    const typed: NgColDef<Trade> = { key: "price", label: "Price", valueGetter: (node) => node.data.price };
    const untyped: NgColDef = { key: "a", label: "A", valueGetter: (row: any) => row.data.whatever };
    const mixed: NgColDef[] = [typed, untyped];
    void mixed;
  });
});
