// @vitest-environment happy-dom
import { beforeAll, describe, expect, it } from "vitest";
import React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
// Import through the public entry: this doubles as a runtime assertion that the core style
// helpers are re-exported from the React package.
import { areGridStylesInjected, Grid } from "./index";
import type { ReactColDef } from "./cellRenderer";

beforeAll(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  (HTMLCanvasElement.prototype as any).getContext = () => ({
    font: "",
    measureText: (t: string) => ({ width: t.length * 7 }),
  });
});

const COLS: ReactColDef[] = [{ colId: "name", key: "name", label: "Name" }];
const DATA = [{ id: "1", name: "A" }];

async function mount(props: Record<string, unknown> = {}) {
  const container = document.createElement("div");
  Object.defineProperty(container, "clientHeight", { value: 600, configurable: true });
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(<Grid rowData={DATA} columnDefs={COLS} rowIdKey="id" {...props} />);
  });
  return { container, root };
}

const styleEls = () => document.querySelectorAll("#pte-grid-styles");

// Ordered: the injected flag in the core module is process-wide for this file, so the opt-out
// case must run before anything injects for its assertion to mean something.
describe("automatic stylesheet delivery", () => {
  it("does not inject when the application opts out via suppressStyleInjection", async () => {
    const { root } = await mount({ suppressStyleInjection: true });
    expect(styleEls()).toHaveLength(0);
    expect(areGridStylesInjected()).toBe(false);
    await act(async () => { root.unmount(); });
  });

  it("injects the grid stylesheet when the component mounts", async () => {
    const { root } = await mount();
    const styles = styleEls();
    expect(styles).toHaveLength(1);
    expect(styles[0].textContent).toContain(".pte-root");
    expect(areGridStylesInjected()).toBe(true);
    await act(async () => { root.unmount(); });
  });

  it("deduplicates stylesheet injection across multiple grid instances", async () => {
    const first = await mount();
    const second = await mount();
    expect(styleEls()).toHaveLength(1);
    await act(async () => { first.root.unmount(); second.root.unmount(); });
  });
});
