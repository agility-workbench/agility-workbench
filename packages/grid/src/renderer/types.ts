import { RendererRecord } from "./renderer";

export interface RowPoolDef {
  leadingRowEl?: HTMLDivElement;
  leftRowEl?: HTMLDivElement;
  rowEl: HTMLDivElement;
  rightRowEl?: HTMLDivElement;
  leadingCellEls?: HTMLDivElement[];
  leftCellEls: HTMLDivElement[];
  cellEls: HTMLDivElement[];
  rightCellEls: HTMLDivElement[];
  // Single cell hosting a full-width row's content (chevron+label or fullWidthCellRenderer). Lives in
  // the center row element, sticky-pinned to the viewport left, and is hidden for normal rows.
  fullWidthCellEl: HTMLDivElement;
  cellRendererInstances: Map<string, RendererRecord>;
}
