// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { Column } from "../../column/column";
import { FilterController } from "../../filter/filterMenuController";
import { ColumnFilterMenuService } from "../../filter/filterMenuService";
import type { IGridCore } from "../../interfaces";
import { ColDef, ColumnType } from "../../interfaces/column";
import { FilterItem, FilterType } from "../../interfaces/filter";
import { BasicFilterRenderer } from "./basicFilterRenderer";

/** A live (no Apply button, no debounce) filter panel over the real service, controller, and renderer. */
function mount(colDef: ColDef) {
  const core = { getOptions: () => ({ filterDebounceMs: 0 }) } as unknown as IGridCore;
  const column = new Column(colDef);
  const spec = new ColumnFilterMenuService(core).buildFilterMenu({ trigger: "api", targetCol: column });
  const applied: (FilterItem | null)[] = [];
  const controller = new FilterController(spec, null, {
    applyModel: (_col, model) => applied.push(model),
    getAllRows: vi.fn(),
  });
  const renderer = new BasicFilterRenderer(controller, spec);
  controller.subscribe(state => renderer.renderState(state));
  const ui = renderer.getUi();
  const typeSelect = () => ui.querySelector<HTMLSelectElement>("select.pte-filter-select:not(.pte-filter-value-select)")!;
  const setOp = (op: FilterType) => {
    typeSelect().value = op;
    typeSelect().dispatchEvent(new Event("change"));
  };
  const valueControls = () => [...ui.querySelectorAll<HTMLInputElement | HTMLSelectElement>("[data-filter-value]")];
  const type = (el: HTMLInputElement | HTMLSelectElement, value: string) => {
    el.value = value;
    el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? "change" : "input"));
  };
  const last = () => applied[applied.length - 1];
  return { ui, setOp, valueControls, type, last, typeSelect };
}

describe("BasicFilterRenderer range inputs", () => {
  it.each([FilterType.IN_RANGE, FilterType.NOT_IN_RANGE])("%s writes each input to its own operand", op => {
    const panel = mount({ key: "n", label: "N", type: ColumnType.NUMBER });
    panel.setOp(op);
    const inputs = panel.valueControls();
    expect(inputs).toHaveLength(2);

    panel.type(inputs[0], "10");
    panel.type(panel.valueControls()[1], "20");

    expect(panel.last()?.filters).toEqual([{ type: op, values: ["10", "20"] }]);
    expect(panel.valueControls().map(input => input.value)).toEqual(["10", "20"]);
  });
});

describe("BasicFilterRenderer boolean filter", () => {
  it.each([
    ["a BOOLEAN column", { key: "b", label: "B", type: ColumnType.BOOLEAN } as ColDef],
    ["filter: \"boolean\"", { key: "b", label: "B", type: ColumnType.STRING, filter: "boolean" } as ColDef],
  ])("%s gets an Any / True / False select and equality operators", (_label, colDef) => {
    const panel = mount(colDef);
    const [control] = panel.valueControls();
    expect(control).toBeInstanceOf(HTMLSelectElement);
    expect([...(control as HTMLSelectElement).options].map(o => o.textContent)).toEqual(["Any", "True", "False"]);
    expect([...panel.typeSelect().options].map(o => o.value))
      .toEqual([FilterType.EQ, FilterType.NEQ, FilterType.IS_BLANK, FilterType.IS_NOT_BLANK]);

    panel.type(control, "false");
    expect(panel.last()?.filters).toEqual([{ type: FilterType.EQ, values: ["false"] }]);

    panel.type(panel.valueControls()[0], "");
    expect(panel.last()).toBeNull();
  });
});

describe("BasicFilterRenderer dropdown filter", () => {
  it("lists the static filterValues in a select", () => {
    const panel = mount({
      key: "status", label: "Status", type: ColumnType.STRING, filter: "dropdown",
      filterParams: { filterValues: ["Open", { value: "Closed" }] },
    });
    const [control] = panel.valueControls();
    expect(control).toBeInstanceOf(HTMLSelectElement);
    expect([...(control as HTMLSelectElement).options].map(o => o.value)).toEqual(["", "Open", "Closed"]);

    panel.type(control, "Closed");
    expect(panel.last()?.filters).toEqual([{ type: FilterType.EQ, values: ["Closed"] }]);
  });

  it("falls back to a text box without a static list", () => {
    const panel = mount({ key: "status", label: "Status", type: ColumnType.STRING, filter: "dropdown" });
    const [control] = panel.valueControls();
    expect(control).toBeInstanceOf(HTMLInputElement);
    expect((control as HTMLInputElement).type).toBe("text");
  });
});

describe("BasicFilterRenderer input types", () => {
  it("uses a date input for date columns and a number input for number columns", () => {
    expect((mount({ key: "d", label: "D", type: ColumnType.DATE }).valueControls()[0] as HTMLInputElement).type).toBe("date");
    expect((mount({ key: "n", label: "N", type: ColumnType.NUMBER }).valueControls()[0] as HTMLInputElement).type).toBe("number");
  });
});
