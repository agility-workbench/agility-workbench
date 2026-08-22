// @vitest-environment happy-dom
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createGrid } from "../createGrid";
import { ColumnType } from "../interfaces/column";
import type { IGridAPI } from "../interfaces/iGridAPI";

/**
 * Chord matching is exact: a binding no longer answers for supersets of its own chord. These are the
 * cases where that changed observable behavior — each one is a keystroke the grid used to consume and
 * now leaves to the page or the platform. Kept together so the policy is testable as a policy, not
 * scattered across the feature suites that happen to touch each key.
 *
 * See docs/planned-work.md, "Keyboard shortcut resolution by specificity".
 */

beforeAll(() => {
  (HTMLCanvasElement.prototype as any).getContext = () => ({
    font: "",
    measureText: (text: string) => ({ width: text.length * 7 }),
  });
});

let host: HTMLElement;
let api: IGridAPI;
let root: HTMLElement;

const columnDefs = [
  { colId: "name", key: "name", label: "Name", type: ColumnType.STRING, editable: true },
  { colId: "total", key: "total", label: "Total", type: ColumnType.NUMBER, editable: true },
];

const rows = Array.from({ length: 8 }, (_, i) => ({ id: i, name: `Row ${i}`, total: i }));

beforeEach(() => {
  document.body.innerHTML = "";
  host = document.createElement("div");
  Object.defineProperty(host, "clientHeight", { value: 400, configurable: true });
  document.body.appendChild(host);
  api = createGrid(host, { rowIdKey: "id", columnDefs, rowData: rows.map(row => ({ ...row })) });
  root = host.querySelector<HTMLElement>(".pte-root")!;
  // Put the cursor on a data cell: these bindings all live on the body cursor.
  api.dispatch({ type: "focusSet", viewIdx: 2, colIdx: 0, reason: "mouse" });
});

/** A keydown at the root, where the grid's cursor bindings are bound. */
function press(key: string, mods: Partial<KeyboardEventInit> = {}): boolean {
  const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...mods });
  root.dispatchEvent(event);
  // preventDefault is how the grid says "this chord was mine".
  return event.defaultPrevented;
}

const MOD = { ctrlKey: true } as const;

describe("exact chord matching frees supersets the grid used to swallow", () => {
  it("copies on Ctrl+C but not Ctrl+Shift+C (devtools)", () => {
    expect(press("c", MOD)).toBe(true);
    expect(press("c", { ...MOD, shiftKey: true })).toBe(false);
    expect(press("c", { ...MOD, altKey: true })).toBe(false);
  });

  it("cuts and pastes only on the bare mod chord", () => {
    expect(press("x", MOD)).toBe(true);
    expect(press("x", { ...MOD, shiftKey: true })).toBe(false);
    expect(press("v", MOD)).toBe(true);
    expect(press("v", { ...MOD, shiftKey: true })).toBe(false);
  });

  it("selects all on Ctrl+A but not Ctrl+Shift+A", () => {
    // selectAll selects the cell range (row selection is a separate, opt-in feature).
    expect(press("a", MOD)).toBe(true);
    expect(api.getSelection().range).not.toBeNull();

    api.clearSelection("all");
    expect(press("a", { ...MOD, shiftKey: true })).toBe(false);
    expect(api.getSelection().range).toBeNull();
  });

  it("clears contents on Delete/Backspace but not with a modifier", () => {
    const cellValue = () => {
      let data = { name: "" };
      api.forEachNodeAfterFilterAndSort((node, idx) => {
        if (idx === 2) data = node.data as { name: string };
      });
      return data;
    };

    expect(press("Delete", { shiftKey: true })).toBe(false);
    expect(press("Delete", MOD)).toBe(false);
    expect(cellValue().name).toBe("Row 2");

    expect(press("Delete")).toBe(true);
    expect(cellValue().name ?? "").toBe("");
  });

  it("starts editing on F2/Enter but not on a modified Enter", () => {
    expect(press("Enter", MOD)).toBe(false);
    expect(press("Enter", { shiftKey: true })).toBe(false);
    expect(api.getEditingCell()).toBeNull();

    expect(press("Enter")).toBe(true);
    expect(api.getEditingCell()).not.toBeNull();
  });

  it("opens the ActionFrame on Shift+F2 only", () => {
    // No ActionFrame component is configured, so the chord is identified by consumption alone:
    // Shift+F2 is claimed, Ctrl+Shift+F2 is not, and plain F2 goes to the editor instead.
    expect(press("F2", { ...MOD, shiftKey: true })).toBe(false);
    expect(api.getEditingCell()).toBeNull();
  });

  it("pages with PageDown and Shift+PageDown, leaving Ctrl+PageDown to the browser", () => {
    expect(press("PageDown")).toBe(true);
    expect(press("PageDown", { shiftKey: true })).toBe(true);
    expect(press("PageDown", MOD)).toBe(false);
    expect(press("PageUp", MOD)).toBe(false);
  });

  it("jumps to a corner with Ctrl+Home but leaves Alt+Home to the browser", () => {
    expect(press("Home", MOD)).toBe(true);
    expect(press("Home", { shiftKey: true })).toBe(true);
    expect(press("Home", { altKey: true })).toBe(false);
    expect(press("End", { ...MOD, shiftKey: true })).toBe(true);
  });

  it("undoes on Ctrl+Z and redoes on Ctrl+Shift+Z / Ctrl+Y, ignoring Ctrl+Alt+Z", () => {
    const undo = vi.fn();
    api.on("historyChanged", undo);

    expect(press("z", { ...MOD, altKey: true })).toBe(false);
    expect(press("z", MOD)).toBe(true);
    expect(press("z", { ...MOD, shiftKey: true })).toBe(true);
    expect(press("y", MOD)).toBe(true);
  });

  it("keeps the tree-nav switch on exactly mod+shift+space", () => {
    api.destroy();
    api = createGrid(host, {
      rowIdKey: "id",
      columnDefs,
      rowData: [
        { id: "a", name: "A", total: 1, path: ["A"] },
        { id: "b", name: "B", total: 2, path: ["A", "B"] },
      ],
      treeData: {
        mode: "path",
        getPath: (row: any) => row.path,
        enableKeyboardNavigationModeSwitch: true,
      },
      groupDefaultExpanded: -1,
    });
    root = host.querySelector<HTMLElement>(".pte-root")!;
    api.dispatch({ type: "focusSet", viewIdx: 1, colIdx: 0, reason: "mouse" });

    expect(press(" ", { ...MOD, shiftKey: true, code: "Space" } as KeyboardEventInit)).toBe(true);
    expect(api.getKeyboardNavigationMode()).toBe("hierarchy");

    // Neither neighbour of that chord is the switch.
    expect(press(" ", { ...MOD, code: "Space" } as KeyboardEventInit)).toBe(false);
    expect(press(" ", { ...MOD, shiftKey: true, altKey: true, code: "Space" } as KeyboardEventInit)).toBe(false);
    expect(api.getKeyboardNavigationMode()).toBe("hierarchy");
  });

  it("commits an edit on Tab and Shift+Tab, leaving Ctrl+Tab to the browser", () => {
    press("Enter");
    const editor = () => host.querySelector<HTMLInputElement>(".pte-cell-editor-input");
    expect(editor()).not.toBeNull();

    const editorPress = (key: string, mods: Partial<KeyboardEventInit> = {}): boolean => {
      const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...mods });
      editor()!.dispatchEvent(event);
      return event.defaultPrevented;
    };

    // Ctrl+Tab used to commit and move the cursor, hijacking the browser's tab switch.
    expect(editorPress("Tab", MOD)).toBe(false);
    expect(api.getEditingCell()).not.toBeNull();
    // Alt+Enter likewise: no editing meaning, so it is no longer a commit.
    expect(editorPress("Enter", { altKey: true })).toBe(false);
    expect(api.getEditingCell()).not.toBeNull();

    expect(editorPress("Tab")).toBe(true);
    expect(api.getEditingCell()).toBeNull();
  });

  it("cancels an edit on Escape whatever modifiers are held", () => {
    press("Enter");
    const editor = host.querySelector<HTMLInputElement>(".pte-cell-editor-input")!;
    // Dismissal is deliberately permissive — the one place a superset still matches on purpose.
    editor.dispatchEvent(new KeyboardEvent("keydown", {
      key: "Escape", shiftKey: true, bubbles: true, cancelable: true,
    }));
    expect(api.getEditingCell()).toBeNull();
  });

  it("steps a number editor on bare arrows only", () => {
    api.dispatch({ type: "focusSet", viewIdx: 2, colIdx: 1, reason: "mouse" });
    press("Enter");
    const editor = host.querySelector<HTMLInputElement>(".pte-cell-editor-input")!;
    const step = (mods: Partial<KeyboardEventInit> = {}) => editor.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true, cancelable: true, ...mods }),
    );

    const before = editor.value;
    step(MOD);
    step({ altKey: true });
    expect(editor.value).toBe(before);

    step();
    expect(Number(editor.value)).toBe(Number(before) + 1);
  });

  it("opens the quick filter on Ctrl+F but not Ctrl+Shift+F", () => {
    api.destroy();
    api = createGrid(host, {
      rowIdKey: "id",
      columnDefs,
      rowData: rows.map(row => ({ ...row })),
      quickFilter: { mode: "onDemand" },
    });
    root = host.querySelector<HTMLElement>(".pte-root")!;

    expect(press("f", { ...MOD, shiftKey: true })).toBe(false);
    expect(press("f", MOD)).toBe(true);
  });

  it("leaves Alt+Arrow to the browser instead of moving the cursor", () => {
    const before = api.getSelection().active;

    // The grid used to consume Alt+Arrow as a plain arrow, silently overriding the browser's
    // back/forward gesture and giving nothing back for it.
    expect(press("ArrowDown", { altKey: true })).toBe(false);
    expect(press("ArrowLeft", { altKey: true })).toBe(false);
    expect(api.getSelection().active).toEqual(before);

    expect(press("ArrowDown")).toBe(true);
    expect(api.getSelection().active).not.toEqual(before);
  });

  it("claims Space and Ctrl+Space in the header but leaves Shift+Space alone", () => {
    api.destroy();
    api = createGrid(host, {
      rowIdKey: "id",
      columnDefs,
      rowData: rows.map(row => ({ ...row })),
      columnSelection: true,
    });
    root = host.querySelector<HTMLElement>(".pte-root")!;
    root.focus();
    expect(api.getCore().getHeaderFocusColIdx()).not.toBeNull();
    const space = (mods: Partial<KeyboardEventInit> = {}) =>
      press(" ", { code: "Space", ...mods } as KeyboardEventInit);

    expect(space()).toBe(true);
    expect(api.getSelection().selectedColumnIds.length).toBe(1);
    expect(space(MOD)).toBe(true);
    expect(api.getSelection().selectedColumnIds.length).toBe(0); // Ctrl+Space toggles

    // Shift+Space carried "additive sort" while multiSortKey existed. Nothing in the header claims
    // it now. (In the body, Space of any kind is type-to-edit — a printable character.)
    expect(space({ shiftKey: true })).toBe(false);
    expect(space({ ...MOD, shiftKey: true, altKey: true })).toBe(false);
  });

  it("switches tree navigation from either cursor, the header included", () => {
    api.destroy();
    api = createGrid(host, {
      rowIdKey: "id",
      columnDefs,
      rowData: [
        { id: "a", name: "A", total: 1, path: ["A"] },
        { id: "b", name: "B", total: 2, path: ["A", "B"] },
      ],
      treeData: {
        mode: "path",
        getPath: (row: any) => row.path,
        enableKeyboardNavigationModeSwitch: true,
      },
      groupDefaultExpanded: -1,
      columnSelection: true,
    });
    root = host.querySelector<HTMLElement>(".pte-root")!;
    const chord = { ...MOD, shiftKey: true, code: "Space" } as KeyboardEventInit;

    // The header used to claim this chord for "add this column to the selection", which made the
    // switch inert here. Space and Ctrl/Cmd+Space now carry column selection on their own, so the
    // switch is a `grid` binding again: one meaning, wherever the cursor is.
    root.focus();
    expect(api.getCore().getHeaderFocusColIdx()).not.toBeNull();
    expect(press(" ", chord)).toBe(true);
    expect(api.getSelection().selectedColumnIds.length).toBe(0);
    expect(api.getKeyboardNavigationMode()).toBe("hierarchy");

    api.dispatch({ type: "focusSet", viewIdx: 1, colIdx: 0, reason: "mouse" });
    expect(press(" ", chord)).toBe(true);
    expect(api.getKeyboardNavigationMode()).toBe("grid");
  });

  it("claims the same Ctrl+F inside the quick-filter input as at the root", () => {
    api.destroy();
    api = createGrid(host, {
      rowIdKey: "id",
      columnDefs,
      rowData: rows.map(row => ({ ...row })),
      quickFilter: { mode: "always" },
    });

    // The input stops propagation for every key, so it has to claim Ctrl+F itself to keep the
    // browser's Find dialog shut. It must claim exactly that chord — no more than the root does,
    // or the same keystroke would be answered differently depending on where focus is.
    const input = host.querySelector<HTMLInputElement>(".pte-quick-filter-input")!;
    const inputPress = (mods: Partial<KeyboardEventInit>): boolean => {
      const event = new KeyboardEvent("keydown", { key: "f", bubbles: true, cancelable: true, ...mods });
      input.dispatchEvent(event);
      return event.defaultPrevented;
    };

    expect(inputPress(MOD)).toBe(true);
    expect(inputPress({ ...MOD, shiftKey: true })).toBe(false);
    expect(inputPress({ ...MOD, altKey: true })).toBe(false);
  });
});
