import { describe, expect, it } from "vitest";
import { escapeTSV, firstCellFromTSV } from "./tsv";

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
