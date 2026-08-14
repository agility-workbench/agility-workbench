// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import type { FilterController } from "../../filter/filterMenuController";
import type { FilterPanelSpec } from "../../filter/types";
import type { IGridAPI } from "../../interfaces/iGridAPI";
import { FilterRenderer } from "./filterRenderer";

function setup(closeOnApply: boolean) {
  const apply = vi.fn();
  const clearAll = vi.fn();
  const unsubscribe = vi.fn();
  const controller = {
    apply,
    cancel: vi.fn(),
    clearAll,
    reset: vi.fn(),
    setJoin: vi.fn(),
    setOp: vi.fn(),
    setValue: vi.fn(),
    subscribe: vi.fn(() => unsubscribe),
  } as unknown as FilterController;
  const spec = {
    column: { label: "Name", key: "name" },
    kind: "text",
    params: {
      buttons: ["apply", "clear"],
      closeOnApply,
      filterOptions: [],
    },
  } as unknown as FilterPanelSpec;
  const requestClose = vi.fn();
  const renderer = new FilterRenderer(controller, spec, {} as IGridAPI, requestClose);
  const click = (label: string) => {
    const button = [...renderer.getUi().querySelectorAll<HTMLButtonElement>(".pte-filter-btn")]
      .find(candidate => candidate.innerText === label);
    if (!button) throw new Error(`Missing ${label} button`);
    button.click();
  };
  return { apply, clearAll, click, renderer, requestClose, unsubscribe };
}

describe("FilterRenderer closeOnApply", () => {
  it("requests menu close after the explicit Apply action commits", () => {
    const { apply, click, renderer, requestClose } = setup(true);

    click("apply");

    expect(apply).toHaveBeenCalledOnce();
    expect(requestClose).toHaveBeenCalledOnce();
    expect(apply.mock.invocationCallOrder[0]).toBeLessThan(requestClose.mock.invocationCallOrder[0]);
    renderer.destroy();
  });

  it("keeps the menu open after Apply when closeOnApply is false", () => {
    const { apply, click, renderer, requestClose } = setup(false);

    click("apply");

    expect(apply).toHaveBeenCalledOnce();
    expect(requestClose).not.toHaveBeenCalled();
    renderer.destroy();
  });

  it("does not close for other action buttons", () => {
    const { clearAll, click, renderer, requestClose } = setup(true);

    click("clear");

    expect(clearAll).toHaveBeenCalledOnce();
    expect(requestClose).not.toHaveBeenCalled();
    renderer.destroy();
  });
});
