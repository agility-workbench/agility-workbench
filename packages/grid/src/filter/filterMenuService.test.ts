import { describe, expect, it, vi } from "vitest";
import { Column } from "../column/column";
import type { IGridCore } from "../interfaces";
import type { ColDef } from "../interfaces/column";
import { ColumnFilterMenuService } from "./filterMenuService";

function buildSpec(colDef: ColDef) {
  const core = { getOptions: () => ({ filterDebounceMs: 100 }) } as unknown as IGridCore;
  const column = new Column(colDef);
  return { column, spec: new ColumnFilterMenuService(core).buildFilterMenu({ trigger: "api", targetCol: column }) };
}

describe("ColumnFilterMenuService set-filter values", () => {
  it("wires keyCreator to valueKey", () => {
    const keyCreator = (value: any) => value.code;
    const { spec } = buildSpec({
      colId: "region",
      key: "region",
      label: "Region",
      filter: "set",
      filterParams: { keyCreator },
    });

    expect(spec.valueKey).toBe(keyCreator);
    expect(spec.valueKey!({ code: "emea" })).toBe("emea");
  });

  it("prefers the Set-filter valueFormatter and supplies the runtime column", () => {
    const columnFormatter = vi.fn(({ value }) => `Cell ${value}`);
    const filterFormatter = vi.fn(({ value }) => `Filter ${value}`);
    const { column, spec } = buildSpec({
      colId: "region",
      key: "region",
      label: "Region",
      filter: "set",
      valueFormatter: columnFormatter,
      filterParams: { valueFormatter: filterFormatter },
    });

    expect(spec.valueLabel!("EMEA")).toBe("Filter EMEA");
    expect(filterFormatter).toHaveBeenCalledWith({ value: "EMEA", col: column });
    expect(columnFormatter).not.toHaveBeenCalled();
  });

  it("falls back to the column valueFormatter", () => {
    const { spec } = buildSpec({
      colId: "region",
      key: "region",
      label: "Region",
      filter: "set",
      valueFormatter: ({ value }) => `Cell ${value}`,
    });

    expect(spec.valueLabel!("APAC")).toBe("Cell APAC");
  });
});
