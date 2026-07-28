export type RendererTooltipContent = string | number | null | undefined;
export type RendererTooltipContentGetter = () => RendererTooltipContent;

type RendererTooltipTargetRegistration = {
  getContent: RendererTooltipContentGetter;
  anchor?: Element;
};

const rendererTooltipTargets = new WeakMap<Element, RendererTooltipTargetRegistration>();
export const RENDERER_TOOLTIP_TARGET_DISPOSED = "pte-renderer-tooltip-target-disposed";

/**
 * Attach point-specific tooltip content to an element owned by a cell renderer. The body tooltip
 * renderer discovers these targets through its existing delegated pointer handlers, so renderers
 * do not create or position floating UI themselves.
 */
export function registerRendererTooltipTarget(
  target: Element,
  getContent: RendererTooltipContentGetter,
  anchor?: Element,
): () => void {
  rendererTooltipTargets.set(target, { getContent, anchor });
  return () => {
    if (!rendererTooltipTargets.delete(target)) return;
    target.dispatchEvent(new CustomEvent(RENDERER_TOOLTIP_TARGET_DISPOSED, { bubbles: true }));
  };
}

export function findRendererTooltipTarget(
  start: Element,
  cell: Element,
): Element | null {
  let current: Element | null = start;
  while (current && cell.contains(current)) {
    if (rendererTooltipTargets.has(current)) return current;
    if (current === cell) break;
    current = current.parentElement;
  }
  return null;
}

export function getRendererTooltipContent(target: Element): RendererTooltipContent {
  return rendererTooltipTargets.get(target)?.getContent();
}

export function getRendererTooltipAnchor(target: Element): Element {
  return rendererTooltipTargets.get(target)?.anchor ?? target;
}
