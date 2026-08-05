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
  onCellMouseUp: () => void;
  shouldSuppressClick: () => boolean;
  onClick: (e: MouseEvent) => void;
  onKeyDown: (e: KeyboardEvent) => void;
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

  private handleCellClick = (e: MouseEvent) => {
    this.params.onCellClick(e);
  };

  private handleCellDoubleClick = (e: MouseEvent) => {
    this.params.onCellDoubleClick(e);
  };

  private handleBodyContextMenu = (e: MouseEvent) => {
    this.params.onBodyContextMenu(e);
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

  private handleKeyDown = (e: KeyboardEvent) => {
    this.params.onKeyDown(e);
  };

  constructor(private params: GridInteractionEventBinderParams) { }

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
  }

  destroy() {
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
    document.removeEventListener("mousemove", this.handleDocumentMouseMove);
    document.removeEventListener("mouseup", this.handleDocumentMouseUp);
    this.params.root.removeEventListener("click", this.handleDocumentClick);
    this.params.root.removeEventListener("keydown", this.handleKeyDown);
  }
}
