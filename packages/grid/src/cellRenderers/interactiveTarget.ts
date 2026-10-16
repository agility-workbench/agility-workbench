import type { CellRendererParams } from "../renderer/renderer";
import type { CellRef } from "../interfaces/selection";
import { isBooleanToggleTarget } from "./booleanRenderer";

/**
 * Marks an element inside a built-in renderer that owns its own click (a link, an editable rating
 * star), so the grid's gesture handlers can recognise it (see isInteractiveCellTarget).
 */
export const INTERACTIVE_ATTR = "data-pte-interactive";

/**
 * Whether a pointer event target is inside an element a built-in renderer handles itself: an
 * editable `BooleanCellRenderer` box, a `LinkCellRenderer` link or an editable
 * `RatingCellRenderer` star. The selection renderer uses it so `editTrigger: "singleClick"` does
 * not open an editor over the element the user just clicked (the editor would replace the cell's
 * DOM before the click lands, so the link would not navigate and the star would not write).
 */
export function isInteractiveCellTarget(target: EventTarget | null): boolean {
  return isBooleanToggleTarget(target) || !!(target as Element | null)?.closest?.(`[${INTERACTIVE_ATTR}]`);
}

/** Whether a value is blank the way the built-in renderers treat it: null, undefined or "". */
export function isBlankValue(value: unknown): boolean {
  return value == null || value === "" || (typeof value === "number" && Number.isNaN(value));
}

/**
 * Whether a renderer may write the cell from a click. Mirrors the core's editor-entry rule (column +
 * row-presentation editability, the pinned-rows gate) plus the edit trigger: `editTrigger: "none"`
 * means the UI never edits. Direct API writes bypass editability, so this check is what keeps a
 * renderer's click honest. The same rule `BooleanCellRenderer` applies.
 */
export function isRendererCellEditable(p: CellRendererParams): boolean {
  const node = p.node;
  if (!node || node.isGroup || p.isGroup || !p.colDef?.isCellEditable(node, p.rowPresentation)) return false;
  const options = p.api?.getCore?.().getOptions?.();
  if (options?.editTrigger === "none") return false;
  if (node.rowPinned && !options?.pinnedRowsEditable) return false;
  return true;
}

/** The cell a renderer writes through `api.setCellValue`. */
export function rendererCellRef(p: CellRendererParams): CellRef {
  return {
    rowId: p.rowId,
    colId: p.colDef.colId,
    colInstanceId: p.colDef.instanceID,
    ...(p.node?.rowPinned ? { rowPinned: p.node.rowPinned } : {}),
  };
}

/** The text a cell would show without a renderer: the formatted value, else the raw value. */
export function rendererText(p: CellRendererParams): string {
  if (p.valueFormatted != null) return String(p.valueFormatted);
  return p.value == null ? "" : String(p.value);
}

/** The cell's renderer params as the given type (`ColDef.cellRendererParams`). */
export function ownParams<T>(p: CellRendererParams): T {
  return (p.colDef?.cellRendererParams ?? {}) as T;
}
