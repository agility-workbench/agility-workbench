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
  cellRendererInstances: Map<string, RendererRecord>;
}
