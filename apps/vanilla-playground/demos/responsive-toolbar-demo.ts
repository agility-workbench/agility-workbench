import { ColumnType, createGrid, type ColDef } from "@grid";

import { btn, demoRoot, h, note } from "../dom";

type Row = {
  id: number;
  region: string;
  product: string;
  owner: string;
  status: string;
  revenue: number;
};

const WIDTH_PRESETS = [900, 700, 480, 360] as const;

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
      h("strong", { text: "Resizable toolbar", style: { fontSize: "13px" } }),
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
      "Full labels become icon-only controls as space tightens. At the narrowest width, Export and"
      + " Columns move into the More menu while grouping, sorting, and quick filter remain available.",
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
  });

  const model = api.getColumnModel();
  const region = model.getByColId("region");
  const revenue = model.getByColId("revenue");
  if (region) api.dispatch({ type: "rowGroupSet", colIds: [region.instanceID] });
  if (revenue) {
    api.dispatch({ type: "sortModelSet", sortItems: [{ key: revenue.instanceID, dir: "desc" }] });
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
