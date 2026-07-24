/**
 * Tests for the per-column header-menu flags:
 *  - showColumnMenu / columnContextMenu default to true and read from the ColDef.
 *  - On a group (parent) column they derive from children: the parent allows the menu / context
 *    menu only when every child does (mirrors sortable/movable/etc.).
 */
import { describe, it, expect } from "vitest";
import { Column } from "./column";

describe("Column header-menu flags", () => {
  it("default to true", () => {
    const col = new Column({ colId: "a", key: "a", label: "A" });
    expect(col.showColumnMenu).toBe(true);
    expect(col.columnContextMenu).toBe(true);
  });

  it("read explicit false from the ColDef", () => {
    const col = new Column({ colId: "a", key: "a", label: "A", showColumnMenu: false, columnContextMenu: false });
    expect(col.showColumnMenu).toBe(false);
    expect(col.columnContextMenu).toBe(false);
  });

  it("a group column derives from children (all children must allow it)", () => {
    const parent = new Column({ colId: "grp", key: "grp", label: "Group" });
    parent.children = [
      new Column({ colId: "c1", key: "c1", label: "C1" }),
      new Column({ colId: "c2", key: "c2", label: "C2", showColumnMenu: false }),
    ];
    parent.updatePropsByChildren();
    // One child hides its menu → parent hides it too.
    expect(parent.showColumnMenu).toBe(false);
    // No child disabled the context menu → parent keeps it.
    expect(parent.columnContextMenu).toBe(true);
  });

  it("a group column keeps the menu when every child allows it", () => {
    const parent = new Column({ colId: "grp", key: "grp", label: "Group" });
    parent.children = [
      new Column({ colId: "c1", key: "c1", label: "C1" }),
      new Column({ colId: "c2", key: "c2", label: "C2" }),
    ];
    parent.updatePropsByChildren();
    expect(parent.showColumnMenu).toBe(true);
    expect(parent.columnContextMenu).toBe(true);
  });
});
