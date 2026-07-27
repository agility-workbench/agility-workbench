import { describe, expect, it } from "vitest";
import { GridCore } from "../core/core";
import { ColumnModel } from "./columnModel";
import { ITextMeasurer } from "../interfaces/iTextMeasure";
import { ColDef, ColumnType } from "../interfaces/column";
import { GridOptions } from "../interfaces/gridOptions";

const measurer: ITextMeasurer = { measure: (t: string) => t.length * 7 };

// A ColumnModel obtained through GridCore so it carries a real InternalGridOptions (with the given
// defaultColDef) rather than a hand-built stub.
function modelWith(options: GridOptions, colDefs: ColDef[]): ColumnModel {
  const core = new GridCore(measurer, { rowIdKey: "id", rowModelType: "clientSide", ...options });
  const model = core.getColumnModel() as ColumnModel;
  model.setColumnDefs(colDefs);
  return model;
}

describe("defaultColDef merge", () => {
  it("applies a defaultColDef field to a column that omits it", () => {
    const model = modelWith({ defaultColDef: { minWidth: 120, editable: true } }, [
      { colId: "a", key: "a", label: "A" },
    ]);
    const col = model.getByColId("a")!;
    expect(col.minWidth).toBe(120);
    expect(col.editable).toBe(true);
  });

  it("lets an explicit column value win over the defaultColDef (precedence)", () => {
    const model = modelWith({ defaultColDef: { minWidth: 120, resizable: false } }, [
      { colId: "a", key: "a", label: "A", minWidth: 300, resizable: true },
    ]);
    const col = model.getByColId("a")!;
    expect(col.minWidth).toBe(300);
    expect(col.resizable).toBe(true);
  });

  it("defensively strips identity/structural fields a plain-JS caller may slip in", () => {
    // The DefaultColDef type forbids colId/key/label/children, but a JS caller could still pass
    // them; the runtime strip in mergeColDef must drop them. The cast simulates that untyped caller.
    const model = modelWith(
      { defaultColDef: { colId: "shared", key: "shared", label: "Shared" } as unknown as GridOptions["defaultColDef"] },
      [
        { colId: "a", key: "a", label: "A" },
        { colId: "b", key: "b", label: "B" },
      ],
    );
    expect(model.getByColId("a")!.label).toBe("A");
    expect(model.getByColId("b")!.label).toBe("B");
    // No column was clobbered into the shared identity.
    expect(model.getByColId("shared")).toBeUndefined();
  });

  it("merges into nested group children too", () => {
    const model = modelWith({ defaultColDef: { minWidth: 90 } }, [
      {
        colId: "grp",
        key: "grp",
        label: "Group",
        children: [
          { colId: "c1", key: "c1", label: "C1" },
          { colId: "c2", key: "c2", label: "C2", minWidth: 200 },
        ],
      },
    ]);
    expect(model.getByColId("c1")!.minWidth).toBe(90);
    expect(model.getByColId("c2")!.minWidth).toBe(200); // own value wins
  });

  it("applies to columns added later via addColumnDef", () => {
    const model = modelWith({ defaultColDef: { editable: true } }, [
      { colId: "a", key: "a", label: "A" },
    ]);
    const id = model.addColumnDef({ colId: "b", key: "b", label: "B", type: ColumnType.STRING });
    expect(model.getById(id)!.editable).toBe(true);
  });
});
