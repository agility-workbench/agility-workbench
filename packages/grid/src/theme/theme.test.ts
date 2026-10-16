import { afterEach, describe, expect, it, vi } from "vitest";
import { createTheme, themeDark } from "./theme";

const FIND_VARS = [
  "--pte-find-match-bg-color",
  "--pte-find-match-active-bg-color",
  "--pte-find-match-active-border-color",
] as const;

function findVars(params: Parameters<typeof createTheme>[0]) {
  const vars = createTheme(params).toCssVars();
  return Object.fromEntries(FIND_VARS.map(name => [name, vars[name]]));
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("theme semantic fan-out", () => {
  it("assigns one accent color to every accent variable", () => {
    const vars = createTheme({ accentColor: "#123456" }).toCssVars();
    expect(vars["--pte-selected-border-color"]).toBe("#123456");
    expect(vars["--pte-checkbox-accent-color"]).toBe("#123456");
  });
});

describe("theme findMatchColor", () => {
  it("derives the two tints and keeps the outline as authored", () => {
    expect(findVars({ findMatchColor: "#38bdf8" })).toEqual({
      "--pte-find-match-bg-color": "rgba(56, 189, 248, 0.35)",
      "--pte-find-match-active-bg-color": "rgba(56, 189, 248, 0.65)",
      "--pte-find-match-active-border-color": "#38bdf8",
    });
  });

  it("reads short hex, hex with alpha, and rgb()/rgba() in either syntax", () => {
    expect(findVars({ findMatchColor: "#0f0" })["--pte-find-match-bg-color"])
      .toBe("rgba(0, 255, 0, 0.35)");
    // An alpha in the input multiplies through, so a translucent color stays translucent.
    expect(findVars({ findMatchColor: "#00ff0080" })["--pte-find-match-active-bg-color"])
      .toBe("rgba(0, 255, 0, 0.326)");
    expect(findVars({ findMatchColor: "rgb(250, 204, 21)" })["--pte-find-match-bg-color"])
      .toBe("rgba(250, 204, 21, 0.35)");
    expect(findVars({ findMatchColor: "rgba(250, 204, 21, 0.5)" })["--pte-find-match-bg-color"])
      .toBe("rgba(250, 204, 21, 0.175)");
    expect(findVars({ findMatchColor: "rgb(250 204 21 / 50%)" })["--pte-find-match-bg-color"])
      .toBe("rgba(250, 204, 21, 0.175)");
  });

  it("ignores a color whose channels it cannot read, warning once per value", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    // A named color and a color space the parser deliberately does not cover: the stylesheet's own
    // defaults must survive rather than be replaced by a guess.
    expect(findVars({ findMatchColor: "rebeccapurple" })).toEqual({
      "--pte-find-match-bg-color": undefined,
      "--pte-find-match-active-bg-color": undefined,
      "--pte-find-match-active-border-color": undefined,
    });
    expect(findVars({ findMatchColor: "oklch(0.7 0.15 200)" })["--pte-find-match-bg-color"])
      .toBeUndefined();
    expect(warn).toHaveBeenCalledTimes(2);

    // Same value again: already reported, so a per-render resolve cannot spam the console.
    createTheme({ findMatchColor: "rebeccapurple" }).toCssVars();
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it("loses to the atomic vars escape hatch, like every other semantic param", () => {
    const vars = themeDark.withParams({
      findMatchColor: "#38bdf8",
      vars: { "--pte-find-match-bg-color": "rgba(1, 2, 3, 0.5)" },
    }).toCssVars();
    expect(vars["--pte-find-match-bg-color"]).toBe("rgba(1, 2, 3, 0.5)");
    // The two it did not override still come from the semantic param.
    expect(vars["--pte-find-match-active-border-color"]).toBe("#38bdf8");
  });
});

describe("theme length params", () => {
  it("gives a bare number a px unit on every length param", () => {
    const vars = createTheme({
      actionFramePopoverWidth: 420,
      actionFramePopoverRadius: 6,
      tooltipMaxWidth: 240,
      tooltipRadius: 4,
      scrollbarSize: 8,
      paginationFooterHeight: 48,
      columnPanelWidth: 320,
    }).toCssVars();
    expect(vars["--pte-action-frame-popover-width"]).toBe("420px");
    expect(vars["--pte-action-frame-popover-radius"]).toBe("6px");
    expect(vars["--pte-tooltip-max-width"]).toBe("240px");
    expect(vars["--pte-tooltip-radius"]).toBe("4px");
    expect(vars["--pte-scrollbar-size"]).toBe("8px");
    expect(vars["--pte-pagination-footer-height"]).toBe("48px");
    expect(vars["--pte-column-panel-width"]).toBe("320px");
  });

  it("passes a string length through untouched", () => {
    const vars = createTheme({ tooltipMaxWidth: "20rem", actionFramePopoverWidth: "min(90vw, 420px)" }).toCssVars();
    expect(vars["--pte-tooltip-max-width"]).toBe("20rem");
    expect(vars["--pte-action-frame-popover-width"]).toBe("min(90vw, 420px)");
  });
});

describe("withParams on a vars-based theme", () => {
  it("lets a semantic param override the variables the base theme set through vars", () => {
    const vars = themeDark.withParams({ actionFramePopoverBackgroundColor: "#123456", tooltipBackgroundColor: "#654321" }).toCssVars();
    expect(vars["--pte-action-frame-popover-bg"]).toBe("#123456");
    expect(vars["--pte-tooltip-bg"]).toBe("#654321");
    // Everything else of the dark theme is still there, and the base is untouched.
    expect(vars["--pte-root-bg-color"]).toBe("#0f172a");
    expect(themeDark.toCssVars()["--pte-action-frame-popover-bg"]).toBe("#1e293b");
  });

  it("keeps raw vars in the same override above the semantic param", () => {
    const vars = themeDark.withParams({
      tooltipBackgroundColor: "#654321",
      vars: { "--pte-tooltip-bg": "#abcdef" },
    }).toCssVars();
    expect(vars["--pte-tooltip-bg"]).toBe("#abcdef");
  });

  it("applies the same rule to the derived params", () => {
    const vars = themeDark.withParams({ spacing: 20 }).toCssVars();
    expect(vars["--pte-cell-padding-left"]).toBe("20px");
    expect(vars["--pte-cell-padding-top"]).toBe("20px");
  });
});
