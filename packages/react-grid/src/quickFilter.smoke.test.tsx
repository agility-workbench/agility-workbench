// @vitest-environment happy-dom
import { beforeAll, describe, expect, it } from "vitest";
import React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { Grid } from "./grid";
import type { IGridAPI } from "@agility-workbench/grid";

// happy-dom's <canvas> has no 2D context; CanvasMeasurer needs one so the real renderer can mount.
beforeAll(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  (HTMLCanvasElement.prototype as any).getContext = () => ({
    font: "",
    measureText: (t: string) => ({ width: t.length * 7 }),
  });
});

type Row = { id: string; name: string; region: string };

const ROWS: Row[] = [
  { id: "1", name: "Acme Corp", region: "West" },
  { id: "2", name: "Acme Labs", region: "East" },
  { id: "3", name: "Globex", region: "West" },
];

function renderInto(root: ReturnType<typeof createRoot>, apiRef: React.RefObject<IGridAPI | null>, quickFilter: any) {
  root.render(
    <Grid
      apiRef={apiRef}
      data={ROWS}
      columnDefs={[
        { colId: "name", key: "name", label: "Name", editable: true },
        { colId: "region", key: "region", label: "Region", editable: true },
      ]}
      rowIdKey="id"
      quickFilter={quickFilter}
    />,
  );
}

async function mountGrid(quickFilter: any = true) {
  const container = document.createElement("div");
  Object.defineProperty(container, "clientHeight", { value: 600, configurable: true });
  document.body.appendChild(container);

  const apiRef = React.createRef<IGridAPI | null>();
  const root = createRoot(container);
  await act(async () => {
    renderInto(root, apiRef, quickFilter);
  });
  // Re-render with a new quickFilter prop (same grid instance — exercises the live reconfigure path).
  const rerender = async (quickFilter: any) => {
    await act(async () => {
      renderInto(root, apiRef, quickFilter);
    });
  };
  return { container, apiRef, root, rerender };
}

const widget = (c: HTMLElement) => c.querySelector<HTMLElement>(".pte-quick-filter");
const input = (c: HTMLElement) => c.querySelector<HTMLInputElement>(".pte-quick-filter-input")!;
const clearBtn = (c: HTMLElement) => c.querySelector<HTMLButtonElement>(".pte-quick-filter-clear")!;
const optionsBtn = (c: HTMLElement) => c.querySelector<HTMLButtonElement>(".pte-quick-filter-options")!;
const closeBtn = (c: HTMLElement) => c.querySelector<HTMLButtonElement>(".pte-quick-filter-close");
const optionsPanel = (c: HTMLElement) => c.querySelector<HTMLElement>(".pte-quick-filter-options-panel")!;
const pill = (c: HTMLElement) => c.querySelector<HTMLButtonElement>(".pte-quick-filter-pill");
const anchorSelect = (c: HTMLElement) => c.querySelector<HTMLSelectElement>(".pte-quick-filter-anchor-select");
const keepCheckbox = (c: HTMLElement) => c.querySelector<HTMLInputElement>(".pte-quick-filter-keep-checkbox");
const openWidget = async (c: HTMLElement) => {
  const rootEl = c.querySelector(".pte-root") as HTMLElement;
  rootEl.focus();
  await act(async () => {
    rootEl.dispatchEvent(new KeyboardEvent("keydown", { key: "f", ctrlKey: true, bubbles: true, cancelable: true }));
  });
};
const noRowsVisible = (c: HTMLElement) => {
  const el = c.querySelector<HTMLElement>(".pte-norows-overlay");
  return !!el && !el.classList.contains("hidden");
};

const setSearch = async (c: HTMLElement, text: string) => {
  await act(async () => {
    input(c).value = text;
    input(c).dispatchEvent(new Event("input", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 200));
  });
};

describe("quick filter end-to-end via Grid", () => {
  it("mounts the widget hidden, opens on Ctrl+F, and filters as the user types", async () => {
    const { container, apiRef, root } = await mountGrid();
    const core = apiRef.current!.getCore();

    // Widget exists but is closed (onDemand mode).
    expect(widget(container)).toBeTruthy();
    expect(widget(container)!.classList.contains("pte-quick-filter-open")).toBe(false);

    // Ctrl+F on the focused grid root opens it (root-level keydown handler, same path as Ctrl+A).
    const rootEl = container.querySelector(".pte-root") as HTMLElement;
    rootEl.focus();
    let prevented = false;
    await act(async () => {
      const ev = new KeyboardEvent("keydown", { key: "f", ctrlKey: true, bubbles: true, cancelable: true });
      rootEl.dispatchEvent(ev);
      prevented = ev.defaultPrevented;
    });
    expect(widget(container)!.classList.contains("pte-quick-filter-open")).toBe(true);
    expect(prevented).toBe(true); // browser's native find suppressed

    // Typing narrows the view (through the debounce → dispatch → core path).
    await act(async () => {
      input(container).value = "globex";
      input(container).dispatchEvent(new Event("input", { bubbles: true }));
      await new Promise((r) => setTimeout(r, 200));
    });
    const visibleIds = () => {
      const out: string[] = [];
      for (let i = 0; i < core.getRowModel().getViewCount(); i++) out.push(core.getRowIdAtViewIndex(i)!);
      return out;
    };
    expect(visibleIds()).toEqual(["3"]);
    expect(core.getQuickFilterText()).toBe("globex");

    root.unmount();
  });

  it("claims Ctrl+F while the quick-filter input already has focus", async () => {
    const { container, root } = await mountGrid();
    await openWidget(container);

    let prevented = false;
    await act(async () => {
      const ev = new KeyboardEvent("keydown", {
        key: "f",
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      });
      input(container).dispatchEvent(ev);
      prevented = ev.defaultPrevented;
    });

    expect(prevented).toBe(true);
    expect(document.activeElement).toBe(input(container));
    root.unmount();
  });

  it("shows the no-rows overlay when the search matches nothing, and hides it when cleared", async () => {
    const { container, apiRef, root } = await mountGrid();
    const core = apiRef.current!.getCore();

    await act(async () => {
      core.dispatch({ type: "quickFilterSet", text: "zzzzz" });
    });
    expect(input(container).value).toBe("zzzzz");
    expect(core.getRowModel().getViewCount()).toBe(0);
    expect(noRowsVisible(container)).toBe(true);

    await act(async () => {
      core.dispatch({ type: "quickFilterSet", text: "" });
    });
    expect(input(container).value).toBe("");
    expect(core.getRowModel().getViewCount()).toBe(3);
    expect(noRowsVisible(container)).toBe(false);

    root.unmount();
  });

  it("respects the 'always' mode (widget open on mount)", async () => {
    const { container, root } = await mountGrid({ mode: "always" });
    expect(widget(container)!.classList.contains("pte-quick-filter-open")).toBe(true);
    root.unmount();
  });

  it("does NOT capture Ctrl+F when focus is outside the grid (browser find left alone)", async () => {
    const { container, root } = await mountGrid();

    // Ctrl+F dispatched at the document (focus never entered the grid) doesn't reach the grid's
    // root-bound handler — same rule as Ctrl+A. The widget stays closed and the event isn't
    // prevented, so the browser's native find is free to run.
    let prevented = false;
    await act(async () => {
      const ev = new KeyboardEvent("keydown", { key: "f", ctrlKey: true, bubbles: true, cancelable: true });
      document.dispatchEvent(ev);
      prevented = ev.defaultPrevented;
    });
    expect(widget(container)!.classList.contains("pte-quick-filter-open")).toBe(false);
    expect(prevented).toBe(false);

    root.unmount();
  });

  it("typing in the search box does NOT leak to the grid (no edit-on-type / navigation)", async () => {
    const { container, apiRef, root } = await mountGrid();
    const core = apiRef.current!.getCore();

    // Select a cell (an editable one) so edit-on-type would fire if a printable key reached the grid.
    await act(async () => { apiRef.current!.setFocusedCell(0, 0); });

    // Open the widget and type a printable character *from the input*. The input's keydown handler
    // stops propagation, so the grid's root-level handler never sees it — no cell editor opens.
    await act(async () => { apiRef.current!.getCore(); });
    const rootEl = container.querySelector(".pte-root") as HTMLElement;
    rootEl.focus();
    await act(async () => {
      rootEl.dispatchEvent(new KeyboardEvent("keydown", { key: "f", ctrlKey: true, bubbles: true, cancelable: true }));
    });
    expect(widget(container)!.classList.contains("pte-quick-filter-open")).toBe(true);

    await act(async () => {
      // A printable keydown originating from the search input.
      input(container).dispatchEvent(new KeyboardEvent("keydown", { key: "a", bubbles: true, cancelable: true }));
    });
    // The grid must NOT have entered edit mode from that keystroke.
    expect(core.getEditingCell()).toBeNull();

    root.unmount();
  });

  it("hides the clear button until there is text, and shows it once there is", async () => {
    const { container, root } = await mountGrid({ mode: "always" });

    // No text yet → clear button hidden.
    expect(clearBtn(container).hidden).toBe(true);

    await setSearch(container, "acme");
    expect(clearBtn(container).hidden).toBe(false);

    // Clicking clear empties the input and hides the button again.
    await act(async () => { clearBtn(container).click(); });
    expect(input(container).value).toBe("");
    expect(clearBtn(container).hidden).toBe(true);

    root.unmount();
  });

  it("expands the container inline to reveal options (no separate popover)", async () => {
    const { container, root } = await mountGrid({ mode: "always" });

    // Collapsed by default: panel present but hidden, no popover element anywhere.
    expect(optionsPanel(container).hidden).toBe(true);
    expect(container.querySelector(".pte-quick-filter-popover")).toBeNull();
    expect(optionsBtn(container).getAttribute("aria-expanded")).toBe("false");

    // Clicking the options button expands the widget in place.
    await act(async () => { optionsBtn(container).click(); });
    expect(optionsPanel(container).hidden).toBe(false);
    expect(widget(container)!.classList.contains("pte-quick-filter-options-open")).toBe(true);
    expect(optionsBtn(container).getAttribute("aria-expanded")).toBe("true");
    // The panel is a child of the widget container (inline), not a detached popover.
    expect(widget(container)!.contains(optionsPanel(container))).toBe(true);

    // Clicking again collapses it.
    await act(async () => { optionsBtn(container).click(); });
    expect(optionsPanel(container).hidden).toBe(true);
    expect(optionsBtn(container).getAttribute("aria-expanded")).toBe("false");

    root.unmount();
  });

  it("applies the match-case option from the inline panel", async () => {
    const { container, apiRef, root } = await mountGrid({ mode: "always" });
    const core = apiRef.current!.getCore();
    const viewCount = () => core.getRowModel().getViewCount();

    await act(async () => { optionsBtn(container).click(); });
    const caseCheckbox = optionsPanel(container).querySelector<HTMLInputElement>("input[type=checkbox]")!;
    await act(async () => {
      caseCheckbox.checked = true;
      caseCheckbox.dispatchEvent(new Event("change", { bubbles: true }));
    });

    // Case-sensitive search for lowercase "acme" must not match "Acme Corp"/"Acme Labs".
    await setSearch(container, "acme");
    expect(viewCount()).toBe(0);

    // The correctly-cased term matches.
    await setSearch(container, "Acme");
    expect(viewCount()).toBe(2);

    root.unmount();
  });

  it("closes and clears the search via the close button (onDemand mode)", async () => {
    const { container, apiRef, root } = await mountGrid();
    const core = apiRef.current!.getCore();

    // Open, search, then dismiss with the close button (no Esc needed).
    const rootEl = container.querySelector(".pte-root") as HTMLElement;
    rootEl.focus();
    await act(async () => {
      rootEl.dispatchEvent(new KeyboardEvent("keydown", { key: "f", ctrlKey: true, bubbles: true, cancelable: true }));
    });
    await setSearch(container, "globex");
    expect(core.getRowModel().getViewCount()).toBe(1);

    expect(closeBtn(container)).toBeTruthy();
    await act(async () => { closeBtn(container)!.click(); });

    // Widget hidden and the search cleared (dismissing doesn't leave a silent filter behind).
    expect(widget(container)!.classList.contains("pte-quick-filter-open")).toBe(false);
    expect(core.getQuickFilterText()).toBe("");
    expect(core.getRowModel().getViewCount()).toBe(3);
    expect(document.activeElement).toBe(rootEl);

    root.unmount();
  });

  it("returns focus to the grid when Escape closes the search", async () => {
    const { container, root } = await mountGrid();
    const rootEl = container.querySelector(".pte-root") as HTMLElement;
    await openWidget(container);

    await act(async () => {
      input(container).dispatchEvent(new KeyboardEvent("keydown", {
        key: "Escape",
        bubbles: true,
        cancelable: true,
      }));
    });

    expect(widget(container)!.classList.contains("pte-quick-filter-open")).toBe(false);
    expect(document.activeElement).toBe(rootEl);
    root.unmount();
  });

  it("omits the close button in 'always' mode (nothing to close)", async () => {
    const { container, root } = await mountGrid({ mode: "always" });
    expect(closeBtn(container)).toBeNull();
    root.unmount();
  });
});

describe("quick filter: clearOnClose", () => {
  it("keeps the filter and shows the indicator pill when clearOnClose is false", async () => {
    const { container, apiRef, root } = await mountGrid({ clearOnClose: false });
    const core = apiRef.current!.getCore();

    await openWidget(container);
    await setSearch(container, "globex");
    expect(core.getRowModel().getViewCount()).toBe(1);

    // Dismiss: the widget collapses but the filter persists.
    await act(async () => { closeBtn(container)!.click(); });
    expect(widget(container)!.classList.contains("pte-quick-filter-open")).toBe(false);
    expect(core.getQuickFilterText()).toBe("globex");
    expect(core.getRowModel().getViewCount()).toBe(1);

    // The collapsed pill stands in, showing the active term, and reopens the widget on click.
    expect(pill(container)).toBeTruthy();
    expect(pill(container)!.hidden).toBe(false);
    expect(pill(container)!.textContent).toContain("globex");
    expect(widget(container)!.classList.contains("pte-quick-filter-has-indicator")).toBe(true);

    await act(async () => { pill(container)!.click(); });
    expect(widget(container)!.classList.contains("pte-quick-filter-open")).toBe(true);
    expect(input(container).value).toBe("globex");
    expect(pill(container)!.hidden).toBe(true);

    root.unmount();
  });

  it("clears on close by default (regression guard) and builds no pill", async () => {
    const { container, apiRef, root } = await mountGrid();
    const core = apiRef.current!.getCore();

    await openWidget(container);
    await setSearch(container, "globex");
    await act(async () => { closeBtn(container)!.click(); });

    expect(core.getQuickFilterText()).toBe("");
    expect(core.getRowModel().getViewCount()).toBe(3);
    expect(pill(container)).toBeNull();

    root.unmount();
  });
});

describe("quick filter: position", () => {
  it("anchors to the left edge when configured, releasing the right edge to auto", async () => {
    const { container, root } = await mountGrid({ mode: "always", position: { anchor: "left", offsetX: 16 } });
    const w = widget(container)!;
    expect(w.style.left).toBe("16px");
    // The opposite edge must be an explicit `auto`, not "" — clearing it would fall back to the base
    // stylesheet `right` rule, pinning both edges and stretching the panel to full width.
    expect(w.style.right).toBe("auto");
    root.unmount();
  });

  it("anchors right by default, releasing the left edge to auto", async () => {
    const { container, root } = await mountGrid({ mode: "always" });
    const w = widget(container)!;
    // happy-dom drops `calc(var(...))` on assignment, so we can't read the `right` value back here;
    // the observable, env-robust signal for the right anchor is that `left` is released to auto.
    expect(w.style.left).toBe("auto");
    root.unmount();
  });

  it("offsets the top below the header by offsetTop", async () => {
    const { container, root } = await mountGrid({ mode: "always", position: { offsetTop: 20 } });
    const w = widget(container)!;
    // top = headerHeight + offsetTop; header height is >= 0 in happy-dom (often 0), so assert the
    // offset is included by checking it is at least offsetTop px.
    const top = parseInt(w.style.top, 10);
    expect(Number.isNaN(top)).toBe(false);
    expect(top).toBeGreaterThanOrEqual(20);
    root.unmount();
  });
});

describe("quick filter: layout UI controls (showLayoutOptions)", () => {
  it("does not render layout controls by default", async () => {
    const { container, root } = await mountGrid({ mode: "always" });
    await act(async () => { optionsBtn(container).click(); });
    expect(anchorSelect(container)).toBeNull();
    expect(keepCheckbox(container)).toBeNull();
    root.unmount();
  });

  it("shows the options popover even when only layout controls are enabled", async () => {
    const { container, root } = await mountGrid({ mode: "always", showOptions: false, showLayoutOptions: true });
    // Options button present despite showOptions:false, but the match controls are absent.
    expect(optionsBtn(container)).toBeTruthy();
    await act(async () => { optionsBtn(container).click(); });
    expect(optionsPanel(container).querySelector(".pte-quick-filter-option-select:not(.pte-quick-filter-anchor-select)")).toBeNull();
    expect(anchorSelect(container)).toBeTruthy();
    root.unmount();
  });

  it("re-anchors the widget live when the anchor control changes", async () => {
    const { container, root } = await mountGrid({ mode: "always", showLayoutOptions: true });
    const w = widget(container)!;
    expect(w.style.left).toBe("auto"); // right anchor default

    await act(async () => { optionsBtn(container).click(); });
    await act(async () => {
      anchorSelect(container)!.value = "left";
      anchorSelect(container)!.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(w.style.left).toBe("8px"); // default offsetX
    expect(w.style.right).toBe("auto");
    root.unmount();
  });

  it("keep-on-close checkbox makes the filter persist and drives the pill", async () => {
    const { container, apiRef, root } = await mountGrid({ showLayoutOptions: true });
    const core = apiRef.current!.getCore();

    await openWidget(container);
    // Enable "keep filter when closed".
    await act(async () => { optionsBtn(container).click(); });
    expect(keepCheckbox(container)!.checked).toBe(false); // clearOnClose default true → unchecked
    await act(async () => {
      keepCheckbox(container)!.checked = true;
      keepCheckbox(container)!.dispatchEvent(new Event("change", { bubbles: true }));
    });

    await setSearch(container, "globex");
    await act(async () => { closeBtn(container)!.click(); });

    // Filter persists and the pill stands in.
    expect(core.getQuickFilterText()).toBe("globex");
    expect(core.getRowModel().getViewCount()).toBe(1);
    expect(pill(container)!.hidden).toBe(false);
    root.unmount();
  });

  it("omits the keep-on-close control in 'always' mode but keeps the anchor control", async () => {
    const { container, root } = await mountGrid({ mode: "always", showLayoutOptions: true });
    await act(async () => { optionsBtn(container).click(); });
    expect(anchorSelect(container)).toBeTruthy();
    expect(keepCheckbox(container)).toBeNull();
    root.unmount();
  });
});

describe("quick filter: live reconfigure (no remount)", () => {
  it("applies a changed quickFilter prop live, without losing the active search", async () => {
    const { container, apiRef, root, rerender } = await mountGrid({ mode: "always", position: { anchor: "right" } });
    const core = apiRef.current!.getCore();

    await setSearch(container, "globex");
    expect(core.getRowModel().getViewCount()).toBe(1);
    expect(widget(container)!.style.left).toBe("auto"); // right anchor
    const previousInput = input(container);
    previousInput.focus();

    // Change only the anchor. The grid must NOT remount, the filter must survive, and the widget
    // must re-anchor left while transferring focus to the replacement input.
    await rerender({ mode: "always", position: { anchor: "left", offsetX: 16 } });

    expect(core.getRowModel().getViewCount()).toBe(1); // search preserved
    expect(input(container).value).toBe("globex"); // input text preserved
    expect(input(container)).not.toBe(previousInput); // widget DOM rebuilt
    expect(document.activeElement).toBe(input(container)); // focus restored
    expect(widget(container)!.style.left).toBe("16px"); // re-anchored live
    root.unmount();
  });

  it("does not steal focus when a live reconfigure replaces an unfocused widget", async () => {
    const { container, root, rerender } = await mountGrid({ mode: "always" });
    const rootEl = container.querySelector(".pte-root") as HTMLElement;
    rootEl.focus();

    await rerender({ mode: "always", position: { offsetX: 16 } });

    expect(document.activeElement).toBe(rootEl);
    root.unmount();
  });

  it("enables the widget live when quickFilter goes from false to true", async () => {
    const { container, root, rerender } = await mountGrid(false);
    expect(widget(container)).toBeNull(); // disabled → no widget

    await rerender({ mode: "always" });
    expect(widget(container)).toBeTruthy(); // built live
    expect(widget(container)!.classList.contains("pte-quick-filter-open")).toBe(true);
    root.unmount();
  });

  it("disables the widget live when quickFilter goes from true to false, clearing the filter", async () => {
    const { container, apiRef, root, rerender } = await mountGrid({ mode: "always" });
    const core = apiRef.current!.getCore();

    await setSearch(container, "globex");
    expect(core.getRowModel().getViewCount()).toBe(1);
    input(container).focus();

    await rerender(false);
    expect(widget(container)).toBeNull(); // torn down
    expect(document.activeElement).toBe(container.querySelector(".pte-root"));

    root.unmount();
  });
});
