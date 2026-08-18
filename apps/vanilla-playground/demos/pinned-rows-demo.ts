import { ColumnType, type ColDef } from "@grid";

import { btn, demoRoot, gridHost, h, toolbarRow } from "../dom";
import { mountGrid } from "../demoGrid";

type Row = {
  id: string;
  region?: string;
  team: string;
  country?: string;
  owner: string;
  pipeline: number;
  closed: number;
};

const ROWS: Row[] = Array.from({ length: 80 }, (_, index) => ({
  id: `deal-${index + 1}`,
  region: ["AMER", "APAC", "OCEANIC"][index % 3],
  team: ["Enterprise", "Commercial", "Growth"][index % 3],
  country: ["USA", "Canada", "Brazil", "India", "France", "Denmark", "China", "Japan", "Australia", "Spain"][index % 10],
  owner: ["Ava", "Liam", "Mia", "Noah", "Emma", "Kent", "Duke", "Frank", "Will", "Smith", "Leo", "Brad", "Oliver", "Nick", "Romeo"][index % 15],
  pipeline: 25_000 + ((index * 7_919) % 180_000),
  closed: 8_000 + ((index * 3_571) % 95_000),
}));

const COLUMNS: ColDef[] = [
  { colId: "team", key: "team", label: "Team", width: 150, pinned: "left" },
  { colId: "region", key: "region", label: "Region", width: 150 },
  { colId: "country", key: "country", label: "Country", width: 150 },
  { colId: "owner", key: "owner", label: "Owner", width: 140, editable: true },
  { colId: "pipeline", key: "pipeline", label: "Pipeline", width: 160, type: ColumnType.CURRENCY },
  { colId: "closed", key: "closed", label: "Closed", width: 160, type: ColumnType.CURRENCY },
];

const totalPipeline = ROWS.reduce((sum, row) => sum + row.pipeline, 0);
const totalClosed = ROWS.reduce((sum, row) => sum + row.closed, 0);

export function mountPinnedRowsDemo(container: HTMLElement): () => void {
  let showTarget = true;
  let showTotals = true;
  let forecast = 8_500_000;

  const host = gridHost();
  const targetButton = btn("Hide top forecast", () => {
    showTarget = !showTarget;
    targetButton.textContent = `${showTarget ? "Hide" : "Show"} top forecast`;
    applyPinnedRows();
  });
  const totalsButton = btn("Hide bottom totals", () => {
    showTotals = !showTotals;
    totalsButton.textContent = `${showTotals ? "Hide" : "Show"} bottom totals`;
    applyPinnedRows();
  });

  container.appendChild(demoRoot(
    toolbarRow(
      targetButton,
      totalsButton,
      btn("Raise forecast", () => {
        forecast += 250_000;
        applyPinnedRows();
      }),
      h("span", {
        style: { fontSize: "12px", color: "#6b7280" },
        text: "Pinned rows stay outside sort, filter, pagination, and the virtualized row count."
          + " Right-click any data row for Pin row / Unpin row.",
      }),
    ),
    host,
  ));

  const grid = mountGrid(host, {
    rowData: ROWS,
    columnDefs: COLUMNS,
    rowIdKey: "id",
    pinnedRowsEditable: true,
    rowPinningMenu: true,
    pinnedTopRowData: topRows(),
    pinnedBottomRowData: bottomRows(),
    quickFilter: { mode: "always", debounceMs: 0 },
    toolbar: { sorting: true },
    getRowClass: ({ node }) => node.rowPinned ? `demo-pinned-${node.rowPinned}` : undefined,
  });

  // The pinned bands are renderer-owned, so a live change goes through setPinnedRowOptions — the
  // same call the React wrapper makes when its pinnedTopRowData / pinnedBottomRowData props change.
  function applyPinnedRows(): void {
    grid.renderer.setPinnedRowOptions({
      pinnedTopRowData: topRows(),
      pinnedBottomRowData: bottomRows(),
    });
  }

  function topRows(): Row[] {
    return showTarget ? [{
      id: "forecast",
      team: "FY forecast",
      owner: "All teams",
      pipeline: forecast,
      closed: 6_400_000,
    }] : [];
  }

  function bottomRows(): Row[] {
    return showTotals ? [{
      id: "totals",
      team: "Visible dataset",
      owner: `${ROWS.length} deals`,
      pipeline: totalPipeline,
      closed: totalClosed,
    }] : [];
  }

  return () => grid.destroy();
}
