// @vitest-environment happy-dom
/**
 * The theme's `rowHeight` param sizes the rows. Row layout is JS-driven, so the param only works by
 * feeding the same number the `rowHeight` grid option does; the grid option wins when both are set.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createGrid } from "../createGrid";
import { createTheme, resolveThemeRowHeightPx, themeLight } from "./theme";

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
const rowData = [{ id: 1, name: "a" }, { id: 2, name: "b" }];

function mount(extra: Record<string, unknown> = {}) {
  return createGrid(host, { rowIdKey: "id", columnDefs, rowData, ...extra });
}

function firstRowHeight(): string | undefined {
  const row = host.querySelector<HTMLElement>(".pte-row[style*='height']");
  return row?.style.height;
}

describe("theme rowHeight", () => {
  it("sizes the rows when no rowHeight grid option is set", () => {
    const api = mount({ theme: themeLight.withParams({ rowHeight: 42 }) });
    expect(api.getCore().getOptions().rowHeight).toBe(42);
    expect(firstRowHeight()).toBe("42px");
    api.destroy();
  });

  it("loses to an explicit rowHeight grid option", () => {
    const api = mount({ theme: themeLight.withParams({ rowHeight: 42 }), rowHeight: 30 });
    expect(api.getCore().getOptions().rowHeight).toBe(30);
    expect(firstRowHeight()).toBe("30px");
    api.destroy();
  });

  it("falls back to the default when neither sets one", () => {
    const api = mount({ theme: themeLight });
    expect(api.getCore().getOptions().rowHeight).toBe(43);
    api.destroy();
  });
});

describe("resolveThemeRowHeightPx", () => {
  it("reads numbers, px strings and the --pte-row-height vars override", () => {
    expect(resolveThemeRowHeightPx(undefined)).toBeUndefined();
    expect(resolveThemeRowHeightPx(createTheme())).toBeUndefined();
    expect(resolveThemeRowHeightPx(createTheme({ rowHeight: 36 }))).toBe(36);
    expect(resolveThemeRowHeightPx(createTheme({ rowHeight: "38px" }))).toBe(38);
    expect(resolveThemeRowHeightPx(createTheme({ rowHeight: "40" }))).toBe(40);
    expect(
      resolveThemeRowHeightPx(createTheme({ rowHeight: 36, vars: { "--pte-row-height": "44px" } })),
    ).toBe(44);
  });

  it("ignores a non-pixel length with one warning", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      expect(resolveThemeRowHeightPx(createTheme({ rowHeight: "3em" }))).toBeUndefined();
      expect(resolveThemeRowHeightPx(createTheme({ rowHeight: "3em" }))).toBeUndefined();
      expect(warn).toHaveBeenCalledTimes(1);
    } finally {
      warn.mockRestore();
    }
  });
});
