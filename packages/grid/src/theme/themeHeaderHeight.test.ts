// @vitest-environment happy-dom
/**
 * The theme's `headerHeight` param sizes the header. Header layout is JS-driven, so the param only
 * works by feeding the same number the `headerHeight` grid option does, read once at creation; the
 * grid option wins when both are set, and the level options fall back to the result.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createGrid } from "../createGrid";
import { createTheme, resolveThemeHeaderHeightPx, themeDark, themeLight } from "./theme";

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

const columnDefs = [
  { colId: "grp", label: "Group", children: [{ colId: "name", key: "name", label: "Name" }] },
  { colId: "id", key: "id", label: "ID" },
];
const rowData = [{ id: 1, name: "a" }];

function mount(extra: Record<string, unknown> = {}) {
  return createGrid(host, { rowIdKey: "id", columnDefs, rowData, ...extra });
}

const wrapperHeight = () => host.querySelector<HTMLElement>(".pte-header-wrapper")!.style.height;
const leafCellHeight = () =>
  host.querySelector<HTMLElement>(".pte-hcell-children .pte-hcell")!.style.height;
const renderedVar = () =>
  host.querySelector<HTMLElement>(".pte-root")!.style.getPropertyValue("--pte-rendered-header-height");

describe("theme headerHeight", () => {
  it("sizes the header when no headerHeight grid option is set", () => {
    const api = mount({ theme: themeLight.withParams({ headerHeight: 60 }) });
    expect(api.getCore().getOptions()).toMatchObject({
      headerHeight: 60, leafHeaderHeight: 60, parentHeaderHeight: 60,
    });
    expect(wrapperHeight()).toBe("120px");
    expect(leafCellHeight()).toBe("60px");
    expect(renderedVar()).toBe("120px");
    api.destroy();
  });

  it("loses to an explicit headerHeight grid option", () => {
    const api = mount({ theme: themeLight.withParams({ headerHeight: 60 }), headerHeight: 30 });
    expect(api.getCore().getOptions().headerHeight).toBe(30);
    expect(wrapperHeight()).toBe("60px");
    api.destroy();
  });

  it("is what the level options fall back to", () => {
    const api = mount({ theme: themeLight.withParams({ headerHeight: 50 }), leafHeaderHeight: 40 });
    expect(wrapperHeight()).toBe("90px");
    expect(leafCellHeight()).toBe("40px");
    api.destroy();
  });

  it("falls back to the default when neither sets one", () => {
    const api = mount({ theme: themeLight });
    expect(api.getCore().getOptions().headerHeight).toBe(43);
    expect(wrapperHeight()).toBe("86px");
    api.destroy();
  });

  it("stays the creation-time fallback: a theme swap does not resize the header", () => {
    const api = mount({ theme: themeLight.withParams({ headerHeight: 50 }) });
    api.updateGridOptions({ theme: themeLight.withParams({ headerHeight: 70 }) });
    expect(wrapperHeight()).toBe("100px");
    api.updateGridOptions({ headerHeight: 30 });
    expect(wrapperHeight()).toBe("60px");
    api.updateGridOptions({ headerHeight: undefined });
    expect(wrapperHeight()).toBe("100px");
    api.destroy();
  });

  it("a theme swap leaves the rendered header height variable alone", () => {
    const api = mount({ theme: themeDark });
    expect(renderedVar()).toBe("86px");
    api.updateGridOptions({ theme: themeLight });
    expect(renderedVar()).toBe("86px");
    api.updateGridOptions({ theme: themeDark });
    expect(renderedVar()).toBe("86px");
    api.destroy();
  });
});

describe("resolveThemeHeaderHeightPx", () => {
  it("reads numbers, px strings and the --pte-header-height vars override", () => {
    expect(resolveThemeHeaderHeightPx(undefined)).toBeUndefined();
    expect(resolveThemeHeaderHeightPx(createTheme())).toBeUndefined();
    expect(resolveThemeHeaderHeightPx(themeDark)).toBeUndefined();
    expect(resolveThemeHeaderHeightPx(createTheme({ headerHeight: 36 }))).toBe(36);
    expect(resolveThemeHeaderHeightPx(createTheme({ headerHeight: "38px" }))).toBe(38);
    expect(resolveThemeHeaderHeightPx(createTheme({ headerHeight: "40" }))).toBe(40);
    expect(
      resolveThemeHeaderHeightPx(createTheme({ headerHeight: 36, vars: { "--pte-header-height": "44px" } })),
    ).toBe(44);
  });

  it("does not emit the rendered header height variable", () => {
    const vars = createTheme({ headerHeight: 36 }).toCssVars();
    expect(vars["--pte-header-height"]).toBe("36px");
    expect(vars["--pte-rendered-header-height"]).toBeUndefined();
  });

  it("ignores a non-pixel length with one warning and falls back", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      expect(resolveThemeHeaderHeightPx(createTheme({ headerHeight: "3em" }))).toBeUndefined();
      expect(resolveThemeHeaderHeightPx(createTheme({ headerHeight: "3em" }))).toBeUndefined();
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn.mock.calls[0][0]).toContain("headerHeight");
      const api = mount({ theme: themeLight.withParams({ headerHeight: "3em" }) });
      expect(api.getCore().getOptions().headerHeight).toBe(43);
      expect(warn).toHaveBeenCalledTimes(1);
      api.destroy();
    } finally {
      warn.mockRestore();
    }
  });
});
