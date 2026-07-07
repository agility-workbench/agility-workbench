import { Column } from "../../column/column";
import { IRowNode } from "../../interfaces/iRowNode";

export interface ICellEditorParams {
  // Current (pre-edit) stored value of the cell.
  value: any;
  row: IRowNode;
  col: Column;
  // Column-level editor config (colDef.cellEditorParams).
  editorParams?: any;
  // The cell element the editor is mounted into.
  eCell: HTMLElement;
  // Grid API reference (for editors that need to read row/column data, distinct values, etc.).
  api: any;
  // Distinct non-null values of this column across the loaded rows (in first-seen order). Used by
  // the select editor's "fromRows" value source; computed lazily by the host.
  getDistinctColumnValues: () => any[];
  // True when the edit was started by typing a character (edit-on-typing); the editor may seed
  // itself with `charPress`. Currently always false — reserved for a later edit-on-typing feature.
  cellStartedEdit?: boolean;
  charPress?: string | null;
}

/**
 * A cell editor mounted over a cell while editing. Mirrors ICellRenderer: created on edit start,
 * mounted via getGui(), committed by reading getValue(), destroyed on stop.
 */
export interface ICellEditor {
  /** Called once when the editor is created. */
  init(params: ICellEditorParams): void;
  /** Root element to mount into the cell. */
  getGui(): HTMLElement;
  /** The value to commit. */
  getValue(): unknown;
  /**
   * Whether getValue() is already the final typed value (skip the column's valueParser). Typed
   * editors (number/date/boolean/select) return true; text/textarea editors return false so their
   * string output still runs through valueParser. Defaults to false when omitted.
   */
  isParsed?(): boolean;
  /** Focus (and typically select) the editor after mounting. */
  focus?(): void;
  /** Return true to abort opening the editor (e.g. nothing editable). */
  isCancelBeforeStart?(): boolean;
  destroy?(): void;
}

export type ICellEditorFn = (params: ICellEditorParams) => ICellEditor;
export type CellEditorClass = new () => ICellEditor;

/** An option in the select editor. A bare value is treated as both value and label. */
export type SelectEditorOption = { value: any; label?: string } | string | number | boolean;

export interface SelectValueAsyncParams {
  col: Column;
  row: IRowNode;
  signal: AbortSignal;
  success: (values: SelectEditorOption[]) => void;
  error: (err: any) => void;
}

/**
 * Where the select editor's options come from:
 *  - static array of options
 *  - "fromRows": distinct values of this column across the loaded rows (like the set filter)
 *  - async loader (may return a Promise or call success/error)
 */
export type SelectValueSource =
  | SelectEditorOption[]
  | "fromRows"
  | ((params: SelectValueAsyncParams) => void | Promise<void>);

/** cellEditorParams shape for the select editor. */
export interface SelectCellEditorParams {
  values?: SelectValueSource;
}

// A built-in editor selected by string alias, a custom class, or a factory function.
export type CellEditorAlias = "text" | "number" | "date" | "boolean" | "select" | "textarea";
export type CellEditor = CellEditorAlias | CellEditorClass | ICellEditorFn;
