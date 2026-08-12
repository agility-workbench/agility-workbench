import { useEffect, useMemo, useRef, useState } from "react";

import { Grid } from "@react-grid";
import type { ReactColDef } from "@react-grid";
import { AggregateType } from "@grid/interfaces/aggregate";
import { ColumnType } from "@grid/interfaces/column";
import type { IGridAPI } from "@grid/interfaces/iGridAPI";
import type { ActionFrameComponentParams } from "@grid/renderer/actionFrame/actionFrameComponent";

/**
 * C3 regression playground, derived from GroupingDemo.
 *
 * The deliberately small page size makes grouped rows carry full-view indices that differ from
 * their rendered page-local slots. That is the case getViewIndexForRowId must resolve correctly
 * for every renderer consumer that addresses a cell by row id.
 */

type SaleRow = {
  id: number;
  region: string;
  country: string;
  category: string;
  rep: string;
  units: number;
  revenue: number;
};

const REGIONS = ["EMEA", "APAC", "Americas"];
const COUNTRIES: Record<string, string[]> = {
  EMEA: ["UK", "France", "Germany", "Spain"],
  APAC: ["Japan", "India", "Australia"],
  Americas: ["USA", "Canada", "Brazil"],
};
const CATEGORIES_BY_REGION: Record<string, string[]> = {
  EMEA: ["Hardware", "Software"],
  APAC: ["Software", "Services"],
  Americas: ["Hardware", "Services"],
};
const REPS = ["Ava Chen", "Liam Patel", "Mia Kim", "Noah Garcia", "Emma Silva", "Ethan Khan"];

const ROUND_TRIP_CHECK = `// Run on page 2 or later. Every index must equal reverseIndex.
(() => {
  const api = window.c3Api;
  const core = api.getCore();
  const visible = Array.from(
    { length: core.getRowModel().getViewCount() },
    (_, index) => {
      const rowId = core.getRowIdAtViewIndex(index);
      return {
        index,
        rowId,
        reverseIndex: core.getViewIndexForRowId(rowId),
      };
    },
  );

  console.table(visible);
  window.c3PreviousPageRowId = visible[0]?.rowId;

  const leaf = visible.find(({ rowId }) =>
    !core.getRowModel().getRowNode(rowId)?.isGroup
  );
  if (leaf) {
    window.c3VisibleLeafRowId = leaf.rowId;
    api.showTooltip({ rowId: leaf.rowId, colId: "revenue" });
    api.openActionFrame({ rowId: leaf.rowId, colId: "rep" });
  }

  return { visible, testedLeafRowId: leaf?.rowId };
})();`;

const STALE_ROW_CHECK = `// After running the first check, move to the next page. Expected: null.
window.c3Api
  .getCore()
  .getViewIndexForRowId(window.c3PreviousPageRowId);`;

const HISTORY_CHECK = `// After editing a Revenue leaf cell, run these one at a time.
window.c3Api.undo();
window.c3Api.redo();`;

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildRows(count: number): SaleRow[] {
  const rand = mulberry32(7);
  const pick = <T,>(arr: T[]) => arr[Math.floor(rand() * arr.length)];
  return Array.from({ length: count }, (_, i) => {
    const region = pick(REGIONS);
    return {
      id: 1 + i,
      region,
      country: pick(COUNTRIES[region]),
      category: pick(CATEGORIES_BY_REGION[region]),
      rep: pick(REPS),
      units: 1 + Math.floor(rand() * 500),
      revenue: 500 + Math.floor(rand() * 500_000),
    };
  });
}

function RowIdentityFrame(params: ActionFrameComponentParams) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 190 }}>
      <strong>ActionFrame target</strong>
      <span>rowId: {params.rowId}</span>
      <span>rep: {String(params.value ?? "")}</span>
      <button type="button" className="btn" onClick={params.close}>Close</button>
    </div>
  );
}

function firstVisibleLeafRowId(api: IGridAPI): string | null {
  const core = api.getCore();
  const model = core.getRowModel();
  for (let index = 0; index < model.getViewCount(); index += 1) {
    const node = model.getRowNodeAtViewIndex(index);
    if (node && !node.isGroup) return node.id;
  }
  return null;
}

export function C3ViewIndexDemo() {
  const rows = useMemo(() => buildRows(2_000), []);
  const apiRef = useRef<IGridAPI | null>(null);
  const [status, setStatus] = useState("Use the pager to move to page 2 or later.");

  useEffect(() => () => {
    delete (window as typeof window & { c3Api?: IGridAPI }).c3Api;
  }, []);

  const columnDefs = useMemo<ReactColDef[]>(() => [
    { colId: "region", key: "region", label: "Region", width: 130 },
    { colId: "country", key: "country", label: "Country", width: 130 },
    { colId: "category", key: "category", label: "Category", width: 130 },
    {
      colId: "rep",
      key: "rep",
      label: "Sales Rep / ActionFrame",
      width: 210,
      actionFrameTrigger: "click",
      actionFrameComponent: RowIdentityFrame,
      headerTooltip: "Click a leaf cell; the frame prints the row id it was anchored to.",
    },
    { colId: "units", key: "units", label: "Units", width: 110, type: ColumnType.NUMBER },
    {
      colId: "revenue",
      key: "revenue",
      label: "Revenue / edit + tooltip",
      width: 210,
      type: ColumnType.CURRENCY,
      editable: true,
      tooltipValueGetter: (params) =>
        `Tooltip target rowId=${params.data?.id}; revenue=${params.valueFormatted}`,
      headerTooltip: "Double-click a leaf cell to edit; the tooltip includes its stable row id.",
    },
  ], []);

  const handleReady = (api: IGridAPI) => {
    apiRef.current = api;
    (window as typeof window & { c3Api: IGridAPI }).c3Api = api;

    const aggregateModels = [
      { key: colInstance(api, "units"), type: AggregateType.SUM },
      { key: colInstance(api, "revenue"), type: AggregateType.SUM },
    ].filter((model) => model.key);
    api.dispatch({ type: "aggregateModelSet", aggregateModels: aggregateModels as any });
    api.dispatch({ type: "rowGroupSet", colIds: ["region", "category"] });
    setStatus("window.c3Api is ready. Move to page 2+ and run the embedded checks.");
  };

  const targetVisibleLeaf = (kind: "tooltip" | "frame") => {
    const api = apiRef.current;
    if (!api) return;
    const rowId = firstVisibleLeafRowId(api);
    if (!rowId) {
      setStatus("This page has no leaf row; move forward one page and try again.");
      return;
    }
    if (kind === "tooltip") api.showTooltip({ rowId, colId: "revenue" });
    else api.openActionFrame({ rowId, colId: "rep" });
    setStatus(`${kind === "tooltip" ? "Tooltip" : "ActionFrame"} targeted visible leaf row ${rowId}.`);
  };

  const jumpToRow = () => {
    const visible = apiRef.current?.ensureCellVisible(
      { rowId: "1500", colId: "revenue" },
      { position: "middle" },
    ) ?? false;
    setStatus(`ensureCellVisible(row 1500, Revenue) returned ${visible}.`);
  };

  return (
    <div className="c3-view-index-demo">
      <div className="c3-view-index-intro">
        <div>
          <div className="c3-view-index-eyebrow">C3 regression harness</div>
          <h2>Grouped pagination: stable row id → current rendered slot</h2>
          <p>
            Four rows per page intentionally separates full-view indices from page-local slots.
            All groups start expanded so later pages contain editable leaf rows.
          </p>
        </div>
        <div className="c3-view-index-status" role="status">{status}</div>
      </div>

      <div className="c3-view-index-controls">
        <button type="button" className="btn" onClick={() => targetVisibleLeaf("tooltip")}>
          Tooltip on first visible leaf
        </button>
        <button type="button" className="btn" onClick={() => targetVisibleLeaf("frame")}>
          ActionFrame on first visible leaf
        </button>
        <button type="button" className="btn" onClick={jumpToRow}>
          Jump to row 1500 / Revenue
        </button>
        <button type="button" className="btn" onClick={() => apiRef.current?.undo()}>Undo</button>
        <button type="button" className="btn" onClick={() => apiRef.current?.redo()}>Redo</button>
        <span>
          Double-click a leaf <strong>Revenue</strong> cell, edit it, then use Undo/Redo.
        </span>
      </div>

      <details className="c3-view-index-console" open>
        <summary>Browser console checks (window.c3Api is intentionally exposed by this demo)</summary>
        <div className="c3-view-index-snippets">
          <pre><code>{ROUND_TRIP_CHECK}</code></pre>
          <pre><code>{STALE_ROW_CHECK}</code></pre>
          <pre><code>{HISTORY_CHECK}</code></pre>
        </div>
      </details>

      <div className="c3-view-index-grid">
        <Grid
          apiRef={apiRef}
          data={rows}
          columnDefs={columnDefs}
          rowIdKey="id"
          pagination
          pageSize={4}
          pageSizes={[4]}
          groupDisplayType="singleColumn"
          groupDefaultExpanded={-1}
          groupRowsSelectable
          tooltip={{ showDelay: 0 }}
          style={{ width: "100%", height: "100%" }}
          onGridReady={handleReady}
        />
      </div>
    </div>
  );
}

function colInstance(api: IGridAPI, colId: string): string {
  return api.getColumnModel().getByColId(colId)?.instanceID ?? "";
}

export default C3ViewIndexDemo;
