import type { FloatingPlacement } from "../floating/floatingAnchor";

export type RendererTooltipContent = string | number | null | undefined;
export type RendererTooltipContentGetter = () => RendererTooltipContent;

type RendererTooltipTargetRegistration = {
  getContent: RendererTooltipContentGetter;
  anchor?: Element;
  placement?: FloatingPlacement;
};

const rendererTooltipTargets = new WeakMap<Element, RendererTooltipTargetRegistration>();
export const RENDERER_TOOLTIP_TARGET_DISPOSED = "pte-renderer-tooltip-target-disposed";

/**
 * Attach point-specific tooltip content to a cell-renderer element or grid-owned UI control. The
 * grid tooltip renderer discovers these targets through delegated pointer handlers, so consumers
 * do not create or position floating UI themselves.
 */
export function registerRendererTooltipTarget(
  target: Element,
  getContent: RendererTooltipContentGetter,
  anchor?: Element,
  placement?: FloatingPlacement,
): () => void {
  rendererTooltipTargets.set(target, { getContent, anchor, placement });
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

export function getRendererTooltipPlacement(target: Element): FloatingPlacement | undefined {
  return rendererTooltipTargets.get(target)?.placement;
}
