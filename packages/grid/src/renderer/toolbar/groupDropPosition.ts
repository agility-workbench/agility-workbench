const CHIP_SELECTOR = ".pte-grid-toolbar-group-chip";
const INDICATOR_CLASS = "pte-grid-toolbar-group-drop-indicator";

export function resolveGroupDropIndex(
  zone: HTMLElement,
  clientX: number,
  chipSelector = CHIP_SELECTOR,
): number {
  const chips = Array.from(zone.querySelectorAll<HTMLElement>(chipSelector));
  const before = chips.findIndex(chip => {
    const rect = chip.getBoundingClientRect();
    return clientX < rect.left + rect.width / 2;
  });
  return before < 0 ? chips.length : before;
}

export function showGroupDropPosition(
  zone: HTMLElement,
  index: number,
  chipSelector = CHIP_SELECTOR,
  indicatorClass = INDICATOR_CLASS,
): void {
  clearGroupDropPosition(zone, indicatorClass);
  const chips = Array.from(zone.querySelectorAll<HTMLElement>(chipSelector));
  const zoneRect = zone.getBoundingClientRect();
  let x = zoneRect.left;
  if (index < chips.length) {
    chips[index].classList.add("drop-before");
    x = chips[index].getBoundingClientRect().left;
  } else if (chips.length > 0) {
    chips[chips.length - 1].classList.add("drop-after");
    x = chips[chips.length - 1].getBoundingClientRect().right;
  }
  const marker = document.createElement("span");
  marker.className = indicatorClass;
  marker.setAttribute("aria-hidden", "true");
  marker.style.left = `${x - zoneRect.left}px`;
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
