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

  it("arms the scrollbar colours, still sourced from the theme variables", () => {
    // scrollbar-color is the whole styling vocabulary on a modern engine, so a host's blanket
    // `* { scrollbar-color: ... !important }` does not tint the grid's scrollbars, it repaints them
    // in the host's own chrome colours. Armed — but reading the variables, so the theme API is
    // still the way through.
    expect(armor).toContain(
      "scrollbar-color: var(--pte-scrollbar-thumb-color) var(--pte-scrollbar-track-color) !important",
    );
    // And declared exactly once in the sheet, so the armed copy cannot drift from an unarmed one.
    expect(GRID_STYLES.match(/scrollbar-color:(?!\s*auto)/g)).toHaveLength(1);
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

// A section keeps its horizontal scroll position only for as long as its viewport contributes
// scrollable overflow, and a zero-height box contributes none however wide it is. When a filter
// matches nothing every pooled row goes `display: none`, the viewport collapses, the section's
// scrollWidth falls back to its clientWidth and the browser clamps scrollLeft to 0 — fanning that 0
// out to the header, the aggregate row and the horizontal scrollbar through the sync listener. The
// two declarations below are what hold the column under the user's filter where they left it; both
// read as removable slack, so they are pinned here.
describe("empty-grid horizontal scroll", () => {
  const rule = (selector: string) => {
    const start = GRID_STYLES.indexOf(`\n${selector} {`);
    return start < 0 ? "" : GRID_STYLES.slice(start, GRID_STYLES.indexOf("}", start));
  };

  it("floors every section viewport above zero height", () => {
    const viewports = rule(".pte-viewport-leading,\n.pte-viewport-left,\n.pte-viewport-right,\n.pte-viewport");
    expect(viewports).not.toBe("");
    expect(viewports).toContain("min-height: 1px");
  });

  it("keeps that floor off the vertical axis by pinning overflow-y on the sections", () => {
    // Left to compute from `visible`, the horizontal `auto` would promote it, turning the floor
    // into a scrollable pixel on an empty grid.
    for (const selector of [".pte-spacer", ".pte-spacer-left", ".pte-spacer-right"]) {
      expect(rule(selector), `${selector} must pin overflow-y`).toContain("overflow-y: hidden");
    }
  });

  it("pins overflow-y on the header mirrors too", () => {
    // Same promotion, different symptom: the header never scrolls vertically, so an `auto` it did
    // not ask for is only ever a second scrollbar on an engine that paints one.
    for (const selector of [".pte-header", ".pte-header-left", ".pte-header-right"]) {
      expect(rule(selector), `${selector} must pin overflow-y`).toContain("overflow-y: hidden");
    }
  });
});

// `scrollbar-width: none` hides the mirrors on the engines that have it; everywhere else the legacy
// `::-webkit-scrollbar` sizing rule reaches every scroller under `.pte-root` and paints the mirrors
// a full themed scrollbar unless each is hidden the legacy way too. The gap shipped, on Android
// WebView (no `scrollbar-width` at any version) and on Safari, where the column header carried its
// own horizontal and vertical bars over the body's.
describe("legacy scrollbar hiding", () => {
  it("hides every mirror the legacy way as well as the standard way", () => {
    for (const cls of [
      ".pte-header", ".pte-header-left", ".pte-header-right",
      ".pte-spacer", ".pte-spacer-left", ".pte-spacer-right",
      ".pte-aggregate-leading", ".pte-aggregate-left",
      ".pte-aggregate-center", ".pte-aggregate-right",
      ".pte-scroller-horizontal-container-wrapper",
      ".pte-pinned-rows-leading", ".pte-pinned-rows-left",
      ".pte-pinned-rows-center", ".pte-pinned-rows-right",
    ]) {
      expect(
        GRID_STYLES,
        `${cls} has no ::-webkit-scrollbar rule to hide it on a pre-121 engine`,
      ).toContain(`${cls}::-webkit-scrollbar`);
    }
  });

  it("keeps the legacy hide rule after the legacy sizing rule it has to outrank", () => {
    // `.pte-root *` and a bare `.pte-*` are the same one class of specificity, so the tie is
    // settled by source order alone.
    const sizing = GRID_STYLES.indexOf(".pte-root *::-webkit-scrollbar");
    const hide = GRID_STYLES.indexOf(".pte-header::-webkit-scrollbar");
    expect(sizing).toBeGreaterThan(-1);
    expect(hide).toBeGreaterThan(sizing);
  });

  it("keeps the hide rule OUTSIDE the scrollbar-color @supports guard", () => {
    // The guard asks about `scrollbar-color`; hiding is a `scrollbar-width` question, and Safari
    // shipped the two four majors apart (18.2 vs 26.2). Every Safari in between answers the guard
    // as a legacy engine, so a hide rule tucked inside it would be applied there — but so would the
    // sizing rule it has to beat on Safari, and skipped on 26.2+ where it is merely redundant.
    // Moving it inside is the regression: it makes correctness depend on a proxy that is wrong.
    const guardStart = GRID_STYLES.indexOf("@supports not (scrollbar-color: auto)");
    expect(guardStart).toBeGreaterThan(-1);
    let depth = 0;
    let guardEnd = -1;
    for (let i = GRID_STYLES.indexOf("{", guardStart); i < GRID_STYLES.length; i++) {
      if (GRID_STYLES[i] === "{") depth++;
      else if (GRID_STYLES[i] === "}" && --depth === 0) {
        guardEnd = i;
        break;
      }
    }
    expect(guardEnd).toBeGreaterThan(guardStart);
    expect(GRID_STYLES.indexOf(".pte-header::-webkit-scrollbar")).toBeGreaterThan(guardEnd);
  });
});
