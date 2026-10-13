// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { GridCore } from "../../core/core";
import { ColumnType } from "../../interfaces/column";
import { GridEventColumnWidthsChangedParams } from "../../events/events";
import { ColumnInteractionRenderer } from "./columnInteraction";

const measurer = { measure: (text: string) => text.length * 7 };

function setup() {
  const core = new GridCore(measurer, { rowIdKey: "id", rowModelType: "clientSide" });
  core.dispatch({ type: "themeFontSet", headerFont: "12px sans", cellFont: "12px sans", reason: "test" });
  core.setRowData([{ id: "1", name: "Ada", qty: 1 }]);
  core.setColumnDefsFromProps([
    { colId: "name", key: "name", label: "Name", type: ColumnType.STRING },
    { colId: "qty", key: "qty", label: "Qty", type: ColumnType.NUMBER },
  ]);
  const col = core.getColumnModel().getByColId("name")!;
  const header = document.createElement("div");
  header.className = "pte-hcell";
  header.id = col.instanceID;
  header.getBoundingClientRect = () => ({ width: 100 } as DOMRect);
  const handle = document.createElement("div");
  handle.className = "pte-hcell-resize-handle";
  header.appendChild(handle);
  document.body.appendChild(header);
  const div = () => document.createElement("div");
  const renderer = new ColumnInteractionRenderer({
    core, root: div(), rowHeight: () => 30, maxDepth: () => 1, headerWrapper: div(),
    leftHeader: div(), centerHeader: div(), rightHeader: div(), body: div(),
    leftSpacer: div(), centerSpacer: div(), rightSpacer: div(), leafColumnLookup: () => new Map(),
  });
  const events: GridEventColumnWidthsChangedParams[] = [];
  core.on("columnWidthsChanged", ev => events.push(ev));
  return { core, renderer, handle, events };
}

const mouse = (type: string, clientX: number, target?: EventTarget) => {
  const ev = new MouseEvent(type, { clientX, button: 0, bubbles: true });
  if (target) Object.defineProperty(ev, "target", { value: target });
  return ev;
};

describe("columnWidthsChanged final flag", () => {
  it("a resize drag emits final:false per move and one trailing final:true", () => {
    const { renderer, handle, events } = setup();
    renderer.onHeaderMouseDown(mouse("mousedown", 200, handle));
    renderer.onColumnResizeMouseMove(mouse("mousemove", 210));
    renderer.onColumnResizeMouseMove(mouse("mousemove", 230));
    renderer.onColumnResizeMouseMove(mouse("mousemove", 250));
    expect(events.map(e => e.final)).toEqual([false, false, false]);
    renderer.onColumnResizeMouseUp();
    expect(events.map(e => e.final)).toEqual([false, false, false, true]);
    expect(events[3].changedColIds).toEqual(["name"]);
  });

  it("a click on the handle that resizes nothing emits nothing", () => {
    const { renderer, handle, events } = setup();
    renderer.onHeaderMouseDown(mouse("mousedown", 200, handle));
    renderer.onColumnResizeMouseUp();
    expect(events).toEqual([]);
  });

  it("autosize and a resize outside a drag are final", () => {
    const { core, events } = setup();
    const col = core.getColumnModel().getByColId("name")!;
    core.dispatch({ type: "columnResize", colId: col.instanceID, widthPx: 321 });
    core.dispatch({ type: "columnAutosize", colId: col.instanceID });
    expect(events.length).toBe(2);
    expect(events.every(e => e.final)).toBe(true);
  });
});
