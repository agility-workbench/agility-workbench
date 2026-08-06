// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { GRID_STYLES } from "./styles.generated";
import { areGridStylesInjected, injectGridStyles, resolveStyleTarget } from "./inject";

// injectGridStyles dedupes per target for the lifetime of the module, so tests
// that need a virgin document make their own rather than sharing the global one.
const freshDocument = () => document.implementation.createHTMLDocument("test");

const shadowRoot = () => {
  const host = document.createElement("div");
  document.body.appendChild(host);
  return host.attachShadow({ mode: "open" });
};

describe("injectGridStyles — document target", () => {
  it("inserts the stylesheet as the first child of head so author CSS still wins", () => {
    const doc = freshDocument();
    const appSheet = doc.createElement("style");
    appSheet.textContent = ".pte-cell { color: rebeccapurple }";
    doc.head.appendChild(appSheet);

    injectGridStyles(doc);

    // Ours must precede the app's, so the app's declaration is the later one.
    expect(doc.head.firstChild).toBe(doc.querySelector("#pte-grid-styles"));
    expect(doc.head.lastChild).toBe(appSheet);
  });

  it("delivers the real stylesheet contents", () => {
    const doc = freshDocument();
    injectGridStyles(doc);
    expect(doc.querySelector("#pte-grid-styles")?.textContent).toBe(GRID_STYLES);
  });

  it("applies a CSP nonce when given one", () => {
    const doc = freshDocument();
    injectGridStyles(doc, { nonce: "abc123" });
    expect(doc.querySelector("#pte-grid-styles")?.getAttribute("nonce")).toBe("abc123");
  });

  it("is idempotent — a second grid attaching does not add a second copy", () => {
    const doc = freshDocument();
    injectGridStyles(doc);
    injectGridStyles(doc);
    injectGridStyles(doc);
    expect(doc.querySelectorAll("#pte-grid-styles")).toHaveLength(1);
  });

  it("honours a stylesheet already present, e.g. from a duplicate copy of the package", () => {
    const doc = freshDocument();
    const existing = doc.createElement("style");
    existing.id = "pte-grid-styles";
    doc.head.appendChild(existing);

    injectGridStyles(doc);

    expect(doc.querySelectorAll("#pte-grid-styles")).toHaveLength(1);
    expect(doc.querySelector("#pte-grid-styles")).toBe(existing);
  });

  it("reports injection state per target", () => {
    const doc = freshDocument();
    expect(areGridStylesInjected(doc)).toBe(false);
    injectGridStyles(doc);
    expect(areGridStylesInjected(doc)).toBe(true);
    expect(areGridStylesInjected(freshDocument())).toBe(false);
  });
});

describe("injectGridStyles — shadow root target", () => {
  it("adopts via CSSOM rather than a style element, so no CSP nonce is needed", () => {
    const root = shadowRoot();
    injectGridStyles(root);

    expect(root.adoptedStyleSheets).toHaveLength(1);
    expect(root.querySelector("#pte-grid-styles")).toBeNull();
  });

  it("does not adopt the same sheet twice", () => {
    const root = shadowRoot();
    injectGridStyles(root);
    injectGridStyles(root);
    expect(root.adoptedStyleSheets).toHaveLength(1);
  });

  it("styles each shadow tree independently — document styles do not cross the boundary", () => {
    const a = shadowRoot();
    const b = shadowRoot();
    injectGridStyles(a);
    expect(a.adoptedStyleSheets).toHaveLength(1);
    expect(b.adoptedStyleSheets).toHaveLength(0);
    injectGridStyles(b);
    expect(b.adoptedStyleSheets).toHaveLength(1);
  });
});

describe("resolveStyleTarget", () => {
  it("resolves a connected element to its document", () => {
    const el = document.createElement("div");
    document.body.appendChild(el);
    expect(resolveStyleTarget(el)).toBe(document);
  });

  it("resolves an element inside a shadow tree to that shadow root", () => {
    const root = shadowRoot();
    const el = document.createElement("div");
    root.appendChild(el);
    expect(resolveStyleTarget(el)).toBe(root);
  });

  it("falls back to the owning document for a detached subtree", () => {
    // getRootNode() returns a plain element here, which is not injectable.
    const detached = document.createElement("div");
    detached.appendChild(document.createElement("span"));
    expect(resolveStyleTarget(detached.firstElementChild!)).toBe(document);
  });
});
