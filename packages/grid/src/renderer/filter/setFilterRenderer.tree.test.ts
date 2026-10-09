// @vitest-environment happy-dom
/**
 * SetFilterRenderer in the tree layout: rows come from `visibleSetOptions` (closed groups hide their
 * subtree, a typed mini filter holds every group open), each row is indented by level and exposed
 * as a treeitem, a chevron opens a group without touching its checkbox, and Left/Right follow the
 * tree keyboard pattern while Home/End and Up/Down walk the visible rows.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import type { IGridAPI } from "../../interfaces/iGridAPI";
import type { FilterPanelSpec, FilterRuntimeState, SetFilterOptions } from "../../filter/types";
import { buildSetOptions } from "../../filter/setFilterCore";
import { buildSetFilterTree, defaultSegmentFormatter, SetFilterTreeSpec } from "../../filter/setFilterTree";
import { SetFilterRenderer } from "./setFilterRenderer";

const slashPath = (value: any): any[] | null => (typeof value === "string" ? value.split("/") : null);
const TREE: SetFilterTreeSpec = { pathOf: slashPath, formatSegment: defaultSegmentFormatter, defaultExpanded: 0 };

function treeOptions(values: any[], defaultExpanded = 0): SetFilterOptions[] {
  return buildSetFilterTree(buildSetOptions(values), { ...TREE, defaultExpanded });
}

function runtimeState(options: SetFilterOptions[], extra: Partial<FilterRuntimeState["ui"][string]> = {}): FilterRuntimeState {
  return {
    join: "and",
    conditionOrder: ["c1"],
    draft: { c1: { type: "notIn" as any, values: [] } },
    ui: { c1: { loading: false, options, ...extra } },
  };
}

function setup(tree: SetFilterTreeSpec | undefined = TREE) {
  const toggleSetValue = vi.fn();
  const setSetGroupExpanded = vi.fn();
  // States are aligned with the options the renderer was last given: groups read mixed, the rest checked.
  let lastOptions: SetFilterOptions[] = [];
  const controller = {
    filterOptions: vi.fn(),
    applyMiniFilter: vi.fn(),
    getSetOptionStates: vi.fn(() => lastOptions.map(o =>
      o.type === "group" ? { selected: false, indeterminate: true } : { selected: true, indeterminate: false })),
    toggleSetValue,
    setSetGroupExpanded,
  } as any;
  const spec = {
    column: { colId: "item", label: "Item" },
    params: {},
    tree,
  } as unknown as FilterPanelSpec;
  const renderer = new SetFilterRenderer(controller, spec, {} as IGridAPI);
  const renderState = renderer.renderState.bind(renderer);
  renderer.renderState = (state: FilterRuntimeState) => {
    lastOptions = state.ui["c1"]?.options ?? [];
    renderState(state);
  };
  document.body.appendChild(renderer.getUi());
  return { renderer, toggleSetValue, setSetGroupExpanded };
}

const rowsOf = (renderer: SetFilterRenderer) =>
  Array.from(renderer.getUi().querySelectorAll<HTMLLabelElement>("label.pte-set-filter-option"));
const labelsOf = (renderer: SetFilterRenderer) =>
  rowsOf(renderer).map(row => row.querySelector(".pte-set-filter-option-label-text")!.textContent);

function keydown(renderer: SetFilterRenderer, key: string): void {
  renderer.getUi().dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
}

const FRUIT = ["Fruit/Citrus/Orange", "Veg/Root/Carrot", "Fruit/Citrus/Lemon"];

afterEach(() => { document.body.innerHTML = ""; });

describe("SetFilterRenderer tree layout", () => {
  it("renders closed groups as roots with chevrons, levels, and tree roles", () => {
    const { renderer } = setup();
    renderer.renderState(runtimeState(treeOptions(FRUIT)));

    const list = renderer.getUi().querySelector(".pte-set-filter-options")!;
    expect(list.getAttribute("role")).toBe("tree");
    expect(labelsOf(renderer)).toEqual(["(Select All)", "Fruit", "Veg"]);

    const [selectAll, fruit] = rowsOf(renderer);
    expect(selectAll.getAttribute("role")).toBe("treeitem");
    expect(selectAll.getAttribute("aria-level")).toBe("1");
    expect(selectAll.getAttribute("aria-checked")).toBe("true");
    // Select All is the root: its chevron stands for every group, closed while any group is.
    expect(selectAll.classList.contains("pte-set-filter-option-root")).toBe(true);
    expect(selectAll.querySelector(".pte-set-filter-expander")).not.toBeNull();
    expect(selectAll.getAttribute("aria-expanded")).toBe("false");

    expect(fruit.classList.contains("pte-set-filter-option-group")).toBe(true);
    expect(fruit.getAttribute("aria-expanded")).toBe("false");
    expect(fruit.getAttribute("aria-checked")).toBe("mixed");
    expect(fruit.querySelector(".pte-set-filter-expander-icon")!.classList.contains("icon-group-collapsed")).toBe(true);
    expect(fruit.querySelector<HTMLInputElement>("input")!.indeterminate).toBe(true);
    expect(fruit.style.getPropertyValue("--pte-set-filter-level")).toBe("0");
    renderer.destroy();
  });

  it("renders the subtree of an open group, indented, and a mini filter holds every group open", () => {
    const { renderer } = setup();
    const options = treeOptions(FRUIT);
    options.find(o => o.label === "Fruit")!.expanded = true;
    renderer.renderState(runtimeState(options));
    expect(labelsOf(renderer)).toEqual(["(Select All)", "Fruit", "Citrus", "Veg"]);
    const citrus = rowsOf(renderer)[2];
    expect(citrus.getAttribute("aria-level")).toBe("2");
    expect(citrus.style.getPropertyValue("--pte-set-filter-level")).toBe("1");
    expect(citrus.dataset.idx).toBe(String(options.findIndex(o => o.label === "Citrus")));

    renderer.renderState(runtimeState(options, { miniFilter: "x" }));
    expect(labelsOf(renderer)).toEqual(["(Select All)", "Fruit", "Citrus", "Lemon", "Orange", "Veg", "Root", "Carrot"]);
    expect(rowsOf(renderer)[5].getAttribute("aria-expanded")).toBe("true");
    renderer.destroy();
  });

  it("the chevron asks the controller to open the group and leaves the checkbox alone", () => {
    const { renderer, toggleSetValue, setSetGroupExpanded } = setup();
    const options = treeOptions(FRUIT);
    renderer.renderState(runtimeState(options));
    const fruit = rowsOf(renderer)[1];
    const checkbox = fruit.querySelector<HTMLInputElement>("input")!;
    const checkedBefore = checkbox.checked;

    fruit.querySelector<HTMLElement>(".pte-set-filter-expander")!.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    expect(setSetGroupExpanded).toHaveBeenCalledWith(0, options.findIndex(o => o.label === "Fruit"), true);
    expect(toggleSetValue).not.toHaveBeenCalled();
    expect(checkbox.checked).toBe(checkedBefore);

    // The group's own checkbox still toggles through the controller, by the group's index.
    checkbox.checked = true;
    checkbox.dispatchEvent(new Event("change"));
    expect(toggleSetValue).toHaveBeenCalledWith(0, options.findIndex(o => o.label === "Fruit"), true);
    renderer.destroy();
  });

  it("Right opens a closed group or steps into an open one; Left closes it or goes to the parent", () => {
    const { renderer, setSetGroupExpanded } = setup();
    const options = treeOptions(FRUIT);
    options.find(o => o.label === "Fruit")!.expanded = true;
    renderer.renderState(runtimeState(options));
    const rows = rowsOf(renderer);
    const fruitIdx = options.findIndex(o => o.label === "Fruit");
    const citrusIdx = options.findIndex(o => o.label === "Citrus");

    rows[2].focus(); // Citrus, closed
    keydown(renderer, "ArrowRight");
    expect(setSetGroupExpanded).toHaveBeenLastCalledWith(0, citrusIdx, true);

    keydown(renderer, "ArrowLeft"); // closed: go to the parent
    expect(document.activeElement).toBe(rows[1]);
    expect(rows[1].classList.contains("focused")).toBe(true);

    keydown(renderer, "ArrowRight"); // Fruit is open: step into it
    expect(document.activeElement).toBe(rows[2]);

    rows[1].focus();
    keydown(renderer, "ArrowLeft"); // open: close it
    expect(setSetGroupExpanded).toHaveBeenLastCalledWith(0, fruitIdx, false);
    renderer.destroy();
  });

  it("Home and End jump to the first and last visible row; Down and Up walk them", () => {
    const { renderer } = setup();
    renderer.renderState(runtimeState(treeOptions(FRUIT)));
    const rows = rowsOf(renderer);
    rows[1].focus();
    keydown(renderer, "End");
    expect(document.activeElement).toBe(rows[2]);
    keydown(renderer, "Home");
    expect(document.activeElement).toBe(rows[0]);
    keydown(renderer, "ArrowDown");
    expect(document.activeElement).toBe(rows[1]);
    keydown(renderer, "ArrowUp");
    expect(document.activeElement).toBe(rows[0]);
    renderer.destroy();
  });

  it("the Select All chevron opens or closes every group, by mouse and by Left/Right", () => {
    const { renderer, toggleSetValue, setSetGroupExpanded } = setup();
    const options = treeOptions(FRUIT);
    renderer.renderState(runtimeState(options));
    const selectAll = rowsOf(renderer)[0];
    const checkbox = selectAll.querySelector<HTMLInputElement>("input")!;

    selectAll.querySelector<HTMLElement>(".pte-set-filter-expander")!.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    expect(setSetGroupExpanded).toHaveBeenLastCalledWith(0, 0, true);
    expect(toggleSetValue).not.toHaveBeenCalled();
    expect(checkbox.checked).toBe(true);

    selectAll.focus();
    keydown(renderer, "ArrowRight");
    expect(setSetGroupExpanded).toHaveBeenLastCalledWith(0, 0, true);

    // With only some groups open the root paints the mixed glyph, reads expanded to AT, and both a
    // click and Right open the rest while Left closes everything.
    options.find(o => o.label === "Veg")!.expanded = true;
    renderer.renderState(runtimeState(options));
    let root = rowsOf(renderer)[0];
    expect(root.dataset.expansion).toBe("some");
    expect(root.getAttribute("aria-expanded")).toBe("true");
    const mixedIcon = root.querySelector(".pte-set-filter-expander-icon")!;
    expect(mixedIcon.classList.contains("icon-group-mixed")).toBe(true);
    expect(mixedIcon.classList.contains("icon-group-collapsed")).toBe(false);
    root.querySelector<HTMLElement>(".pte-set-filter-expander")!.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    expect(setSetGroupExpanded).toHaveBeenLastCalledWith(0, 0, true);
    root.focus();
    keydown(renderer, "ArrowRight");
    expect(setSetGroupExpanded).toHaveBeenLastCalledWith(0, 0, true);
    keydown(renderer, "ArrowLeft");
    expect(setSetGroupExpanded).toHaveBeenLastCalledWith(0, 0, false);

    // Once every group is open the root reads all, Right steps into the tree, and Left closes everything.
    for (const o of options) if (o.type === "group") o.expanded = true;
    renderer.renderState(runtimeState(options));
    const rows = rowsOf(renderer);
    root = rows[0];
    expect(root.dataset.expansion).toBe("all");
    expect(root.getAttribute("aria-expanded")).toBe("true");
    expect(root.querySelector(".pte-set-filter-expander-icon")!.classList.contains("icon-group-expanded")).toBe(true);
    expect(root.querySelector(".icon-group-mixed")).toBeNull();
    root.focus();
    keydown(renderer, "ArrowRight");
    expect(document.activeElement).toBe(rows[1]);
    root.focus();
    keydown(renderer, "ArrowLeft");
    expect(setSetGroupExpanded).toHaveBeenLastCalledWith(0, 0, false);
    renderer.destroy();
  });

  it("a groupComponent owns a group's label text while the grid keeps the chevron and checkbox", () => {
    const seen: any[] = [];
    const { renderer, setSetGroupExpanded } = setup();
    (renderer as any).spec.params.groupComponent = (params: any) => {
      seen.push(params);
      return `${params.label} [${params.level}:${params.path.join(">")}:${params.segment}:${params.expanded ? "open" : "closed"}:${params.count ?? "-"}:${params.tag}]`;
    };
    (renderer as any).spec.params.groupComponentParams = { tag: "extra" };
    (renderer as any).spec.params.valueComponent = () => "leaf";

    const options = treeOptions(FRUIT);
    options.find(o => o.label === "Fruit")!.expanded = true;
    options.find(o => o.label === "Citrus")!.count = 2;
    renderer.renderState(runtimeState(options));
    const rows = rowsOf(renderer);
    const labelOf = (row: HTMLElement) => row.querySelector(".pte-set-filter-option-label")!.textContent;
    expect(labelOf(rows[1])).toBe("Fruit [0:Fruit:Fruit:open:-:extra]");
    expect(labelOf(rows[2])).toBe("Citrus [1:Fruit>Citrus:Citrus:closed:2:extra]");
    expect(rows[1].querySelector(".pte-set-filter-expander")).not.toBeNull();
    expect(rows[1].querySelector<HTMLInputElement>("input")!.indeterminate).toBe(true);
    // Select All keeps its built-in label: it is not a group.
    expect(labelOf(rows[0])).toBe("(Select All)");
    expect(seen[0].colDef).toBe((renderer as any).spec.column);

    // Opening Citrus refreshes its component with the new state rather than recreating it.
    seen.length = 0;
    options.find(o => o.label === "Citrus")!.expanded = true;
    renderer.renderState(runtimeState(options));
    expect(labelOf(rowsOf(renderer)[2])).toBe("Citrus [1:Fruit>Citrus:Citrus:open:2:extra]");
    expect(rowsOf(renderer)[3].querySelector(".pte-set-filter-option-label")!.textContent).toBe("leaf");
    expect(setSetGroupExpanded).not.toHaveBeenCalled();
    renderer.destroy();
  });

  it("re-renders with focus on the row the controller selected", () => {
    const { renderer } = setup();
    const options = treeOptions(FRUIT);
    options.find(o => o.label === "Fruit")!.expanded = true;
    renderer.renderState(runtimeState(options, { selectedIdx: options.findIndex(o => o.label === "Fruit") }));
    expect(document.activeElement).toBe(rowsOf(renderer)[1]);
    renderer.destroy();
  });

  it("a tree column whose values have no paths renders the flat list: no roles, no spacers, Left/Right jump", () => {
    const { renderer } = setup({ ...TREE, pathOf: () => null });
    renderer.renderState(runtimeState(buildSetFilterTree(buildSetOptions(["b", "a"]), { ...TREE, pathOf: () => null })));
    const list = renderer.getUi().querySelector(".pte-set-filter-options")!;
    expect(list.getAttribute("role")).toBeNull();
    expect(labelsOf(renderer)).toEqual(["(Select All)", "a", "b"]);
    const rows = rowsOf(renderer);
    expect(rows[0].getAttribute("role")).toBeNull();
    expect(rows[0].querySelector(".pte-set-filter-expander-spacer")).toBeNull();

    rows[1].focus();
    keydown(renderer, "ArrowRight");
    expect(document.activeElement).toBe(rows[2]);
    keydown(renderer, "ArrowLeft");
    expect(document.activeElement).toBe(rows[0]);
    renderer.destroy();
  });

  it("the flat layout is untouched: no tree spec means no roles even with hidden rows", () => {
    const { renderer } = setup(undefined);
    const options = buildSetOptions(["apple", "banana"]);
    options[2].hidden = true;
    renderer.renderState(runtimeState(options, { miniFilter: "app" }));
    expect(labelsOf(renderer)).toEqual(["(Select All)", "apple"]);
    expect(renderer.getUi().querySelector(".pte-set-filter-options")!.getAttribute("role")).toBeNull();
    renderer.destroy();
  });
});
