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

  it("seeds the text editor from charPress instead of the cell value (edit-on-typing)", () => {
    const e = mount(new TextCellEditor(), { value: "old", charPress: "z", col: col({}) });
    expect((e.getGui() as HTMLInputElement).value).toBe("z");
    expect(e.getValue()).toBe("z");
  });

  it("seeds the number editor from charPress", () => {
    const e = mount(new NumberCellEditor(), { value: 5, charPress: "7", col: col({ type: ColumnType.NUMBER }) });
    expect((e.getGui() as HTMLInputElement).value).toBe("7");
    expect(e.getValue()).toBe(7);
  });

  it("seeds the textarea editor from charPress", () => {
    const e = mount(new TextareaCellEditor(), { value: "old", charPress: "a", col: col({}) });
    expect((e.getGui() as HTMLTextAreaElement).value).toBe("a");
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

describe("NumberCellEditor (text-based numeric input)", () => {
  const arrow = (input: HTMLInputElement, key: "ArrowUp" | "ArrowDown") =>
    input.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));

  const numCol = (def: any = {}) => col({ type: ColumnType.NUMBER, ...def });

  // "12.5%"-style pair: stored fraction, displayed percent.
  const pctCol = () => numCol({
    valueFormatter: ({ value }: any) => (value == null ? "" : `${+(Number(value) * 100).toFixed(6)}%`),
    valueParser: ({ value }: any) => {
      const n = Number(String(value).trim().replace(/%$/, ""));
      return Number.isNaN(n) ? null : n / 100;
    },
  });

  it("renders a text input with a decimal inputmode (no native number input)", () => {
    const e = mount(new NumberCellEditor(), { value: 5, col: numCol() });
    const input = e.getGui() as HTMLInputElement;
    expect(input.type).toBe("text");
    expect(input.inputMode).toBe("decimal");
  });

  it("clamps the committed number to min/max (plain mode)", () => {
    const e = mount(new NumberCellEditor(), { value: 5, col: numCol(), editorParams: { min: 0, max: 10 } });
    const input = e.getGui() as HTMLInputElement;
    input.value = "99";
    expect(e.getValue()).toBe(10);
    input.value = "-3";
    expect(e.getValue()).toBe(0);
    input.value = "abc";
    expect(e.getValue()).toBeNull(); // invalid text still commits null, as before
  });

  it("steps with ArrowUp/ArrowDown, clamped and quantized to the step precision", () => {
    const e = mount(new NumberCellEditor(), { value: 0.2, col: numCol(), editorParams: { step: 0.1, max: 0.4 } });
    const input = e.getGui() as HTMLInputElement;
    arrow(input, "ArrowUp");
    expect(input.value).toBe("0.3"); // not 0.30000000000000004
    arrow(input, "ArrowUp");
    arrow(input, "ArrowUp"); // clamped at max
    expect(input.value).toBe("0.4");
    arrow(input, "ArrowDown");
    expect(input.value).toBe("0.3");
  });

  it("steps from blank as 0 and ignores stepping on unparseable text", () => {
    const e = mount(new NumberCellEditor(), { value: null, col: numCol() });
    const input = e.getGui() as HTMLInputElement;
    expect(input.value).toBe("");
    arrow(input, "ArrowUp");
    expect(input.value).toBe("1");
    input.value = "abc";
    arrow(input, "ArrowUp");
    expect(input.value).toBe("abc"); // no guess
  });

  it("with a valueParser: seeds the formatted value and returns the raw string unparsed", () => {
    const e = mount(new NumberCellEditor(), { value: 0.125, col: pctCol() });
    const input = e.getGui() as HTMLInputElement;
    expect(input.value).toBe("12.5%"); // edits what the cell displays
    expect(e.isParsed?.()).toBe(false);
    input.value = "45%";
    expect(e.getValue()).toBe("45%"); // commit path runs the column's valueParser
    input.value = "";
    expect(e.getValue()).toBe(""); // blank goes to the parser too — it decides what empty means
  });

  it("with a valueParser: arrow stepping round-trips parse → ±step → format", () => {
    const e = mount(new NumberCellEditor(), { value: 0.125, col: pctCol(), editorParams: { step: 0.005 } });
    const input = e.getGui() as HTMLInputElement;
    arrow(input, "ArrowUp");
    expect(input.value).toBe("13%");
    arrow(input, "ArrowDown");
    arrow(input, "ArrowDown");
    expect(input.value).toBe("12%");
  });

  it("seeds a non-numeric charPress verbatim (type=number used to blank it)", () => {
    const e = mount(new NumberCellEditor(), { value: 0.125, col: pctCol(), charPress: "%" });
    expect((e.getGui() as HTMLInputElement).value).toBe("%");
  });
});

describe("DateCellEditor (typed-format parser mode)", () => {
  const arrow = (input: HTMLInputElement, key: "ArrowUp" | "ArrowDown") =>
    input.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));

  // "MM/DD/YYYY"-style pair: stored ISO yyyy-mm-dd string, displayed US format.
  const usDateCol = () => col({
    type: ColumnType.DATE,
    valueFormatter: ({ value }: any) => {
      if (value == null || value === "") return "";
      const [y, m, d] = String(value).split("-");
      return `${m}/${d}/${y}`;
    },
    valueParser: ({ value }: any) => {
      const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(String(value).trim());
      if (!m) return null;
      return `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
    },
  });

  it("stays a native date input without a valueParser", () => {
    const e = mount(new DateCellEditor(), { value: "2026-07-07", col: col({ type: ColumnType.DATE }) });
    expect((e.getGui() as HTMLInputElement).type).toBe("date");
    expect(e.isParsed?.()).toBe(true);
  });

  it("with a valueParser: seeds the formatted value and returns the raw string unparsed", () => {
    const e = mount(new DateCellEditor(), { value: "2026-07-07", col: usDateCol() });
    const input = e.getGui() as HTMLInputElement;
    expect(input.type).toBe("text");
    expect(input.value).toBe("07/07/2026"); // edits what the cell displays
    expect(e.isParsed?.()).toBe(false);
    input.value = "12/25/2026";
    expect(e.getValue()).toBe("12/25/2026"); // commit path runs the column's valueParser
    input.value = "";
    expect(e.getValue()).toBe(""); // blank goes to the parser too — it decides what empty means
  });

  it("arrow stepping round-trips parse → ±step days → format, across month ends", () => {
    const e = mount(new DateCellEditor(), { value: "2026-07-07", col: usDateCol() });
    const input = e.getGui() as HTMLInputElement;
    arrow(input, "ArrowUp");
    expect(input.value).toBe("07/08/2026");
    input.value = "12/31/2026";
    arrow(input, "ArrowUp");
    expect(input.value).toBe("01/01/2027"); // local-date stepping, no UTC off-by-one
    arrow(input, "ArrowDown");
    expect(input.value).toBe("12/31/2026");
  });

  it("steps by editorParams.step days", () => {
    const e = mount(new DateCellEditor(), { value: "2026-07-07", col: usDateCol(), editorParams: { step: 7 } });
    const input = e.getGui() as HTMLInputElement;
    arrow(input, "ArrowUp");
    expect(input.value).toBe("07/14/2026");
  });

  it("steps from blank using the cell's original value and ignores unparseable text", () => {
    const e = mount(new DateCellEditor(), { value: "2026-07-07", col: usDateCol() });
    const input = e.getGui() as HTMLInputElement;
    input.value = "";
    arrow(input, "ArrowUp");
    expect(input.value).toBe("07/08/2026");
    input.value = "not a date";
    arrow(input, "ArrowUp");
    expect(input.value).toBe("not a date"); // no guess
  });

  it("seeds charPress verbatim (edit-on-typing)", () => {
    const e = mount(new DateCellEditor(), { value: "2026-07-07", col: usDateCol(), charPress: "1" });
    expect((e.getGui() as HTMLInputElement).value).toBe("1");
  });
});
