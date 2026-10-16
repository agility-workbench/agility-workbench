import { isScrollbarGutterEvent } from "./scrollbarHit";
import { dropCompatMouseEvent, TouchGestureController } from "./touchGestures";

interface GridInteractionEventBinderParams {
  root: HTMLDivElement;
  headerWrapper: HTMLDivElement;
  body: HTMLDivElement;
  pinnedRowContainers?: HTMLDivElement[];
  onHeaderMouseDown: (e: MouseEvent) => void;
  onHeaderContextMenu: (e: MouseEvent) => void;
  onHeaderDoubleClick: (e: MouseEvent) => void;
  onCellMouseDown: (e: MouseEvent) => void;
  onCellClick: (e: MouseEvent) => void;
  onCellDoubleClick: (e: MouseEvent) => void;
  onBodyContextMenu: (e: MouseEvent) => void;
  onColumnResizeMouseMove: (e: MouseEvent) => void;
  onColumnDragMouseMove: (e: MouseEvent) => void;
  onCellMouseMove: (e: MouseEvent) => void;
  onColumnResizeMouseUp: () => void;
  onColumnDragMouseUp: () => void;
  onCellMouseUp: (e: MouseEvent) => void;
  shouldSuppressClick: () => boolean;
  onClick: (e: MouseEvent) => void;
  onKeyDown: (e: KeyboardEvent) => void;
  /** Focus entering the grid root — where the keyboard cursor lands on entry. */
  onRootFocus: () => void;
  // Touch / pen only (see touchGestures.ts): the pieces of the mouse gestures a pointer needs
  // separately, because a touch pointer stays targeted at the element it pressed.
  isFillHandleTarget?: (target: EventTarget | null) => boolean;
  isFillDragging?: () => boolean;
  /** The finger is over `target` during a fill drag. */
  onFillTouchMove?: (target: EventTarget | null) => void;
  onFillCancel?: () => void;
  isColumnResizing?: () => boolean;
  /** Tear down a column drag without dropping it (pointercancel, long press, a vertical pan). */
  onColumnDragCancel?: () => void;
}

export class GridInteractionEventBinder {
  // A compatibility mouse event of a touch / pen gesture the pointer path already handled.
  private handleHeaderMouseDown = (e: MouseEvent) => {
    if (dropCompatMouseEvent(e)) return;
    this.params.onHeaderMouseDown(e);
  };

  private handleHeaderContextMenu = (e: MouseEvent) => {
    this.params.onHeaderContextMenu(e);
  };

  private handleHeaderDoubleClick = (e: MouseEvent) => {
    this.params.onHeaderDoubleClick(e);
  };

  // Driving a scrollbar is not a body interaction. The body is itself the vertical scroll container
  // these listeners are bound to, so its bar reports `target === body` and would otherwise read as
  // a click on empty body space — which clears the cell selection.
  private handleCellMouseDown = (e: MouseEvent) => {
    if (dropCompatMouseEvent(e)) return;
    if (isScrollbarGutterEvent(e)) return;
    this.params.onCellMouseDown(e);
  };

  private handleCellClick = (e: MouseEvent) => {
    if (isScrollbarGutterEvent(e)) return;
    this.params.onCellClick(e);
  };

  private handleCellDoubleClick = (e: MouseEvent) => {
    if (isScrollbarGutterEvent(e)) return;
    this.params.onCellDoubleClick(e);
  };

  private handleBodyContextMenu = (e: MouseEvent) => {
    if (isScrollbarGutterEvent(e)) return;
    this.params.onBodyContextMenu(e);
  };

  private handleDocumentMouseMove = (e: MouseEvent) => {
    if (dropCompatMouseEvent(e)) return;
    this.params.onColumnResizeMouseMove(e);
    this.params.onColumnDragMouseMove(e);
    this.params.onCellMouseMove(e);
  };

  private handleDocumentMouseUp = (e: MouseEvent) => {
    if (dropCompatMouseEvent(e)) return;
    this.params.onColumnResizeMouseUp();
    this.params.onColumnDragMouseUp();
    this.params.onCellMouseUp(e);
  };

  private handleDocumentClick = (e: MouseEvent) => {
    if (this.params.shouldSuppressClick()) return;
    this.params.onClick(e);
  };

  private handleKeyDown = (e: KeyboardEvent) => {
    this.params.onKeyDown(e);
  };

  // Only a focus landing on the root itself counts as entering the grid; focus moving to a control
  // inside it (a pagination button, the quick filter) bubbles here too and must not move the cursor.
  private handleRootFocus = (e: FocusEvent) => {
    if (e.target !== this.params.root) return;
    this.params.onRootFocus();
  };

  private touch: TouchGestureController;

  constructor(private params: GridInteractionEventBinderParams) {
    const p = params;
    this.touch = new TouchGestureController({
      root: p.root,
      headerWrapper: p.headerWrapper,
      bodyRoots: () => [p.body, ...(p.pinnedRowContainers ?? [])],
      bodyTap: (e) => {
        if (isScrollbarGutterEvent(e)) return;
        p.onCellMouseDown(e);
        p.onCellMouseUp(e);
      },
      isFillHandle: (target) => !!p.isFillHandleTarget?.(target),
      fillStart: (e) => {
        p.onCellMouseDown(e);
        return !!p.isFillDragging?.();
      },
      fillMove: (target) => p.onFillTouchMove?.(target),
      fillEnd: (e) => p.onCellMouseUp(e),
      fillCancel: () => p.onFillCancel?.(),
      headerDown: (e) => p.onHeaderMouseDown(e),
      isResizing: () => !!p.isColumnResizing?.(),
      resizeMove: (e) => p.onColumnResizeMouseMove(e),
      resizeEnd: () => p.onColumnResizeMouseUp(),
      columnDragMove: (e) => p.onColumnDragMouseMove(e),
      columnDragEnd: () => p.onColumnDragMouseUp(),
      columnDragCancel: () => p.onColumnDragCancel?.(),
    });
  }

  bind() {
    this.params.headerWrapper.addEventListener("mousedown", this.handleHeaderMouseDown);
    this.params.headerWrapper.addEventListener("contextmenu", this.handleHeaderContextMenu);
    this.params.headerWrapper.addEventListener("dblclick", this.handleHeaderDoubleClick);
    this.params.body.addEventListener("mousedown", this.handleCellMouseDown);
    this.params.body.addEventListener("click", this.handleCellClick);
    this.params.body.addEventListener("dblclick", this.handleCellDoubleClick);
    this.params.body.addEventListener("contextmenu", this.handleBodyContextMenu);
    for (const container of this.params.pinnedRowContainers ?? []) {
      container.addEventListener("mousedown", this.handleCellMouseDown);
      container.addEventListener("click", this.handleCellClick);
      container.addEventListener("dblclick", this.handleCellDoubleClick);
      container.addEventListener("contextmenu", this.handleBodyContextMenu);
    }
    document.addEventListener("mousemove", this.handleDocumentMouseMove);
    document.addEventListener("mouseup", this.handleDocumentMouseUp);
    this.params.root.addEventListener("click", this.handleDocumentClick);
    this.params.root.addEventListener("keydown", this.handleKeyDown);
    this.params.root.addEventListener("focus", this.handleRootFocus);
    this.touch.bind();
  }

  destroy() {
    this.touch.destroy();
    this.params.headerWrapper.removeEventListener("mousedown", this.handleHeaderMouseDown);
    this.params.headerWrapper.removeEventListener("contextmenu", this.handleHeaderContextMenu);
    this.params.headerWrapper.removeEventListener("dblclick", this.handleHeaderDoubleClick);
    this.params.body.removeEventListener("mousedown", this.handleCellMouseDown);
    this.params.body.removeEventListener("click", this.handleCellClick);
    this.params.body.removeEventListener("dblclick", this.handleCellDoubleClick);
    this.params.body.removeEventListener("contextmenu", this.handleBodyContextMenu);
    for (const container of this.params.pinnedRowContainers ?? []) {
      container.removeEventListener("mousedown", this.handleCellMouseDown);
      container.removeEventListener("click", this.handleCellClick);
      container.removeEventListener("dblclick", this.handleCellDoubleClick);
      container.removeEventListener("contextmenu", this.handleBodyContextMenu);
    }
    this.params.root.removeEventListener("focus", this.handleRootFocus);
    document.removeEventListener("mousemove", this.handleDocumentMouseMove);
    document.removeEventListener("mouseup", this.handleDocumentMouseUp);
    this.params.root.removeEventListener("click", this.handleDocumentClick);
    this.params.root.removeEventListener("keydown", this.handleKeyDown);
  }
}
