import { Column } from "../../column/column";
import { GridCore } from "../../core/core";
import { DEFAULT_SORTING_ORDER, SortDir } from "../../interfaces/sort";

export type OrderedSortItem = {
  key: string;
  dir: SortDir;
};

export function getSortDirections(col: Column): SortDir[] {
  const order = col.sortingOrder?.length ? col.sortingOrder : DEFAULT_SORTING_ORDER;
  return Array.from(new Set(
    order.filter((candidate): candidate is SortDir => candidate != null),
  ));
}

export function getOrderedSortItems(core: GridCore): OrderedSortItem[] {
  return core.getSortModel().items.map(item => ({
    key: item.col.instanceID,
    dir: item.dir,
  }));
}

export function applyOrderedSortItems(core: GridCore, next: OrderedSortItem[]): void {
  const current = getOrderedSortItems(core);
  const unchanged = current.length === next.length && current.every(
    (item, index) => item.key === next[index].key && item.dir === next[index].dir,
  );
  if (unchanged) return;

  core.dispatch({
    type: "sortModelSet",
    sortItems: [
      ...current.map(item => ({ key: item.key, dir: null })),
      ...next,
    ],
  });
}

export function insertSortColumn(
  core: GridCore,
  col: Column,
  index?: number,
): void {
  const sorts = getOrderedSortItems(core);
  const from = sorts.findIndex(item => item.key === col.instanceID);
  const existing = from < 0 ? null : sorts.splice(from, 1)[0];
  const dir = existing?.dir ?? getSortDirections(col)[0];
  if (!dir) return;

  const requested = index == null ? sorts.length : index;
  const insertAt = Math.max(
    0,
    Math.min(from >= 0 && requested > from ? requested - 1 : requested, sorts.length),
  );
  sorts.splice(insertAt, 0, { key: col.instanceID, dir });
  applyOrderedSortItems(core, sorts);
}
