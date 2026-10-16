import { IGridCore } from "../interfaces";
import type { LocaleTextResolver } from "../interfaces/locale";
import { staticSetValue } from "./setFilterCore";
import { FilterInputType, FilterOption, FilterParams, FilterType } from "../interfaces/filter";
import { ColumnFilterContext } from "./context";
import { ColumnType } from "../interfaces/column";
import { Column } from "../column/column";
import { parseDateInput } from "../column/formatters";
import { FilterPanelSpec, FilterValueSource, getFilterKindForFilterType } from "./types";
import {
  dateSegmentFormatter,
  dateTreePath,
  defaultSegmentFormatter,
  SetFilterTreeSpec,
} from "./setFilterTree";

export class ColumnFilterMenuService {
  constructor(private core: IGridCore) { }

  private readonly t: LocaleTextResolver = (key, values) => this.core.getLocaleText(key, values);

  /** Offered last by every built-in operator list (set filters aside). */
  private blankOps(): FilterOption[] {
    return [
      { value: FilterType.IS_BLANK, label: this.t("filterIsBlank") },
      { value: FilterType.IS_NOT_BLANK, label: this.t("filterIsNotBlank") },
    ];
  }

  buildFilterMenu(ctx: ColumnFilterContext): FilterPanelSpec {
    const filterParams = this.getFilterParams(ctx.targetCol);
    let filterType = this.getFilterInputType(ctx.targetCol);
    const isSetFilter = filterType === "set" || filterType === "tree";

    let filterValueSource: FilterValueSource | undefined;
    const valueSource = isSetFilter ? filterParams.filterValues || "fromRows" : undefined;
    if (valueSource === "fromRows") {
      filterValueSource = { kind: "fromRows" };
    } else if (Array.isArray(valueSource)) {
      filterValueSource = { kind: "static", values: valueSource.map(staticSetValue) };
    } else if (typeof valueSource === "function") {
      filterValueSource = { kind: "async", load: valueSource };
    }

    const valueFormatter = filterParams.valueFormatter ?? ctx.targetCol.valueFormatter;

    return {
      column: ctx.targetCol,
      kind: getFilterKindForFilterType(filterType),
      conditionTemplate: {
        ops: filterParams.filterOptions || [],
        valueInputType: filterType,
        valueSource: filterValueSource,
      },
      params: filterParams,
      limits: {
        maxNumConditions: typeof filterParams.maxNumConditions === "number" ? filterParams.maxNumConditions : 1,
        defaultNumConditions: typeof filterParams.initialFilterItemsCount === "number" ? filterParams.initialFilterItemsCount : 1,
        exceededByModel: false,
      },
      defaultOp: filterParams.filterOptions && filterParams.filterOptions.length > 0 ? filterParams.filterOptions[0].value : FilterType.EQ,
      valueKey: isSetFilter ? filterParams.keyCreator : undefined,
      valueLabel: isSetFilter && valueFormatter
        ? value => valueFormatter({ value, col: ctx.targetCol })
        : undefined,
      compare: isSetFilter ? filterParams.comparator : undefined,
      tree: filterType === "tree" ? this.buildTreeSpec(ctx.targetCol, filterParams, filterValueSource?.kind === "fromRows") : undefined,
      localeText: this.t,
    };
  }

  /**
   * How a tree-layout column places and labels its values. An application path getter comes with
   * plain `String(segment)` labels unless it also formats; the built-in date path (Date values, or
   * a date column's text) names its months in the column's formatter locale.
   */
  /**
   * The tree layout's spec. Sibling order follows the value source the way the flat layout's does:
   * values read from the rows are sorted (built-in rule or the application's comparator); a static
   * or async list keeps the order it was given, and the comparator is not consulted for it.
   */
  private buildTreeSpec(column: Column, params: FilterParams, fromRows: boolean): SetFilterTreeSpec {
    const isDateColumn = column.type === ColumnType.DATE;
    const pathOf = params.treePathGetter
      ?? dateTreePath(value => (isDateColumn ? parseDateInput(value) : null));
    const formatSegment = params.treePathFormatter
      ?? (params.treePathGetter ? defaultSegmentFormatter : dateSegmentFormatter(this.formatterLocale(column)));
    return {
      pathOf,
      formatSegment,
      defaultExpanded: params.treeDefaultExpanded ?? 0,
      compare: fromRows ? params.comparator : undefined,
      keepOrder: !fromRows,
      rememberExpansion: params.treeRememberExpansion !== false,
    };
  }

  private formatterLocale(column: Column): string | undefined {
    const opts = typeof column.formatterOptions === "function"
      ? column.formatterOptions({ col: column })
      : column.formatterOptions;
    return opts?.locale;
  }

  private getFilterParams(column: Column): FilterParams {
    const filterParams = this.mergeFilterParams(
      this.getDefaultFilterParams(column),
      // The defaults already follow the column type when `filter` names no kind; reading the type
      // again here would let it override an explicit `filter: "boolean"` / `"date"` / `"number"`.
      column.filterParams ?? {}
    );
    return filterParams;
  }

  private getDefaultFilterParams(column: Column): FilterParams {
    if (column.filter === true || typeof column.filter === "function" || column.filter === undefined) {
      return this.getFilterParamsByColType(column);
    }
    const debounceMs = this.core.getOptions().filterDebounceMs;
    switch (column.filter) {
      case "number":
      case "currency":
        return { filterOptions: this.getFilterOpsForType(true), debounceMs };
      case "date":
        return { filterOptions: this.getFilterOpsForType(true) };
      case "boolean":
        return { filterOptions: this.getBooleanFilterOps() };
      case "dropdown":
        return { filterOptions: this.getDropdownFilterOps() };
      case "set":
      case "tree":
        return { filterOptions: [{ value: FilterType.NOT_IN, label: this.t("filterNotIn") }] };
    }
    return { filterOptions: this.getFilterOpsForType(false), debounceMs };
  }

  private mergeFilterParams(defaultParams: FilterParams, customParams: FilterParams): FilterParams {
    return { ...defaultParams, ...customParams };
  }

  private getFilterParamsByColType(column: Column): FilterParams {
    if (column.filter === "set" || column.filter === "tree") {
      return { filterOptions: [{ value: FilterType.NOT_IN, label: this.t("filterNotIn") }] };
    }
    const debounceMs = this.core.getOptions().filterDebounceMs;
    switch (column.type) {
      case ColumnType.NUMBER:
      case ColumnType.CURRENCY:
        return { filterOptions: this.getFilterOpsForType(column.isComputableType()), debounceMs };
      case ColumnType.DATE:
        return { filterOptions: this.getFilterOpsForType(column.isComputableType()) };
      case ColumnType.BOOLEAN:
        return { filterOptions: this.getBooleanFilterOps() };
      default:
        return { filterOptions: this.getFilterOpsForType(column.isComputableType()), debounceMs };
    }
  }

  private getFilterOpsForType(isComputable: boolean): FilterOption[] {
    if (isComputable) {
      return [
        { value: FilterType.EQ, label: this.t("filterEqual") },
        { value: FilterType.NEQ, label: this.t("filterNotEqual") },
        { value: FilterType.GT, label: this.t("filterGreaterThan") },
        { value: FilterType.GTE, label: this.t("filterGreaterThanOrEqual") },
        { value: FilterType.LT, label: this.t("filterLessThan") },
        { value: FilterType.LTE, label: this.t("filterLessThanOrEqual") },
        { value: FilterType.IN_RANGE, label: this.t("filterBetween") },
        { value: FilterType.NOT_IN_RANGE, label: this.t("filterNotBetween") },
        ...this.blankOps(),
      ];
    }
    // string
    return [
      { value: FilterType.CONTAINS, label: this.t("filterContains") },
      { value: FilterType.NOT_CONTAINS, label: this.t("filterExcludes") },
      { value: FilterType.EQ, label: this.t("filterEqual") },
      { value: FilterType.NEQ, label: this.t("filterNotEqual") },
      { value: FilterType.STARTS_WITH, label: this.t("filterStartsWith") },
      { value: FilterType.ENDS_WITH, label: this.t("filterEndsWith") },
      ...this.blankOps(),
    ];
  }

  /** A true / false choice: equality only, plus the blank checks. */
  private getBooleanFilterOps(): FilterOption[] {
    return [
      { value: FilterType.EQ, label: this.t("filterEqual") },
      { value: FilterType.NEQ, label: this.t("filterNotEqual") },
      ...this.blankOps(),
    ];
  }

  /** A pick from `filterParams.filterValues`: equality only, plus the blank checks. */
  private getDropdownFilterOps(): FilterOption[] {
    return this.getBooleanFilterOps();
  }

  private getFilterInputType(column: Column): FilterInputType {
    if (typeof column.filter === "string") {
      return this.getFilterInputTypeForFilter(column.filter);
    }
    return this.getFilterInputTypeForColumn(column);
  }

  private getFilterInputTypeForColumn(column: Column): FilterInputType {
    if (column.isNumericType()) {
      return "number";
    } else if (column.type === ColumnType.DATE) {
      return "date";
    } else if (column.type === ColumnType.BOOLEAN) {
      return "boolean";
    }
    return "text";
  }

  private getFilterInputTypeForFilter(filter: string): FilterInputType {
    switch (filter) {
      case "currency":
        return "number";
    }
    return filter as FilterInputType;
  }

}
