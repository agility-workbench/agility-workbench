export interface AggregateRowElements {
  row: HTMLDivElement;
  left: HTMLDivElement;
  center: HTMLDivElement;
  right: HTMLDivElement;
  centerRow: HTMLDivElement;
  closeButton: HTMLButtonElement;
}

export function createAggregateRow(rowHeight: number, onClose: (event: MouseEvent) => void): AggregateRowElements {
  const row = document.createElement("div");
  row.className = "pte-aggregate-row";
  row.style.display = "none";
  row.style.height = `${rowHeight}px`;
  row.style.minHeight = `${rowHeight}px`;
  row.style.maxHeight = `${rowHeight}px`;

  const left = document.createElement("div");
  left.className = "pte-aggregate-left";

  const center = document.createElement("div");
  center.className = "pte-aggregate-center";

  const right = document.createElement("div");
  right.className = "pte-aggregate-right";

  const closeButton = document.createElement("button");
  closeButton.type = "button";
  closeButton.className = "pte-aggregate-close";
  closeButton.title = "Hide aggregate row";
  closeButton.setAttribute("aria-label", "Hide aggregate row");
  closeButton.textContent = "x";
  closeButton.addEventListener("click", onClose);

  const centerRow = document.createElement("div");

  row.appendChild(left);
  row.appendChild(center);
  row.appendChild(right);
  row.appendChild(closeButton);

  return {
    row,
    left,
    center,
    right,
    centerRow,
    closeButton,
  };
}

export class AggregateRowRenderer {
  private elements: AggregateRowElements;

  constructor(root: HTMLElement, rowHeight: number, onClose: (event: MouseEvent) => void) {
    this.elements = createAggregateRow(rowHeight, onClose);
    root.appendChild(this.elements.row);
  }

  getRefs() {
    return this.elements;
  }
}
