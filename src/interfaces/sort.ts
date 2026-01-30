import { Column } from "../column/Column";

export type SortDir = "asc" | "desc";

export interface SortDef {
  col: Column;
  key: string;
  dir: SortDir;
}
