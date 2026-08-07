// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { GRID_STYLES } from "./styles.generated";

// The theme variable block is declared on `:root, :host, .pte-theme-light`.
// `:host` is what lets the variables apply when the stylesheet is scoped to a
// shadow tree — `:root` matches the document element, which is not part of one.
//
// The failure mode these tests guard is silent and total: an invalid selector
// anywhere in a selector list drops the whole rule, so losing the block would
// leave every --pte-* variable unset and the grid rendering with no colours,
// borders or sizing at all.
describe("theme variable block", () => {
  it("declares the variables for document, shadow-tree and explicit-class contexts", () => {
    const block = GRID_STYLES.slice(GRID_STYLES.indexOf(":root"));
    const selectorList = block.slice(0, block.indexOf("{"));

    expect(selectorList).toContain(":root");
    expect(selectorList).toContain(":host");
    expect(selectorList).toContain(".pte-theme-light");
  });

  it("still resolves the variables in a plain document", () => {
    const style = document.createElement("style");
    style.textContent = GRID_STYLES;
    document.head.appendChild(style);

    const computed = getComputedStyle(document.documentElement);
    expect(computed.getPropertyValue("--pte-font-size").trim()).toBe("14px");
    expect(computed.getPropertyValue("--pte-border-color").trim()).toBe("#e5e7eb");

    style.remove();
  });
});
