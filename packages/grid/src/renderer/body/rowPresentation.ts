import type { Column } from "../../column/column";
import type { IGridCore } from "../../interfaces/iGridCore";
import type {
  RowPinnedPosition,
  RowPresentation,
} from "../../interfaces/gridOptions";
import type { IRowNode } from "../../interfaces/iRowNode";

export function resolveRowPresentation(
  core: IGridCore,
  row: IRowNode,
  rowIndex: number,
  rowPinned?: RowPinnedPosition,
): RowPresentation | undefined {
  return core.resolveRowPresentation(row, rowIndex, rowPinned);
}

export function inheritRowPresentation(
  col: Column,
  field: "cellClass" | "cellStyle" | "tooltip" | "editable",
): boolean {
  return col.inheritsRowPresentation(field);
}

export function mergeClassValues(
  first: string | string[] | null | undefined,
  second: string | string[] | null | undefined,
): string[] | null {
  const values = [first, second]
    .flatMap(value => Array.isArray(value) ? value : value ? [value] : [])
    .filter(Boolean);
  return values.length ? values : null;
}

export function mergeStyleValues(
  defaults: Partial<CSSStyleDeclaration> | null | undefined,
  overrides: Partial<CSSStyleDeclaration> | null | undefined,
): Partial<CSSStyleDeclaration> | null {
  if (!defaults && !overrides) return null;
  return { ...(defaults ?? {}), ...(overrides ?? {}) };
}
