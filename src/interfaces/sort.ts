import { Column } from "../column/column";

export type SortDir = "asc" | "desc";

export interface SortModel {
  col: Column;
  key: string;
  dir: SortDir;
}
