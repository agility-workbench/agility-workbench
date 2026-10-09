import type { SetFilterComparator } from "../filter/setFilterCore";
import { FilterValueAsyncSource } from "../filter/types";
import { Column } from "../column/column";
import type { ValueFormatterParams } from "../column/formatters";
import { IRowNode } from "./iRowNode";
import type {
  SetFilterGroupComponent,
  SetFilterSpecialValueComponent,
  SetFilterValueComponent,
} from "../renderer/filter/setFilterValueComponent";

/**
 * Custom column filter matcher. Called once per row for each active menu filter on the column;
 * return true to keep the row. Receives the cell value, the row node, and the user's current filter
 * input from the menu: `filterValues` is the `FilterDef.values` array (e.g. `["abc"]` for contains,
 * `[10, 20]` for inRange, `[]` for isBlank), and `filterType` is the chosen operator. Values are raw
 * unless `filterParams.textFormatter` is configured, in which case the formatter is applied to the
 * cell and filter values first. Use it to implement column-specific matching that the built-in
 * operators don't cover. Only runs for filters the user has applied via the menu — a column with no
 * active filter is not filtered.
 */
export type FilterMatcherFn = (
  val: any,
  node: IRowNode,
  filterValues: any[],
  filterType: FilterType,
) => boolean;

export type Filter = boolean | string | FilterMatcherFn;

export enum FilterType {
  CONTAINS = "contains",
  NOT_CONTAINS = "notContains",
  STARTS_WITH = "startsWith",
  ENDS_WITH = "endsWith",
  EQ = "eq",
  NEQ = "neq",
  LT = "lt",
  LTE = "lte",
  GT = "gt",
  GTE = "gte",
  IN_RANGE = "inRange",
  NOT_IN_RANGE = "notInRange",
  IS_BLANK = "isBlank",
  IS_NOT_BLANK = "isNotBlank",
  IN = "in",
  NOT_IN = "notIn",
}

export type ComparatorFn = (a: any, b: any, nodeA: IRowNode, nodeB: IRowNode) => number;

/**
 * Explicit set-filter intent. When present on an in/notIn FilterDef, the stored representation
 * always follows the mode — "include" stores the checked values as `in`, "exclude" stores the
 * unchecked values as `notIn` — and the menu's usual storage optimization (flipping to whichever
 * list is shorter) is suppressed. The observable difference is what happens to values that arrive
 * AFTER filtering (new rows, edited cells): "exclude" shows them, "include" hides them.
 */
export type SetFilterMode = "include" | "exclude";

export interface FilterDef {
  type: FilterType;
  values: any;
  /** Set-filter (in/notIn) only: pins the representation to the user's intent. */
  mode?: SetFilterMode;
}

export interface FilterItem {
  col: Column
  key: string;
  filters: FilterDef[];
  // AND/OR between filters
  join?: "and" | "or";
}

export class FilterModel {
  public id: string;

  constructor(public items: FilterItem[] = []) {
    this.id = crypto.randomUUID();
    this.items = items;
  }

  addItem(item: FilterItem) {
    const nextItems = this.items.filter(f => !this.matchesColumn(f, item.col));
    nextItems.push({ ...item, key: item.col.key });
    this.items = nextItems;
    this.id = crypto.randomUUID();
  }

  removeItem(col: Column): boolean {
    const nextItems = this.items.filter(f => !this.matchesColumn(f, col));
    if (nextItems.length === this.items.length) return false;
    this.items = nextItems;
    this.id = crypto.randomUUID();
    return true;
  }

  setItems(items: FilterItem[]) {
    this.items = items;
    this.id = crypto.randomUUID();
  }

  clear() {
    this.items = [];
    this.id = crypto.randomUUID();
  }

  private matchesColumn(item: FilterItem, col: Column): boolean {
    return item.col.instanceID === col.instanceID
      || item.col.colId === col.colId
      || item.col.key === col.key
      || item.key === col.colId
      || item.key === col.key;
  }
}

export type FilterAction = "apply" | "clear" | "reset" | "cancel";

export type FilterOption = {
  value: FilterType;
  label: string;
};

export interface FilterParams {
  buttons?: FilterAction[];
  /** Close the filter popover after its explicit Apply button commits. Defaults to false. */
  closeOnApply?: boolean;
  debounceMs?: number;
  /** Preserve letter case for built-in comparisons. Defaults to false (case-insensitive). */
  caseSensitive?: boolean;
  /** Trim leading and trailing whitespace from built-in filter operands. Defaults to false. */
  trimValues?: boolean;
  filterOptions?: FilterOption[];
  maxNumConditions?: number;
  initialFilterItemsCount?: number;
  filterValues?: any[] | FilterValueAsyncSource; // for set filter; if not specified, will be derived from rows
  /**
   * Creates the stable identity used to deduplicate and compare regular set-filter values. The raw
   * values are still stored in filter models and returned by the Set Filter API.
   *
   * **Never called with a blank value.** `null`, `undefined`, and `""` are blanks (never `0` or
   * `false`); the grid decides that from the raw value and folds them into its own `(Blanks)` row,
   * so this only ever sees values it was written for — `value => value.code` needs no guard.
   *
   * **Return `""` to call a value blank.** That is how an application widens the bucket — useful for
   * values assembled by a `valueGetter`, where only the application knows which shapes are empty.
   * The value then folds into `(Blanks)`, is not passed to the filter's `valueFormatter` either, and
   * is stored as `null` in the filter model. A nullish return means the same thing, so a keyCreator
   * that misses (`value?.code` on an unexpected shape) declares a blank rather than failing.
   *
   * On the server-side row model the `(Blanks)` bucket travels as `null` in the filter model and the
   * server applies its own blank rule — it cannot see this function, so a value this callback calls
   * blank is a client-side notion the server has to reproduce itself.
   */
  keyCreator?: (value: any) => string;
  /**
   * Formats regular set-filter values for display, sorting, mini-filter matching, accessible names,
   * and `SetFilterValueComponentParams.valueFormatted`. Falls back to the column valueFormatter.
   *
   * Never called with a blank value, nor with one `keyCreator` called blank: `(Blanks)` is the
   * grid's row, labeled by the grid (or by `blanksComponent`). Note that the *column's*
   * `valueFormatter` is still called with blanks when rendering cells — that is how an application
   * shows an em dash for an empty cell.
   */
  valueFormatter?: (params: ValueFormatterParams) => string;
  /**
   * Orders the set filter's values in place of the built-in order (labels, or in the tree layout
   * segments when they are numbers or dates). Applies to the universe read from the rows and, in
   * the tree layout, to the siblings at every level of it; a static or async `filterValues` list
   * keeps the order it was given in either layout (tree siblings in the order their values are
   * listed) and is not passed through it. Each side carries the raw `value` (absent on a tree group) and the `label`
   * the menu shows, plus `segment`, `level`, and `path` in the tree layout. Never called with a
   * blank: `(Blanks)` stays pinned above the values, and Select All above that.
   */
  comparator?: SetFilterComparator;
  /**
   * Shows the number of loaded leaf rows represented by each set-filter value.
   * Counts cover every row in CSRM and only rows currently loaded in SSRM.
   */
  showValueCounts?: boolean;
  /** Replaces the text span for regular set-filter values; the grid continues to own the checkbox. */
  valueComponent?: SetFilterValueComponent;
  /** Extra params merged into regular set-filter value component params. */
  valueComponentParams?: any;
  /** Replaces only the Select All text span; omitted means the built-in label is rendered. */
  selectAllComponent?: SetFilterSpecialValueComponent;
  /** Extra params merged into the Select All component params. */
  selectAllComponentParams?: any;
  /** Replaces only the Blanks text span; omitted means the built-in label is rendered. */
  blanksComponent?: SetFilterSpecialValueComponent;
  /** Extra params merged into the Blanks component params. */
  blanksComponentParams?: any;
  /**
   * Tree layout: replaces the text span of a group row; the grid keeps the chevron and the
   * checkbox. Receives the label, the summed count, the level, the path, the segment, and whether
   * the group is open (refreshed when that changes).
   */
  groupComponent?: SetFilterGroupComponent;
  /** Extra params merged into the group component params. */
  groupComponentParams?: any;
  /**
   * Tree layout (`filter: "tree"`): the path of a value in the tree, root first and the leaf last —
   * `["Fruit", "Citrus", "Orange"]` lists Orange under Fruit › Citrus. Every segment but the last
   * becomes a collapsible group; values sharing a prefix share those groups. Return null or an empty
   * array to place a value at the root with its ordinary label.
   *
   * Without it, a `Date` value (or a date column's parseable text) is placed under its year and
   * month with the day as the leaf, and anything else sits at the root. Never called with a blank:
   * `(Blanks)` keeps its own row above the tree.
   *
   * Groups are never stored. Checking one checks the leaves beneath it, and the filter model holds
   * the leaf values exactly as in the flat layout, so the Set Filter API and a server-side data
   * source see no difference.
   */
  treePathGetter?: (value: any) => any[] | null | undefined;
  /**
   * Tree layout: formats one path segment for display, mini-filter matching, and accessible names.
   * `level` is 0 at the root and `parentPath` holds the segments above. Defaults to the month's
   * name at level 1 of the built-in date path, else `String(segment)`.
   */
  treePathFormatter?: (segment: any, level: number, parentPath: any[]) => string;
  /**
   * Tree layout: depth to which groups start open each time the filter opens. 0 (default) leaves
   * every group collapsed; N opens the first N levels; -1 opens all. A typed mini filter opens every
   * group with a match for as long as it is typed.
   */
  treeDefaultExpanded?: number;
  /**
   * Tree layout: whether the groups a user opens or closes are remembered for as long as the grid
   * lives, so the filter reopens as it was left; a group not seen before starts at
   * `treeDefaultExpanded`. Defaults to true. `false` reopens at the default depth every time.
   */
  treeRememberExpansion?: boolean;
  /**
   * Transforms cell and filter operands before comparison. Runs before built-in normalization and
   * before either custom matcher. Built-in blank operators still inspect the raw cell value.
   */
  textFormatter?: (value: any) => string;
  /**
   * Custom client-side comparison. Takes precedence over a function assigned to `ColDef.filter`,
   * unless `ColDef.filter` is explicitly false. Receives textFormatter-processed operands and the
   * resolved case/trim flags; the callback owns how those flags apply to its comparison.
   */
  filterFunction?: (type: FilterType, filterValues: any[], cellValue: any, caseSensitive?: boolean, trimValues?: boolean) => boolean;
}

/** `"tree"` is the set filter with its values laid out as a collapsible tree (`FilterParams.treePathGetter`). */
export type FilterInputType = "text" | "number" | "date" | "boolean" | "dropdown" | "set" | "tree" | "none";

export function valuesNeededFor(op: FilterType): number {
  switch (op) {
    case FilterType.IS_BLANK:
    case FilterType.IS_NOT_BLANK:
      return 0;
    case "inRange":
      return 2;
    case FilterType.IN:
    case FilterType.NOT_IN:
      return -1; // but “multipleValues” true; values[0] is array OR store in values directly
    default:
      return 1;
  }
}
