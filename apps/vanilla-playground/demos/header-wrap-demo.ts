import { createGrid, ColumnType, type ColDef } from "@grid";

import { btn, checkbox, code, demoRoot, field, gridHost, h, note, toolbarRow } from "../dom";

type DealRow = {
  id: number;
  customer: string;
  region: string;
  units: number;
  revenue: number;
  status: string;
};

const CUSTOMERS = ["Acme", "Globex", "Initech", "Umbrella", "Stark", "Wayne"];
const REGIONS = ["North", "South", "East", "West"];
const STATUSES = ["Open", "Won", "Lost"];

function buildRows(): DealRow[] {
  return Array.from({ length: 40 }, (_, index) => ({
    id: index + 1,
    customer: CUSTOMERS[index % CUSTOMERS.length],
    region: REGIONS[index % REGIONS.length],
    units: 2 + ((index * 7) % 19),
    revenue: 250 + ((index * 137) % 2400),
    status: STATUSES[index % STATUSES.length],
  }));
}

/** Leaf ids the width slider resizes (the locked edge columns keep their width). */
const DATA_COLUMNS = ["customer", "region", "units", "revenue"];

function buildColumnDefs(wrap: boolean, autoHeight: boolean, width: number): ColDef[] {
  const header = { wrapHeaderText: wrap, autoHeaderHeight: autoHeight };
  return [
    { colId: "id", key: "id", label: "Order #", width: 90, type: ColumnType.NUMBER, lockPosition: "left", ...header },
    {
      colId: "account", label: "Customer details for the quarterly account review", ...header,
      children: [
        { colId: "customer", key: "customer", label: "Customer account name (legal entity)", width, ...header },
        { colId: "region", key: "region", label: "Primary region of operation", width, ...header },
      ],
    },
    {
      colId: "performance", label: "Commercial performance this fiscal year", ...header,
      children: [
        { colId: "units", key: "units", label: "Units shipped to date across all warehouses", width, type: ColumnType.NUMBER, ...header },
        { colId: "revenue", key: "revenue", label: "Recognised revenue in reporting currency", width, type: ColumnType.CURRENCY, ...header },
      ],
    },
    { colId: "status", key: "status", label: "Deal status", width: 110, lockPosition: "right", ...header },
  ];
}

export function mountHeaderWrapDemo(container: HTMLElement): () => void {
  let wrap = true;
  let autoHeight = true;
  let width = 140;

  const host = gridHost();
  const orderReadout = h("span", { style: { fontSize: "13px", color: "#6b7280" } });
  const rebuild = () => api.updateGridOptions({ columnDefs: buildColumnDefs(wrap, autoHeight, width) });

  const widthLabel = h("span", { text: `${width}px`, style: { fontSize: "13px", minWidth: "48px" } });
  const slider = h("input", { type: "range", min: "70", max: "320", step: "10", value: String(width) });
  slider.addEventListener("input", () => {
    width = Number(slider.value);
    widthLabel.textContent = `${width}px`;
    // A width change, not a rebuild: the header re-measures the wrapped labels on its own.
    api.setColumnWidths(DATA_COLUMNS.map(colId => ({ colId, widthPx: width })));
  });

  container.appendChild(demoRoot(
    toolbarRow(
      field("Wrap header text", checkbox(wrap, value => { wrap = value; rebuild(); })),
      field("Auto header height", checkbox(autoHeight, value => { autoHeight = value; rebuild(); })),
      field("Column width", h("span", { style: { display: "flex", alignItems: "center", gap: "6px" } }, slider, widthLabel)),
    ),
    toolbarRow(
      btn("Pin region left", () => api.setColumnPinned("region", "left")),
      btn("Unpin all", () => api.setColumnPinned(DATA_COLUMNS, null)),
      btn("Hide units", () => api.setColumnVisible("units", false)),
      btn("Show all", () => api.setColumnsVisible(DATA_COLUMNS, true)),
      btn("Move revenue to index 0", () => api.moveColumn("revenue", 0)),
      btn("Move Order # to the end (locked: no-op)", () => api.moveColumn("id", 99)),
      orderReadout,
    ),
    note(
      "The labels wrap with ", code("wrapHeaderText"), " and the header grows to fit them with ",
      code("autoHeaderHeight"), " (group level and leaf level independently; pinned sections stay"
      + " level). Turn auto height off and wrapped labels are clipped at the configured height. ",
      code("Order #"), " is ", code("lockPosition: \"left\""), " and ", code("Deal status"), " is ",
      code("\"right\""), ": try dragging them, or dropping another column before Order #.",
    ),
    host,
  ));

  const api = createGrid(host, {
    rowData: buildRows(),
    columnDefs: buildColumnDefs(wrap, autoHeight, width),
    rowIdKey: "id",
    columnPanel: { trigger: "rail" },
  });

  const updateOrder = () => {
    orderReadout.textContent = `Order: ${api.getColumnState().map(s => s.colId).join(", ")}`;
  };
  const off = api.on("columnsChanged", updateOrder);
  updateOrder();

  return () => {
    off();
    api.destroy();
  };
}
