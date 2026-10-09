// @vitest-environment happy-dom
/**
 * FilterMenuCoordinator rebuilds the controller on every open; it is what keeps a tree column's
 * expansion between opens. These tests open a tree column's filter through the coordinator, toggle
 * groups in the rendered list, close, reopen, and read the DOM — the path a user takes.
 */
import { afterEach, describe, expect, it } from "vitest";
import { GridAPI } from "../api/api";
import { GridCore } from "../core/core";
import { ITextMeasurer } from "../interfaces/iTextMeasure";
import { ColumnFilterMenuService } from "./filterMenuService";
import { FilterMenuCoordinator } from "./filterMenuCoordinator";

const measurer: ITextMeasurer = { measure: text => text.length * 7 };

function makeGrid() {
  const core = new GridCore(measurer, { rowIdKey: "id", rowModelType: "clientSide" });
  core.setColumnDefsFromProps([
    { colId: "item", key: "item", label: "Item", filter: "tree", filterParams: { treePathGetter: (v: string) => v.split("/") } },
    { colId: "fixed", key: "fixed", label: "Fixed", filter: "tree", filterParams: { treePathGetter: (v: string) => v.split("/"), treeRememberExpansion: false } },
    // A static list: the menu lists siblings in the order given, not sorted, and ignores the comparator.
    {
      colId: "listed", key: "item", label: "Listed", filter: "tree",
      filterParams: {
        treePathGetter: (v: string) => v.split("/"),
        treeDefaultExpanded: -1,
        filterValues: ["Veg/Root/Carrot", "Fruit/Citrus/Orange", "Fruit/Citrus/Lemon"].map(value => ({ value })),
        comparator: (a: any, b: any) => a.label.localeCompare(b.label),
      },
    },
  ]);
  core.dispatch({ type: "themeFontSet", headerFont: "12px sans-serif", cellFont: "12px sans-serif", reason: "test" });
  core.setRowData([
    { id: "1", item: "Fruit/Citrus/Orange", fixed: "A/B" },
    { id: "2", item: "Veg/Root/Carrot", fixed: "A/C" },
  ]);
  const api = new GridAPI(core);
  const coordinator = new FilterMenuCoordinator(core, new ColumnFilterMenuService(core), api);
  const open = (colId: string) => {
    const col = core.getColumnModel().getByColId(colId)!;
    const menu = coordinator.openFilterMenu({ trigger: "header", targetCol: col } as any);
    document.body.appendChild(menu.contentEl);
    const rows = () => Array.from(menu.contentEl.querySelectorAll<HTMLLabelElement>("label.pte-set-filter-option"));
    const labels = () => rows().map(r => r.querySelector(".pte-set-filter-option-label-text")!.textContent);
    const click = (label: string) => rows().find(r => r.querySelector(".pte-set-filter-option-label-text")!.textContent === label)!
      .querySelector<HTMLElement>(".pte-set-filter-expander")!
      .dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    const close = () => { menu.onClose(); menu.contentEl.remove(); };
    return { rows, labels, click, close };
  };
  return { core, api, open };
}

afterEach(() => { document.body.innerHTML = ""; });

describe("FilterMenuCoordinator remembers tree expansion per column", () => {
  it("reopens the filter as it was left", () => {
    const { open } = makeGrid();
    let menu = open("item");
    expect(menu.labels()).toEqual(["(Select All)", "Fruit", "Veg"]);
    menu.click("Fruit");
    menu.click("Citrus");
    expect(menu.labels()).toEqual(["(Select All)", "Fruit", "Citrus", "Orange", "Veg"]);
    menu.close();

    menu = open("item");
    expect(menu.labels()).toEqual(["(Select All)", "Fruit", "Citrus", "Orange", "Veg"]);
    menu.click("Fruit");
    menu.close();

    menu = open("item");
    expect(menu.labels()).toEqual(["(Select All)", "Fruit", "Veg"]);
    // Citrus stayed open underneath the closed Fruit.
    menu.click("Fruit");
    expect(menu.labels()).toEqual(["(Select All)", "Fruit", "Citrus", "Orange", "Veg"]);
    menu.close();
  });

  it("keeps the expansion through a filter change, and across the grid's filter being cleared", async () => {
    const { api, open } = makeGrid();
    let menu = open("item");
    menu.click("Veg");
    menu.close();
    await api.uncheckSetFilterPath("item", ["Fruit"]);
    api.setFilterModel([]);
    menu = open("item");
    expect(menu.labels()).toEqual(["(Select All)", "Fruit", "Veg", "Root"]);
    menu.close();
  });

  it("remembers each column on its own, and not a column that opted out", () => {
    const { open } = makeGrid();
    let menu = open("fixed");
    menu.click("A");
    expect(menu.labels()).toEqual(["(Select All)", "A", "B", "C"]);
    menu.close();
    menu = open("fixed");
    expect(menu.labels()).toEqual(["(Select All)", "A"]);
    menu.close();

    menu = open("item");
    expect(menu.labels()).toEqual(["(Select All)", "Fruit", "Veg"]);
    menu.close();
  });

  it("lists a static list's siblings in the order given", () => {
    const { open } = makeGrid();
    const menu = open("listed");
    expect(menu.labels()).toEqual(["(Select All)", "Veg", "Root", "Carrot", "Fruit", "Citrus", "Orange", "Lemon"]);
    menu.close();
  });
});
