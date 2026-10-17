import { isRtl } from "../layout/direction";

const CHIP_SELECTOR = ".pte-grid-toolbar-group-chip";
const INDICATOR_CLASS = "pte-grid-toolbar-group-drop-indicator";

/**
 * Which way the chips run. The bar lays them out in a row; the chip editor behind a `+N` or a
 * summary button stacks them, and reorders by the same drag.
 */
export type ChipAxis = "x" | "y";

/**
 * Chips folded into a `+N` are still in the DOM (a fit pass resets and re-measures, so removing
 * them would cost their drag and focus state), and a `display: none` chip has an all-zero rect that
 * would land every drop at index 0. They are always a *suffix* of the list — folding happens from
 * the end — so ignoring them here leaves the surviving indices equal to their model indices, and a
 * drop past the last visible chip lands just before the folded ones.
 */
const VISIBLE = ":not(.pte-bar-displaced)";

function visibleChips(zone: HTMLElement, chipSelector: string): HTMLElement[] {
  return Array.from(zone.querySelectorAll<HTMLElement>(`${chipSelector}${VISIBLE}`));
}

export function resolveGroupDropIndex(
  zone: HTMLElement,
  pointer: number,
  chipSelector = CHIP_SELECTOR,
  axis: ChipAxis = "x",
): number {
  const chips = visibleChips(zone, chipSelector);
  // A row of chips runs along the inline axis: in RTL the first chip is the rightmost, so "before
  // this chip" is the pointer being in its RIGHT half.
  const rtl = axis === "x" && isRtl(zone);
  const before = chips.findIndex(chip => {
    const rect = chip.getBoundingClientRect();
    if (axis === "y") return pointer < rect.top + rect.height / 2;
    const middle = rect.left + rect.width / 2;
    return rtl ? pointer > middle : pointer < middle;
  });
  return before < 0 ? chips.length : before;
}

export function showGroupDropPosition(
  zone: HTMLElement,
  index: number,
  chipSelector = CHIP_SELECTOR,
  indicatorClass = INDICATOR_CLASS,
  axis: ChipAxis = "x",
): void {
  clearGroupDropPosition(zone, indicatorClass);
  const chips = visibleChips(zone, chipSelector);
  const zoneRect = zone.getBoundingClientRect();
  // The marker is placed physically (`left`, centred by its own translate), at the target chip's
  // inline-START edge or past the last chip's inline-END edge: the right/left edges in RTL.
  const rtl = axis === "x" && isRtl(zone);
  const start = axis === "x" ? zoneRect.left : zoneRect.top;
  let offset = rtl ? zoneRect.right : start;
  if (index < chips.length) {
    chips[index].classList.add("drop-before");
    const rect = chips[index].getBoundingClientRect();
    offset = axis === "x" ? (rtl ? rect.right : rect.left) : rect.top;
  } else if (chips.length > 0) {
    chips[chips.length - 1].classList.add("drop-after");
    const rect = chips[chips.length - 1].getBoundingClientRect();
    offset = axis === "x" ? (rtl ? rect.left : rect.right) : rect.bottom;
  }
  const marker = document.createElement("span");
  marker.className = indicatorClass;
  marker.setAttribute("aria-hidden", "true");
  if (axis === "x") marker.style.left = `${offset - start}px`;
  else marker.style.top = `${offset - start}px`;
  zone.appendChild(marker);
}

export function clearGroupDropPosition(
  zone: HTMLElement,
  indicatorClass = INDICATOR_CLASS,
): void {
  zone.querySelector(`.${indicatorClass}`)?.remove();
  zone.querySelectorAll(".drop-before, .drop-after").forEach(element => {
    element.classList.remove("drop-before", "drop-after");
  });
}
