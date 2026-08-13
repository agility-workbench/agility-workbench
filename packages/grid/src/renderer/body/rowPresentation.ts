import type { Column } from "../../column/column";
import type { GridCore } from "../../core/core";
import type {
  RowPinnedPosition,
  RowPresentation,
  RowPresentationParams,
} from "../../interfaces/gridOptions";
import type { IRowNode } from "../../interfaces/iRowNode";

export function resolveRowPresentation(
  core: GridCore,
  row: IRowNode,
  rowIndex: number,
  rowPinned?: RowPinnedPosition,
): RowPresentation | undefined {
  const getter = core.options.getRowPresentation;
  if (!getter) return undefined;
  const params: RowPresentationParams = {
    data: row.data,
    rowId: row.id,
    rowIndex,
    isGroup: !!row.isGroup,
    node: row,
    rowPinned,
  };
  return getter(params) ?? undefined;
}

export function inheritRowPresentation(
  col: Column,
  field: "cellClass" | "cellStyle" | "tooltip",
): boolean {
  const setting = col.col.inheritRowPresentation;
  if (setting === false) return false;
  if (setting == null || setting === true) return true;
  return setting[field] !== false;
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
