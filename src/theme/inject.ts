import { GRID_STYLES } from "./styles.generated";

const STYLE_EL_ID = "pte-grid-styles";
let injected = false;

/**
 * Inject the grid's base stylesheet into `document.head` once.
 *
 * This is the zero-import delivery path: call it (e.g. once at app startup, or it
 * runs automatically on first grid mount) instead of `import
 * "@agility-workbench/grid/styles.css"`. The CSS text is bundled into the JS. If
 * you already import the stylesheet, you do not need this — the injected `<style>`
 * is keyed by id and deduped, so calling both is harmless.
 *
 * SSR-safe: a no-op when there is no `document`.
 *
 * @param target - Node to inject into. Defaults to `document.head`. Pass a
 *   `ShadowRoot` to scope the styles to a shadow tree.
 */
export function injectGridStyles(target?: Document | ShadowRoot): void {
  if (typeof document === "undefined") return;

  const root: Document | ShadowRoot = target ?? document;
  const container: ParentNode & Node =
    root instanceof Document ? root.head : root;
  if (!container) return;

  // Dedupe: once per document (fast path) and per explicit target (query).
  if (root === document && injected) return;
  const existing = (container as ParentNode).querySelector?.(`#${STYLE_EL_ID}`);
  if (existing) {
    if (root === document) injected = true;
    return;
  }

  const style = document.createElement("style");
  style.id = STYLE_EL_ID;
  style.textContent = GRID_STYLES;
  container.appendChild(style);

  if (root === document) injected = true;
}

/** Whether the base stylesheet has been injected into the main document. */
export function areGridStylesInjected(): boolean {
  return injected;
}
