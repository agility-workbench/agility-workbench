import { RendererRecord } from "./renderer";
import { renderedPosition } from "./body/columnWindow";

export interface RowPoolDef {
  leadingRowEl?: HTMLDivElement;
  leftRowEl?: HTMLDivElement;
  rowEl: HTMLDivElement;
  rightRowEl?: HTMLDivElement;
  leadingCellEls?: HTMLDivElement[];
  leftCellEls: HTMLDivElement[];
  /**
   * The centre section's rendered cells. With column virtualization this is a subset of the
   * centre leaves: `cellEls[c]` shows centre leaf `centerCols[c]` (an index into
   * `ColumnModel.getCenterLeaves()`). Map a centre `localIndex` through `centerCellAt`.
   */
  cellEls: HTMLDivElement[];
  /** Ascending centre leaf indexes rendered in `cellEls` (see renderer/body/columnWindow.ts). */
  centerCols: number[];
  /**
   * `div.pte-col-gap` spacers in the centre row, one before each run of rendered cells, sized to
   * the unrendered columns they stand for. Only gaps wider than 0 are attached to the row.
   */
  centerGapEls: HTMLDivElement[];
  /** Id prefix of this slot's cells (`${core.id}-r${slot}`); cell ids are `${prefix}-c${globalIndex}`. */
  idPrefix: string;
  rightCellEls: HTMLDivElement[];
  // Single cell hosting a full-width row's content (chevron+label or fullWidthCellRenderer). Lives in
  // the center row element, sticky-pinned to the viewport left, and is hidden for normal rows.
  fullWidthCellEl: HTMLDivElement;
  /** Hidden text referenced by the ARIA row when row presentation supplies a description. */
  descriptionEl: HTMLSpanElement;
  cellRendererInstances: Map<string, RendererRecord>;
}

/** The rendered centre cell of centre leaf `localIndex` in `slot`, or null when it is not rendered. */
export function centerCellAt(slot: RowPoolDef, localIndex: number): HTMLDivElement | null {
  const c = renderedPosition(slot.centerCols, localIndex);
  return c < 0 ? null : slot.cellEls[c] ?? null;
}
