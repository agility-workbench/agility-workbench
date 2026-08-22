// @vitest-environment happy-dom
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createGrid } from "../createGrid";
import { ColumnType } from "../interfaces/column";
import type { IGridAPI } from "../interfaces/iGridAPI";
import type { TreeDataOptions } from "../interfaces/gridOptions";

beforeAll(() => {
  (HTMLCanvasElement.prototype as any).getContext = () => ({
    font: "",
    measureText: (text: string) => ({ width: text.length * 7 }),
  });
});

let host: HTMLElement;

beforeEach(() => {
  document.body.innerHTML = "";
  host = document.createElement("div");
  host.style.height = "400px";
  host.style.width = "600px";
  document.body.appendChild(host);
});

const treeData: TreeDataOptions = {
  mode: "path",
  getPath: (row: any) => row.path,
};

const rows = [
  { id: "paris", name: "Paris", path: ["World", "Europe", "France", "Paris"] },
  { id: "berlin", name: "Berlin", path: ["World", "Europe", "Germany", "Berlin"] },
];

const columnDefs = [{ colId: "name", key: "name", label: "Name", type: ColumnType.STRING }];

function mountTree(options: Record<string, unknown> = {}): IGridAPI {
  return createGrid(host, {
    rowIdKey: "id",
    columnDefs,
    rowData: rows,
    treeData: { ...treeData },
    groupDefaultExpanded: -1,
    ...options,
  });
}

/** The fixed mode-switch shortcut, dispatched at the grid root where the handler is bound. */
function pressModeSwitch(): void {
  const root = host.querySelector<HTMLElement>(".pte-root");
  expect(root).not.toBeNull();
  root!.dispatchEvent(new KeyboardEvent("keydown", {
    key: " ",
    code: "Space",
    ctrlKey: true,
    shiftKey: true,
    bubbles: true,
    cancelable: true,
  }));
}

describe("api.setTreeDataKeyboardNavigationOptions", () => {
  it("enables the mode-switch shortcut on a mounted grid, with no rebuild", () => {
    const api = mountTree();

    // Not enabled at creation: the shortcut does nothing.
    pressModeSwitch();
    expect(api.getKeyboardNavigationMode()).toBe("grid");

    api.setTreeDataKeyboardNavigationOptions({ enableKeyboardNavigationModeSwitch: true });

    pressModeSwitch();
    expect(api.getKeyboardNavigationMode()).toBe("hierarchy");
    pressModeSwitch();
    expect(api.getKeyboardNavigationMode()).toBe("grid");

    api.destroy();
  });

  it("disables the shortcut again", () => {
    const api = mountTree({
      treeData: { ...treeData, enableKeyboardNavigationModeSwitch: true },
    });

    api.setTreeDataKeyboardNavigationOptions({ enableKeyboardNavigationModeSwitch: false });

    pressModeSwitch();
    expect(api.getKeyboardNavigationMode()).toBe("grid");

    api.destroy();
  });

  it("sets the mode, reporting `options` as the source", () => {
    const api = mountTree();
    const events: unknown[] = [];
    api.on("keyboardNavigationModeChanged", event => events.push(event));

    api.setTreeDataKeyboardNavigationOptions({ keyboardNavigationMode: "hierarchy" });

    expect(api.getKeyboardNavigationMode()).toBe("hierarchy");
    // Configuration-driven, unlike the imperative setKeyboardNavigationMode below.
    expect(events).toEqual([{ mode: "hierarchy", previousMode: "grid", source: "options" }]);

    api.setKeyboardNavigationMode("grid");
    expect(events).toHaveLength(2);
    expect((events[1] as any).source).toBe("api");

    api.destroy();
  });

  it("changes only the fields present: setting the flag leaves the mode alone", () => {
    const api = mountTree({ treeData: { ...treeData, keyboardNavigationMode: "hierarchy" } });
    expect(api.getKeyboardNavigationMode()).toBe("hierarchy");

    api.setTreeDataKeyboardNavigationOptions({ enableKeyboardNavigationModeSwitch: true });

    expect(api.getKeyboardNavigationMode()).toBe("hierarchy");
    api.destroy();
  });

  it("changes only the fields present: setting the mode leaves the flag alone", () => {
    const api = mountTree({
      treeData: { ...treeData, enableKeyboardNavigationModeSwitch: true },
    });

    api.setTreeDataKeyboardNavigationOptions({ keyboardNavigationMode: "hierarchy" });

    // The shortcut still works, so the flag survived a mode-only call.
    pressModeSwitch();
    expect(api.getKeyboardNavigationMode()).toBe("grid");

    api.destroy();
  });

  it("treats a present `undefined` as a reset to the default", () => {
    const api = mountTree({
      treeData: {
        ...treeData,
        keyboardNavigationMode: "hierarchy",
        enableKeyboardNavigationModeSwitch: true,
      },
    });
    expect(api.getKeyboardNavigationMode()).toBe("hierarchy");

    api.setTreeDataKeyboardNavigationOptions({
      keyboardNavigationMode: undefined,
      enableKeyboardNavigationModeSwitch: undefined,
    });

    expect(api.getKeyboardNavigationMode()).toBe("grid");
    pressModeSwitch();
    expect(api.getKeyboardNavigationMode()).toBe("grid");

    api.destroy();
  });

  it("is a no-op on a grid without treeData", () => {
    const api = createGrid(host, { rowIdKey: "id", columnDefs, rowData: [{ id: 1, name: "a" }] });

    expect(() => api.setTreeDataKeyboardNavigationOptions({
      keyboardNavigationMode: "hierarchy",
      enableKeyboardNavigationModeSwitch: true,
    })).not.toThrow();

    expect(api.getKeyboardNavigationMode()).toBe("grid");
    pressModeSwitch();
    expect(api.getKeyboardNavigationMode()).toBe("grid");

    api.destroy();
  });
});
