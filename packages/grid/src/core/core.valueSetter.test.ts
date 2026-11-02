// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { GridCore } from "./core";
import { GridAPI } from "../api/api";
import { ColDef, ColumnType, ValueSetterParams } from "../interfaces/column";
import { ITextMeasurer } from "../interfaces/iTextMeasure";
import { GridOptions, REJECT } from "../interfaces/gridOptions";
import { GridEventCellValueChangedParams, GridEventEditingChangedParams } from "../events/events";
import { IServerSideDataSource } from "../interfaces/serverSide";

// #41 ColDef.valueSetter on every write path: editor commit, api.setCellValue, paste / fill /
// clear batches, undo/redo, on the client-side and server-side row models.

const measurer: ITextMeasurer = { measure: (t: string) => t.length * 7 };

type Person = { id: string; first: string; last: string; qty: number };

// "full" reads "first last" and writes it back split in two.
const fullName: ColDef<Person> = {
  colId: "full",
  key: "full",
  label: "Full name",
  editable: true,
  valueGetter: (node) => `${node.data.first} ${node.data.last}`,
  valueSetter: ({ data, newValue }) => {
    const [first, ...rest] = String(newValue ?? "").split(" ");
    if (first === data.first && rest.join(" ") === data.last) return false;
    data.first = first;
    data.last = rest.join(" ");
    return true;
  },
};

function rows(): Person[] {
  return [
    { id: "1", first: "Ada", last: "Lovelace", qty: 3 },
    { id: "2", first: "Alan", last: "Turing", qty: 7 },
  ];
}

function makeGrid(options: Partial<GridOptions> = {}, extraCols: ColDef[] = []) {
  const core = new GridCore(measurer, { rowIdKey: "id", rowModelType: "clientSide", ...options });
  core.dispatch({ type: "themeFontSet", headerFont: "12px sans", cellFont: "12px sans", reason: "test" });
  core.setRowData(rows());
  core.setColumnDefsFromProps([fullName, ...extraCols]);
  const valueEvents: GridEventCellValueChangedParams[] = [];
  const editing: GridEventEditingChangedParams[] = [];
  let cellsChanged = 0;
  core.on("cellValueChanged", (e) => valueEvents.push(e));
  core.on("editingChanged", (e) => editing.push(e));
  core.on("cellsChanged", () => cellsChanged++);
  return { core, api: new GridAPI(core), valueEvents, editing, cellsChanged: () => cellsChanged };
}

const ref = (core: GridCore, rowId: string, colId = "full") =>
  ({ rowId, colId: core.getColumnModel().getByColId(colId)!.instanceID });
const data = (core: GridCore, rowId: string) => core.getRowModel().getRowNode(rowId)!.data as Person;

describe("valueSetter (#41)", () => {
  it("an editor commit writes through the setter, with the read value as oldValue", () => {
    const spy = vi.fn(fullName.valueSetter!);
    const { core, valueEvents } = makeGrid({}, []);
    core.setColumnDefsFromProps([{ ...fullName, valueSetter: spy }]);
    core.dispatch({ type: "editStart", cell: ref(core, "1") });
    core.dispatch({ type: "editCommit", cell: ref(core, "1"), value: "Ada King", fromEditor: true });

    expect(data(core, "1")).toMatchObject({ first: "Ada", last: "King" });
    const params = spy.mock.calls[0][0] as ValueSetterParams<Person>;
    expect(params).toMatchObject({
      colId: "full", key: "full", oldValue: "Ada Lovelace", newValue: "Ada King",
    });
    expect(params.node.id).toBe("1");
    expect(params.data).toBe(data(core, "1"));
    expect(params.colDef.colId).toBe("full");
    expect(valueEvents).toEqual([expect.objectContaining({ oldValue: "Ada Lovelace", value: "Ada King", source: "edit" })]);
    expect(core.getEditingCell()).toBeNull();
    // Undo goes back through the setter with the value the cell read.
    core.dispatch({ type: "undo" });
    expect(data(core, "1")).toMatchObject({ first: "Ada", last: "Lovelace" });
    core.dispatch({ type: "redo" });
    expect(data(core, "1")).toMatchObject({ first: "Ada", last: "King" });
  });

  it("never writes the column key itself", () => {
    const { core, api } = makeGrid();
    api.setCellValue(ref(core, "2"), "Alan Kay");
    expect(data(core, "2")).toMatchObject({ first: "Alan", last: "Kay" });
    expect("full" in data(core, "2")).toBe(false);
  });

  it("a setter returning false is no write: no cellValueChanged, no repaint, no undo step", () => {
    const { core, api, valueEvents, editing, cellsChanged } = makeGrid();
    api.setCellValue(ref(core, "1"), "Ada Lovelace");
    expect(valueEvents).toEqual([]);
    expect(cellsChanged()).toBe(0);
    expect(core.canUndo()).toBe(false);
    // The editor still closes as committed.
    expect(editing.at(-1)).toMatchObject({ state: "committed" });
  });

  it("change detection compares the read value before and after the setter", () => {
    // A setter that writes (returns true) but leaves the read value as it was is no value change.
    const { core, api, valueEvents } = makeGrid({}, []);
    core.setColumnDefsFromProps([{ ...fullName, valueSetter: ({ data }) => { (data as any).touched = true; return true; } }]);
    api.setCellValue(ref(core, "1"), "Someone Else");
    expect((data(core, "1") as any).touched).toBe(true);
    expect(valueEvents).toEqual([]);
    expect(core.canUndo()).toBe(false);
  });

  it("runs after valueParser and onBeforeCellCommit, and not at all when they refuse", () => {
    const order: string[] = [];
    const { core, api } = makeGrid({
      onBeforeCellCommit: (p) => { order.push(`hook:${p.value}`); return p.value === "NO ONE" ? REJECT : undefined; },
    }, []);
    core.setColumnDefsFromProps([{
      ...fullName,
      valueParser: ({ value }) => { order.push(`parse:${value}`); return String(value).toUpperCase(); },
      valueSetter: (p) => { order.push(`set:${p.newValue}`); return fullName.valueSetter!(p); },
    }]);
    api.setCellValue(ref(core, "1"), "ada king");
    expect(order).toEqual(["parse:ada king", "hook:ADA KING", "set:ADA KING"]);
    order.length = 0;
    api.setCellValue(ref(core, "1"), "no one");
    expect(order).toEqual(["parse:no one", "hook:NO ONE"]);
    expect(data(core, "1")).toMatchObject({ first: "ADA", last: "KING" });
  });

  it("paste-shaped batches write each cell through the setter as one undo step", () => {
    const { core, valueEvents } = makeGrid();
    core.dispatch({
      type: "cellsCommit",
      reason: "paste",
      edits: [
        { cell: ref(core, "1"), value: "Grace Hopper" },
        { cell: ref(core, "2"), value: "Alan Turing" }, // unchanged → setter returns false
      ],
    });
    expect(data(core, "1")).toMatchObject({ first: "Grace", last: "Hopper" });
    expect(valueEvents).toEqual([expect.objectContaining({ value: "Grace Hopper", source: "paste" })]);
    core.dispatch({ type: "undo" });
    expect(data(core, "1")).toMatchObject({ first: "Ada", last: "Lovelace" });
    expect(core.canUndo()).toBe(false);
  });

  it("fill-shaped and clear batches go through the setter too", () => {
    const { core, valueEvents } = makeGrid();
    core.dispatch({
      type: "cellsCommit", reason: "fill",
      edits: [{ cell: ref(core, "2"), value: "Ada Lovelace", parsed: true }],
    });
    expect(data(core, "2")).toMatchObject({ first: "Ada", last: "Lovelace" });
    core.dispatch({ type: "cellsCommit", reason: "clear", edits: [{ cell: ref(core, "1"), value: "" }] });
    // The text column's parser turns "" into null; the setter decides what that means.
    expect(data(core, "1")).toMatchObject({ first: "", last: "" });
    expect(valueEvents.map(e => e.source)).toEqual(["fill", "clear"]);
  });

  it("readOnlyEdit reports the value without calling the setter", () => {
    const setter = vi.fn(() => true);
    const { core, api, valueEvents } = makeGrid({ readOnlyEdit: true }, []);
    core.setColumnDefsFromProps([{ ...fullName, valueSetter: setter }]);
    api.setCellValue(ref(core, "1"), "X Y");
    expect(setter).not.toHaveBeenCalled();
    expect(valueEvents).toHaveLength(1);
  });

  it("columns without a setter keep the storage-space no-op rule", () => {
    const { core, api, valueEvents } = makeGrid({}, [
      { colId: "qty", key: "qty", label: "Qty", type: ColumnType.NUMBER, editable: true },
    ]);
    api.setCellValue(ref(core, "1", "qty"), 3);
    expect(valueEvents).toEqual([]);
    api.setCellValue(ref(core, "1", "qty"), 4);
    expect(valueEvents).toHaveLength(1);
  });
});

describe("valueSetter on the server-side row model", () => {
  const flush = async () => {
    for (let i = 0; i < 3; i++) await new Promise(resolve => setTimeout(resolve, 0));
  };

  it("edits, batches and undo write through the setter", async () => {
    const source: IServerSideDataSource = {
      getRows: ({ request, success }) => {
        const all = rows();
        success({ rows: all.slice(request.startRow ?? 0, request.endRow ?? all.length), totalRows: all.length });
      },
    };
    const core = new GridCore(measurer, { rowModelType: "serverSide", rowIdKey: "id" });
    core.dispatch({ type: "themeFontSet", headerFont: "12px sans", cellFont: "12px sans", reason: "test" });
    core.setColumnDefsFromProps([fullName]);
    core.setServerSideDataSource(source);
    await flush();
    const api = new GridAPI(core);
    const values: GridEventCellValueChangedParams[] = [];
    core.on("cellValueChanged", (e) => values.push(e));

    api.setCellValue(ref(core, "1"), "Ada King");
    expect(data(core, "1")).toMatchObject({ first: "Ada", last: "King" });
    api.setCellValue(ref(core, "1"), "Ada King"); // setter declines
    expect(values).toHaveLength(1);
    core.dispatch({ type: "cellsCommit", reason: "paste", edits: [{ cell: ref(core, "2"), value: "Alan Kay" }] });
    expect(data(core, "2")).toMatchObject({ first: "Alan", last: "Kay" });
    core.dispatch({ type: "undo" });
    core.dispatch({ type: "undo" });
    expect(data(core, "1")).toMatchObject({ first: "Ada", last: "Lovelace" });
    expect(data(core, "2")).toMatchObject({ first: "Alan", last: "Turing" });
  });
});
