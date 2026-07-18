import { IGridCore } from "../interfaces";
import { FilterInputType, FilterOption, FilterParams, FilterType } from "../interfaces/filter";
import { ColumnFilterContext } from "./context";
import { ColumnType } from "../interfaces/column";
import { Column } from "../column/column";
import { FilterPanelSpec, FilterValueSource, getFilterKindForFilterType } from "./types";

export class ColumnFilterMenuService {
  constructor(private core: IGridCore) { }

  buildFilterMenu(ctx: ColumnFilterContext): FilterPanelSpec {
    const filterParams = this.getFilterParams(ctx.targetCol);
    let filterType = this.getFilterInputType(ctx.targetCol);

    let filterValueSource: FilterValueSource | undefined;
    const valueSource = filterType === "set" || filterType === "tree" ? filterParams.filterValues || "fromRows" : undefined;
    if (valueSource === "fromRows") {
      filterValueSource = { kind: "fromRows" };
    } else if (Array.isArray(valueSource)) {
      filterValueSource = { kind: "static", values: valueSource.map(o => o.value) };
    } else if (typeof valueSource === "function") {
      filterValueSource = { kind: "async", load: valueSource };
    }

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
        maxNumConditions: typeof filterParams.maxFilterItems === "number" ? filterParams.maxFilterItems : 1,
        defaultNumConditions: typeof filterParams.initialFilterItemsCount === "number" ? filterParams.initialFilterItemsCount : 1,
        exceededByModel: false,
      },
      defaultOp: filterParams.filterOptions && filterParams.filterOptions.length > 0 ? filterParams.filterOptions[0].value : FilterType.EQ,
    };
  }

  private getFilterParams(column: Column): FilterParams {
    const filterParams = this.mergeFilterParams(
      this.getDefaultFilterParams(column),
      column.filterParams || this.getFilterParamsByColType(column)
    );
    return filterParams;
  }

  private getDefaultFilterParams(column: Column): FilterParams {
    if (column.filter === true || typeof column.filter === "function" || column.filter === undefined) {
      return this.getFilterParamsByColType(column);
    }
    switch (column.filter) {
      case "number":
      case "currency":
        return { filterOptions: this.getFilterOpsForType(true), debounceMs: 300 };
      case "date":
        return { filterOptions: this.getFilterOpsForType(true) };
      case "boolean":
        return { filterOptions: this.getFilterOpsForType(true) };
      case "set":
      case "tree":
        return { filterOptions: [{value: FilterType.NOT_IN, label: "Not in"}] };
    }
    return { filterOptions: this.getFilterOpsForType(false), debounceMs: 300 };
  }

  private mergeFilterParams(defaultParams: FilterParams, customParams: FilterParams): FilterParams {
    return { ...defaultParams, ...customParams };
  }

  private getFilterParamsByColType(column: Column): FilterParams {
    if (column.filter === "set" || column.filter === "tree") {
      return { filterOptions: [{value: FilterType.NOT_IN, label: "Not in"}] };
    }
    switch (column.type) {
      case ColumnType.NUMBER:
      case ColumnType.CURRENCY:
        return { filterOptions: this.getFilterOpsForType(column.isComputableType()), debounceMs: 300 };
      case ColumnType.DATE:
        return { filterOptions: this.getFilterOpsForType(column.isComputableType()) };
      case ColumnType.BOOLEAN:
        return { filterOptions: this.getFilterOpsForType(column.isComputableType()) };
      default:
        return { filterOptions: this.getFilterOpsForType(column.isComputableType()), debounceMs: 300 };
    }
  }

  private getFilterOpsForType(isComputable: boolean): FilterOption[] {
    if (isComputable) {
      return [
        { value: FilterType.EQ, label: "Equal" },
        { value: FilterType.NEQ, label: "Not equal" },
        { value: FilterType.GT, label: "Greater than" },
        { value: FilterType.GTE, label: "Greater than or equal" },
        { value: FilterType.LT, label: "Less than" },
        { value: FilterType.LTE, label: "Less than or equal" },
        { value: FilterType.IN_RANGE, label: "Between" },
        { value: FilterType.NOT_IN_RANGE, label: "Not between" },
      ];
    }
    // string
    return [
      { value: FilterType.CONTAINS, label: "Contains" },
      { value: FilterType.NOT_CONTAINS, label: "Excludes" },
      { value: FilterType.EQ, label: "Equal" },
      { value: FilterType.NEQ, label: "Not equal" },
      { value: FilterType.STARTS_WITH, label: "Starts with" },
      { value: FilterType.ENDS_WITH, label: "Ends with" },
    ];
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
