import { IRowNode } from "../interfaces/iRowNode";
import {
  FilterInputType,
  FilterOption,
  FilterParams,
  FilterType,
  FilterDef,
  FilterItem,
} from "../interfaces/filter";
import { Column } from "../column/column";
import { ColDef } from "../interfaces";

export type FilterKind = "text" | "number" | "date" | "set" | "boolean";

export function getFilterKindForFilterType(inputType: FilterInputType): FilterKind {
  switch (inputType) {
    case "text":
    case "dropdown":
      return "text";
    case "number":
      return "number";
    case "date":
      return "date";
    case "set":
    case "tree":
      return "set";
    case "boolean":
      return "boolean";
    case "none":
      return "text";
    default:
      return "text";
  }
}

export interface FilterValueAsyncSourceParams {
  colDef: ColDef;
  signal: AbortSignal;
  success: (values: any[]) => void;
  error: (err: any) => void;
}

export type FilterValueAsyncSource = (params: FilterValueAsyncSourceParams) => void | Promise<void>;

export type FilterValueSource =
  | { kind: "static"; values: any[] }
  | { kind: "fromRows" }
  | { kind: "async"; load: FilterValueAsyncSource };


export interface FilterConditionSpec {
  // template-ish
  ops: FilterOption[];
  valueInputType: FilterInputType;
  valueSource?: FilterValueSource; // only for set
}

export interface FilterPanelSpec {
  column: Column;
  kind: FilterKind;

  conditionTemplate: FilterConditionSpec;
  params: FilterParams;

  limits: {
    maxNumConditions: number;
    defaultNumConditions: number;
    exceededByModel: boolean; // initial model exceeded max
  };

  defaultOp: FilterType;

  // set-filter helpers
  valueKey?: (value: any) => string;
  valueLabel?: (value: any) => string;
}

export type FilterApplyReason =
  | "ui"
  | "debounce"
  | "applyButton"
  | "clearAll"
  | "reset"
  | "cancelRevert";

export interface FilterControllerHooks {
  // commit to grid filtering pipeline (client filter or SSRM refresh)
  applyModel: (col: Column, model: FilterItem | null, meta: { reason: FilterApplyReason }) => void;

  // for set filter fromRows
  getAllRows: (callback: (node: IRowNode, idx: number) => void) => void;
}

export type SetFilterOptionType = "select_all" | "blanks" | "value";

export interface SetFilterOptions {
  type: SetFilterOptionType;
  key: string;
  label: string;
  raw: any;
  hidden: boolean;
}

export interface FilterRuntimeState {
  join: "and" | "or";

  // dynamic rows
  conditionOrder: string[]; // ["c1","c2",...]

  // draft values
  draft: Record<string, FilterDef>;

  // ui state per condition
  ui: Record<
    string,
    {
      loading?: boolean;
      options?: SetFilterOptions[];
      error?: string;
      valid?: boolean;
      miniFilter?: string;
      selectedIdx?: number;
    }
  >;
}

export interface IFilterController {
  subscribe(listener: (s: FilterRuntimeState) => void): () => void;

  setJoin(join: "and" | "or"): void;

  setOp(condIndex: number, op: FilterType): void;
  setValue(condIndex: number, valueIndex: number, value: any): void;

  // convenience for set-filter selection: store selected raw keys/values as values array
  toggleSetValue(condIndex: number, optionIdx: number, selected: boolean): void;
  filterOptions(condIndex: number, filter: string): void;
  applyMiniFilter(condIndex: number): void;

  // actions
  apply(): void;
  clearAll(): void;
  reset(): void;
  cancel(): void;

  dispose(): void;
}

export class FilterValueAsyncSourceParamsImpl implements FilterValueAsyncSourceParams {
  private successCallback!: (values: any[]) => void;
  private errorCallback!: (err: any) => void;

  constructor(public colDef: ColDef, public signal: AbortSignal) { }

  onSuccess(callback: (values: any[]) => void): void {
    this.successCallback = callback;
  }

  onError(callback: (err: any) => void): void {
    this.errorCallback = callback;
  }

  success(values: any[]): void {
    if (this.successCallback) {
      this.successCallback(values);
    }
  }

  error(err: any): void {
    if (this.errorCallback) {
      this.errorCallback(err);
    }
  }
}
