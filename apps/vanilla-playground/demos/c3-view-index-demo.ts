import {
  AggregateType,
  ColumnType,
  createGrid,
  type ActionFrameComponentParams,
  type ColDef,
  type IGridAPI,
} from "@grid";

import { btn, h } from "../dom";
import { mulberry32, picker } from "../helpers";

/**
 * C3 regression playground, derived from the grouping demo.
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

function buildRows(count: number): SaleRow[] {
  const rand = mulberry32(7);
  const pick = picker(rand);
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

function rowIdentityFrame(params: ActionFrameComponentParams): HTMLElement {
  return h("div", {
    style: { display: "flex", flexDirection: "column", gap: "6px", minWidth: "190px" },
  },
    h("strong", { text: "ActionFrame target" }),
    h("span", { text: `rowId: ${params.rowId}` }),
    h("span", { text: `rep: ${String(params.value ?? "")}` }),
    btn("Close", () => params.close()),
  );
}

function firstVisibleLeafRowId(api: IGridAPI): string | null {
  const model = api.getCore().getRowModel();
  for (let index = 0; index < model.getViewCount(); index += 1) {
    const node = model.getRowNodeAtViewIndex(index);
    if (node && !node.isGroup) return node.id;
  }
  return null;
}

/** Resolve a column's instanceID (the key the aggregate model expects) from its colId. */
function colInstance(api: IGridAPI, colId: string): string {
  return api.getColumnModel().getByColId(colId)?.instanceID ?? "";
}

const COLUMNS: ColDef[] = [
  { colId: "region", key: "region", label: "Region", width: 130 },
  { colId: "country", key: "country", label: "Country", width: 130 },
  { colId: "category", key: "category", label: "Category", width: 130 },
  {
    colId: "rep",
    key: "rep",
    label: "Sales Rep / ActionFrame",
    width: 210,
    actionFrameTrigger: "click",
    actionFrameComponent: rowIdentityFrame,
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
    tooltipValueGetter: params =>
      `Tooltip target rowId=${params.data?.id}; revenue=${params.valueFormatted}`,
    headerTooltip: "Double-click a leaf cell to edit; the tooltip includes its stable row id.",
  },
];

export function mountC3ViewIndexDemo(container: HTMLElement): () => void {
  const host = h("div", { class: "c3-view-index-grid" });
  const statusBox = h("div", {
    class: "c3-view-index-status",
    role: "status",
    text: "Use the pager to move to page 2 or later.",
  });

  container.appendChild(h("div", { class: "c3-view-index-demo" },
    h("div", { class: "c3-view-index-intro" },
      h("div", null,
        h("div", { class: "c3-view-index-eyebrow", text: "C3 regression harness" }),
        h("h2", { text: "Grouped pagination: stable row id → current rendered slot" }),
        h("p", {
          text: "Four rows per page intentionally separates full-view indices from page-local slots."
            + " All groups start expanded so later pages contain editable leaf rows.",
        }),
      ),
      statusBox,
    ),
    h("div", { class: "c3-view-index-controls" },
      btn("Tooltip on first visible leaf", () => targetVisibleLeaf("tooltip")),
      btn("ActionFrame on first visible leaf", () => targetVisibleLeaf("frame")),
      btn("Jump to row 1500 / Revenue", () => {
        const visible = api.ensureCellVisible({ rowId: "1500", colId: "revenue" }, { position: "middle" });
        statusBox.textContent = `ensureCellVisible(row 1500, Revenue) returned ${visible}.`;
      }),
      btn("Undo", () => api.undo()),
      btn("Redo", () => api.redo()),
      h("span", null, "Double-click a leaf ", h("strong", { text: "Revenue" }),
        " cell, edit it, then use Undo/Redo."),
    ),
    h("details", { class: "c3-view-index-console", open: true },
      h("summary", {
        text: "Browser console checks (window.c3Api is intentionally exposed by this demo)",
      }),
      h("div", { class: "c3-view-index-snippets" },
        h("pre", null, h("code", { text: ROUND_TRIP_CHECK })),
        h("pre", null, h("code", { text: STALE_ROW_CHECK })),
        h("pre", null, h("code", { text: HISTORY_CHECK })),
      ),
    ),
    host,
  ));

  const api = createGrid(host, {
    rowData: buildRows(2_000),
    columnDefs: COLUMNS,
    rowIdKey: "id",
    pagination: true,
    pageSize: 4,
    pageSizes: [4],
    groupDisplayType: "singleColumn",
    groupDefaultExpanded: -1,
    groupRowsSelectable: true,
    tooltip: { showDelay: 0 },
  });

  (window as typeof window & { c3Api: IGridAPI }).c3Api = api;

  api.dispatch({
    type: "aggregateModelSet",
    aggregateModels: [
      { key: colInstance(api, "units"), type: AggregateType.SUM },
      { key: colInstance(api, "revenue"), type: AggregateType.SUM },
    ].filter(model => model.key),
  });
  api.dispatch({ type: "rowGroupSet", colIds: ["region", "category"] });
  statusBox.textContent = "window.c3Api is ready. Move to page 2+ and run the embedded checks.";

  function targetVisibleLeaf(kind: "tooltip" | "frame"): void {
    const rowId = firstVisibleLeafRowId(api);
    if (!rowId) {
      statusBox.textContent = "This page has no leaf row; move forward one page and try again.";
      return;
    }
    if (kind === "tooltip") api.showTooltip({ rowId, colId: "revenue" });
    else api.openActionFrame({ rowId, colId: "rep" });
    statusBox.textContent =
      `${kind === "tooltip" ? "Tooltip" : "ActionFrame"} targeted visible leaf row ${rowId}.`;
  }

  return () => {
    delete (window as typeof window & { c3Api?: IGridAPI }).c3Api;
    api.destroy();
  };
}
