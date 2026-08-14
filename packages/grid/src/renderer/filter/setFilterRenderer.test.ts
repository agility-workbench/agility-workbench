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
    getSetOptionState: vi.fn(() => ({ selected: true, indeterminate: false })),
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
    const count = renderer.getUi().querySelector(".pte-set-filter-option-count");
    expect(count?.textContent).toBe("3");
    expect(count?.parentElement?.textContent).toBe("EMEA3");
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
