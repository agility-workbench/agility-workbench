// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { Column } from "../../../column/column";
import { ColumnType } from "../../../interfaces/column";
import { IRowNode } from "../../../interfaces/iRowNode";
import { ICellEditor, ICellEditorParams } from "../cellEditor";
import { createEditorForColumn } from "../resolveEditor";
import { TextCellEditor } from "./textCellEditor";
import { NumberCellEditor } from "./numberCellEditor";
import { DateCellEditor } from "./dateCellEditor";
import { BooleanCellEditor } from "./booleanCellEditor";
import { SelectCellEditor } from "./selectCellEditor";
import { TextareaCellEditor } from "./textareaCellEditor";

const row = (data: any): IRowNode => ({ data } as IRowNode);

function mount(editor: ICellEditor, params: Partial<ICellEditorParams> & { value: any; col: Column }): ICellEditor {
  editor.init({
    row: row({}),
    editorParams: undefined,
    eCell: document.createElement("div"),
    api: null,
    getDistinctColumnValues: () => [],
    ...params,
  });
  return editor;
}

const col = (def: any) => new Column({ colId: "c", key: "c", label: "C", editable: true, ...def });

describe("built-in editors", () => {
  it("TextCellEditor returns the string and is not parsed", () => {
    const e = mount(new TextCellEditor(), { value: "hi", col: col({}) });
    expect((e.getGui() as HTMLInputElement).value).toBe("hi");
    expect(e.getValue()).toBe("hi");
    expect(e.isParsed?.()).toBe(false);
  });

  it("NumberCellEditor returns a number and is parsed; blank → null", () => {
    const e = mount(new NumberCellEditor(), { value: 5, col: col({ type: ColumnType.NUMBER }) });
    const input = e.getGui() as HTMLInputElement;
    expect(e.getValue()).toBe(5);
    expect(e.isParsed?.()).toBe(true);
    input.value = "42";
    expect(e.getValue()).toBe(42);
    input.value = "";
    expect(e.getValue()).toBeNull();
  });

  it("DateCellEditor seeds yyyy-mm-dd and returns it (parsed)", () => {
    const e = mount(new DateCellEditor(), { value: "2026-07-07", col: col({ type: ColumnType.DATE }) });
    expect((e.getGui() as HTMLInputElement).value).toBe("2026-07-07");
    expect(e.getValue()).toBe("2026-07-07");
    expect(e.isParsed?.()).toBe(true);
  });

  it("BooleanCellEditor returns a boolean (parsed)", () => {
    const e = mount(new BooleanCellEditor(), { value: true, col: col({ type: ColumnType.BOOLEAN }) });
    const cb = e.getGui().querySelector("input") as HTMLInputElement;
    expect(cb.checked).toBe(true);
    cb.checked = false;
    expect(e.getValue()).toBe(false);
    expect(e.isParsed?.()).toBe(true);
  });

  it("TextareaCellEditor returns the string (not parsed)", () => {
    const e = mount(new TextareaCellEditor(), { value: "a\nb", col: col({}) });
    expect((e.getGui() as HTMLTextAreaElement).value).toBe("a\nb");
    expect(e.getValue()).toBe("a\nb");
    expect(e.isParsed?.()).toBe(false);
  });

  it("SelectCellEditor builds options from a static array and round-trips values", () => {
    const e = mount(new SelectCellEditor(), {
      value: "b",
      col: col({}),
      editorParams: { values: ["a", "b", "c"] },
    });
    const sel = e.getGui() as HTMLSelectElement;
    expect(sel.options.length).toBe(3);
    expect(e.getValue()).toBe("b"); // current value pre-selected
    sel.value = "2"; // index-based
    expect(e.getValue()).toBe("c");
    expect(e.isParsed?.()).toBe(true);
  });

  it("SelectCellEditor 'fromRows' uses distinct column values", () => {
    const e = mount(new SelectCellEditor(), {
      value: "x",
      col: col({}),
      editorParams: { values: "fromRows" },
      getDistinctColumnValues: () => ["x", "y", "z"],
    });
    const sel = e.getGui() as HTMLSelectElement;
    expect(Array.from(sel.options).map(o => o.textContent)).toEqual(["x", "y", "z"]);
  });

  it("SelectCellEditor async source populates after resolving", async () => {
    let resolveLoad!: (vals: string[]) => void;
    const e = mount(new SelectCellEditor(), {
      value: null,
      col: col({}),
      editorParams: {
        values: (p: any) => new Promise<void>((res) => {
          resolveLoad = (vals) => { p.success(vals); res(); };
        }),
      },
    });
    const sel = e.getGui() as HTMLSelectElement;
    expect(sel.disabled).toBe(true); // loading
    resolveLoad(["one", "two"]);
    await Promise.resolve();
    expect(sel.disabled).toBe(false);
    expect(Array.from(sel.options).map(o => o.textContent)).toEqual(["one", "two"]);
  });
});

describe("createEditorForColumn resolution", () => {
  it("picks number editor for NUMBER/CURRENCY columns", () => {
    expect(createEditorForColumn(col({ type: ColumnType.NUMBER }))).toBeInstanceOf(NumberCellEditor);
    expect(createEditorForColumn(col({ type: ColumnType.CURRENCY }))).toBeInstanceOf(NumberCellEditor);
  });

  it("picks date/boolean editors by type", () => {
    expect(createEditorForColumn(col({ type: ColumnType.DATE }))).toBeInstanceOf(DateCellEditor);
    expect(createEditorForColumn(col({ type: ColumnType.BOOLEAN }))).toBeInstanceOf(BooleanCellEditor);
  });

  it("defaults to text for string columns", () => {
    expect(createEditorForColumn(col({ type: ColumnType.STRING }))).toBeInstanceOf(TextCellEditor);
  });

  it("honors an explicit cellEditor alias over the type default", () => {
    expect(createEditorForColumn(col({ type: ColumnType.NUMBER, cellEditor: "select" }))).toBeInstanceOf(SelectCellEditor);
    expect(createEditorForColumn(col({ cellEditor: "textarea" }))).toBeInstanceOf(TextareaCellEditor);
  });

  it("honors an explicit editor class", () => {
    expect(createEditorForColumn(col({ cellEditor: NumberCellEditor }))).toBeInstanceOf(NumberCellEditor);
  });
});
