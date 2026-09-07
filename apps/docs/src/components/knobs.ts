import type { DemoFeature } from "./snippets";

/**
 * The configurable surface of each live example, declared as data.
 *
 * A knob is one control in the example frame; `toProps` turns the current knob values into the grid
 * options they stand for. The options come out as plain data (no functions), which is what lets the
 * code tabs print them back verbatim — see `optionsCode.ts`. Knobs flagged `structural` change
 * options the grid fixes at construction (they fold into the `<Grid key>` and remount); everything
 * else flows through the wrapper's prop reconciliation and updates the mounted grid in place.
 *
 * This module must stay import-safe on the server: the code tabs render during static build, and
 * they read knob defaults from here. Import grid *types* only.
 */
export type KnobDef =
  | { id: string; label: string; kind: "toggle"; default: boolean; structural?: boolean; hint?: string }
  | {
    id: string;
    label: string;
    kind: "select";
    options: readonly { value: string; label?: string }[];
    default: string;
    structural?: boolean;
    hint?: string;
  }
  | {
    id: string;
    label: string;
    kind: "number";
    default: number;
    min?: number;
    max?: number;
    step?: number;
    structural?: boolean;
    hint?: string;
  };

export type KnobValue = boolean | string | number;
export type KnobValues = Record<string, KnobValue>;

/** Grid options a set of knob values stands for. Plain data only — the code tabs print it. */
export type KnobOptions = Record<string, unknown>;

export type FeatureKnobs = {
  knobs: readonly KnobDef[];
  toProps: (values: KnobValues) => KnobOptions;
};

const bool = (v: KnobValue) => v === true;
const str = (v: KnobValue) => String(v);
const num = (v: KnobValue) => Number(v);

const onOff = (value: KnobValue, key: string): KnobOptions => (bool(value) ? { [key]: true } : {});

export const featureKnobs: Partial<Record<DemoFeature, FeatureKnobs>> = {
  columns: {
    knobs: [
      { id: "rowNumbers", label: "Row numbers", kind: "toggle", default: true, structural: true },
      { id: "columnPanel", label: "Columns panel", kind: "toggle", default: true },
      { id: "showColumnButtonsOnHover", label: "Header buttons on hover only", kind: "toggle", default: false },
      { id: "quickFilter", label: "Toolbar search", kind: "toggle", default: true },
    ],
    toProps: (v) => ({
      ...onOff(v.rowNumbers, "rowNumbers"),
      ...(bool(v.columnPanel) ? { columnPanel: { trigger: "toolbar" } } : {}),
      ...onOff(v.showColumnButtonsOnHover, "showColumnButtonsOnHover"),
      ...(bool(v.quickFilter) ? { toolbar: { quickFilter: true } } : {}),
    }),
  },
  "client-side-data": {
    knobs: [
      { id: "pagination", label: "Pagination", kind: "toggle", default: true },
      { id: "pageSize", label: "Page size", kind: "select", options: [{ value: "10" }, { value: "20" }, { value: "50" }], default: "10", structural: true },
      { id: "rowNumbers", label: "Row numbers", kind: "toggle", default: true, structural: true },
    ],
    toProps: (v) => ({
      ...(bool(v.pagination) ? { pagination: true, pageSize: num(v.pageSize), pageSizes: [10, 20, 50] } : {}),
      ...onOff(v.rowNumbers, "rowNumbers"),
    }),
  },
  "server-side-data": {
    knobs: [
      { id: "blockSize", label: "Block size", kind: "select", options: [{ value: "6" }, { value: "12" }, { value: "24" }], default: "12", structural: true },
      { id: "pagination", label: "Pagination", kind: "toggle", default: true },
    ],
    toProps: (v) => ({
      serverSideBlockSize: num(v.blockSize),
      ...(bool(v.pagination) ? { pagination: true, pageSize: num(v.blockSize) } : {}),
    }),
  },
  filtering: {
    knobs: [
      { id: "mode", label: "Search box", kind: "select", options: [{ value: "always", label: "Always shown" }, { value: "onDemand", label: "On demand (Ctrl/Cmd+F)" }], default: "always" },
      { id: "behavior", label: "Default behavior", kind: "select", options: [{ value: "filter", label: "Filter rows" }, { value: "find", label: "Find (highlight)" }], default: "filter" },
      { id: "matchMode", label: "Match", kind: "select", options: [{ value: "multiTerm", label: "Any term" }, { value: "substring", label: "Substring" }, { value: "wholeCell", label: "Whole cell" }], default: "multiTerm" },
      { id: "caseSensitive", label: "Case sensitive", kind: "toggle", default: false },
      { id: "showBehaviorToggle", label: "Filter/Find toggle in options", kind: "toggle", default: true },
    ],
    toProps: (v) => ({
      quickFilter: {
        mode: str(v.mode),
        behavior: str(v.behavior),
        matchMode: str(v.matchMode),
        ...(bool(v.caseSensitive) ? { caseSensitive: true } : {}),
        debounceMs: 0,
        showOptions: true,
        showBehaviorToggle: bool(v.showBehaviorToggle),
        showLayoutOptions: true,
      },
    }),
  },
  sorting: {
    knobs: [
      { id: "showSortPriority", label: "Priority badge", kind: "select", options: [{ value: "always" }, { value: "multi", label: "multi (only for multi-sort)" }, { value: "never" }], default: "always", structural: true },
      { id: "sortIconVisibility", label: "Sort icon", kind: "select", options: [{ value: "hover" }, { value: "always" }, { value: "never" }], default: "hover", structural: true },
      { id: "sortingOrder", label: "Click cycle", kind: "select", options: [{ value: "asc-desc-none", label: "asc → desc → none" }, { value: "desc-asc-none", label: "desc → asc → none" }, { value: "asc-desc", label: "asc ↔ desc" }], default: "asc-desc-none", structural: true },
      { id: "toolbar", label: "Sort toolbar", kind: "toggle", default: true },
    ],
    toProps: (v) => {
      // The sort cycle and icon visibility are column-level settings; `defaultColDef` is how a
      // grid sets them for every column at once.
      const defaults: KnobOptions = {};
      if (v.sortIconVisibility !== "hover") defaults.sortIconVisibility = str(v.sortIconVisibility);
      if (v.sortingOrder !== "asc-desc-none") {
        defaults.sortingOrder = v.sortingOrder === "desc-asc-none" ? ["desc", "asc", null] : ["asc", "desc"];
      }
      return {
        showSortPriority: str(v.showSortPriority),
        ...(Object.keys(defaults).length ? { defaultColDef: defaults } : {}),
        ...(bool(v.toolbar) ? { toolbar: { sorting: true } } : {}),
      };
    },
  },
  selection: {
    knobs: [
      { id: "rowSelection", label: "Row selection", kind: "select", options: [{ value: "off" }, { value: "rowNumbers", label: "Row numbers" }, { value: "checkboxes", label: "Checkboxes (multiple)" }, { value: "single", label: "Checkboxes (single)" }], default: "rowNumbers" },
      { id: "rangeSelection", label: "Range selection", kind: "toggle", default: true },
      { id: "columnSelection", label: "Column selection", kind: "toggle", default: true },
      { id: "cellSelection", label: "Cell cursor", kind: "select", options: [{ value: "true", label: "Grid cursor" }, { value: "text", label: "Native text selection" }, { value: "false", label: "Off" }], default: "true" },
      { id: "selectAllScope", label: "Select all", kind: "select", options: [{ value: "filtered", label: "All filtered rows" }, { value: "page", label: "Current page" }], default: "filtered", structural: true },
      { id: "selectionPersistence", label: "On sort/filter", kind: "select", options: [{ value: "clear", label: "Clear selection" }, { value: "keep", label: "Keep selection" }], default: "clear", structural: true },
      { id: "highlightActiveCell", label: "Highlight active cell", kind: "toggle", default: true },
    ],
    toProps: (v) => ({
      rowNumbers: true,
      ...(v.rowSelection === "rowNumbers"
        ? { rowSelection: true }
        : v.rowSelection === "checkboxes"
          ? { rowSelection: { mode: "multiple", checkboxes: true } }
          : v.rowSelection === "single"
            ? { rowSelection: { mode: "single", checkboxes: true } }
            : {}),
      // Fixed at construction, so it is always on: the row-number header selects all whenever row
      // selection is enabled by row numbers.
      selectAllRowsOnHeaderClick: true,
      // Range and column selection default to ON; turning one off has to say so.
      ...(bool(v.rangeSelection) ? {} : { rangeSelection: false }),
      ...(bool(v.columnSelection) ? {} : { columnSelection: false }),
      ...(v.cellSelection === "text" ? { cellSelection: "text" } : v.cellSelection === "false" ? { cellSelection: false } : {}),
      ...(v.selectAllScope === "page" ? { selectAllScope: "page" } : {}),
      ...(v.selectionPersistence === "keep" ? { selectionPersistence: "keep" } : {}),
      ...onOff(v.highlightActiveCell, "highlightActiveCell"),
    }),
  },
  editing: {
    knobs: [
      { id: "editTrigger", label: "Start editing on", kind: "select", options: [{ value: "doubleClick", label: "Double-click" }, { value: "singleClick", label: "Single click" }, { value: "none", label: "Keyboard only" }], default: "doubleClick" },
      { id: "moveAfterEdit", label: "Enter moves down", kind: "toggle", default: true },
      { id: "commitOnBlur", label: "Commit on blur", kind: "toggle", default: true },
      { id: "suppressTypeToEdit", label: "Disable type-to-edit", kind: "toggle", default: false },
      { id: "readOnlyEdit", label: "Read-only edit (events only)", kind: "toggle", default: false },
      { id: "undoLimit", label: "Undo depth", kind: "select", options: [{ value: "0", label: "Off" }, { value: "10" }, { value: "50" }], default: "50", structural: true },
    ],
    toProps: (v) => ({
      editTrigger: str(v.editTrigger),
      // Both default to ON; turning one off has to say so.
      ...(bool(v.moveAfterEdit) ? {} : { moveAfterEdit: false }),
      ...(bool(v.commitOnBlur) ? {} : { commitOnBlur: false }),
      ...onOff(v.suppressTypeToEdit, "suppressTypeToEdit"),
      ...onOff(v.readOnlyEdit, "readOnlyEdit"),
      undoLimit: num(v.undoLimit),
      highlightActiveCell: true,
    }),
  },
  grouping: {
    knobs: [
      { id: "groupDisplayType", label: "Group display", kind: "select", options: [{ value: "singleColumn", label: "Single group column" }, { value: "multipleColumns", label: "One column per level" }, { value: "groupRows", label: "Full-width group rows" }], default: "singleColumn" },
      { id: "groupDefaultExpanded", label: "Expanded by default", kind: "select", options: [{ value: "0", label: "Collapsed" }, { value: "1", label: "First level" }, { value: "-1", label: "All levels" }], default: "1", structural: true },
      { id: "groupRowsSticky", label: "Sticky group rows", kind: "toggle", default: true },
      { id: "groupRowsSelectable", label: "Group rows selectable", kind: "toggle", default: false },
      { id: "groupSortMode", label: "Sort within groups", kind: "select", options: [{ value: "local", label: "local (per group)" }, { value: "hierarchy" }, { value: "global" }], default: "local" },
    ],
    toProps: (v) => ({
      ...(v.groupDisplayType !== "singleColumn" ? { groupDisplayType: str(v.groupDisplayType) } : {}),
      groupDefaultExpanded: num(v.groupDefaultExpanded),
      ...onOff(v.groupRowsSticky, "groupRowsSticky"),
      ...onOff(v.groupRowsSelectable, "groupRowsSelectable"),
      ...(v.groupSortMode !== "local" ? { groupSortMode: str(v.groupSortMode) } : {}),
      toolbar: { grouping: true },
    }),
  },
  pivot: {
    knobs: [
      { id: "pivotColumnMoveMode", label: "Header drag", kind: "select", options: [{ value: "measures", label: "Reorders measures" }, { value: "free", label: "Free arrangement" }], default: "measures" },
      { id: "columnPanel", label: "Columns panel (pivot setup)", kind: "toggle", default: true },
      { id: "groupDefaultExpanded", label: "Expanded by default", kind: "select", options: [{ value: "0", label: "Collapsed" }, { value: "1", label: "First level" }, { value: "-1", label: "All levels" }], default: "1", structural: true },
    ],
    toProps: (v) => ({
      toolbar: { pivot: true },
      ...(bool(v.columnPanel) ? { columnPanel: { trigger: "toolbar" } } : {}),
      ...(v.pivotColumnMoveMode === "free" ? { pivotColumnMoveMode: "free" } : {}),
      groupDefaultExpanded: num(v.groupDefaultExpanded),
    }),
  },
  "tree-data": {
    knobs: [
      { id: "groupDefaultExpanded", label: "Expanded by default", kind: "select", options: [{ value: "0", label: "Collapsed" }, { value: "1", label: "First level" }, { value: "2", label: "Two levels" }, { value: "-1", label: "All levels" }], default: "2", structural: true },
      { id: "groupRowsSticky", label: "Sticky parent rows", kind: "toggle", default: false },
    ],
    toProps: (v) => ({
      groupDefaultExpanded: num(v.groupDefaultExpanded),
      ...onOff(v.groupRowsSticky, "groupRowsSticky"),
    }),
  },
  "pinned-rows": {
    knobs: [
      { id: "top", label: "Pinned top (Target)", kind: "toggle", default: true },
      { id: "bottom", label: "Pinned bottom (Total)", kind: "toggle", default: true },
      { id: "rowPinningMenu", label: "Pin rows from the menu", kind: "toggle", default: true },
      { id: "pinnedRowsEditable", label: "Pinned rows editable", kind: "toggle", default: false },
    ],
    toProps: (v) => ({
      rowNumbers: true,
      ...onOff(v.rowPinningMenu, "rowPinningMenu"),
      ...onOff(v.pinnedRowsEditable, "pinnedRowsEditable"),
      // The row arrays themselves are supplied by the example; the code tab names them.
      ...(bool(v.top) ? { pinnedTopRowData: "$pinnedTop" } : {}),
      ...(bool(v.bottom) ? { pinnedBottomRowData: "$pinnedBottom" } : {}),
    }),
  },
  rendering: {
    knobs: [
      { id: "zebraRows", label: "Zebra rows", kind: "toggle", default: true },
      { id: "rowHover", label: "Row hover", kind: "toggle", default: true },
      { id: "columnHover", label: "Column hover", kind: "toggle", default: true },
      { id: "highlightActiveCell", label: "Highlight active cell", kind: "toggle", default: false },
    ],
    toProps: (v) => ({
      ...onOff(v.zebraRows, "zebraRows"),
      // Row hover defaults to ON; turning it off has to say so.
      ...(bool(v.rowHover) ? {} : { rowHover: false }),
      ...onOff(v.columnHover, "columnHover"),
      ...onOff(v.highlightActiveCell, "highlightActiveCell"),
    }),
  },
  tooltips: {
    knobs: [
      { id: "mode", label: "Mode", kind: "select", options: [{ value: "anchored", label: "Anchored to the cell" }, { value: "follow", label: "Follows the pointer" }], default: "anchored" },
      { id: "placement", label: "Placement", kind: "select", options: [{ value: "auto" }, { value: "top" }, { value: "bottom" }, { value: "left" }, { value: "right" }], default: "auto" },
      { id: "showDelay", label: "Show delay (ms)", kind: "select", options: [{ value: "0" }, { value: "150" }, { value: "600" }], default: "150" },
      { id: "interactive", label: "Interactive (hoverable)", kind: "toggle", default: false },
    ],
    toProps: (v) => ({
      tooltip: {
        showDelay: num(v.showDelay),
        hideDelay: 75,
        mode: str(v.mode),
        ...(v.mode === "anchored" ? { placement: str(v.placement) } : {}),
        ...(bool(v.interactive) ? { interactive: true } : {}),
      },
    }),
  },
  export: {
    knobs: [
      { id: "csv", label: "CSV", kind: "toggle", default: true, structural: true },
      { id: "excel", label: "Excel", kind: "toggle", default: true, structural: true },
      { id: "rowNumbers", label: "Row numbers", kind: "toggle", default: true, structural: true },
    ],
    toProps: (v) => ({
      ...onOff(v.rowNumbers, "rowNumbers"),
      // Both formats default to ON; turning one off has to say so.
      ...(bool(v.csv) ? {} : { allowExportAsCSV: false }),
      ...(bool(v.excel) ? {} : { allowExportAsExcel: false }),
      toolbar: { export: true },
    }),
  },
  theming: {
    knobs: [
      { id: "zebraRows", label: "Zebra rows", kind: "toggle", default: true },
      { id: "columnHover", label: "Column hover", kind: "toggle", default: true },
      { id: "highlightActiveCell", label: "Highlight active cell", kind: "toggle", default: true },
    ],
    toProps: (v) => ({
      ...onOff(v.zebraRows, "zebraRows"),
      ...onOff(v.columnHover, "columnHover"),
      ...onOff(v.highlightActiveCell, "highlightActiveCell"),
    }),
  },
};

export function defaultKnobValues(feature: DemoFeature): KnobValues {
  const values: KnobValues = {};
  for (const knob of featureKnobs[feature]?.knobs ?? []) values[knob.id] = knob.default;
  return values;
}

export function knobOptions(feature: DemoFeature, values: KnobValues): KnobOptions {
  return featureKnobs[feature]?.toProps(values) ?? {};
}

/** The structural knob values, in declaration order — the remount key for the live grid. */
export function structuralKey(feature: DemoFeature, values: KnobValues): string {
  return (featureKnobs[feature]?.knobs ?? [])
    .filter((knob) => knob.structural)
    .map((knob) => `${knob.id}=${String(values[knob.id])}`)
    .join("|");
}
