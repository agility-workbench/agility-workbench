import {
  AggregateType, ColumnType, createGrid, type ColDef, type GridSheet,
} from "@grid";

import { btn, demoRoot, h, note } from "../dom";

type Row = {
  id: number;
  region: string;
  product: string;
  owner: string;
  status: string;
  revenue: number;
};

const WIDTH_PRESETS = [1100, 900, 700, 560, 480, 360] as const;

function buildRows(): Row[] {
  return Array.from({ length: 80 }, (_, index) => ({
    id: index + 1,
    region: ["Americas", "EMEA", "APAC"][index % 3],
    product: ["Analytics", "Cloud", "Security", "Support"][(index * 3) % 4],
    owner: ["Ava", "Liam", "Mia", "Noah", "Emma"][(index * 2) % 5],
    status: ["Qualified", "Negotiating", "Won"][index % 3],
    revenue: 12_000 + ((index * 7_913) % 85_000),
  }));
}

const COLUMNS: ColDef[] = [
  { colId: "region", key: "region", label: "Region", width: 130 },
  { colId: "product", key: "product", label: "Product", width: 140 },
  { colId: "owner", key: "owner", label: "Owner", width: 120 },
  { colId: "status", key: "status", label: "Status", width: 130 },
  { colId: "revenue", key: "revenue", label: "Revenue", width: 140, type: ColumnType.CURRENCY },
];

export function mountResponsiveToolbarDemo(container: HTMLElement): () => void {
  const widthLabel = h("code", { text: "900px", style: { marginLeft: "auto", fontSize: "12px" } });

  // Sheets are application-owned, but the strip updates itself optimistically before reporting,
  // so keeping the list this demo is handed back is all it takes to stay in sync.
  let sheets: GridSheet[] = [
    { id: "data", name: "Data" },
    { id: "pipeline", name: "Pipeline" },
  ];
  let activeSheetId: string | null = "data";

  const frame = h("div", {
    style: {
      width: "900px", maxWidth: "100%", minWidth: "340px", height: "100%", minHeight: "440px",
      boxSizing: "border-box", resize: "horizontal", overflow: "hidden", padding: "8px",
      border: "2px dashed #9ca3af", borderRadius: "10px",
    },
  });
  const host = h("div", { style: { width: "100%", height: "100%" } });
  frame.appendChild(host);

  container.appendChild(demoRoot(
    h("div", { style: { display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" } },
      h("strong", { text: "Resizable toolbar and footer", style: { fontSize: "13px" } }),
      h("span", {
        text: "Drag the container’s bottom-right resize handle, or choose a preset:",
        style: { fontSize: "12px", color: "#6b7280" },
      }),
      ...WIDTH_PRESETS.map(preset => btn(`${preset}px`, () => {
        frame.style.width = `${preset}px`;
        widthLabel.textContent = `${preset}px`;
      })),
      widthLabel,
    ),
    note(
      "Toolbar: captions first, then the search field gives up its slack width, then chip lists"
      + " fold into a +N, then Grouped by / Sort by become summary buttons that still open the full"
      + " editor, then the least important controls move into the overflow menu — Columns last."
      + " Whatever room the last rung leaves over goes to the search field, so the bar never sits"
      + " with a hole in it.",
    ),
    note(
      "Footer, on its own ladder: captions, then the redundant first/last page buttons go (the page"
      + " picker already reaches any page), then rows-per-page, the aggregate scope and the sheet"
      + " strip's + move into the footer's own ⋮ — which wears a dot while aggregation is on behind"
      + " it. Page navigation never gives way. Nothing ever overlaps in either bar, and a bar out of"
      + " rungs scrolls rather than clipping.",
    ),
    h("div", { style: { flex: "1", minHeight: "0", overflow: "auto" } }, frame),
  ));

  const api = createGrid(host, {
    rowData: buildRows(),
    columnDefs: COLUMNS,
    rowIdKey: "id",
    toolbar: { grouping: true, sorting: true, quickFilter: true, export: true },
    quickFilter: { debounceMs: 0, showOptions: true },
    columnPanel: { trigger: "toolbar" },
    allowExportAsCSV: true,
    allowExportAsExcel: true,
    groupDefaultExpanded: 1,
    // The footer at its richest: every page control, a live aggregate scope select, and a sheet
    // strip with its "+" — so all of its rungs have something to give way.
    pagination: true,
    pageSize: 25,
    sheets: {
      sheets,
      activeSheetId,
      onChange: (next) => { sheets = next; },
      onActiveSheetChange: (sheetId) => { activeSheetId = sheetId; },
    },
  });

  const model = api.getColumnModel();
  const region = model.getByColId("region");
  const revenue = model.getByColId("revenue");
  if (region) api.dispatch({ type: "rowGroupSet", colIds: [region.instanceID] });
  if (revenue) {
    api.dispatch({ type: "sortModelSet", sortItems: [{ key: revenue.instanceID, dir: "desc" }] });
    // An aggregate the footer is actually running, so the scope select is live rather than
    // disabled — and so the overflow button has a reason to show its dot once it is displaced.
    api.dispatch({
      type: "aggregateModelSet",
      aggregateModels: [{ key: revenue.instanceID, type: AggregateType.SUM }],
    });
  }

  // Report the frame's own border-box width so the readout tracks a manual drag too.
  const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => {
    const next = Math.round(frame.getBoundingClientRect().width);
    if (next > 0) widthLabel.textContent = `${next}px`;
  });
  observer?.observe(frame);

  return () => {
    observer?.disconnect();
    api.destroy();
  };
}
