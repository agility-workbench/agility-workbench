import { IRowNode } from "../interfaces/iRowNode";
import {
  FilterModel,
  FilterInputType,
  FilterOption,
  FilterParams,
  FilterType,
  FilterDef,
} from "../interfaces/filter";
import { Column } from "../column/column";

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

export type FilterValueSource =
  | { kind: "static"; values: any[] }
  | { kind: "fromRows" }
  | { kind: "async"; load: (ctx: { colId: string; signal: AbortSignal }) => Promise<{ values: any[] }> };


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
  applyModel: (col: Column, model: FilterModel | null, meta: { reason: FilterApplyReason }) => void;

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
    }
  >;
}

export interface IFilterController {
  subscribe(listener: (s: FilterRuntimeState) => void): () => void;

  setJoin(join: "and" | "or"): void;

  setOp(condIndex: number, op: FilterType): void;
  setValue(condIndex: number, valueIndex: number, value: any): void;

  // convenience for set-filter selection: store selected raw keys/values as values array
  toggleSetValue(condIndex: number, type: SetFilterOptionType, value: any, selected: boolean): void;
  filterOptions(condIndex: number, filter: string): void;
  applyMiniFilter(condIndex: number): void;

  // actions
  apply(): void;
  clearAll(): void;
  reset(): void;
  cancel(): void;

  dispose(): void;
}
