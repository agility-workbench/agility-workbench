import { describe, expect, it } from "vitest";
import { Column } from "./column";
import { ColumnType } from "../interfaces/column";
import { IRowNode } from "../interfaces/iRowNode";

const rowNode = (data: any): IRowNode => ({ data } as IRowNode);

describe("Column editing", () => {
  it("defaults to non-editable", () => {
    const col = new Column({ key: "name", label: "Name" });
    expect(col.editable).toBe(false);
    expect(col.isCellEditable()).toBe(false);
  });

  it("is editable when the flag is set", () => {
    const col = new Column({ key: "name", label: "Name", editable: true });
    expect(col.editable).toBe(true);
    expect(col.isCellEditable()).toBe(true);
  });

  it("stores the raw text verbatim when no valueParser is given", () => {
    const col = new Column({ key: "name", label: "Name", editable: true });
    expect(col.parseValue("hello", rowNode({ name: "old" }), "old")).toBe("hello");
  });

  it("runs the column's valueParser and receives the old value", () => {
    const col = new Column({
      key: "qty",
      label: "Qty",
      type: ColumnType.NUMBER,
      editable: true,
      valueParser: ({ value, oldValue }) => {
        const n = Number(value);
        return Number.isNaN(n) ? oldValue : n;
      },
    });
    expect(col.parseValue("42", rowNode({ qty: 1 }), 1)).toBe(42);
    // Falls back to oldValue on unparseable input.
    expect(col.parseValue("abc", rowNode({ qty: 1 }), 1)).toBe(1);
  });

  it("carries editable/valueParser through duplicate()", () => {
    const parser = ({ value }: { value: string }) => value.toUpperCase();
    const col = new Column({ key: "name", label: "Name", editable: true, valueParser: parser });
    const dup = col.duplicate();
    expect(dup.editable).toBe(true);
    expect(dup.valueParser).toBe(parser);
  });
});

describe("Column colSpan", () => {
  it("defaults to undefined (no span)", () => {
    const col = new Column({ key: "name", label: "Name" });
    expect(col.colSpan).toBeUndefined();
  });

  it("copies the colSpan callback through updateFromColDef", () => {
    const colSpan = () => 2;
    const col = new Column({ key: "name", label: "Name", colSpan });
    expect(col.colSpan).toBe(colSpan);
    // A subsequent def without colSpan clears it.
    col.updateFromColDef({ key: "name", label: "Name" });
    expect(col.colSpan).toBeUndefined();
  });
});
