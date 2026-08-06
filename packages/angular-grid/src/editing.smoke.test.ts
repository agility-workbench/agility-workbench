import { Component } from "@angular/core";
import { describe, expect, it, vi } from "vitest";
import type { CellValueChangedParams, ICellEditorParams, IGridAPI } from "@agility-workbench/grid";
import { AwbGrid } from "./grid.component";
import type { ICellEditorNgComp, NgColDef } from "./interface";
import { mountGridHost, syncGridInputs } from "./test-utils";

@Component({
  standalone: true,
  template: `
    <input
      class="angular-cell-editor"
      [value]="value"
      (input)="updateValue($event)"
    />
  `,
})
class AngularEditor implements ICellEditorNgComp {
  static focusCalls = 0;
  static current: AngularEditor | null = null;
  value = "";

  constructor() {
    AngularEditor.current = this;
  }

  awbInit(params: ICellEditorParams): void {
    this.value = String(params.value ?? "");
  }

  getValue(): unknown {
    return this.value;
  }

  updateValue(event: Event): void {
    this.value = (event.target as HTMLInputElement).value;
  }

  focus(): void {
    AngularEditor.focusCalls++;
  }
}

@Component({
  standalone: true,
  imports: [AwbGrid],
  template: `
    <awb-grid
      style="height: 600px"
      [rowData]="rows"
      [columnDefs]="cols"
      rowIdKey="id"
      [editTrigger]="editTrigger"
      [suppressKeyboardEdit]="suppressKeyboardEdit"
      [suppressTypeToEdit]="suppressTypeToEdit"
      [moveAfterEdit]="moveAfterEdit"
      [commitOnBlur]="commitOnBlur"
      (gridReady)="api = $event"
      (cellValueChanged)="onCellValueChanged($event)"
    />
  `,
})
class EditingHost {
  api: IGridAPI | null = null;
  editTrigger: "doubleClick" | "singleClick" | "none" = "doubleClick";
  suppressKeyboardEdit = false;
  suppressTypeToEdit = false;
  moveAfterEdit = true;
  commitOnBlur = true;
  rows = [{ id: "1", name: "AAA" }, { id: "2", name: "BBB" }];
  cols: NgColDef[] = [
    { colId: "id", key: "id", label: "ID" },
    { colId: "name", key: "name", label: "Name", editable: true, cellEditor: AngularEditor },
  ];
  onCellValueChanged = vi.fn<(event: CellValueChangedParams) => void>();
}

function cellWithText(gridEl: HTMLElement, text: string): HTMLElement {
  const cell = Array.from(gridEl.querySelectorAll<HTMLElement>(".pte-cell"))
    .find((candidate) => candidate.textContent === text);
  if (!cell) throw new Error(`No cell containing ${text}`);
  return cell;
}

function key(gridEl: HTMLElement, key: string): void {
  gridEl.querySelector<HTMLElement>("[data-pte-grid-id]")!.dispatchEvent(
    new KeyboardEvent("keydown", { key, bubbles: true }),
  );
}

describe("AwbGrid editing", () => {
  it("mounts an Angular editor on double click and bridges focus", async () => {
    AngularEditor.focusCalls = 0;
    const { gridEl, host } = await mountGridHost(EditingHost);
    const cell = cellWithText(gridEl, "AAA");

    cell.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 }));
    expect(host.api!.getCore().getEditingCell()).toBeNull();
    cell.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, button: 0 }));

    expect(host.api!.getCore().getEditingCell()).not.toBeNull();
    expect(cell.querySelector<HTMLInputElement>(".angular-cell-editor")?.value).toBe("AAA");
    expect(AngularEditor.focusCalls).toBe(1);
  });

  it("commits the Angular editor value and emits cellValueChanged", async () => {
    const { gridEl, host } = await mountGridHost(EditingHost);
    const cell = cellWithText(gridEl, "AAA");
    cell.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 }));
    cell.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, button: 0 }));
    const editor = cell.querySelector<HTMLInputElement>(".angular-cell-editor")!;
    editor.value = "Updated";
    editor.dispatchEvent(new Event("input", { bubbles: true }));
    expect(AngularEditor.current?.value).toBe("Updated");
    editor.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    await new Promise<void>((resolve) => queueMicrotask(resolve));

    expect(host.api!.getCore().getCellValue("1", "name")).toBe("Updated");
    expect(host.onCellValueChanged).toHaveBeenCalledTimes(1);
    expect(host.onCellValueChanged.mock.calls[0][0]).toMatchObject({
      rowId: "1",
      value: "Updated",
    });
  });

  it("keeps API editing available when mouse and keyboard triggers are suppressed", async () => {
    const { fixture, gridEl, host } = await mountGridHost(EditingHost);
    host.editTrigger = "none";
    host.suppressKeyboardEdit = true;
    await syncGridInputs(fixture);
    const cell = cellWithText(gridEl, "AAA");

    cell.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, button: 0 }));
    cell.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 }));
    key(gridEl, "F2");
    expect(host.api!.getCore().getEditingCell()).toBeNull();

    const name = host.api!.getColumnModel().getByColId("name")!;
    host.api!.startEditingCell({ rowId: "1", colId: name.instanceID });
    expect(host.api!.getCore().getEditingCell()).not.toBeNull();
  });

  it("starts editing and selects the cell together in singleClick mode", async () => {
    const { gridEl, host } = await mountGridHost(EditingHost, 600, (instance) => {
      instance.editTrigger = "singleClick";
    });
    cellWithText(gridEl, "AAA").dispatchEvent(
      new MouseEvent("mousedown", { bubbles: true, button: 0 }),
    );
    expect(host.api!.getCore().getEditingCell()).not.toBeNull();
    expect(host.api!.getSelection().kind).toBe("cell");
  });

  it("suppresses type-to-edit while keeping explicit keyboard editing", async () => {
    const { gridEl, host } = await mountGridHost(EditingHost, 600, (instance) => {
      instance.suppressTypeToEdit = true;
    });
    cellWithText(gridEl, "AAA").dispatchEvent(
      new MouseEvent("mousedown", { bubbles: true, button: 0 }),
    );
    key(gridEl, "a");
    expect(host.api!.getCore().getEditingCell()).toBeNull();
    key(gridEl, "F2");
    expect(host.api!.getCore().getEditingCell()).not.toBeNull();
  });

  it("moves the active cell down after an Enter commit by default", async () => {
    const { gridEl, host } = await mountGridHost(EditingHost);
    const cell = cellWithText(gridEl, "AAA");
    cell.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 }));
    key(gridEl, "F2");
    const editor = gridEl.querySelector<HTMLInputElement>(".angular-cell-editor")!;
    editor.value = "Moved";
    editor.dispatchEvent(new Event("input", { bubbles: true }));
    editor.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));

    expect(host.api!.getCore().getCellValue("1", "name")).toBe("Moved");
    expect(host.api!.getCore().getActiveCell()).toMatchObject({ row: 1, colIdx: 1 });
  });

  it("commits in place when moveAfterEdit is false", async () => {
    const { gridEl, host } = await mountGridHost(EditingHost, 600, (instance) => {
      instance.moveAfterEdit = false;
    });
    const cell = cellWithText(gridEl, "AAA");
    cell.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 }));
    key(gridEl, "F2");
    const editor = gridEl.querySelector<HTMLInputElement>(".angular-cell-editor")!;
    editor.value = "Stayed";
    editor.dispatchEvent(new Event("input", { bubbles: true }));
    editor.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));

    expect(host.api!.getCore().getCellValue("1", "name")).toBe("Stayed");
    expect(host.api!.getCore().getActiveCell()).toMatchObject({ row: 0, colIdx: 1 });
  });

  it("keeps an editor open on blur when commitOnBlur is false", async () => {
    const { gridEl, host } = await mountGridHost(EditingHost, 600, (instance) => {
      instance.commitOnBlur = false;
    });
    const cell = cellWithText(gridEl, "AAA");
    cell.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 }));
    key(gridEl, "F2");
    gridEl.querySelector<HTMLInputElement>(".angular-cell-editor")!.dispatchEvent(
      new FocusEvent("blur", { bubbles: true }),
    );
    expect(host.api!.getCore().getEditingCell()).not.toBeNull();
  });
});
