import type { ColDef } from "./column";
import type { IRowNode } from "./iRowNode";

/** Argument of {@link ClipboardOptions.processCellForClipboard}. */
export interface ProcessCellForClipboardParams<TData = any> {
  /** The cell's value as the grid would copy it (formatted text when the column formats). */
  value: any;
  node: IRowNode<TData>;
  colDef: ColDef<TData>;
  colId: string;
}

/** Argument of {@link ClipboardOptions.processCellFromClipboard}. */
export interface ProcessCellFromClipboardParams<TData = any> {
  /** The pasted text for this cell, before the column's `valueParser`. */
  value: string;
  node: IRowNode<TData>;
  colDef: ColDef<TData>;
  colId: string;
}

/** Argument of {@link ClipboardOptions.processHeaderForClipboard}. */
export interface ProcessHeaderForClipboardParams<TData = any> {
  /** The header label as the grid would copy it. */
  value: string;
  colDef: ColDef<TData>;
  colId: string;
}

/**
 * Clipboard behaviour (`GridOptions.clipboard`). Set at construction only.
 *
 * Copy (Ctrl/Cmd+C, `api.copySelection`, the body menu, cut): each cell's text is the value the
 * grid shows (the column's `valueFormatter`; a group row's label or aggregate), then
 * `processCellForClipboard`, then quoting; each header is the column label, then
 * `processHeaderForClipboard`, then quoting. Fields join with `delimiter`, rows with a newline.
 *
 * Paste (Ctrl/Cmd+V, `api.paste`, `api.pasteText`, the body menu): the text splits into rows on
 * `\r?\n` (a trailing newline is ignored) and into fields on `delimiter`, honouring quoted fields.
 * Each target cell's field goes through `processCellFromClipboard`, then the column's
 * `valueParser`, `onBeforeCellCommit` and `valueSetter` — the whole paste is one undo step.
 */
export interface ClipboardOptions<TData = any> {
  /**
   * Column separator in copied text and when splitting pasted text, matched literally (may be
   * more than one character; must not be a newline or a quote). Defaults to a tab. A field that
   * contains it, a newline or a quote is copied in double quotes.
   */
  delimiter?: string;
  /** Copy the header row above the cells by default (the body menu's "Copy with headers" always does). Defaults to false. */
  copyHeaders?: boolean;
  /**
   * Transform each cell before it is copied. Receives the text the grid would copy (after the
   * column's formatter); the result is stringified (`null`/`undefined` → empty) and quoted.
   */
  processCellForClipboard?: (params: ProcessCellForClipboardParams<TData>) => any;
  /**
   * Transform each pasted cell before the column's `valueParser` and `onBeforeCellCommit` see it.
   * Runs only for editable target cells. Return a string to let the parser run on it, or any
   * other value to store it as the final typed value (the parser is then skipped).
   */
  processCellFromClipboard?: (params: ProcessCellFromClipboardParams<TData>) => any;
  /** Transform each header label before it is copied. */
  processHeaderForClipboard?: (params: ProcessHeaderForClipboardParams<TData>) => string;
}

/** Argument of `api.copySelection`. */
export interface CopySelectionOptions {
  /**
   * Prepend one line of column labels (through `processHeaderForClipboard`). Unset follows
   * {@link ClipboardOptions.copyHeaders}.
   */
  includeHeaders?: boolean;
}
