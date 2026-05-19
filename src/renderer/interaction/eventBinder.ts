interface GridInteractionEventBinderParams {
  headerWrapper: HTMLDivElement;
  body: HTMLDivElement;
  onHeaderMouseDown: (e: MouseEvent) => void;
  onHeaderContextMenu: (e: MouseEvent) => void;
  onHeaderDoubleClick: (e: MouseEvent) => void;
  onCellMouseDown: (e: MouseEvent) => void;
  onColumnResizeMouseMove: (e: MouseEvent) => void;
  onColumnDragMouseMove: (e: MouseEvent) => void;
  onCellMouseMove: (e: MouseEvent) => void;
  onColumnResizeMouseUp: () => void;
  onColumnDragMouseUp: () => void;
  onCellMouseUp: () => void;
  shouldSuppressClick: () => boolean;
  onClick: (e: MouseEvent) => void;
}

export class GridInteractionEventBinder {
  private handleHeaderMouseDown = (e: MouseEvent) => {
    this.params.onHeaderMouseDown(e);
  };

  private handleHeaderContextMenu = (e: MouseEvent) => {
    this.params.onHeaderContextMenu(e);
  };

  private handleHeaderDoubleClick = (e: MouseEvent) => {
    this.params.onHeaderDoubleClick(e);
  };

  private handleCellMouseDown = (e: MouseEvent) => {
    this.params.onCellMouseDown(e);
  };

  private handleDocumentMouseMove = (e: MouseEvent) => {
    this.params.onColumnResizeMouseMove(e);
    this.params.onColumnDragMouseMove(e);
    this.params.onCellMouseMove(e);
  };

  private handleDocumentMouseUp = () => {
    this.params.onColumnResizeMouseUp();
    this.params.onColumnDragMouseUp();
    this.params.onCellMouseUp();
  };

  private handleDocumentClick = (e: MouseEvent) => {
    if (this.params.shouldSuppressClick()) return;
    this.params.onClick(e);
  };

  constructor(private params: GridInteractionEventBinderParams) { }

  bind() {
    this.params.headerWrapper.addEventListener("mousedown", this.handleHeaderMouseDown);
    this.params.headerWrapper.addEventListener("contextmenu", this.handleHeaderContextMenu);
    this.params.headerWrapper.addEventListener("dblclick", this.handleHeaderDoubleClick);
    this.params.body.addEventListener("mousedown", this.handleCellMouseDown);
    document.addEventListener("mousemove", this.handleDocumentMouseMove);
    document.addEventListener("mouseup", this.handleDocumentMouseUp);
    document.addEventListener("click", this.handleDocumentClick);
  }

  destroy() {
    this.params.headerWrapper.removeEventListener("mousedown", this.handleHeaderMouseDown);
    this.params.headerWrapper.removeEventListener("contextmenu", this.handleHeaderContextMenu);
    this.params.headerWrapper.removeEventListener("dblclick", this.handleHeaderDoubleClick);
    this.params.body.removeEventListener("mousedown", this.handleCellMouseDown);
    document.removeEventListener("mousemove", this.handleDocumentMouseMove);
    document.removeEventListener("mouseup", this.handleDocumentMouseUp);
    document.removeEventListener("click", this.handleDocumentClick);
  }
}
