// Mirrors the package README quick-start, plus the public CSS subpath so the
// production bundle proves both root and subpath exports resolve from the
// packed artifact.
import "@agility-workbench/grid/styles.css";
import { ColumnType, createGrid, type IGridAPI } from "@agility-workbench/grid";

export function mount(host: HTMLElement): IGridAPI {
  return createGrid(host, {
    rowIdKey: "id",
    rowSelection: true,
    columnDefs: [
      { key: "name", label: "Name", type: ColumnType.STRING },
      { key: "price", label: "Price", type: ColumnType.NUMBER },
    ],
    rowData: [
      { id: "1", name: "Widget", price: 9.99 },
      { id: "2", name: "Gadget", price: 14.5 },
      { id: "3", name: "Sprocket", price: 3.25 },
    ],
  });
}

const host = document.getElementById("app");
if (host) mount(host);
