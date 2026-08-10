// @vitest-environment happy-dom

import { describe, expect, it } from "vitest";
import { createTheme } from "../theme/theme";
import { ThemeRenderer } from "./themeRenderer";

describe("ThemeRenderer", () => {
  it("reconciles theme variables on the root and external targets", () => {
    const root = document.createElement("div");
    const external = document.createElement("div");
    const renderer = new ThemeRenderer(root);

    renderer.registerTarget(external);
    renderer.setTheme(createTheme({ accentColor: "#123456" }));

    expect(root.style.getPropertyValue("--pte-checkbox-accent-color")).toBe("#123456");
    expect(external.style.getPropertyValue("--pte-checkbox-accent-color")).toBe("#123456");

    renderer.setTheme();

    expect(root.style.getPropertyValue("--pte-checkbox-accent-color")).toBe("");
    expect(external.style.getPropertyValue("--pte-checkbox-accent-color")).toBe("");
  });
});
