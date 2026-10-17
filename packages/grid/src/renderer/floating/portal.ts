/**
 * Portaling grid layers out of `.pte-root` without losing the grid's styling.
 *
 * A few layers have to leave the grid root: the column drag ghost (it follows the pointer across
 * the whole page) and floating anchors under `escapeRootClip` (tooltips / ActionFrame popovers that
 * must not clip against `.pte-root { overflow: hidden }`). Leaving the root costs two things, and
 * this module puts both back:
 *
 * 1. **The stylesheet, under a shadow-root mount.** The grid's CSS is delivered *into* the shadow
 *    root it lives in (see `theme/inject.ts`), so a layer appended to `document.body` matches none
 *    of it and renders unstyled. {@link resolvePortalContainer} therefore portals into the grid's
 *    own shadow root, where the existing injection already covers it.
 *
 *    Trade-off, deliberately accepted: a `position: fixed` layer appended directly to the
 *    `ShadowRoot` is a child of the shadow host in the flat tree. Fixed positioning ignores the
 *    `overflow` clip of every ancestor that is not its containing block, so it still escapes
 *    `.pte-root` and any clipping wrapper inside the shadow tree — and the host's own
 *    `overflow: hidden` too. What it cannot escape is a `transform` / `filter` / `contain` /
 *    `will-change: transform` on the host or one of its light-DOM ancestors (those make the
 *    ancestor the containing block for fixed descendants), and its z-index competes inside the
 *    host's stacking context rather than the page's. The alternative — keep `document.body` and
 *    also inject the grid's stylesheet into the document — was rejected: it would push the grid's
 *    global rules (including the `:root` variable block) into the very page the consumer isolated
 *    the grid from with a shadow root, and the document path needs a CSP nonce the shadow path
 *    does not. A consumer who needs to escape a transformed host can drop `escapeRootClip` or lift
 *    the transform.
 *
 * 2. **The per-grid theme and direction.** A theme's `--pte-*` values (and icon overrides) are written as inline
 *    custom properties on `.pte-root` (ThemeRenderer / IconRenderer); a portaled layer is not a
 *    descendant, so it would fall back to the stylesheet's `:root` / `:host` defaults (or whatever
 *    the page sets). {@link linkPortalTheme} copies every inline custom property of the root onto
 *    the portaled element and keeps them in sync while it is mounted (a MutationObserver on the
 *    root's `style` attribute catches `setTheme` / `setThemeVars` / `setIcons` and the measured
 *    scrollbar gutter alike). Copying the root's *resolved inline values* rather than re-deriving
 *    them from the theme means dark themes, `createTheme({...})` params, `withParams`, raw `vars`
 *    overrides and icon variables all carry with one mechanism and no access to the theme object.
 *    It also sets `font-family: var(--pte-font-family)`, the one typographic property every layer
 *    otherwise inherits from `.pte-root` and that no layer rule restates, and copies the root's
 *    `dir` (the grid's resolved direction) so the layer lays out the way the grid does.
 */

/** Where a layer leaving `root` should be appended. */
export type PortalContainer = HTMLElement | ShadowRoot;

function isShadowRoot(node: Node): node is ShadowRoot {
  // Duck-typed (nodeType + host) rather than `instanceof ShadowRoot`: the node may come from
  // another realm (iframe, test DOM). Same check as theme/inject.ts.
  return node.nodeType === 11 && "host" in node;
}

/**
 * The container a layer leaving `root` should be mounted in: the grid's own shadow root when it is
 * mounted inside one (the stylesheet lives there — see the module comment for the trade-off),
 * otherwise the owning document's `<body>`.
 */
export function resolvePortalContainer(root: HTMLElement): PortalContainer {
  const rootNode = root.getRootNode();
  if (isShadowRoot(rootNode)) return rootNode;
  return root.ownerDocument?.body ?? document.body;
}

/** Copy `root`'s inline custom properties onto `el`, removing ones the root no longer has. */
function syncCustomProperties(root: HTMLElement, el: HTMLElement, copied: Set<string>): void {
  const next = new Set<string>();
  const rootStyle = root.style;
  for (let i = 0; i < rootStyle.length; i++) {
    const name = rootStyle.item(i);
    if (!name.startsWith("--")) continue;
    next.add(name);
    el.style.setProperty(name, rootStyle.getPropertyValue(name));
  }
  for (const name of copied) {
    if (!next.has(name)) el.style.removeProperty(name);
  }
  copied.clear();
  next.forEach(name => copied.add(name));
}

/**
 * Give `el` (a layer portaled out of `root`) the root's theme: copies the root's inline `--*`
 * properties now and on every later change to the root's inline style, until the returned
 * function is called. Call that when the layer is unmounted.
 */
export function linkPortalTheme(root: HTMLElement, el: HTMLElement): () => void {
  const copied = new Set<string>();
  syncCustomProperties(root, el, copied);
  el.style.fontFamily = "var(--pte-font-family)";
  // The grid's direction too: a layer under <body> or the shadow root inherits the PAGE's
  // direction, not the grid's, so an `enableRtl` grid on an LTR page (or the reverse) would lay its
  // tooltip or drag ghost out the wrong way round. The root carries the resolved value as `dir`
  // (fixed at creation), so one copy is enough.
  const dir = root.getAttribute("dir");
  if (dir) el.setAttribute("dir", dir);
  // Some test rigs expose a MutationObserver global that is not the real thing (zone-patched or
  // stubbed); without a working observer the copy is simply not kept live.
  let observer: MutationObserver | null = null;
  try {
    const candidate = typeof MutationObserver === "function"
      ? new MutationObserver(() => syncCustomProperties(root, el, copied))
      : null;
    if (candidate && typeof candidate.observe === "function") {
      candidate.observe(root, { attributes: true, attributeFilter: ["style"] });
      observer = candidate;
    }
  } catch {
    observer = null;
  }
  return () => observer?.disconnect();
}

/**
 * Append `el` to the right container for a layer leaving `root` and give it the root's theme.
 * Returns the unlink function from {@link linkPortalTheme}; removing `el` stays the caller's job.
 */
export function portalOutOfRoot(root: HTMLElement, el: HTMLElement): () => void {
  resolvePortalContainer(root).appendChild(el);
  return linkPortalTheme(root, el);
}
