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
