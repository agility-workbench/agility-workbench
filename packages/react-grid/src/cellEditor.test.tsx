// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import React, { act, forwardRef, useImperativeHandle } from "react";
import { adaptCellEditor, ReactCellEditorHandle } from "./cellEditor";
import { flushPendingReactRootUnmounts } from "./managedReactRoot";
import type { ICellEditor, ICellEditorParams } from "@agility-workbench/grid";

// A minimal core editor class (implements the public ICellEditor contract) used to
// assert that adaptCellEditor passes non-React editor classes through unchanged.
// We deliberately do NOT reach into grid internals for a concrete built-in editor —
// the React package only consumes the public @agility-workbench/grid surface.
class CoreEditorStub implements ICellEditor {
  private el = document.createElement("input");
  init(params: ICellEditorParams): void {
    this.el.value = String(params.value ?? "");
  }
  getGui(): HTMLElement {
    return this.el;
  }
  getValue(): unknown {
    return this.el.value;
  }
}

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
    expect(adaptCellEditor(CoreEditorStub)).toBe(CoreEditorStub);
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

  it("wrapped editor bridges getValue / isParsed / focus through the imperative handle", async () => {
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
    await act(async () => editor.init(initParams("hello")));

    expect(editor.getValue()).toBe("edited:hello");
    expect(editor.isParsed?.()).toBe(true);
    editor.focus?.();
    expect(focused).toBe(true);
    expect(editor.getGui()).toBeInstanceOf(HTMLElement);
    await act(async () => {
      editor.destroy?.();
      await flushPendingReactRootUnmounts();
    });
  });
});
