import React from "react";
import { createRoot, Root } from "react-dom/client";
import { flushSync } from "react-dom";
import type {
  CellEditor,
  CellEditorClass,
  ICellEditor,
  ICellEditorParams,
} from "@agility-workbench/grid";

/**
 * The imperative handle a React cell editor exposes via useImperativeHandle. The grid reads
 * `getValue()` on commit and calls the optional lifecycle methods; everything else (mount, focus,
 * teardown) is handled by the adapter.
 */
export interface ReactCellEditorHandle {
  /** The value to commit. */
  getValue: () => unknown;
  /** Whether getValue() is already the final typed value (skip the column's valueParser). */
  isParsed?: () => boolean;
  /** Focus the editor after mount. */
  focus?: () => void;
  /** Return true to abort opening the editor. */
  isCancelBeforeStart?: () => boolean;
}

/**
 * A React cell editor: a forwardRef component that receives ICellEditorParams as props and exposes
 * a ReactCellEditorHandle via useImperativeHandle.
 */
export type ReactCellEditor =
  | React.ForwardRefExoticComponent<ICellEditorParams & React.RefAttributes<ReactCellEditorHandle>>
  | React.ComponentType<ICellEditorParams & { ref?: React.Ref<ReactCellEditorHandle> }>;

const reactEditorCache = new WeakMap<object, CellEditorClass>();

function isEditorClass(e: unknown): e is CellEditorClass {
  const proto = (e as any)?.prototype;
  return typeof e === "function" && !!proto && typeof proto.init === "function" && typeof proto.getGui === "function";
}

/**
 * Wrap a React editor component in a core CellEditorClass. The component is rendered into a
 * container div with a ref; rendering is wrapped in flushSync so the imperative handle is populated
 * synchronously — the grid calls focus() immediately after init() and getValue() on commit, both of
 * which must see a live handle.
 */
function createReactEditorClass(Component: ReactCellEditor): CellEditorClass {
  return class ReactCellEditorAdapter implements ICellEditor {
    private el = document.createElement("div");
    private root: Root | null = null;
    private handle = React.createRef<ReactCellEditorHandle>();

    init(params: ICellEditorParams): void {
      this.el.style.width = "100%";
      this.el.style.height = "100%";
      this.root = createRoot(this.el);
      const element = React.createElement(Component as any, { ...params, ref: this.handle });
      // Synchronous mount so this.handle.current is set before focus()/getValue() are called.
      flushSync(() => this.root!.render(element));
    }

    getGui(): HTMLElement {
      return this.el;
    }

    getValue(): unknown {
      return this.handle.current?.getValue();
    }

    isParsed(): boolean {
      return this.handle.current?.isParsed?.() ?? false;
    }

    focus(): void {
      this.handle.current?.focus?.();
    }

    isCancelBeforeStart(): boolean {
      return this.handle.current?.isCancelBeforeStart?.() ?? false;
    }

    destroy(): void {
      // Defer unmount out of the current render/commit cycle to avoid React's
      // "synchronously unmounting during render" warning.
      const root = this.root;
      this.root = null;
      if (root) queueMicrotask(() => root.unmount());
    }
  };
}

/**
 * Adapt a ReactColDef.cellEditor to a core CellEditor. String aliases and core editor classes pass
 * through unchanged; React components are wrapped (and cached). Core ICellEditorFn factories cannot
 * be distinguished from React function components, so pass those as a class or via the core API.
 */
export function adaptCellEditor(editor: CellEditor | ReactCellEditor | undefined): CellEditor | undefined {
  if (editor == null) return undefined;
  if (typeof editor === "string") return editor; // built-in alias
  if (isEditorClass(editor)) return editor as CellEditor; // core editor class

  const cached = reactEditorCache.get(editor);
  if (cached) return cached;

  const adapted = createReactEditorClass(editor as ReactCellEditor);
  reactEditorCache.set(editor, adapted);
  return adapted;
}
