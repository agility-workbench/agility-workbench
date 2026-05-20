import { Column } from "../../column/column";
import { AggregateType } from "../../interfaces/aggregate";

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

  getCenterRow() {
    return this.elements.centerRow;
  }

  setCenterRow(row: HTMLDivElement) {
    this.elements.centerRow = row;
  }

  setVisible(visible: boolean) {
    this.elements.row.classList.toggle("visible", visible);
    this.elements.row.style.display = visible ? "flex" : "none";
  }

  setHeight(rowHeight: number) {
    this.elements.row.style.height = `${rowHeight}px`;
    this.elements.row.style.minHeight = `${rowHeight}px`;
    this.elements.row.style.maxHeight = `${rowHeight}px`;
  }

  renderCells(
    cells: HTMLDivElement[],
    columns: Column[],
    aggregateMap: Map<string, AggregateType>,
    values: Map<string, string>,
  ) {
    let idx = -1;
    for (const col of columns) {
      if (col.hidden) continue;
      idx++;
      const cell = cells[idx];
      if (!cell) continue;
      if (cell.children.length > 0) cell.innerHTML = "";
      const aggFn = aggregateMap.get(col.instanceID) || (col.isComputableType() ? AggregateType.SUM : AggregateType.COUNT);
      const icon = document.createElement("div");
      icon.className = "pte-aggregate-icon";
      let suffix = "";
      if ([AggregateType.MIN, AggregateType.MAX].includes(aggFn)) {
        suffix = "-" + (col.isComputableType() ? "number" : "string");
      }
      icon.classList.add("icon-" + aggFn + suffix);
      icon.title = aggFn === AggregateType.DISTINCT_COUNT ? "Distinct Count" : aggFn[0].toUpperCase() + aggFn.substring(1);
      cell.appendChild(icon);
      const content = document.createElement("div");
      content.className = "pte-aggregate-cell-content";
      content.textContent = values.get(col.instanceID) ?? "";
      cell.appendChild(content);
      if (content.scrollWidth > content.clientWidth) {
        content.title = values.get(col.instanceID) ?? "";
      }
    }
  }
}
