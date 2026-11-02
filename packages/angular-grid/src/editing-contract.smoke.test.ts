import { Component } from "@angular/core";
import { describe, expect, it } from "vitest";
import { reject } from "@agility-workbench/grid";
import type { ICellEditorParams, IGridAPI } from "@agility-workbench/grid";
import { AwbGrid } from "./grid.component";
import type { ICellEditorNgComp, NgColDef } from "./interface";
import { mountGridHost } from "./test-utils";

// The editing contract through the Angular wrapper: a valueSetter column, an editable function, a
// nested (dot-path) key, and a refused edit that keeps an Angular editor open and invalid.

@Component({
  standalone: true,
  template: `<input class="ng-code-editor" [value]="value" (input)="value = $any($event.target).value" />`,
})
class CodeEditor implements ICellEditorNgComp {
  static message: string | null = null;
  value = "";

  awbInit(params: ICellEditorParams): void {
    this.value = String(params.value ?? "");
  }

  getValue(): unknown {
    return this.value;
  }

  getValidationMessage(): string | null {
    return CodeEditor.message;
  }
}

type Row = { id: string; first: string; last: string; locked: boolean; address: { city: string } };

@Component({
  standalone: true,
  imports: [AwbGrid],
  template: `
    <awb-grid style="height: 600px" [rowData]="rows" [columnDefs]="cols" rowIdKey="id"
      (gridReady)="api = $event" />
  `,
})
class ContractHost {
  api: IGridAPI | null = null;
  rows: Row[] = [
    { id: "1", first: "Ada", last: "Lovelace", locked: false, address: { city: "London" } },
    { id: "2", first: "Alan", last: "Turing", locked: true, address: { city: "Wilmslow" } },
  ];
  cols: NgColDef<Row>[] = [
    { colId: "id", key: "id", label: "ID" },
    {
      colId: "full",
      label: "Full name",
      editable: true,
      valueGetter: (row) => `${row.data.first} ${row.data.last}`,
      valueSetter: ({ data, newValue }) => {
        const [first, ...rest] = String(newValue ?? "").trim().split(/\s+/);
        if (!first) return false;
        data.first = first;
        data.last = rest.join(" ");
        return true;
      },
    },
    { colId: "city", key: "address.city", label: "City", editable: ({ data }) => !data.locked },
    {
      colId: "code",
      key: "first",
      label: "Code",
      editable: true,
      cellEditor: CodeEditor,
      valueParser: ({ value }) => (/^[A-Z]/.test(String(value)) ? String(value) : reject("Must start with a capital")),
    },
  ];
}

describe("AwbGrid editing contract", () => {
  it("writes a valueSetter column through the setter, and undo restores it", async () => {
    const { host } = await mountGridHost(ContractHost);
    const api = host.api!;
    api.setCellValue({ rowId: "1", colId: "full" }, "Grace Hopper");
    expect(host.rows[0]).toMatchObject({ first: "Grace", last: "Hopper" });
    api.undo();
    expect(host.rows[0]).toMatchObject({ first: "Ada", last: "Lovelace" });
  });

  it("gates editing with an editable function and writes a nested key in place", async () => {
    const { host } = await mountGridHost(ContractHost);
    const api = host.api!;
    api.startEditingCell({ rowId: "2", colId: "city" });
    expect(api.getEditingCell()).toBeNull();
    api.startEditingCell({ rowId: "1", colId: "city" });
    expect(api.getEditingCell()).toMatchObject({ rowId: "1", colId: "city" });
    api.stopEditing("Paris");
    expect(host.rows[0].address.city).toBe("Paris");
  });

  it("keeps an Angular editor open and invalid on a refused commit; a retry commits", async () => {
    const { gridEl, host } = await mountGridHost(ContractHost);
    const api = host.api!;
    api.startEditingCell({ rowId: "1", colId: "code" });
    const input = gridEl.querySelector<HTMLInputElement>(".ng-code-editor")!;
    input.value = "lowercase";
    input.dispatchEvent(new Event("input", { bubbles: true }));

    api.stopEditing();
    expect(api.getEditingCell()).toMatchObject({ rowId: "1", colId: "code" });
    const cell = gridEl.querySelector<HTMLElement>(".pte-cell-invalid")!;
    expect(cell.getAttribute("aria-invalid")).toBe("true");
    expect(cell.querySelector("[title]")?.getAttribute("title")).toBe("Must start with a capital");

    CodeEditor.message = "Not now";
    input.value = "Valid";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    api.stopEditing();
    expect(api.getEditingCell()).not.toBeNull();
    expect(gridEl.querySelector(".pte-cell-invalid [title]")?.getAttribute("title")).toBe("Not now");

    CodeEditor.message = null;
    api.stopEditing();
    expect(api.getEditingCell()).toBeNull();
    expect(gridEl.querySelector(".pte-cell-invalid")).toBeNull();
    expect(host.rows[0].first).toBe("Valid");
  });
});
