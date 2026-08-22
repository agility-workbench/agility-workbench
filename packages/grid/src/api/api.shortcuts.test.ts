// @vitest-environment happy-dom
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createGrid } from "../createGrid";
import type { IGridAPI } from "../interfaces/iGridAPI";
import { ColumnType } from "../interfaces/column";

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
  { key: "name", label: "Name", type: ColumnType.STRING },
  { key: "price", label: "Price", type: ColumnType.NUMBER },
];

function mount(options: Record<string, unknown> = {}): IGridAPI {
  return createGrid(host, {
    rowIdKey: "id",
    columnDefs,
    rowData: [
      { id: 1, name: "Widget", price: 9.99 },
      { id: 2, name: "Gadget", price: 4.5 },
    ],
    ...options,
  });
}

function press(key: string, init: KeyboardEventInit = {}): KeyboardEvent {
  const root = host.querySelector<HTMLElement>(".pte-root")!;
  const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init });
  root.dispatchEvent(event);
  return event;
}

describe("api.registerShortcut", () => {
  it("fires a registered shortcut and preventDefaults it by default", () => {
    const api = mount();
    const run = vi.fn();
    api.registerShortcut({ id: "approve", chord: "mod+shift+y", run });

    const event = press("y", { ctrlKey: true, shiftKey: true });
    expect(run).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(true);
    // Exact matching: a superset chord is not this shortcut.
    press("y", { ctrlKey: true, shiftKey: true, altKey: true });
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("app scope sits below built-ins; override: true shadows them", () => {
    // quickFilter enabled, so the built-in mod+f binding is live (its `when` requires the widget —
    // with the feature off, the chord would legitimately fall through to the app scope).
    const api = mount({ quickFilter: true });
    const shadowed = vi.fn();
    // mod+f is the built-in quick-filter chord (non-reserved). Without override it never fires.
    api.registerShortcut({ id: "find", chord: "mod+f", run: shadowed });
    press("f", { ctrlKey: true });
    expect(shadowed).not.toHaveBeenCalled();

    const winning = vi.fn();
    api.registerShortcut({ id: "find2", chord: "mod+f", run: winning, override: true });
    press("f", { ctrlKey: true });
    expect(winning).toHaveBeenCalledTimes(1);
    expect(shadowed).not.toHaveBeenCalled();
  });

  it("refuses reserved chords with the owning feature named, and frees them when it is off", () => {
    const api = mount();
    expect(() => api.registerShortcut({ id: "nav", chord: "arrowdown", run: () => {} }))
      .toThrow(/cell navigation \(cellSelection\)/);
    expect(() => api.registerShortcut({ id: "esc", chord: "escape", run: () => {} }))
      .toThrow(/Escape/);
    expect(() => api.registerShortcut({ id: "tab", chord: "tab", run: () => {} }))
      .toThrow(/Tab/);

    // Both surfaces off: the navigation cluster belongs to the application. Fresh host — press()
    // targets the first .pte-root in the current host.
    api.destroy();
    host.remove();
    host = document.createElement("div");
    host.style.height = "400px";
    host.style.width = "600px";
    document.body.appendChild(host);
    const inert = mount({ cellSelection: false, headerKeyboardNavigation: false });
    const run = vi.fn();
    expect(() => inert.registerShortcut({ id: "nav", chord: "arrowdown", run })).not.toThrow();
    press("ArrowDown");
    expect(run).toHaveBeenCalledTimes(1);
    // Tab and Escape stay reserved in every configuration.
    expect(() => inert.registerShortcut({ id: "esc", chord: "escape", run: () => {} }))
      .toThrow(/Escape/);
  });

  it("suspends a legally-registered shortcut while the claiming feature is re-enabled", () => {
    const api = mount({ cellSelection: false, headerKeyboardNavigation: false });
    const run = vi.fn();
    api.registerShortcut({ id: "nav", chord: "arrowright", run });
    press("ArrowRight");
    expect(run).toHaveBeenCalledTimes(1);

    api.updateGridOptions({ cellSelection: true });
    press("ArrowRight");
    expect(run).toHaveBeenCalledTimes(1); // dormant: the built-in owns the key again

    api.updateGridOptions({ cellSelection: false });
    press("ArrowRight");
    expect(run).toHaveBeenCalledTimes(2); // awake again
  });

  it("refuses AltGr-shaped chords, duplicate ids, and duplicate unconditional chords", () => {
    const api = mount();
    expect(() => api.registerShortcut({ id: "altgr", chord: "mod+alt+e", run: () => {} }))
      .toThrow(/AltGr/);
    expect(() => api.registerShortcut({ id: "fn", chord: "mod+alt+f6", run: () => {} }))
      .not.toThrow();

    api.registerShortcut({ id: "one", chord: "mod+shift+k", run: () => {} });
    expect(() => api.registerShortcut({ id: "one", chord: "mod+shift+l", run: () => {} }))
      .toThrow(/already registered/);
    expect(() => api.registerShortcut({ id: "two", chord: "mod+shift+k", run: () => {} }))
      .toThrow(/could never run/);
    // A `when` on one of the two makes sharing the chord legal.
    expect(() => api.registerShortcut({
      id: "three", chord: "mod+shift+k", when: () => false, run: () => {},
    })).not.toThrow();
  });

  it("disposes idempotently and frees the id and chord for re-registration", () => {
    const api = mount();
    const run = vi.fn();
    const off = api.registerShortcut({ id: "temp", chord: "mod+shift+u", run });
    off();
    off(); // StrictMode-style double cleanup
    press("u", { ctrlKey: true, shiftKey: true });
    expect(run).not.toHaveBeenCalled();

    const run2 = vi.fn();
    api.registerShortcut({ id: "temp", chord: "mod+shift+u", run: run2 });
    press("u", { ctrlKey: true, shiftKey: true });
    expect(run2).toHaveBeenCalledTimes(1);
  });
});

describe("api.getKeyboardShortcuts", () => {
  it("lists built-ins with commands and app shortcuts with their scope", () => {
    const api = mount();
    api.registerShortcut({ id: "approve", chord: "mod+shift+y", label: "Approve", run: () => {} });

    const table = api.getKeyboardShortcuts();
    const copy = table.find(row => row.command === "body.copy");
    expect(copy).toBeDefined();
    expect(copy!.chord).toEqual(expect.objectContaining({ key: "c", mod: true }));

    const approve = table.find(row => row.id === "approve");
    expect(approve).toMatchObject({ scope: "app", label: "Approve" });
    expect(approve!.chord).toEqual(expect.objectContaining({ key: "y", mod: true, shift: true }));

    // Pattern bindings appear without a chord rather than being hidden.
    const typeToEdit = table.find(row => row.id === "typeToEdit");
    expect(typeToEdit).toBeDefined();
    expect(typeToEdit!.chord).toBeUndefined();
  });
});
