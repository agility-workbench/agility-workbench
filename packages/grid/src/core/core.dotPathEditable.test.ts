// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { GridCore } from "./core";
import { GridAPI } from "../api/api";
import { ColDef, ColumnType, EditableCallbackParams } from "../interfaces/column";
import { ITextMeasurer } from "../interfaces/iTextMeasure";
import { GridOptions } from "../interfaces/gridOptions";
import { ClipboardRenderer } from "../renderer/clipboard/clipboardRenderer";
import { readKeyPath, writeKeyPath } from "../column/keyPath";

const measurer: ITextMeasurer = { measure: (t: string) => t.length * 7 };

function makeGrid(rowData: any[], columnDefs: ColDef[], options: Partial<GridOptions> = {}) {
  const core = new GridCore(measurer, { rowIdKey: "id", rowModelType: "clientSide", ...options });
  core.dispatch({ type: "themeFontSet", headerFont: "12px sans", cellFont: "12px sans", reason: "test" });
  core.setRowData(rowData);
  core.setColumnDefsFromProps(columnDefs);
  return { core, api: new GridAPI(core) };
}

const ref = (core: GridCore, rowId: string, colId: string) =>
  ({ rowId, colId: core.getColumnModel().getByColId(colId)!.instanceID });
const node = (core: GridCore, rowId: string) => core.getRowModel().getRowNode(rowId)!;
const displayedIds = (api: GridAPI) =>
  Array.from({ length: api.getDisplayedRowCount() }, (_, i) => api.getDisplayedRowAtIndex(i)!.id);

describe("dot-path keys (#42)", () => {
  it("readKeyPath / writeKeyPath: nested by default, a literal property wins", () => {
    const data: any = { address: { city: "Oslo" }, "a.b": 1, a: { b: 2 } };
    expect(readKeyPath(data, "address.city")).toBe("Oslo");
    expect(readKeyPath(data, "a.b")).toBe(1);
    expect(readKeyPath(data, "missing.deep.path")).toBeUndefined();
    expect(writeKeyPath(data, "a.b", 10)).toBe(true);
    expect(data["a.b"]).toBe(10);
    expect(data.a.b).toBe(2);
    expect(writeKeyPath(data, "geo.lat", 5)).toBe(true);
    expect(data.geo).toEqual({ lat: 5 });
    // A primitive in the way cannot carry a nested value: nothing is written.
    expect(writeKeyPath({ x: 1 }, "x.y", 2)).toBe(false);
  });

  const cityCol: ColDef = { colId: "city", key: "address.city", label: "City", editable: true };
  const rows = () => [
    { id: "1", address: { city: "Oslo" } },
    { id: "2", address: { city: "Bergen" } },
    { id: "3", address: { city: "Alta" } },
  ];

  it("reads and writes the nested value; undo restores it", () => {
    const { core, api } = makeGrid(rows(), [cityCol]);
    const col = core.getColumnModel().getByColId("city")!;
    expect(col.getValue(node(core, "1"))).toBe("Oslo");
    api.setCellValue(ref(core, "1", "city"), "Tromsø");
    expect(node(core, "1").data).toEqual({ id: "1", address: { city: "Tromsø" } });
    core.dispatch({ type: "undo" });
    expect(node(core, "1").data.address.city).toBe("Oslo");
  });

  it("a literal dotted property wins for reads and writes", () => {
    const { core, api } = makeGrid([{ id: "1", "address.city": "Literal", address: { city: "Nested" } }], [cityCol]);
    expect(core.getColumnModel().getByColId("city")!.getValue(node(core, "1"))).toBe("Literal");
    api.setCellValue(ref(core, "1", "city"), "Changed");
    expect(node(core, "1").data["address.city"]).toBe("Changed");
    expect(node(core, "1").data.address.city).toBe("Nested");
  });

  it("the no-op check compares the nested slot", () => {
    const { core, api } = makeGrid(rows(), [cityCol]);
    const changes = vi.fn();
    core.on("cellValueChanged", changes);
    api.setCellValue(ref(core, "2", "city"), "Bergen");
    expect(changes).not.toHaveBeenCalled();
    expect(core.canUndo()).toBe(false);
  });

  it("sorting and the quick filter follow the nested value", () => {
    const { api } = makeGrid(rows(), [cityCol]);
    api.setSortModel([{ colId: "city", dir: "asc" }]);
    expect(displayedIds(api)).toEqual(["3", "2", "1"]);
    api.setQuickFilter("berg");
    expect(displayedIds(api)).toEqual(["2"]);
  });

  it("copy reads the nested value", () => {
    const { core, api } = makeGrid(rows(), [cityCol]);
    api.selectRange(0, 0);
    const text = new ClipboardRenderer({ core }).buildCopyText();
    expect(text).toBe("Oslo");
  });
});

describe("editable as a function (#43)", () => {
  const defs = (editable: ColDef["editable"]): ColDef[] => [
    { colId: "name", key: "name", label: "Name", editable },
    { colId: "qty", key: "qty", label: "Qty", type: ColumnType.NUMBER, editable: true },
  ];
  const data = () => [
    { id: "1", name: "open", qty: 1, locked: false },
    { id: "2", name: "shut", qty: 2, locked: true },
  ];
  const unlocked = ({ data }: EditableCallbackParams) => !data.locked;

  it("receives node, data, colDef, colId and the cell value", () => {
    const spy = vi.fn(() => true);
    const { core } = makeGrid(data(), defs(spy));
    core.dispatch({ type: "editStart", cell: ref(core, "2", "name") });
    expect(spy).toHaveBeenCalled();
    const params = (spy.mock.calls[0] as unknown as [EditableCallbackParams])[0];
    expect(params.node.id).toBe("2");
    expect(params.data).toBe(node(core, "2").data);
    expect(params.colDef.colId).toBe("name");
    expect(params.colId).toBe("name");
    expect(params.value).toBe("shut");
  });

  it("gates opening the editor per row", () => {
    const { core } = makeGrid(data(), defs(unlocked));
    core.dispatch({ type: "editStart", cell: ref(core, "2", "name") });
    expect(core.getEditingCell()).toBeNull();
    core.dispatch({ type: "editStart", cell: ref(core, "1", "name") });
    expect(core.getEditingCell()).toMatchObject({ rowId: "1", colId: "name" });
  });

  it("gates paste and clear per row, and the body menu's edit items", () => {
    const { core, api } = makeGrid(data(), defs(unlocked));
    const clipboard = new ClipboardRenderer({ core });
    // Column 0 (name), rows 0..1.
    core.dispatch({ type: "rangeSelectSet", viewIdx: 0, colIdx: 0, mode: "start" });
    core.dispatch({ type: "rangeSelectSet", viewIdx: 1, colIdx: 0, mode: "extend" });
    expect(api.pasteText("A\nB")).toBe(true);
    expect(node(core, "1").data.name).toBe("A");
    expect(node(core, "2").data.name).toBe("shut");

    clipboard.clearContents();
    expect(node(core, "1").data.name).toBe("");
    expect(node(core, "2").data.name).toBe("shut");

    expect(clipboard.hasEditableCells()).toBe(true);
    core.dispatch({ type: "rangeSelectSet", viewIdx: 1, colIdx: 0, mode: "start" });
    expect(clipboard.hasEditableCells()).toBe(false);
  });

  it("the row presentation gate still applies on top of a function", () => {
    const { core } = makeGrid(data(), defs(() => true), {
      getRowPresentation: ({ data }) => ({ editable: !data.locked }),
    });
    core.dispatch({ type: "editStart", cell: ref(core, "2", "name") });
    expect(core.getEditingCell()).toBeNull();
  });

  it("a function returning a non-true value is not editable; the column still counts as editable for column-level gates", () => {
    const { core } = makeGrid(data(), defs((() => "yes") as any));
    const col = core.getColumnModel().getByColId("name")!;
    expect(col.editable).toBe(true);
    expect(col.isCellEditable(node(core, "1"))).toBe(false);
    expect(col.isCellEditable()).toBe(false);
  });
});
