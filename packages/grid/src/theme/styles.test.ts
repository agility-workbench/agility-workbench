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

// The armor layer is what stops a host application's blanket `* { ... !important }` reset from
// reaching grid internals — the bug that put a second horizontal scrollbar under the column
// headers. happy-dom parses the `@layer` block but discards its contents, so these rules cannot be
// asserted through the CSSOM the way the rest of the stylesheet is; the checks below run against
// the source text instead. Without them the whole layer could be deleted and every test would
// still pass.
describe("pte-armor layer", () => {
  const layerStart = GRID_STYLES.indexOf("@layer pte-armor");
  const armor = (() => {
    // Walk braces from the layer's opening `{` to find its matching close.
    let depth = 0;
    for (let i = GRID_STYLES.indexOf("{", layerStart); i < GRID_STYLES.length; i++) {
      if (GRID_STYLES[i] === "{") depth++;
      else if (GRID_STYLES[i] === "}" && --depth === 0) return GRID_STYLES.slice(layerStart, i + 1);
    }
    return "";
  })();

  it("is present and closed", () => {
    expect(layerStart).toBeGreaterThan(-1);
    expect(armor).not.toBe("");
  });

  it("arms every scroller the grid hides a native scrollbar on", () => {
    // Each of these mirrors the body's scrollLeft; a visible bar on any of them is a duplicate.
    for (const cls of [
      ".pte-header", ".pte-header-left", ".pte-header-right",
      ".pte-spacer", ".pte-spacer-left", ".pte-spacer-right",
      ".pte-aggregate-leading", ".pte-aggregate-left",
      ".pte-aggregate-center", ".pte-aggregate-right",
      ".pte-scroller-horizontal-container-wrapper",
      ".pte-pinned-rows-leading", ".pte-pinned-rows-left",
      ".pte-pinned-rows-center", ".pte-pinned-rows-right",
    ]) {
      // `[,{]` anchors the match to a whole selector, so `.pte-header` does not match
      // `.pte-header-left` and a selector at the end of its list still counts.
      const selector = new RegExp(`${cls.replace(".", "\\.")}\\s*[,{]`);
      expect(armor, `${cls} missing from the armor layer`).toMatch(selector);
    }
    expect(armor).toContain("scrollbar-width: none !important");
  });

  it("keeps the real scrollers scrollable", () => {
    // The mirror rule above would otherwise be a plausible way to hide these too.
    expect(armor).toMatch(/\.pte-body\s*[,{]/);
    expect(armor).toMatch(/\.pte-scroller-horizontal-spacer\s*[,{]/);
    expect(armor).toContain("scrollbar-width: auto !important");
  });

  it("arms only with !important — an unarmed declaration in a layer loses to unlayered host CSS", () => {
    // Layer precedence is inverted only for important declarations. A normal declaration inside a
    // layer ranks BELOW an unlayered host rule, so it would be weaker here than where it started.
    for (const line of armor.split("\n")) {
      const decl = line.trim();
      if (!decl || decl.startsWith("/*") || decl.startsWith("*") || !decl.endsWith(";")) continue;
      expect(decl, `unarmed declaration in the armor layer: ${decl}`).toContain("!important");
    }
  });
});
