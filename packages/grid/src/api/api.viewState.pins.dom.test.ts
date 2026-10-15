// @vitest-environment happy-dom
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { createGrid } from "../createGrid";
import { IGridAPI } from "../interfaces/iGridAPI";

/** Saved views carry runtime row pins through the real renderer's pin controller. */

beforeAll(() => {
  (HTMLCanvasElement.prototype as any).getContext = () => ({
    font: "",
    measureText: (text: string) => ({ width: text.length * 7 }),
  });
});

const apis: IGridAPI[] = [];
afterEach(() => {
  while (apis.length) apis.pop()!.destroy();
  document.body.innerHTML = "";
});

function mount(): { api: IGridAPI; host: HTMLElement } {
  const host = document.createElement("div");
  host.style.height = "400px";
  document.body.appendChild(host);
  const api = createGrid(host, {
    rowIdKey: "id",
    columnDefs: [{ colId: "name", key: "name", label: "Name" }],
    rowData: [{ id: "1", name: "One" }, { id: "2", name: "Two" }, { id: "3", name: "Three" }],
  } as any);
  apis.push(api);
  return { api, host };
}

const pinnedIds = (host: HTMLElement, band: "top" | "bottom") =>
  Array.from(host.querySelectorAll<HTMLElement>(`.pte-pinned-rows-${band} .pte-pinned-row`))
    .map(row => row.dataset.rowId)
    .filter((id, index, all) => all.indexOf(id) === index);

describe("saved views: runtime row pins", () => {
  it("capture → apply on a fresh grid reproduces the pins, idempotently", () => {
    const a = mount();
    a.api.setRowPinned("2", "top");
    a.api.setRowPinned("3", "bottom");
    const captured = JSON.parse(JSON.stringify(a.api.captureViewState()));
    expect(captured.rowPinning).toEqual([
      { rowId: "2", position: "top" },
      { rowId: "3", position: "bottom" },
    ]);

    const b = mount();
    b.api.setRowPinned("1", "top");
    b.api.applyViewState(captured);
    expect(pinnedIds(b.host, "top")).toEqual(["2"]);
    expect(pinnedIds(b.host, "bottom")).toEqual(["3"]);
    expect(JSON.parse(JSON.stringify(b.api.captureViewState()))).toEqual(captured);
  });

  it("an old view without rowPinning leaves the pins alone", () => {
    const a = mount();
    a.api.setRowPinned("2", "top");
    const old = a.api.captureViewState() as any;
    delete old.rowPinning;
    a.api.setRowPinned("1", "bottom");
    a.api.applyViewState(old);
    expect(pinnedIds(a.host, "top")).toEqual(["2"]);
    expect(pinnedIds(a.host, "bottom")).toEqual(["1"]);
  });
});
