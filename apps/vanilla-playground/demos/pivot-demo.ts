import {
  createGrid,
  AggregateType,
  ColumnType,
  type ColDef,
} from "@grid";

import { btn, checkbox, demoRoot, field, gridHost, h, toolbarRow } from "../dom";
import { mulberry32, picker } from "../helpers";

/**
 * Pivot playground: pick the pivot columns and measures, flip pivot mode (checkbox, toolbar
 * indicator, or the column menu's "Pivot on Column"), and watch pivot cells update live as cell
 * edits land. Sorting a generated value column orders the group rows by that cell's aggregate.
 * The toolbar's Columns button opens the column panel, which acts as the pivot customizer while
 * pivoted: role chips per source column plus ordered Row groups / Column labels / Values wells.
 */

type SaleRow = {
  id: number;
  region: string;
  country: string;
  quarter: string;
  product: string;
  units: number;
  revenue: number;
};

const REGIONS = ["EMEA", "APAC", "Americas"];
const COUNTRIES: Record<string, string[]> = {
  EMEA: ["UK", "France", "Germany"],
  APAC: ["Japan", "India", "Australia"],
  Americas: ["USA", "Canada", "Brazil"],
};
const QUARTERS = ["Q1", "Q2", "Q3", "Q4"];
const PRODUCTS = ["Hardware", "Software", "Services"];

function buildRows(count: number): SaleRow[] {
  const rand = mulberry32(11);
  const pick = picker(rand);
  return Array.from({ length: count }, (_, i) => {
    const region = pick(REGIONS);
    return {
      id: 1 + i,
      region,
      country: pick(COUNTRIES[region]),
      quarter: pick(QUARTERS),
      product: pick(PRODUCTS),
      units: 1 + Math.floor(rand() * 500),
      revenue: 500 + Math.floor(rand() * 100_000),
    };
  });
}

const PIVOTABLE: Array<{ colId: string; label: string }> = [
  { colId: "quarter", label: "Quarter" },
  { colId: "product", label: "Product" },
];

const MEASURES: Array<{ colId: string; type: AggregateType; label: string }> = [
  { colId: "revenue", type: AggregateType.SUM, label: "Revenue (sum)" },
  { colId: "revenue", type: AggregateType.AVG, label: "Revenue (avg)" },
  { colId: "units", type: AggregateType.SUM, label: "Units (sum)" },
];

const COLUMNS: ColDef[] = [
  { colId: "region", key: "region", label: "Region", width: 130 },
  { colId: "country", key: "country", label: "Country", width: 130 },
  // A pivotComparator keeps quarters in calendar order even if a formatter renamed them.
  { colId: "quarter", key: "quarter", label: "Quarter", width: 110, pivotComparator: (a, b) => String(a).localeCompare(String(b)) },
  { colId: "product", key: "product", label: "Product", width: 130 },
  { colId: "units", key: "units", label: "Units", width: 110, type: ColumnType.NUMBER },
  { colId: "revenue", key: "revenue", label: "Revenue", width: 140, type: ColumnType.CURRENCY },
];

export function mountPivotDemo(container: HTMLElement): () => void {
  const rows = buildRows(2000);
  let pivotCols = ["quarter"];
  let measures = new Set([0]);
  let groupBy = ["region"];
  let editCounter = 0;

  const host = gridHost();

  const pivotChecks = PIVOTABLE.map(({ colId, label }) => field(
    label,
    checkbox(pivotCols.includes(colId), () => {
      pivotCols = pivotCols.includes(colId) ? pivotCols.filter(c => c !== colId) : [...pivotCols, colId];
      api.setPivotColumns(pivotCols);
    }),
    { style: { display: "inline-flex", alignItems: "center", gap: "4px", fontSize: "12px" } },
  ));

  const measureChecks = MEASURES.map((measure, index) => field(
    measure.label,
    checkbox(measures.has(index), () => {
      if (measures.has(index)) measures.delete(index);
      else measures.add(index);
      applyAggregates();
    }),
    { style: { display: "inline-flex", alignItems: "center", gap: "4px", fontSize: "12px" } },
  ));

  const groupChecks = ["region", "country"].map(colId => field(
    colId === "region" ? "Region" : "Country",
    checkbox(groupBy.includes(colId), () => {
      groupBy = groupBy.includes(colId) ? groupBy.filter(c => c !== colId) : [...groupBy, colId];
      api.setRowGroupColumns(groupBy);
    }),
    { style: { display: "inline-flex", alignItems: "center", gap: "4px", fontSize: "12px" } },
  ));

  container.appendChild(demoRoot(
    toolbarRow(
      field("Pivot mode", checkbox(true, value => api.setPivotMode(value))),
      h("div", { style: { display: "flex", alignItems: "center", gap: "8px" } },
        h("span", { text: "Pivot on", style: { fontSize: "13px" } }),
        ...pivotChecks,
      ),
      h("div", { style: { display: "flex", alignItems: "center", gap: "8px" } },
        h("span", { text: "Measures", style: { fontSize: "13px" } }),
        ...measureChecks,
      ),
      h("div", { style: { display: "flex", alignItems: "center", gap: "8px" } },
        h("span", { text: "Group rows by", style: { fontSize: "13px" } }),
        ...groupChecks,
      ),
      btn("Bump a revenue cell (+25k)", () => {
        // setCellValue writes into the same row objects rowData holds, so the local ref is live.
        const row = rows[editCounter++ % 50];
        api.setCellValue({ rowId: String(row.id), colId: "revenue" }, row.revenue + 25_000);
      }),
    ),
    // minWidth:0 keeps the grid from widening the page as generated pivot columns appear.
    host,
  ));

  const api = createGrid(host, {
    rowData: rows,
    columnDefs: COLUMNS,
    rowIdKey: "id",
    groupDefaultExpanded: 1,
    toolbar: { pivot: true },
    columnPanel: { trigger: "toolbar" },
  });

  applyAggregates();
  api.setRowGroupColumns(groupBy);
  api.setPivotColumns(pivotCols);
  api.setPivotMode(true);

  function applyAggregates(): void {
    api.setAggregates(MEASURES.filter((_, index) => measures.has(index)));
  }

  return () => api.destroy();
}
