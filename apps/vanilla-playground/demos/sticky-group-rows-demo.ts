import {
  createGrid,
  AggregateType,
  ColumnType,
  type ColDef,
  type GroupDisplayType,
} from "@grid";

import { btn, demoRoot, field, gridHost, h, select, toolbarRow } from "../dom";

type Row = {
  id: number;
  region: string;
  country: string;
  account: string;
  revenue: number;
};

const REGIONS: Record<string, string[]> = {
  Americas: ["USA", "Canada", "Brazil"],
  EMEA: ["UK", "France", "Germany"],
  APAC: ["India", "Japan", "Australia"],
};

const ROWS: Row[] = Array.from({ length: 240 }, (_, index) => {
  const region = Object.keys(REGIONS)[index % 3];
  const countries = REGIONS[region];
  return {
    id: index + 1,
    region,
    country: countries[Math.floor(index / 3) % countries.length],
    account: `Account ${String(index + 1).padStart(3, "0")}`,
    revenue: 5_000 + ((index * 12_731) % 220_000),
  };
});

const COLUMNS: ColDef[] = [
  { colId: "region", key: "region", label: "Region", width: 140 },
  { colId: "country", key: "country", label: "Country", width: 140 },
  { colId: "account", key: "account", label: "Account", width: 190 },
  { colId: "revenue", key: "revenue", label: "Revenue", width: 160, type: ColumnType.CURRENCY },
];

export function mountStickyGroupRowsDemo(container: HTMLElement): () => void {
  let sticky = true;
  let manuallyPinnedId: string | null = null;

  const host = gridHost();
  const manualLabel = h("span", {
    text: "No explicit group pin",
    style: { fontSize: "12px", color: "#6b7280" },
  });
  const stickyButton = btn("Sticky ancestors: on", () => {
    sticky = !sticky;
    stickyButton.textContent = `Sticky ancestors: ${sticky ? "on" : "off"}`;
    api.updateGridOptions({ groupRowsSticky: sticky });
  });

  container.appendChild(demoRoot(
    toolbarRow(
      stickyButton,
      field("Group display", select(
        [
          { value: "singleColumn", label: "Single column" },
          { value: "multipleColumns", label: "Multiple columns" },
          { value: "groupRows", label: "Full-width group rows" },
        ],
        "singleColumn",
        value => api.updateGridOptions({ groupDisplayType: value as GroupDisplayType }),
      ), { style: { fontSize: "12px", display: "inline-flex", alignItems: "center", gap: "6px" } }),
      btn("Pin EMEA bottom", () => {
        if (manuallyPinnedId) api.setRowPinned(manuallyPinnedId, null);
        const emea = api.getGroupNodes()
          .find(node => node.level === 0 && node.groupKey === "EMEA");
        if (!emea) return;
        api.setRowPinned(emea.id, "bottom");
        manuallyPinnedId = emea.id;
        manualLabel.textContent = "EMEA explicitly pinned at bottom";
      }),
      btn("Clear explicit pin", () => {
        if (manuallyPinnedId) {
          api.setRowPinned(manuallyPinnedId, null);
          manuallyPinnedId = null;
        }
        manualLabel.textContent = "No explicit group pin";
      }),
      manualLabel,
    ),
    h("div", {
      style: { fontSize: "12px", color: "#6b7280" },
      text: "Scroll through the expanded Region → Country hierarchy. Active ancestors stack above the"
        + " body; every mirrored chevron controls the original live group.",
    }),
    host,
  ));

  const api = createGrid(host, {
    rowData: ROWS,
    columnDefs: COLUMNS,
    rowIdKey: "id",
    rowPinningMenu: true,
    groupDefaultExpanded: -1,
    groupRowsSticky: sticky,
    groupDisplayType: "singleColumn",
    groupRowsSelectable: true,
    quickFilter: true,
    toolbar: { grouping: true, sorting: true },
  });

  api.dispatch({ type: "rowGroupSet", colIds: ["region", "country"] });
  const revenue = api.getColumnModel().getByColId("revenue");
  if (revenue) {
    api.dispatch({
      type: "aggregateModelSet",
      aggregateModels: [{ key: revenue.instanceID, type: AggregateType.SUM }],
    });
  }

  return () => api.destroy();
}
