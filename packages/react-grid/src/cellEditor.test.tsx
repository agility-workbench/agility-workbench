// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import React, { forwardRef, useImperativeHandle } from "react";
import { adaptCellEditor, ReactCellEditorHandle } from "./cellEditor";
import { NumberCellEditor } from "@grid/renderer/editing/editors/numberCellEditor";
import type { ICellEditor, ICellEditorParams } from "@grid/renderer/editing/cellEditor";

function initParams(value: any): ICellEditorParams {
  return {
    value,
    row: { data: {} } as any,
    col: {} as any,
    editorParams: undefined,
    eCell: document.createElement("div"),
    api: null,
    getDistinctColumnValues: () => [],
  };
}

describe("adaptCellEditor discrimination", () => {
  it("passes string aliases through unchanged", () => {
    expect(adaptCellEditor("number")).toBe("number");
    expect(adaptCellEditor("select")).toBe("select");
  });

  it("passes core editor classes through unchanged", () => {
    expect(adaptCellEditor(NumberCellEditor)).toBe(NumberCellEditor);
  });

  it("returns undefined for undefined", () => {
    expect(adaptCellEditor(undefined)).toBeUndefined();
  });

  it("wraps a React component and caches the wrapper", () => {
    const Comp = forwardRef<ReactCellEditorHandle, ICellEditorParams>(function Comp(_p, ref) {
      useImperativeHandle(ref, () => ({ getValue: () => 1 }), []);
      return React.createElement("input");
    });
    const a = adaptCellEditor(Comp);
    const b = adaptCellEditor(Comp);
    expect(typeof a).toBe("function");
    expect(a).not.toBe(Comp); // wrapped, not the component itself
    expect(a).toBe(b); // cached
  });

  it("wrapped editor bridges getValue / isParsed / focus through the imperative handle", () => {
    let focused = false;
    const Comp = forwardRef<ReactCellEditorHandle, ICellEditorParams>(function Comp(params, ref) {
      useImperativeHandle(ref, () => ({
        getValue: () => `edited:${params.value}`,
        isParsed: () => true,
        focus: () => { focused = true; },
      }), [params.value]);
      return React.createElement("input");
    });

    const EditorClass = adaptCellEditor(Comp) as new () => ICellEditor;
    const editor = new EditorClass();
    editor.init(initParams("hello"));

    expect(editor.getValue()).toBe("edited:hello");
    expect(editor.isParsed?.()).toBe(true);
    editor.focus?.();
    expect(focused).toBe(true);
    expect(editor.getGui()).toBeInstanceOf(HTMLElement);
    editor.destroy?.();
  });
});
