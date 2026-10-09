// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import type { IGridAPI } from "../../interfaces/iGridAPI";
import type { ISetFilterComponent, SetFilterValueComponentParams } from "./setFilterValueComponent";
import type { FilterPanelSpec, FilterRuntimeState, SetFilterOptions } from "../../filter/types";
import { SetFilterRenderer } from "./setFilterRenderer";

class RecordingValueComponent implements ISetFilterComponent<SetFilterValueComponentParams> {
  static created = 0;
  static refreshed = 0;
  static destroyed = 0;
  static lastCount: number | undefined;
  private readonly el = document.createElement("span");

  constructor() { RecordingValueComponent.created++; }
  init(params: SetFilterValueComponentParams): void { this.render(params); }
  getGui(): HTMLElement { return this.el; }
  refresh(params: SetFilterValueComponentParams): boolean {
    RecordingValueComponent.refreshed++;
    this.render(params);
    return true;
  }
  destroy(): void { RecordingValueComponent.destroyed++; }
  private render(params: SetFilterValueComponentParams): void {
    RecordingValueComponent.lastCount = params.count;
    this.el.textContent = `${params.valueFormatted}:${params.suffix}`;
  }
}

function runtimeState(options: SetFilterOptions[]): FilterRuntimeState {
  return {
    join: "and",
    conditionOrder: ["c1"],
    draft: { c1: { type: "notIn" as any, values: [] } },
    ui: { c1: { loading: false, options } },
  };
}

function options(): SetFilterOptions[] {
  return [
    { type: "select_all", key: "__select_all__", label: "(Select All)", raw: "__select_all__", hidden: false },
    { type: "blanks", key: "__blanks__", label: "(Blanks)", raw: null, hidden: false },
    { type: "value", key: "EMEA", label: "EMEA", raw: "EMEA", hidden: false },
  ];
}

function setup() {
  RecordingValueComponent.created = 0;
  RecordingValueComponent.refreshed = 0;
  RecordingValueComponent.destroyed = 0;
  RecordingValueComponent.lastCount = undefined;
  const toggleSetValue = vi.fn();
  const controller = {
    filterOptions: vi.fn(),
    applyMiniFilter: vi.fn(),
    // Every option reads checked; sized generously since the rendered list varies per test.
    getSetOptionStates: vi.fn(() => Array.from({ length: 8 }, () => ({ selected: true, indeterminate: false }))),
    toggleSetValue,
  } as any;
  const spec = {
    column: { colId: "region", label: "Region" },
    params: {
      valueComponent: RecordingValueComponent,
      valueComponentParams: { suffix: "custom" },
      selectAllComponent: ({ label }: { label: string }) => `All: ${label}`,
      // A configured nullish component is intentionally empty rather than falling back to text.
      blanksComponent: () => undefined,
    },
  } as unknown as FilterPanelSpec;
  const renderer = new SetFilterRenderer(controller, spec, {} as IGridAPI);
  return { renderer, toggleSetValue };
}

describe("SetFilterRenderer value components", () => {
  it("replaces label content while retaining grid-owned checkboxes and accessible names", () => {
    const { renderer, toggleSetValue } = setup();
    renderer.renderState(runtimeState(options()));
    const ui = renderer.getUi();
    const labels = ui.querySelectorAll(".pte-set-filter-option-label");
    const checkboxes = ui.querySelectorAll<HTMLInputElement>('input[type="checkbox"]');

    expect(labels[0].textContent).toBe("All: (Select All)");
    expect(labels[1].textContent).toBe("");
    expect(labels[2].textContent).toBe("EMEA:custom");
    expect(checkboxes).toHaveLength(3);
    expect(checkboxes[2].getAttribute("aria-label")).toBe("EMEA");

    checkboxes[2].checked = false;
    checkboxes[2].dispatchEvent(new Event("change"));
    expect(toggleSetValue).toHaveBeenCalledWith(0, 2, false);

    renderer.destroy();
  });

  it("refreshes keyed component instances and destroys them when the filter closes", () => {
    const { renderer } = setup();
    const state = runtimeState(options());
    renderer.renderState(state);
    expect(RecordingValueComponent.created).toBe(1);

    renderer.renderState(state);
    expect(RecordingValueComponent.created).toBe(1);
    expect(RecordingValueComponent.refreshed).toBe(1);

    renderer.destroy();
    expect(RecordingValueComponent.destroyed).toBe(1);
  });

  it("renders built-in counts and supplies the count to custom value components", () => {
    const { renderer } = setup();
    const counted = options().map(option => option.type === "value" ? { ...option, count: 3 } : option);
    renderer.renderState(runtimeState(counted));
    expect(RecordingValueComponent.lastCount).toBe(3);

    (renderer as any).spec.params.valueComponent = undefined;
    renderer.renderState(runtimeState(counted));
    const count = renderer.getUi().querySelector(".pte-set-filter-option-count")!;
    expect(count.textContent).toBe("3");
    // The unit after the count is screen-reader-only text, and both describe the checkbox:
    // its name stays the value's label, its description reads "3 rows".
    expect(count.parentElement?.textContent).toBe("EMEA3 rows");
    const unit = count.nextElementSibling!;
    expect(unit.className).toBe("pte-sr-only");
    expect(count.id).toMatch(/^pte-set-filter-\d+-count-2$/);
    const checkbox = count.closest("label")!.querySelector("input")!;
    expect(checkbox.getAttribute("aria-label")).toBe("EMEA");
    expect(checkbox.getAttribute("aria-describedby")).toBe(`${count.id} ${unit.id}`);
    renderer.destroy();
  });

  it("uses built-in text only when the corresponding component option is absent", () => {
    const { renderer } = setup();
    (renderer as any).spec.params.selectAllComponent = undefined;
    renderer.renderState(runtimeState(options()));
    const labels = renderer.getUi().querySelectorAll(".pte-set-filter-option-label");
    expect(labels[0].textContent).toBe("(Select All)");
    expect(labels[1].textContent).toBe("");
    renderer.destroy();
  });
});

describe("SetFilterRenderer option-list keyboard", () => {
  it("the flat list is a labelled group whose rows focus their checkbox; arrows continue from a clicked row, Enter clicks the row, Space is the checkbox's own", () => {
    const { renderer } = setup();
    renderer.renderState(runtimeState(options()));
    const ui = renderer.getUi();
    document.body.appendChild(ui);
    const list = ui.querySelector(".pte-set-filter-options")!;
    expect(list.getAttribute("role")).toBe("group");
    expect(list.getAttribute("aria-label")).toBe("Filter values");
    const rows = Array.from(ui.querySelectorAll<HTMLLabelElement>("label.pte-set-filter-option"));
    const key = (init: Partial<KeyboardEventInit>) => {
      const e = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init });
      ui.dispatchEvent(e);
      return e;
    };

    // A mouse click leaves focus on the checkbox; the arrows start from that row.
    rows[1].querySelector("input")!.focus();
    key({ key: "ArrowDown" });
    expect(document.activeElement).toBe(rows[2].querySelector("input"));
    expect(rows[2].classList.contains("focused")).toBe(true);
    expect(rows[1].classList.contains("focused")).toBe(false);

    // Enter toggles through the row, a label click; Space is left to the checkbox itself.
    const clicked = vi.fn();
    rows[2].addEventListener("click", clicked);
    expect(key({ key: "Enter" }).defaultPrevented).toBe(true);
    expect(clicked).toHaveBeenCalled();
    clicked.mockClear();
    expect(key({ key: " " }).defaultPrevented).toBe(false);
    expect(clicked).not.toHaveBeenCalled();

    renderer.destroy();
    ui.remove();
  });

  it("claims Tab to enter the option list but leaves Shift+Tab to move focus out", () => {
    const { renderer } = setup();
    renderer.renderState(runtimeState(options()));
    const ui = renderer.getUi();
    document.body.appendChild(ui);
    const firstRow = ui.querySelector<HTMLElement>("label.pte-set-filter-option")!;
    // Flat layout: focus goes to the row's native checkbox, a named control; the row is outlined.
    const firstOption = firstRow.querySelector("input")!;

    const key = (init: Partial<KeyboardEventInit>) => ui.dispatchEvent(
      new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init }),
    );

    // Shift+Tab is the user leaving backwards; capturing it here used to drag focus onto the
    // first option instead, trapping them in the list.
    key({ key: "Tab", shiftKey: true });
    expect(document.activeElement).not.toBe(firstOption);

    key({ key: "Tab" });
    expect(document.activeElement).toBe(firstOption);
    expect(firstRow.classList.contains("focused")).toBe(true);

    // A modified arrow is not a list gesture either.
    key({ key: "ArrowDown", ctrlKey: true });
    expect(document.activeElement).toBe(firstOption);

    key({ key: "ArrowDown" });
    expect(document.activeElement).not.toBe(firstOption);

    renderer.destroy();
    ui.remove();
  });
});
