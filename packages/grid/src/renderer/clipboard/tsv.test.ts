import { describe, expect, it } from "vitest";
import { escapeTSV, firstCellFromTSV, parseTSV, serializeNodesToTSV } from "./tsv";
import { Column } from "../../column/column";
import { ColumnType } from "../../interfaces/column";
import { groupRowLabel, IRowNode } from "../../interfaces/iRowNode";

describe("escapeTSV", () => {
  it("returns empty string for null/undefined", () => {
    expect(escapeTSV(null)).toBe("");
    expect(escapeTSV(undefined)).toBe("");
  });

  it("passes plain values through", () => {
    expect(escapeTSV("hello")).toBe("hello");
    expect(escapeTSV(42)).toBe("42");
  });

  it("quotes and escapes values containing tab, newline or quotes", () => {
    expect(escapeTSV("a\tb")).toBe('"a\tb"');
    expect(escapeTSV("a\nb")).toBe('"a\nb"');
    expect(escapeTSV('say "hi"')).toBe('"say ""hi"""');
  });
});

describe("firstCellFromTSV", () => {
  it("returns the first field of the first line", () => {
    expect(firstCellFromTSV("a\tb\tc\nd\te")).toBe("a");
  });

  it("handles CRLF and lone CR line endings", () => {
    expect(firstCellFromTSV("x\r\ny")).toBe("x");
    expect(firstCellFromTSV("x\ry")).toBe("x");
  });

  it("unwraps a quoted field", () => {
    expect(firstCellFromTSV('"a\tb"\tc')).toBe("a\tb");
    expect(firstCellFromTSV('"say ""hi"""')).toBe('say "hi"');
  });

  it("returns empty string for empty input", () => {
    expect(firstCellFromTSV("")).toBe("");
  });
});

describe("parseTSV", () => {
  it("returns [] for empty input", () => {
    expect(parseTSV("")).toEqual([]);
  });

  it("parses a rectangular grid", () => {
    expect(parseTSV("a\tb\tc\nd\te\tf")).toEqual([
      ["a", "b", "c"],
      ["d", "e", "f"],
    ]);
  });

  it("handles CRLF and lone CR row separators", () => {
    expect(parseTSV("a\tb\r\nc\td\re\tf")).toEqual([
      ["a", "b"],
      ["c", "d"],
      ["e", "f"],
    ]);
  });

  it("does not emit a trailing empty row for a trailing newline", () => {
    expect(parseTSV("a\tb\n")).toEqual([["a", "b"]]);
  });

  it("preserves empty fields", () => {
    expect(parseTSV("a\t\tc")).toEqual([["a", "", "c"]]);
    expect(parseTSV("\t")).toEqual([["", ""]]);
  });

  it("parses ragged rows", () => {
    expect(parseTSV("a\tb\tc\nd")).toEqual([["a", "b", "c"], ["d"]]);
  });

  it("parses quoted fields containing tabs, newlines and escaped quotes", () => {
    expect(parseTSV('"a\tb"\tc')).toEqual([["a\tb", "c"]]);
    expect(parseTSV('"line1\nline2"\tx')).toEqual([["line1\nline2", "x"]]);
    expect(parseTSV('"say ""hi"""\tx')).toEqual([['say "hi"', "x"]]);
  });
});

describe("serializeNodesToTSV group rows", () => {
  const autoGroupCol = () => {
    const col = new Column(
      { colId: "__pte_group__", key: "__pte_group__", label: "Group", __internalRole: "autoGroup" } as any,
      "__pte_group__",
    );
    return col;
  };
  const groupNode = (over: Partial<IRowNode>): IRowNode => ({
    id: "g", data: {}, viewIndex: 0, selected: false, type: "group",
    isGroup: true, level: 0, isExpanded: false, ...over,
  });

  it("copies the count a group row has", () => {
    const node = groupNode({ groupKey: "EMEA", childCount: 2 });
    expect(serializeNodesToTSV([autoGroupCol()], [node], false)).toBe("EMEA (2)");
  });

  it("copies what the screen shows when the count is unknown, not \"(0)\"", () => {
    // A server-side group with no supplied child count: the cell renderer writes just the key, and
    // a copy that invented "(0)" would put a number in the user's clipboard that the grid never
    // displayed and the data never claimed.
    const node = groupNode({ groupKey: "EMEA" });
    const copied = serializeNodesToTSV([autoGroupCol()], [node], false);
    expect(copied).toBe("EMEA");
    expect(copied).toBe(groupRowLabel(node));
  });
});
