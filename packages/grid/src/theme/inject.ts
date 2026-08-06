import { GRID_STYLES } from "./styles.generated";

const STYLE_EL_ID = "pte-grid-styles";

/** Roots already carrying the stylesheet, by whichever mechanism was used. */
const injectedRoots = new WeakSet<Document | ShadowRoot>();

/**
 * A constructable stylesheet belongs to the document that created it and cannot
 * be adopted into a different one, so sheets are cached per document and shared
 * across that document's shadow roots.
 */
const sheetsByDocument = new WeakMap<Document, CSSStyleSheet>();

export interface InjectGridStylesOptions {
  /**
   * CSP nonce for the generated `<style>` element, for apps served with
   * `style-src 'nonce-...'` and without `'unsafe-inline'`. Nonces are global to
   * a page, so every grid on the page must be given the same value. Ignored on
   * the shadow-root path, which needs no nonce (see below).
   */
  nonce?: string;
}

function isDocument(node: Node): node is Document {
  return node.nodeType === 9;
}

function isShadowRoot(node: Node): node is ShadowRoot {
  return node.nodeType === 11 && "host" in node;
}

/**
 * Resolve the node a grid rooted at `el` should have its styles delivered to.
 * `getRootNode()` returns a plain element for a subtree that is not yet
 * connected, which is neither injectable nor the right cascade context, so that
 * case falls back to the owning document.
 */
export function resolveStyleTarget(el: Element): Document | ShadowRoot | null {
  const root = el.getRootNode();
  if (isDocument(root) || isShadowRoot(root)) return root;
  return el.ownerDocument ?? null;
}

/**
 * Adopt the stylesheet via CSSOM. Constructable stylesheets are not covered by
 * CSP's `style-src`, so this needs neither `'unsafe-inline'` nor a nonce.
 * Returns false when the browser lacks support and the caller should fall back.
 */
function adopt(target: Document | ShadowRoot, doc: Document): boolean {
  if (typeof CSSStyleSheet === "undefined" || !("replaceSync" in CSSStyleSheet.prototype)) {
    return false;
  }
  try {
    let sheet = sheetsByDocument.get(doc);
    if (!sheet) {
      sheet = new CSSStyleSheet();
      sheet.replaceSync(GRID_STYLES);
      sheetsByDocument.set(doc, sheet);
    }
    if (!target.adoptedStyleSheets.includes(sheet)) {
      target.adoptedStyleSheets = [...target.adoptedStyleSheets, sheet];
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Insert the stylesheet as a `<style>` element.
 *
 * For a document this goes in as the *first* child of `<head>` so that author
 * stylesheets, which come later, win at equal specificity — matching how the
 * grid behaves when the consumer imports `styles.css` themselves.
 */
function insertStyleEl(
  target: Document | ShadowRoot,
  doc: Document,
  nonce: string | undefined,
): void {
  const style = doc.createElement("style");
  style.id = STYLE_EL_ID;
  if (nonce) style.setAttribute("nonce", nonce);
  style.textContent = GRID_STYLES;

  if (isDocument(target)) {
    const head = target.head;
    if (!head) return;
    head.insertBefore(style, head.firstChild);
  } else {
    target.insertBefore(style, target.firstChild);
  }
}

/**
 * Deliver the grid's base stylesheet to `target`, once.
 *
 * The grid calls this itself when it attaches to the DOM, so applications
 * normally do not need to — set the `suppressStyleInjection` grid option to opt
 * out, e.g. when importing `@agility-workbench/grid/styles.css` instead.
 *
 * Mechanism depends on the target, deliberately:
 *
 * - **Shadow root** — adopted via CSSOM. There is no competing author CSS
 *   inside a shadow tree, so cascade position does not matter, and CSSOM is
 *   exempt from CSP.
 * - **Document** — a `<style>` element placed first in `<head>`, so the
 *   consumer's own stylesheets keep winning at equal specificity. This costs
 *   CSP compatibility, hence {@link InjectGridStylesOptions.nonce}.
 *
 * Idempotent per target, and SSR-safe: a no-op where there is no DOM.
 *
 * @param target - Document or `ShadowRoot` to style. Defaults to the global
 *   document.
 */
export function injectGridStyles(
  target?: Document | ShadowRoot,
  options?: InjectGridStylesOptions,
): void {
  if (typeof document === "undefined") return;

  const root = target ?? document;
  if (injectedRoots.has(root)) return;

  // A second copy would be inert (identical bytes) but would sort after the
  // first, so honour any existing element — including one from a duplicate copy
  // of this package with its own module state.
  if (root.querySelector?.(`#${STYLE_EL_ID}`)) {
    injectedRoots.add(root);
    return;
  }

  const doc = isDocument(root) ? root : (root.ownerDocument ?? document);

  if (isShadowRoot(root) && adopt(root, doc)) {
    injectedRoots.add(root);
    return;
  }

  insertStyleEl(root, doc, options?.nonce);
  injectedRoots.add(root);
}

/** Whether the base stylesheet has been delivered to `target` by this module. */
export function areGridStylesInjected(target?: Document | ShadowRoot): boolean {
  if (typeof document === "undefined") return false;
  return injectedRoots.has(target ?? document);
}
