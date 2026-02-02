import { RendererRecord } from "./renderer";

export interface RowPoolDef {
  leftRowEl?: HTMLDivElement;
  rowEl: HTMLDivElement;
  rightRowEl?: HTMLDivElement;
  leftCellEls: HTMLDivElement[];
  cellEls: HTMLDivElement[];
  rightCellEls: HTMLDivElement[];
  cellRendererInstances: Map<string, RendererRecord>;
}
