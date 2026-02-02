import { Column } from "../column/column";

export type SortDir = "asc" | "desc";

export interface SortDef {
  col: Column;
  key: string;
  dir: SortDir;
}
