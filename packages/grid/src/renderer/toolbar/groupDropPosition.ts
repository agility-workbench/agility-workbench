const CHIP_SELECTOR = ".pte-grid-toolbar-group-chip";

export function resolveGroupDropIndex(zone: HTMLElement, clientX: number): number {
  const chips = Array.from(zone.querySelectorAll<HTMLElement>(CHIP_SELECTOR));
  const before = chips.findIndex(chip => {
    const rect = chip.getBoundingClientRect();
    return clientX < rect.left + rect.width / 2;
  });
  return before < 0 ? chips.length : before;
}

export function showGroupDropPosition(zone: HTMLElement, index: number): void {
  clearGroupDropPosition(zone);
  const chips = Array.from(zone.querySelectorAll<HTMLElement>(CHIP_SELECTOR));
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
  marker.className = "pte-grid-toolbar-group-drop-indicator";
  marker.setAttribute("aria-hidden", "true");
  marker.style.left = `${x - zoneRect.left}px`;
  zone.appendChild(marker);
}

export function clearGroupDropPosition(zone: HTMLElement): void {
  zone.querySelector(".pte-grid-toolbar-group-drop-indicator")?.remove();
  zone.querySelectorAll(".drop-before, .drop-after").forEach(element => {
    element.classList.remove("drop-before", "drop-after");
  });
}
