// @vitest-environment happy-dom
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createGrid } from "../../createGrid";
import { IGridAPI } from "../../interfaces/iGridAPI";
import { ColumnType } from "../../interfaces/column";
import { themeLight } from "../../theme/theme";

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
  { colId: "name", key: "name", label: "Name" },
  { colId: "region", key: "region", label: "Region" },
  { colId: "amount", key: "amount", label: "Amount", type: ColumnType.NUMBER },
];

const rowData = [
  { id: 1, name: "Acme Corp", region: "West", amount: 10 },
  { id: 2, name: "Acme Labs", region: "East", amount: 20 },
  { id: 3, name: "Globex", region: "West", amount: 30 },
];

function mount(quickFilter: unknown = { mode: "always", debounceMs: 0, behavior: "find" }) {
  return createGrid(host, { rowIdKey: "id", columnDefs, rowData, quickFilter } as any);
}

/** The text of every cell currently carrying the find-match class. */
function matchedCells(): string[] {
  return [...host.querySelectorAll(".pte-cell.pte-find-match")].map(c => c.textContent ?? "");
}

function activeCells(): string[] {
  return [...host.querySelectorAll(".pte-cell.pte-find-match-active")].map(c => c.textContent ?? "");
}

function input(): HTMLInputElement {
  return host.querySelector<HTMLInputElement>(".pte-quick-filter-input")!;
}

function type(text: string): void {
  const el = input();
  el.value = text;
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

function press(key: string, init: KeyboardEventInit = {}): void {
  input().dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, ...init }));
}

function counter(): string {
  return host.querySelector(".pte-quick-filter-find-count")?.textContent ?? "";
}

function findNav(): HTMLElement {
  return host.querySelector<HTMLElement>(".pte-quick-filter-find-nav")!;
}

/**
 * The options popover's match-mode row. Addressed by the select it contains, NOT by
 * `.pte-quick-filter-option-row` — the behavior row is one of those too, and matches first.
 */
function matchModeRow(): HTMLElement {
  const select = host.querySelector<HTMLElement>(
    ".pte-quick-filter-option-select:not(.pte-quick-filter-behavior-select):not(.pte-quick-filter-anchor-select)",
  )!;
  return select.closest<HTMLElement>(".pte-quick-filter-option-row")!;
}

function behaviorSelect(): HTMLSelectElement {
  return host.querySelector<HTMLSelectElement>(".pte-quick-filter-behavior-select")!;
}

/**
 * Every visible sign of which behavior the widget believes is in force.
 *
 * Deliberately reads the COMPUTED display, not `el.hidden`: an author `display` rule outranks the
 * user agent's `[hidden] { display: none }`, so the property can be set on an element that is still
 * on screen — which is exactly the bug an earlier version of this test missed.
 */
function widgetBehaviorUI() {
  const shown = (el: HTMLElement) => getComputedStyle(el).display !== "none";
  return {
    placeholder: input().placeholder,
    navShown: shown(findNav()),
    matchModeShown: shown(matchModeRow()),
    select: behaviorSelect().value,
  };
}

function rowCount(api: IGridAPI): number {
  return api.getCore().getRowModel().getViewCount();
}

describe("quick-filter find rendering", () => {
  it("tints matching cells and leaves every row in place", () => {
    const api = mount();
    type("acme");
    expect(matchedCells()).toEqual(["Acme Corp", "Acme Labs"]);
    expect(rowCount(api)).toBe(3);
    api.destroy();
  });

  it("marks only the active match, and moves it with Enter", () => {
    const api = mount();
    type("west");
    expect(matchedCells()).toEqual(["West", "West"]);
    expect(activeCells()).toEqual([]);
    expect(counter()).toBe("2 matches");

    press("Enter");
    expect(activeCells()).toEqual(["West"]);
    expect(counter()).toBe("1 of 2");

    press("Enter");
    expect(counter()).toBe("2 of 2");
    // Both cells read "West"; the active one is the second row's, so the match class count holds
    // while the active class stays a single cell.
    expect(activeCells()).toHaveLength(1);
    expect(matchedCells()).toHaveLength(2);

    press("Enter", { shiftKey: true });
    expect(counter()).toBe("1 of 2");
    api.destroy();
  });

  it("reports an empty search with no matches", () => {
    const api = mount();
    type("nowhere");
    expect(counter()).toBe("No matches");
    expect(matchedCells()).toEqual([]);
    const next = host.querySelector<HTMLButtonElement>(".pte-quick-filter-find-step:last-child")!;
    expect(next.disabled).toBe(true);
    api.destroy();
  });

  it("clears the highlights when the search is emptied", () => {
    const api = mount();
    type("acme");
    expect(matchedCells()).toHaveLength(2);
    type("");
    expect(matchedCells()).toEqual([]);
    expect(counter()).toBe("");
    api.destroy();
  });

  it("matches the formatted value the user sees, not the raw one", () => {
    const api = createGrid(host, {
      rowIdKey: "id",
      columnDefs: [
        { colId: "name", key: "name", label: "Name" },
        {
          colId: "amount",
          key: "amount",
          label: "Amount",
          type: ColumnType.NUMBER,
          valueFormatter: ({ value }: any) => `$${value},00`,
        },
      ],
      rowData,
      quickFilter: { mode: "always", debounceMs: 0, behavior: "find" },
    } as any);
    type("$20,00");
    expect(matchedCells()).toEqual(["$20,00"]);
    api.destroy();
  });

  it("shows no find affordances while filtering, and no match-mode control while finding", () => {
    const api = mount({ mode: "always", debounceMs: 0, showBehaviorToggle: true });
    expect(widgetBehaviorUI()).toEqual({
      placeholder: "Search…", navShown: false, matchModeShown: true, select: "filter",
    });

    // Filtering: the rows narrow and nothing is highlighted.
    type("acme");
    expect(rowCount(api)).toBe(2);
    expect(matchedCells()).toEqual([]);

    behaviorSelect().value = "find";
    behaviorSelect().dispatchEvent(new Event("change", { bubbles: true }));

    expect(rowCount(api)).toBe(3);
    expect(matchedCells()).toEqual(["Acme Corp", "Acme Labs"]);
    // The match-mode control stays: all three of its shapes mean something while finding.
    expect(widgetBehaviorUI()).toEqual({
      placeholder: "Find…", navShown: true, matchModeShown: true, select: "find",
    });
    api.destroy();
  });

  it("follows a behavior change made through the grid option, not just through the widget", () => {
    // The reconfigure path builds a replacement widget and re-commits the behavior to the core
    // afterwards, so the widget cannot decide it is in sync from its own state: every affordance
    // here was a flip behind until it re-synced from the core.
    const api = mount({ mode: "always", debounceMs: 0, showBehaviorToggle: true });
    const options = (behavior: "filter" | "find") =>
      ({ mode: "always", debounceMs: 0, showBehaviorToggle: true, behavior }) as any;

    api.updateGridOptions({ quickFilter: options("find") });
    expect(widgetBehaviorUI()).toEqual({
      placeholder: "Find…", navShown: true, matchModeShown: true, select: "find",
    });

    type("acme");
    expect(rowCount(api)).toBe(3);
    expect(matchedCells()).toEqual(["Acme Corp", "Acme Labs"]);
    expect(counter()).toBe("2 matches");

    // …and back, with the search text surviving and filtering again.
    api.updateGridOptions({ quickFilter: options("filter") });
    expect(widgetBehaviorUI()).toEqual({
      placeholder: "Search…", navShown: false, matchModeShown: true, select: "filter",
    });
    expect(input().value).toBe("acme");
    expect(rowCount(api)).toBe(2);
    expect(matchedCells()).toEqual([]);
    api.destroy();
  });

  it("offers all three match modes while finding, and switching one re-highlights", () => {
    const api = mount();
    const modeSelect = matchModeRow().querySelector<HTMLSelectElement>("select")!;
    expect([...modeSelect.options].map(o => o.value)).toEqual(["multiTerm", "substring", "wholeCell"]);

    type("west");
    expect(matchedCells()).toEqual(["West", "West"]);

    // "west" is the whole of both Region cells, so whole-cell keeps them…
    modeSelect.value = "wholeCell";
    modeSelect.dispatchEvent(new Event("change", { bubbles: true }));
    expect(matchedCells()).toEqual(["West", "West"]);

    // …but a partial word is no longer a match.
    type("wes");
    expect(matchedCells()).toEqual([]);
    expect(counter()).toBe("No matches");

    // Cell-scoped multiTerm: both words must be in the one cell being highlighted.
    modeSelect.value = "multiTerm";
    modeSelect.dispatchEvent(new Event("change", { bubbles: true }));
    type("corp acme");
    expect(matchedCells()).toEqual(["Acme Corp"]);
    api.destroy();
  });

  it("follows a behavior change made through the API", () => {
    const api = mount({ mode: "always", debounceMs: 0, showBehaviorToggle: true });
    api.setQuickFilter("acme", { behavior: "find" });
    expect(widgetBehaviorUI()).toEqual({
      placeholder: "Find…", navShown: true, matchModeShown: true, select: "find",
    });
    expect(input().value).toBe("acme");
    expect(rowCount(api)).toBe(3);
    api.destroy();
  });

  it("offers no behavior toggle unless the option asks for one", () => {
    const api = mount({ mode: "always", debounceMs: 0, behavior: "find" });
    expect(host.querySelector(".pte-quick-filter-behavior-select")).toBeNull();
    // Forced find: typing highlights, and nothing the user can do makes it filter.
    type("acme");
    expect(rowCount(api)).toBe(3);
    api.destroy();
  });

  it("keeps highlighting after the widget is dismissed with clearOnClose off", () => {
    const api = mount({ mode: "onDemand", debounceMs: 0, behavior: "find", clearOnClose: false });
    api.getCore().dispatch({ type: "quickFilterSet", text: "acme", behavior: "find" } as any);
    expect(matchedCells()).toHaveLength(2);
    expect(host.querySelector<HTMLElement>(".pte-quick-filter-pill")!.hidden).toBe(false);
    api.destroy();
  });

  it("re-tints live when the theme changes, without disturbing the search", () => {
    // Highlights are painted through CSS variables on the grid root, so a theme change repaints
    // them through the cascade: no remount, no cell re-render, and the find state is untouched.
    const api = createGrid(host, {
      rowIdKey: "id",
      columnDefs,
      rowData,
      quickFilter: { mode: "always", debounceMs: 0, behavior: "find" },
      theme: themeLight.withParams({ findMatchColor: "#38bdf8" }),
    } as any);
    type("acme");
    api.findNext();

    const root = host.querySelector<HTMLElement>(".pte-root")!;
    const activeCell = host.querySelector<HTMLElement>(".pte-find-match-active")!;
    expect(root.style.getPropertyValue("--pte-find-match-bg-color")).toBe("rgba(56, 189, 248, 0.35)");
    expect(getComputedStyle(activeCell).backgroundColor).toBe("rgba(56, 189, 248, 0.65)");

    api.updateGridOptions({
      theme: themeLight.withParams({ findMatchColor: "rgb(250, 204, 21)" }),
    } as any);

    expect(root.style.getPropertyValue("--pte-find-match-bg-color")).toBe("rgba(250, 204, 21, 0.35)");
    expect(getComputedStyle(activeCell).backgroundColor).toBe("rgba(250, 204, 21, 0.65)");
    // The same cell element, still the active match, on the same grid.
    expect(host.querySelector(".pte-find-match-active")).toBe(activeCell);
    expect(api.getFindState()).toMatchObject({ matchCount: 2, activeIndex: 1, text: "acme" });

    // Dropping the theme takes the override off the root, so the stylesheet's own default tint is
    // what paints again (the playgrounds' "reset color" path).
    api.updateGridOptions({ theme: undefined } as any);
    expect(root.style.getPropertyValue("--pte-find-match-bg-color")).toBe("");
    expect(getComputedStyle(activeCell).backgroundColor).toBe("rgba(250, 204, 21, 0.75)");
    api.destroy();
  });

  it("exposes the find state and navigation on the API", () => {
    const api = mount();
    api.setQuickFilter("west");
    expect(api.getFindState()).toMatchObject({
      behavior: "find",
      available: true,
      matchCount: 2,
      activeIndex: 0,
    });
    const match = api.findNext()!;
    expect(match.colId).toBe("region");
    expect(api.getFindState().activeIndex).toBe(1);
    api.destroy();
  });
});
