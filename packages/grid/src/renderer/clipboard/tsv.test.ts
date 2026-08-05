import { describe, expect, it } from "vitest";
import { escapeTSV, firstCellFromTSV, parseTSV } from "./tsv";

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
