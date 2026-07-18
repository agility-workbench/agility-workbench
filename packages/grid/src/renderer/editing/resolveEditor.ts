import { Column } from "../../column/column";
import { ColumnType } from "../../interfaces/column";
import { CellEditor, CellEditorAlias, CellEditorClass, ICellEditor, ICellEditorFn, ICellEditorParams } from "./cellEditor";
import { TextCellEditor } from "./editors/textCellEditor";
import { TextareaCellEditor } from "./editors/textareaCellEditor";
import { NumberCellEditor } from "./editors/numberCellEditor";
import { DateCellEditor } from "./editors/dateCellEditor";
import { BooleanCellEditor } from "./editors/booleanCellEditor";
import { SelectCellEditor } from "./editors/selectCellEditor";

const BUILTIN: Record<CellEditorAlias, CellEditorClass> = {
  text: TextCellEditor,
  textarea: TextareaCellEditor,
  number: NumberCellEditor,
  date: DateCellEditor,
  boolean: BooleanCellEditor,
  select: SelectCellEditor,
};

/** Default editor alias for a column type when the column doesn't set cellEditor explicitly. */
function defaultAliasForType(type: ColumnType): CellEditorAlias {
  switch (type) {
    case ColumnType.NUMBER:
    case ColumnType.CURRENCY:
      return "number";
    case ColumnType.DATE:
      return "date";
    case ColumnType.BOOLEAN:
      return "boolean";
    default:
      return "text";
  }
}

function isEditorClass(e: CellEditorClass | ICellEditorFn): e is CellEditorClass {
  // Class editors define init/getGui on their prototype; factory functions do not.
  const proto = (e as any).prototype;
  return !!proto && typeof proto.init === "function" && typeof proto.getGui === "function";
}

/** Instantiate the editor configured on a column (or the type default), returning a fresh instance. */
export function createEditorForColumn(col: Column): ICellEditor {
  const configured: CellEditor = col.cellEditor ?? defaultAliasForType(col.type);

  if (typeof configured === "string") {
    const Ctor = BUILTIN[configured] ?? TextCellEditor;
    return new Ctor();
  }
  if (isEditorClass(configured)) {
    return new configured();
  }
  // Factory function: (params) => ICellEditor. We defer calling it until init, so wrap it.
  return new FactoryEditorAdapter(configured);
}

/**
 * Adapts an ICellEditorFn (params => ICellEditor) to the class-style lifecycle the host uses:
 * the factory is invoked at init() and all calls delegate to the produced editor.
 */
class FactoryEditorAdapter implements ICellEditor {
  private inner!: ICellEditor;
  constructor(private factory: ICellEditorFn) { }
  init(params: ICellEditorParams): void {
    this.inner = this.factory(params);
    this.inner.init(params);
  }
  getGui(): HTMLElement { return this.inner.getGui(); }
  getValue(): unknown { return this.inner.getValue(); }
  isParsed(): boolean { return this.inner.isParsed?.() ?? false; }
  focus(): void { this.inner.focus?.(); }
  isCancelBeforeStart(): boolean { return this.inner.isCancelBeforeStart?.() ?? false; }
  destroy(): void { this.inner.destroy?.(); }
}
