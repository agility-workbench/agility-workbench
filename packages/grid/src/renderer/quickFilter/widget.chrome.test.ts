// @vitest-environment happy-dom
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createGrid } from "../../createGrid";
import { IGridAPI } from "../../interfaces/iGridAPI";

beforeAll(() => {
  (HTMLCanvasElement.prototype as any).getContext = () => ({
    font: "",
    measureText: (text: string) => ({ width: text.length * 7 }),
  });
});

let host: HTMLElement;
let api: IGridAPI;

function mount(quickFilter: Record<string, unknown>): IGridAPI {
  return createGrid(host, {
    rowIdKey: "id",
    columnDefs: [{ colId: "name", key: "name", label: "Name" }],
    rowData: [{ id: "1", name: "Acme Corp" }, { id: "2", name: "Acme Labs" }],
    quickFilter,
  } as any);
}

/** Swap the grid for one configured differently. The afterEach destroys whichever is current. */
function remount(quickFilter: Record<string, unknown>): void {
  api.destroy();
  host.innerHTML = "";
  api = mount(quickFilter);
}

beforeEach(() => {
  document.body.innerHTML = "";
  host = document.createElement("div");
  host.style.height = "400px";
  host.style.width = "800px";
  document.body.appendChild(host);
  api = mount({ mode: "always", debounceMs: 0 });
});

afterEach(() => {
  api.destroy();
});

const field = () => host.querySelector<HTMLElement>(".pte-quick-filter-field")!;
const input = () => host.querySelector<HTMLInputElement>(".pte-quick-filter-input")!;
const wrapper = () => host.querySelector<HTMLElement>(".pte-quick-filter")!;
const classNames = (parent: HTMLElement) =>
  [...parent.children].map(child => child.className.split(" ")[0]);

function type(text: string): void {
  const el = input();
  el.value = text;
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

/**
 * Every rule in the injected stylesheet, flattened, so a rule can be looked up by selector.
 * Selector lists keep the source's line breaks, so both sides are collapsed to single spaces.
 */
function cssRule(selector: string): CSSStyleRule | undefined {
  const flatten = (text: string) => text.replace(/\s+/g, " ").trim();
  const rules = [...document.styleSheets]
    .flatMap(sheet => [...(sheet as CSSStyleSheet).cssRules]) as CSSStyleRule[];
  return rules.find(rule => flatten(rule.selectorText ?? "") === flatten(selector));
}

describe("quick-filter field chrome", () => {
  it("is one box: a label wrapping the icon, the input and the clear button", () => {
    // A <label> is what makes the icon and the padding around the input focus the input on click,
    // natively. happy-dom does not implement label activation, so the click itself is not
    // assertable here — the element type it depends on is.
    expect(field().tagName).toBe("LABEL");
    expect(classNames(field())).toEqual([
      "pte-quick-filter-icon",
      "pte-quick-filter-input",
      "pte-quick-filter-clear",
    ]);
    // Clicks on the glyph belong to the field (i.e. the input), not to the glyph itself.
    expect(getComputedStyle(host.querySelector(".pte-quick-filter-icon")!).pointerEvents)
      .toBe("none");
    expect(getComputedStyle(field()).cursor).toBe("text");
  });

  it("paints its border on the field, never on the input inside it", () => {
    const fieldStyle = getComputedStyle(field());
    expect(fieldStyle.borderTopStyle).toBe("solid");
    expect(fieldStyle.borderTopWidth).toBe("1px");
    // The input contributes no box of its own, so there is nothing to draw a second rectangle.
    const inputStyle = getComputedStyle(input());
    expect(inputStyle.borderTopStyle).toBe("none");
    expect(inputStyle.backgroundColor).toBe("transparent");
  });

  it("declares the keyboard focus ring on the field and suppresses the input's", () => {
    // Asserted against the stylesheet rather than through getComputedStyle: happy-dom's cascade
    // does not resolve `:focus-visible`, so a focused input reports no box-shadow either way. What
    // matters is that exactly one of the two elements is asked to draw a ring — the double ring
    // this replaced came from the generic `.pte-root input:focus-visible` rule reaching the input.
    const focused = ".pte-quick-filter-field:has(.pte-quick-filter-input:focus-visible)";
    // Border and ring share the color so the edge reads as one 2px line, not two.
    expect(cssRule(focused)?.style.borderColor).toBe("var(--pte-focus-ring-color)");
    // The ring is a pseudo-element, and must stay one: as the field's own inset shadow it painted
    // before the field's descendants, so the counter's opaque background and the clear button's
    // hover fill each notched a 1px hole in it.
    const ring = cssRule(`${focused}::after`);
    expect(ring?.style.boxShadow).toBe("inset 0 0 0 1px var(--pte-focus-ring-color)");
    expect(ring?.style.getPropertyValue("inset")).toBe("0");
    expect(cssRule(focused)?.style.boxShadow).toBe("");
    expect(cssRule(".pte-quick-filter-field .pte-quick-filter-input:focus-visible")?.style.boxShadow)
      .toBe("none");
  });

  it("keeps the field the focus box when the input holds focus", () => {
    input().focus();
    expect(document.activeElement).toBe(input());
    // The selector the ring rule uses actually matches with focus inside, so the rule above is not
    // dead code.
    expect(field().matches(":has(.pte-quick-filter-input:focus-visible)")).toBe(true);
  });
});

describe("quick-filter match counter", () => {
  beforeEach(() => {
    remount({ mode: "always", debounceMs: 0, behavior: "find", showBehaviorToggle: true });
  });

  it("sits inside the field, over the input's right end, with the steppers left outside", () => {
    const count = host.querySelector<HTMLElement>(".pte-quick-filter-find-count")!;
    expect(count.parentElement).toBe(field());
    // Before the clear button: the count is content, the "×" is a control on the box's edge.
    expect(classNames(field())).toEqual([
      "pte-quick-filter-icon",
      "pte-quick-filter-input",
      "pte-quick-filter-find-count",
      "pte-quick-filter-clear",
    ]);
    // The steppers are buttons, so they stay on the tinted chrome beside the field.
    expect(host.querySelector(".pte-quick-filter-find-nav")!.parentElement)
      .toBe(host.querySelector(".pte-quick-filter-row"));
    const style = getComputedStyle(count);
    expect(style.position).toBe("absolute");
    // Out of the pointer's way, so a click over the count reaches the input and places a caret.
    expect(style.pointerEvents).toBe("none");
  });

  it("paints a terse count and gives a screen reader the verbose one", () => {
    type("acme");
    const text = host.querySelector<HTMLElement>(".pte-quick-filter-find-count-text")!;
    const sr = host.querySelector<HTMLElement>(".pte-quick-filter-find-count-sr")!;
    expect(text.textContent).toBe("0/2");
    expect(sr.textContent).toBe("2 matches");
    api.findNext();
    expect(text.textContent).toBe("1/2");
    expect(sr.textContent).toBe("Match 1 of 2");
    // The painted half is hidden from AT and the verbose half is never painted, so neither is read
    // twice and "0/2" is not spelled out.
    expect(text.getAttribute("aria-hidden")).toBe("true");
    expect(getComputedStyle(sr).position).toBe("absolute");
    expect(getComputedStyle(sr).width).toBe("1px");
    // One live region wrapping both, announcing only what the sr half says.
    expect(host.querySelector(".pte-quick-filter-find-count")!.getAttribute("aria-live"))
      .toBe("polite");
  });

  it("has no width of its own to give: it is sized, and reserved for, by one variable", () => {
    // Asserted against the stylesheet: happy-dom's cascade does not re-resolve a rule that depends
    // on an ancestor's class, so the mode-conditional halves below cannot be read off
    // getComputedStyle. The class that switches them is asserted in the next test instead.
    expect(cssRule(".pte-quick-filter-find-count")?.style.width)
      .toBe("var(--pte-qf-count-width)");
    expect(cssRule(".pte-quick-filter-find-count")?.style.display).toBe("none");
    expect(cssRule(".pte-quick-filter-finding .pte-quick-filter-find-count")?.style.display)
      .toBe("flex");
    // The input's reserve reads the same variable, so the counter's box and the room left for it
    // cannot drift apart — and a narrow toolbar rung shrinks both by overriding it once.
    expect(cssRule(".pte-quick-filter-finding .pte-quick-filter-input")?.style.paddingRight)
      .toBe("var(--pte-qf-count-width)");
    expect(
      cssRule(".pte-bar-qf-compact .pte-quick-filter-field, .pte-bar-qf-expanded .pte-quick-filter-field")
        ?.style.getPropertyValue("--pte-qf-count-width"),
    ).toBe("38px");
  });

  it("marks the wrapper only while finding, so the count and the reserve come and go together", () => {
    expect(wrapper().classList.contains("pte-quick-filter-finding")).toBe(true);
    api.setQuickFilter("", { behavior: "filter" });
    expect(wrapper().classList.contains("pte-quick-filter-finding")).toBe(false);
    api.setQuickFilter("acme", { behavior: "find" });
    expect(wrapper().classList.contains("pte-quick-filter-finding")).toBe(true);
  });
});
