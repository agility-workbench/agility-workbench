import { describe, expect, it } from "vitest";
import { Column } from "../column/column";
import { ColumnType } from "../interfaces/column";
import type { CellRendererAlias, ColDef } from "../interfaces/column";
import { CELL_RENDERER_ALIASES, resolveCellRendererAlias } from "./aliases";
import { BooleanCellRenderer } from "./booleanRenderer";
import { ImageCellRenderer } from "./imageRenderer";
import { LinkCellRenderer } from "./linkRenderer";
import { ProgressCellRenderer } from "./progressRenderer";
import { RatingCellRenderer } from "./ratingRenderer";
import * as publicApi from "../index";

/**
 * `ColDef.cellRenderer` names a built-in by alias. The column resolves the alias to its class (so
 * every renderer reader sees a renderer) while the definition keeps the string it was given.
 */

const column = (def: Partial<ColDef>) => new Column({ colId: "c", key: "c", label: "C", ...def } as ColDef, "0");

describe("cell renderer aliases", () => {
  it("maps each alias to its class, and \"text\" or an unknown name to none", () => {
    expect(resolveCellRendererAlias("link")).toBe(LinkCellRenderer);
    expect(resolveCellRendererAlias("image")).toBe(ImageCellRenderer);
    expect(resolveCellRendererAlias("progress")).toBe(ProgressCellRenderer);
    expect(resolveCellRendererAlias("rating")).toBe(RatingCellRenderer);
    expect(resolveCellRendererAlias("text")).toBeUndefined();
    expect(resolveCellRendererAlias("toString")).toBeUndefined();
    expect(resolveCellRendererAlias("nope")).toBeUndefined();
    const aliases: Exclude<CellRendererAlias, "text">[] = ["link", "image", "progress", "rating"];
    expect(Object.keys(CELL_RENDERER_ALIASES).sort()).toEqual([...aliases].sort());
  });

  it("resolves on the column and keeps the alias string on the definition (round trip)", () => {
    const col = column({ cellRenderer: "progress", cellRendererParams: { max: 100 } });
    expect(col.cellRenderer).toBe(ProgressCellRenderer);
    expect(col.col.cellRenderer).toBe("progress");
    expect(col.explicitColDef.cellRenderer).toBe("progress");
    // Re-applying the definition the column reports resolves the same way.
    const again = column(col.col);
    expect(again.cellRenderer).toBe(ProgressCellRenderer);
    expect(again.cellRendererParams).toEqual({ max: 100 });
  });

  it("keeps \"text\" as the explicit opt-out of the boolean default", () => {
    const text = column({ type: ColumnType.BOOLEAN, cellRenderer: "text" });
    expect(text.cellRenderer).toBeUndefined();
    expect(text.usesDefaultCheckboxRenderer()).toBe(false);
    expect(text.rendersNoText()).toBe(false);
    expect(text.col.cellRenderer).toBe("text");
    // A boolean column with an alias draws that renderer, not the checkbox.
    const rated = column({ type: ColumnType.BOOLEAN, cellRenderer: "rating" });
    expect(rated.usesDefaultCheckboxRenderer()).toBe(false);
    expect(rated.cellRenderer).toBe(RatingCellRenderer);
  });

  it("reports which columns show no text", () => {
    expect(column({ type: ColumnType.BOOLEAN }).rendersNoText()).toBe(true);
    expect(column({ cellRenderer: BooleanCellRenderer }).rendersNoText()).toBe(true);
    expect(column({ cellRenderer: "image" }).rendersNoText()).toBe(true);
    expect(column({ cellRenderer: "rating" }).rendersNoText()).toBe(true);
    expect(column({ cellRenderer: "progress" }).rendersNoText()).toBe(true);
    expect(column({ cellRenderer: "progress", cellRendererParams: { showValue: true } }).rendersNoText()).toBe(false);
    expect(column({ cellRenderer: "link" }).rendersNoText()).toBe(false);
    expect(column({}).rendersNoText()).toBe(false);
    expect(column({ cellRenderer: () => "x" }).rendersNoText()).toBe(false);
  });

  it("exports every built-in from the package entry", () => {
    expect(publicApi.LinkCellRenderer).toBe(LinkCellRenderer);
    expect(publicApi.ImageCellRenderer).toBe(ImageCellRenderer);
    expect(publicApi.ProgressCellRenderer).toBe(ProgressCellRenderer);
    expect(publicApi.RatingCellRenderer).toBe(RatingCellRenderer);
  });
});
