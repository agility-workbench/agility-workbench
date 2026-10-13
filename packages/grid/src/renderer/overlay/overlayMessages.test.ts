// @vitest-environment happy-dom
/**
 * `loadingMessage` and `noRowsMessage` are live: updateGridOptions changes the overlay text on a
 * mounted grid, and undefined restores the default.
 */
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createGrid } from "../../createGrid";

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

const columnDefs = [{ colId: "name", key: "name", label: "Name" }];

function mount(extra: Record<string, unknown> = {}) {
  return createGrid(host, { rowIdKey: "id", columnDefs, ...extra });
}

const text = (selector: string) => host.querySelector(selector)?.textContent;

describe("overlay messages", () => {
  it("updateGridOptions({ loadingMessage }) relabels the loading overlay", () => {
    const api = mount({ rowData: [{ id: 1, name: "a" }], loadingMessage: "Fetching" });
    expect(text(".pte-loading-label")).toBe("Fetching");

    api.updateGridOptions({ loadingMessage: "Still fetching" });
    expect(text(".pte-loading-label")).toBe("Still fetching");
    expect(api.getCore().getOptions().loadingMessage).toBe("Still fetching");

    api.updateGridOptions({ loadingMessage: undefined });
    expect(text(".pte-loading-label")).toBe("Loading data...");
    api.destroy();
  });

  it("updateGridOptions({ noRowsMessage }) relabels a no-rows overlay already showing", () => {
    const api = mount({ rowData: [], noRowsMessage: "Nothing yet" });
    const overlay = host.querySelector(".pte-norows-overlay");
    expect(overlay?.classList.contains("hidden")).toBe(false);
    expect(text(".pte-norows-label")).toBe("Nothing yet");

    api.updateGridOptions({ noRowsMessage: "Still nothing" });
    expect(text(".pte-norows-label")).toBe("Still nothing");

    api.updateGridOptions({ noRowsMessage: undefined });
    expect(text(".pte-norows-label")).toBe("No rows to show");
    api.destroy();
  });

  it("uses the new noRowsMessage the next time the grid empties", () => {
    const api = mount({ rowData: [{ id: 1, name: "a" }] });
    api.updateGridOptions({ noRowsMessage: "Empty now" });
    api.setRowData([]);
    expect(text(".pte-norows-label")).toBe("Empty now");
    api.destroy();
  });

  it("leaves the other runtime options alone", () => {
    const api = mount({ rowData: [], zebraRows: true });
    api.updateGridOptions({ noRowsMessage: "x" });
    expect(api.getCore().getOptions().zebraRows).toBe(true);
    api.destroy();
  });
});

describe("overlay sequencing", () => {
  it("shows the no-rows overlay again when loading ends on an empty grid", () => {
    const api = mount({ rowData: [] });
    const overlay = () => host.querySelector(".pte-norows-overlay")!;
    expect(overlay().classList.contains("hidden")).toBe(false);

    api.dispatch({ type: "overlayShow", overlayType: "loading" });
    expect(overlay().classList.contains("hidden")).toBe(true);

    api.dispatch({ type: "overlayShow", overlayType: "none" });
    expect(overlay().classList.contains("hidden")).toBe(false);
    api.destroy();
  });

  it("keeps the no-rows overlay hidden when loading ends on a grid that has rows", () => {
    const api = mount({ rowData: [{ id: 1, name: "a" }] });
    const overlay = () => host.querySelector(".pte-norows-overlay")!;
    api.dispatch({ type: "overlayShow", overlayType: "loading" });
    api.dispatch({ type: "overlayShow", overlayType: "none" });
    expect(overlay().classList.contains("hidden")).toBe(true);
    api.destroy();
  });
});

describe("filter overlay", () => {
  // A never-opened FilterOverlayRenderer used to be portalled to document.body per grid, with
  // document-level mousedown/keydown listeners; it was removed as dead code.
  it("mounting a grid portals no .pte-filter element into the document", () => {
    const api = mount({ rowData: [{ id: 1, name: "a" }] });
    expect(document.querySelector(".pte-filter")).toBeNull();
    api.destroy();
  });
});
