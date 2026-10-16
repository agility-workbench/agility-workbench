import { Column } from "../../column/column";
import { AggregateKind, AggregateType, aggregateTypeLabel, isBuiltInAggregateType } from "../../interfaces/aggregate";
import { markPresentational } from "../aria";
import { registerRendererTooltipTarget } from "../tooltip/rendererTooltipTarget";

export interface AggregateRowElements {
  row: HTMLDivElement;
  leading: HTMLDivElement;
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

  const leading = document.createElement("div");
  leading.className = "pte-aggregate-leading";

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

  row.appendChild(leading);
  row.appendChild(left);
  row.appendChild(center);
  row.appendChild(right);
  row.appendChild(closeButton);

  // ARIA: wrapper machinery is presentational; the builder stitches the center
  // aggregate row as THE row owning every section's cells. Its aria-rowindex is stamped by the
  // grid's row-count refresh while it is shown: after the body and the pinned bands (see
  // GridRenderer._refreshAriaCounts).
  markPresentational(row, leading, left, center, right);

  return {
    row,
    leading,
    left,
    center,
    right,
    centerRow,
    closeButton,
  };
}

export class AggregateRowRenderer {
  private elements: AggregateRowElements;

  constructor(
    root: HTMLElement,
    rowHeight: number,
    onClose: (event: MouseEvent) => void,
    private onOpenAggregateMenu?: (
      column: Column,
      activeType: AggregateKind,
      anchorEl: HTMLElement,
    ) => void,
  ) {
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

  /**
   * Paint one section's footer cells. `typeFor` is the function each column's cell shows — its
   * entry in the aggregate model, else its default (`ColDef.aggFunc`, else sum/count): the same
   * pick the computed value was made with, so the label never disagrees with the number.
   */
  renderCells(
    cells: HTMLDivElement[],
    columns: Column[],
    typeFor: (col: Column) => AggregateKind,
    values: Map<string, string>,
  ) {
    let idx = -1;
    for (const col of columns) {
      if (col.hidden) continue;
      idx++;
      const cell = cells[idx];
      if (!cell) continue;
      if (cell.children.length > 0) cell.innerHTML = "";
      if (col.isRowNumberColumn()) {
        cell.textContent = "";
        continue;
      }
      const aggFn = typeFor(col);
      const label = footerAggregateLabel(aggFn);
      const button = document.createElement("button");
      button.type = "button";
      button.className = "pte-aggregate-menu-button";
      button.setAttribute("aria-haspopup", "menu");
      button.setAttribute("aria-label", `Change ${col.label} aggregation. Current function: ${label}`);
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        this.onOpenAggregateMenu?.(col, aggFn, button);
      });
      registerRendererTooltipTarget(button, () => `${label} — change aggregation function`, button, "top");

      const icon = document.createElement("span");
      icon.className = "pte-aggregate-icon";
      icon.classList.add(aggregateIconClass(aggFn, col.isComputableType()));
      button.appendChild(icon);
      cell.appendChild(button);
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

/**
 * The footer's short name for an aggregate: the built-in type capitalised ("Avg", "First"), with
 * distinct count spelled out; a custom function's name as given.
 */
function footerAggregateLabel(type: AggregateKind): string {
  if (!isBuiltInAggregateType(type)) return type;
  if (type === AggregateType.DISTINCT_COUNT) return aggregateTypeLabel(type);
  return type[0].toUpperCase() + type.substring(1);
}

/**
 * The footer button's icon class for an aggregate: `icon-<type>` for the built-ins (min/max split
 * by whether they compare numbers or text), one generic `icon-agg-custom` for every custom name —
 * a name is app text, not a class token.
 */
export function aggregateIconClass(type: AggregateKind, numeric: boolean): string {
  if (!isBuiltInAggregateType(type)) return "icon-agg-custom";
  if (type === AggregateType.MIN || type === AggregateType.MAX) {
    return `icon-${type}-${numeric ? "number" : "string"}`;
  }
  return `icon-${type}`;
}
