import { ColumnType } from "../interfaces/column";
import { MenuItem } from "../interfaces/menuItem";
import { ColumnMenuContext } from "./context";
import { IGridCore } from "../interfaces";
import { Column } from "../column/column";

type CapSummary = {
  sortable: boolean;
  groupable: boolean;
  hideable: boolean;
  pinning: "left" | "right" | "mixed" | null;
  sortDir: "asc" | "desc" | "mixed" | null;
  aggType: string;
  aggregated: boolean;
  colType?: ColumnType;
  exportable: boolean;
};

export class ColumnMenuService {
  constructor(private core: IGridCore) { }

  buildDefaultColumnMenu(ctx: ColumnMenuContext): MenuItem[] {
    const cap = this.summarize(ctx);
    const items: MenuItem[] = [];

    const colIDs = [ctx.targetColId, ...ctx.colIds.filter(id => id !== ctx.targetColId)];

    if (cap.sortable) {
      if (cap.sortDir === "asc") {
        items.push({ id: "sortDesc", label: "Sort Descending", command: "sort.setMany", payload: { colIDs, dir: "desc" } });
      } else if (cap.sortDir === "desc") {
        items.push({ id: "sortAsc", label: "Sort Ascending", command: "sort.setMany", payload: { colIDs, dir: "asc" } });
      } else {
        items.push(
          { id: "sortAsc", label: "Sort Ascending", command: "sort.setMany", payload: { colIDs, dir: "asc" } },
          { id: "sortDesc", label: "Sort Descending", command: "sort.setMany", payload: { colIDs, dir: "desc" } }
        );
      }
      if (cap.sortDir !== null) items.push({ id: "sortClear", label: "Clear Sort", command: "sort.setMany", payload: { colIDs, dir: null } });
      items.push({ isSeparator: true });
    }
    if (cap.hideable) {
      items.push({ id: "hideColumns", label: "Hide Column", command: "column.hideMany", payload: { colIDs } });
      items.push({ isSeparator: true });
    }
    if (cap.groupable) items.push({ id: "groupColumns", label: "Group by Column", command: "group.setMany", payload: { colIDs } });
    if (cap.aggType) {
      const item: MenuItem = { id: "aggregateColumns", label: `Aggregate (${cap.aggType})`, command: "aggregate.openMany", payload: { colIDs } };
      if (cap.aggType === "numeric") {
        item.subMenu = [
          { id: "aggSum", label: "Sum", command: "aggregate.setMany", payload: { colIDs, agg: "sum" } },
          { id: "aggAvg", label: "Average", command: "aggregate.setMany", payload: { colIDs, agg: "avg" } },
          { id: "aggMin", label: "Min", command: "aggregate.setMany", payload: { colIDs, agg: "min" } },
          { id: "aggMax", label: "Max", command: "aggregate.setMany", payload: { colIDs, agg: "max" } },
          { id: "aggMedian", label: "Median", command: "aggregate.setMany", payload: { colIDs, agg: "median" } },
        ];
      } else if (cap.aggType === "string") {
        item.subMenu = [
          { id: "aggCount", label: "Count", command: "aggregate.setMany", payload: { colIDs, agg: "count" } },
          { id: "aggMin", label: "Min", command: "aggregate.setMany", payload: { colIDs, agg: "min" } },
          { id: "aggMax", label: "Max", command: "aggregate.setMany", payload: { colIDs, agg: "max" } },
        ];
      }
      if (cap.aggregated) {
        item.subMenu!.push({ id: "aggClear", label: "Clear Aggregation", command: "aggregate.setMany", payload: { colIDs, agg: null } });
      }
      items.push(item);
    }
    if (cap.pinning !== "mixed") {
      items.push({ isSeparator: true });
      const pinMenus: MenuItem[] = [];
      if (cap.pinning === "left") {
        pinMenus.push({ id: "unpinColumns", label: "Unpin Column" + (colIDs.length > 1 ? "s" : ""), command: "column.pinMany", payload: { colIDs, pinned: null } });
      } else {
        pinMenus.push({ id: "pinLeft", label: "Pin Left", command: "column.pinMany", payload: { colIDs, pinned: "left" } });
      }
      if (cap.pinning === "right") {
        pinMenus.push({ id: "unpinColumns", label: "Unpin Column" + (colIDs.length > 1 ? "s" : ""), command: "column.pinMany", payload: { colIDs, pinned: null } });
      } else {
        pinMenus.push({ id: "pinRight", label: "Pin Right", command: "column.pinMany", payload: { colIDs, pinned: "right" } });
      }
      items.push({ id: "pinning", label: "Pin Column" + (colIDs.length > 1 ? "s" : ""), subMenu: pinMenus });
    }
    if (cap.exportable) {
      if (items.length > 0) items.push({ isSeparator: true });
      items.push(...this.getExportMenuItems(colIDs));
    }

    if (ctx.colIds.length > 1) {
      items.unshift({ id: "clearSelection", label: `Clear Selection`, disabled: true });

      if (cap.colType === ColumnType.NUMBER || cap.colType === ColumnType.CURRENCY) {
        items.push({ isSeparator: true });
        items.push({
          id: "sparklines",
          label: "Show Sparklines",
          subMenu: [
            { id: "sparklinesBar", label: "Bar Sparklines", command: "columns.newSparklineCol", payload: { cols: colIDs, type: "bar" } },
            { id: "sparklinesLine", label: "Line Sparklines", command: "columns.newSparklineCol", payload: { cols: colIDs, type: "line" } },
            { id: "sparklinesArea", label: "Area Sparklines", command: "columns.newSparklineCol", payload: { cols: colIDs, type: "area" } },
          ]
        });
      }
    }

    return items;
  }

  execute(item: MenuItem, ctx: ColumnMenuContext) {
    // app onClick takes precedence
    if (item.disabled) return;
    if (item.onClick) return item.onClick();

    console.log("Executing column menu item", item);

    switch (item.command) {
      case "sort.setMany":
        return this.core.dispatch({ type: "sortModelSet", sortItems: item.payload.colIDs.map((colId: string) => ({ key: colId, dir: item.payload.dir })) });
      case "column.hideMany":
        return this.core.dispatch({ type: "columnVisibility", colIds: item.payload.colIDs, hidden: true });
      case "column.pinMany":
        console.log("Pinning columns", item.payload.colIDs, "to", item.payload.pinned);
        return this.core.dispatch({ type: "columnPin", colIds: item.payload.colIDs, pinned: item.payload.pinned });
      // filter.open / filter.clear / pin / hide etc

      default:
        // unknown command -> ignore (or warn in dev)
        return;
    }
  }

  private summarize(ctx: ColumnMenuContext): CapSummary {
    const colIDs = [ctx.targetColId, ...ctx.colIds.filter(id => id !== ctx.targetColId)];

    let sortable = true;
    let groupable = true;
    let hideable = true;
    let colTypes: ColumnType | "mixed" | null = null;
    let sortDir: "asc" | "desc" | "mixed" | null = null;
    let pinning: "left" | "right" | "mixed" | null = null;
    let exportable = true;
    const sorts: Record<string, "asc" | "desc"> = {};
    for (const sort of this.core.getSortModel().items) {
      sorts[sort.col.instanceID] = sort.dir;
    }
    for (const colID of colIDs) {
      const col = this.core.getColumnModel().getById(colID);
      if (!col) continue;
      if (!col.sortable) {
        sortable = false;
      } else if (sortDir !== "mixed") {
        const colSortDir = this.identifySortDir(col, sorts);
        if (!sortDir) {
          sortDir = colSortDir;
        } else if (colSortDir !== sortDir) {
          sortDir = "mixed";
        }
      }
      if (!col.groupable) groupable = false;
      if (!col.hideable) hideable = false;
      const colType = col.type || ColumnType.STRING;
      if (!colTypes) {
        colTypes = colType;
      } else if (colTypes == "mixed") {
        continue;
      } else if (colType !== colTypes) {
        colTypes = "mixed";
      }
      if (!col.exportable) exportable = false;
      if (!pinning) {
        pinning = col.pinned || null;
      } else if (col.pinned !== pinning) {
        pinning = "mixed";
      }
    }

    let aggType = "";
    if (colTypes && colTypes !== "mixed") {
      if (colTypes === ColumnType.NUMBER || colTypes === ColumnType.CURRENCY) {
        aggType = "numeric";
      } else {
        aggType = "string";
      }
    }

    if (sortDir === "mixed") sortable = false;

    const aggregated = this.core.getAggregateModel().filter(f => colIDs.includes(f.key)).length == colIDs.length;

    return {
      sortable,
      groupable,
      sortDir,
      hideable,
      pinning,
      aggType,
      aggregated,
      colType: colTypes === "mixed" ? undefined : (colTypes as ColumnType),
      exportable,
    };
  }

  private getExportMenuItems(colIDs: string[]): MenuItem[] {
    const items: MenuItem[] = [];
    if (this.core.getOptions().allowExportAsCSV) {
      items.push({ id: "exportCSV", label: "Export as CSV", command: "export.csv", payload: { colIDs } });
    }
    if (this.core.getOptions().allowExportAsExcel) {
      items.push({ id: "exportExcel", label: "Export as Excel", command: "export.excel", payload: { colIDs } });
    }
    return items;
  }

  // Identify sort dir based on the first visible child with sort applied on. If no child has sort applied, return null.
  private identifySortDir(col: Column, sorts: Record<string, "asc" | "desc" | null>): "asc" | "desc" | "mixed" | null {
    if (col.children.length === 0) return sorts[col.instanceID] || null;
    for (const child of col.getVisibleLeaves()) {
      const childDir = this.identifySortDir(child, sorts);
      if (childDir) return childDir;
    }
    return null;
  }

}
