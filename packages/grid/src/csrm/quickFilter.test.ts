import { describe, expect, it } from "vitest";
import { performQuickFilter, QuickFilterSpec } from "./filter";
import { Column } from "../column/column";
import { ColumnType } from "../interfaces/column";
import { IRowNode } from "../interfaces/iRowNode";

// Build a minimal leaf Column backed by a key on row.data, with an optional formatter.
function col(key: string, type: ColumnType, formatter?: (v: any) => string): Column {
  const c = new Column({ colId: key, key, label: key, type } as any);
  if (formatter) {
    (c as any).valueFormatter = ({ value }: { value: any }) => formatter(value);
  }
  return c;
}

function node(id: string, data: any): IRowNode {
  return {
    id, data, viewIndex: -1, selected: false,
    type: "leaf", level: 0, isGroup: false, isExpanded: false,
  };
}

const rows: IRowNode[] = [
  node("1", { name: "Acme Corp", region: "West", sales: 1200 }),
  node("2", { name: "Acme Labs", region: "East", sales: 900 }),
  node("3", { name: "Globex", region: "West", sales: 1500 }),
  node("4", { name: "Initech", region: "South", sales: null }),
];
const all = rows.map((_, i) => i);

function spec(over: Partial<QuickFilterSpec>): QuickFilterSpec {
  return {
    text: "",
    matchMode: "multiTerm",
    caseSensitive: false,
    columns: [col("name", ColumnType.STRING), col("region", ColumnType.STRING), col("sales", ColumnType.NUMBER)],
    ...over,
  };
}

const ids = (rs: IRowNode[], idx: number[]) => idx.map(i => rs[i].id);

describe("performQuickFilter", () => {
  it("returns candidates unchanged for empty / whitespace-only text", () => {
    expect(performQuickFilter(spec({ text: "" }), rows, all)).toBe(all);
    expect(performQuickFilter(spec({ text: "   " }), rows, all)).toBe(all);
  });

  it("matches a single case-insensitive substring across columns", () => {
    const out = performQuickFilter(spec({ text: "acme" }), rows, all);
    expect(ids(rows, out)).toEqual(["1", "2"]);
  });

  it("matches on a non-name column (region)", () => {
    const out = performQuickFilter(spec({ text: "west" }), rows, all);
    expect(ids(rows, out)).toEqual(["1", "3"]);
  });

  it("multiTerm requires every whitespace-separated token to match somewhere in the row", () => {
    const out = performQuickFilter(spec({ text: "acme west" }), rows, all);
    expect(ids(rows, out)).toEqual(["1"]); // Acme Corp / West — Acme Labs is East
  });

  it("substring mode treats the whole string as one contiguous run", () => {
    // "acme west" is never contiguous in one row, so substring mode finds nothing...
    expect(performQuickFilter(spec({ text: "acme west", matchMode: "substring" }), rows, all)).toEqual([]);
    // ...but a contiguous phrase matches.
    const out = performQuickFilter(spec({ text: "acme c", matchMode: "substring" }), rows, all);
    expect(ids(rows, out)).toEqual(["1"]); // "Acme Corp"
  });

  it("honours case sensitivity", () => {
    expect(performQuickFilter(spec({ text: "ACME", caseSensitive: true }), rows, all)).toEqual([]);
    const out = performQuickFilter(spec({ text: "Acme", caseSensitive: true }), rows, all);
    expect(ids(rows, out)).toEqual(["1", "2"]);
  });

  it("matches against the formatted display value, not the raw value", () => {
    const columns = [col("sales", ColumnType.NUMBER, (v) => (v == null ? "" : `$${v.toLocaleString("en-US")}`))];
    // Raw is 1200; formatted is "$1,200" — searching the formatted comma form matches.
    const out = performQuickFilter(spec({ text: "1,200", columns }), rows, all);
    expect(ids(rows, out)).toEqual(["1"]);
  });

  it("only narrows within the provided candidate set (composes with column filters)", () => {
    const candidates = [2, 3]; // pretend a column filter already limited to Globex / Initech
    const out = performQuickFilter(spec({ text: "west" }), rows, candidates);
    expect(ids(rows, out)).toEqual(["3"]); // Globex is West; Initech is South and was a candidate
  });

  it("skips group nodes", () => {
    const withGroup: IRowNode[] = [
      { ...node("g:West", { __group: true }), type: "group", isGroup: true, groupKey: "West" },
      ...rows,
    ];
    const idx = withGroup.map((_, i) => i);
    const out = performQuickFilter(spec({ text: "west" }), withGroup, idx);
    // The group node (index 0) is skipped even though its key contains "West".
    expect(out).not.toContain(0);
  });
});
