// @vitest-environment happy-dom
import { beforeAll, describe, expect, it } from "vitest";
import { GridCore } from "../core/core";
import { ColumnType } from "../interfaces/column";
import type { IMenuAdapter } from "../interfaces/iMenuAdapter";
import type { ITextMeasurer } from "../interfaces/iTextMeasure";
import { initDomRenderer } from "./dom";

// End-to-end cover for the renderer half of stylesheet delivery: attach() resolving its real root
// and picking a mechanism from it. The unit tests in theme/inject.test.ts call injectGridStyles
// with a target directly, so they never exercise resolveStyleTarget(this.root) — which is the part
// that makes a grid inside a shadow tree work at all.

beforeAll(() => {
  (HTMLCanvasElement.prototype as any).getContext = () => ({
    font: "",
    measureText: (text: string) => ({ width: text.length * 7 }),
  });
});

const measurer: ITextMeasurer = { measure: (text: string) => text.length * 7 };

const menuAdapter: IMenuAdapter = {
  resolveMenuItems: (_ctx, defaults) => ({ items: defaults, cleanup: () => undefined }),
};

function mountInto(container: HTMLElement, options: Record<string, unknown> = {}) {
  Object.defineProperty(container, "clientHeight", { value: 500, configurable: true });
  const core = new GridCore(measurer, { rowIdKey: "id", ...options });
  core.dispatch({
    type: "themeFontSet",
    headerFont: "12px sans",
    cellFont: "12px sans",
    reason: "test",
  } as any);
  core.setColumnDefsFromProps([
    { colId: "name", key: "name", label: "Name", type: ColumnType.STRING },
  ]);
  const { renderer } = initDomRenderer(core, menuAdapter);
  renderer.attach({ current: container });
  return { core, renderer };
}

function shadowHost() {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const shadow = host.attachShadow({ mode: "open" });
  const container = document.createElement("div");
  shadow.appendChild(container);
  return { shadow, container };
}

describe("GridRenderer.attach — stylesheet delivery", () => {
  it("styles a grid inside a shadow tree via CSSOM, not the document", () => {
    const headBefore = document.head.querySelectorAll("#pte-grid-styles").length;
    const { shadow, container } = shadowHost();

    mountInto(container);

    expect(shadow.adoptedStyleSheets).toHaveLength(1);
    // Document styles do not cross a shadow boundary, so styling the document would not have
    // helped this grid — and equally, the shadow grid must not have touched the document.
    expect(document.head.querySelectorAll("#pte-grid-styles")).toHaveLength(headBefore);
    expect(shadow.querySelector("#pte-grid-styles")).toBeNull();
  });

  it("delivers the theme variables into the shadow tree, where :root alone would not reach", () => {
    const { shadow, container } = shadowHost();
    mountInto(container);

    const css = shadow.adoptedStyleSheets[0];
    const text = Array.from(css.cssRules).map(r => r.cssText).join("\n");
    expect(text).toContain("--pte-font-size");
    expect(text).toContain(":host");
  });

  it("adopts once for two grids sharing a shadow tree", () => {
    const { shadow, container } = shadowHost();
    const second = document.createElement("div");
    shadow.appendChild(second);

    mountInto(container);
    mountInto(second);

    expect(shadow.adoptedStyleSheets).toHaveLength(1);
  });

  it("honours suppressStyleInjection inside a shadow tree", () => {
    const { shadow, container } = shadowHost();
    mountInto(container, { suppressStyleInjection: true });
    expect(shadow.adoptedStyleSheets).toHaveLength(0);
  });

  it("styles a grid attached to the document with a style element in head", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);

    mountInto(container);

    const style = document.head.querySelector("#pte-grid-styles");
    expect(style).not.toBeNull();
    expect(document.head.firstChild).toBe(style);
  });
});
